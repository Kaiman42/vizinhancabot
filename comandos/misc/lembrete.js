const { SlashCommandBuilder } = require('discord.js');
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const lembretesTotal = 3;

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
            return interaction.reply({ 
                content: 'Formato de hora inválido. Use HH:MM (exemplo: 14:30).', 
                flags: 'Ephemeral' 
            });
        }

        if (conteudo.length > 512) {
            return interaction.reply({ 
                content: 'O conteúdo do lembrete deve ter no máximo 512 caracteres.', 
                flags: 'Ephemeral' 
            });
        }

        const client = new MongoClient(uri);

        try {
            await client.connect();
            const db = client.db('ignis');
            const temporario = db.collection('temporario');

            // Verificar número de lembretes ativos do usuário
            const activeReminders = await temporario.countDocuments({
                userId: interaction.user.id
            });

            if (activeReminders >= lembretesTotal) {
                await client.close();
                return interaction.reply({ 
                    content: `Você já possui ${lembretesTotal} lembretes ativos. Aguarde algum ser concluído antes de criar outro.`, 
                    flags: 'Ephemeral' 
                });
            }

            const now = new Date();
            const reminderTime = calculateReminderTime(hora);

            if (reminderTime <= now) {
                await client.close();
                return interaction.reply({ 
                    content: 'O horário do lembrete deve ser no futuro.', 
                    flags: 'Ephemeral' 
                });
            }

            // Verificar se já existe um lembrete para o mesmo horário
            const existingReminder = await temporario.findOne({
                userId: interaction.user.id,
                hora: hora
            });

            if (existingReminder) {
                await client.close();
                return interaction.reply({ 
                    content: 'Você já possui um lembrete agendado para este horário exato.', 
                    flags: 'Ephemeral' 
                });
            }

            const reminder = {
                hora,
                conteudo,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                createdAt: now,
                scheduledFor: reminderTime
            };

            const result = await temporario.insertOne(reminder);

            const delay = reminderTime.getTime() - now.getTime();

            // Armazena o ID do lembrete para uso posterior
            const reminderId = result.insertedId;

            await client.close();

            setTimeout(async () => {
                try {
                    // Notifica o usuário do lembrete
                    await interaction.followUp({
                        content: `<@${interaction.user.id}>, aqui está seu lembrete: ${conteudo}`,
                    });

                    // Abre uma nova conexão para remover o lembrete
                    const reminderClient = new MongoClient(uri);
                    await reminderClient.connect();
                    const reminderDb = reminderClient.db('ignis');
                    const reminderCollection = reminderDb.collection('temporario');
                    
                    // Remove o lembrete do banco de dados
                    await reminderCollection.deleteOne({ _id: reminderId });
                    
                    // Fecha a conexão
                    await reminderClient.close();
                } catch (error) {
                    console.error('Erro ao notificar ou remover lembrete:', error);
                }
            }, delay);

            await interaction.reply({ 
                content: `Lembrete configurado com sucesso para ${hora}: ${conteudo}`, 
                flags: 'Ephemeral' 
            });
        } catch (error) {
            console.error('Erro ao salvar lembrete:', error);
            await interaction.reply({ 
                content: 'Erro ao salvar o lembrete. Por favor, tente novamente mais tarde.', 
                flags: 'Ephemeral' 
            });
            await client.close();
        }
    },
};
