const { SlashCommandBuilder } = require('discord.js');
const { MongoClient } = require('mongodb');
const { lembretesTotal, atingiuLimiteLembretes } = require('./limites');
const { erros, responderErro } = require('./erros');
const { logAcao, logErro } = require('./logs');

const uri = process.env.MONGO_URI;

function formatTimeString(timeString) {
    // Remove any colons if present
    timeString = timeString.replace(':', '');
    
    // Add colon if it's a 4-digit format
    if (timeString.length === 4) {
        return timeString.substring(0, 2) + ':' + timeString.substring(2, 4);
    }
    return timeString;
}

function isValidTimeFormat(timeString) {
    // Format the time string first
    timeString = formatTimeString(timeString);
    
    // Check if it matches HH:MM format
    if (!/^\d{2}:\d{2}$/.test(timeString)) {
        return false;
    }
    
    const [hours, minutes] = timeString.split(':').map(num => parseInt(num));
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function calculateReminderTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(num => parseInt(num, 10));
    const reminderTime = new Date();
    reminderTime.setHours(hours, minutes, 0, 0);
    return reminderTime;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lembrete')
        .setDescription('Cria um lembrete.')
        .addStringOption(option =>
            option.setName('hora')
                .setDescription('Hora e minutos no formato HH:MM ou HHMM (exemplo: 14:30 ou 1430)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('conteudo')
                .setDescription('Conteúdo do lembrete (até 512 caracteres)')
                .setRequired(true)),

    async execute(interaction) {
        const hora = formatTimeString(interaction.options.getString('hora'));
        const conteudo = interaction.options.getString('conteudo');

        if (!isValidTimeFormat(hora)) {
            return responderErro(interaction, erros.formatoHora);
        }

        if (conteudo.length > 512) {
            return responderErro(interaction, erros.conteudoLongo);
        }

        const client = new MongoClient(uri);

        try {
            await client.connect();
            const db = client.db('ignis');
            const temporario = db.collection('temporario');

            // Verificar número de lembretes ativos do usuário
            if (await atingiuLimiteLembretes(temporario, interaction.user.id)) {
                await client.close();
                return responderErro(interaction, erros.limite(lembretesTotal));
            }

            const now = new Date();
            const reminderTime = calculateReminderTime(hora);

            if (reminderTime <= now) {
                await client.close();
                return responderErro(interaction, erros.passado);
            }

            // Verificar se já existe um lembrete para o mesmo horário
            const existingReminder = await temporario.findOne({
                userId: interaction.user.id,
                hora: hora
            });

            if (existingReminder) {
                await client.close();
                return responderErro(interaction, erros.duplicado);
            }

            const reminder = {
                scheduledFor: reminderTime,
                hora,
                userId: interaction.user.id,
                channelId: interaction.channelId,
                conteudo
            };

            const result = await temporario.insertOne(reminder);
            const reminderId = result.insertedId;
            const delay = reminderTime.getTime() - now.getTime();

            await client.close();

            logAcao(`Lembrete criado para ${hora} por ${interaction.user.id}`);

            setTimeout(async () => {
                try {
                    await interaction.followUp({
                        content: `<@${interaction.user.id}>, aqui está seu lembrete: ${conteudo}`,
                    });

                    const reminderClient = new MongoClient(uri);
                    await reminderClient.connect();
                    const reminderDb = reminderClient.db('ignis');
                    const reminderCollection = reminderDb.collection('temporario');
                    await reminderCollection.deleteOne({ _id: reminderId });
                    await reminderClient.close();
                    logAcao(`Lembrete executado e removido para ${interaction.user.id} (${hora})`);
                } catch (error) {
                    logErro(error);
                }
            }, delay);

            await interaction.reply({
                content: `Lembrete configurado com sucesso para ${hora}: ${conteudo}`,
                flags: 'Ephemeral'
            });
        } catch (error) {
            logErro(error);
            await responderErro(interaction, erros.salvar);
            await client.close();
        }
    },
};
