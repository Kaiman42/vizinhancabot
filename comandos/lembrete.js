const { SlashCommandBuilder } = require('discord.js');
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lembrete')
        .setDescription('Cria um lembrete.')
        .addStringOption(option =>
            option.setName('hora')
                .setDescription('Hora e minutos no formato HHMM')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('conteudo')
                .setDescription('Conteúdo do lembrete (até 512 caracteres)')
                .setRequired(true)),
    async execute(interaction) {
        const hora = interaction.options.getString('hora');
        const conteudo = interaction.options.getString('conteudo');

        if (!/^\d{4}$/.test(hora)) {
            return interaction.reply({ content: 'Formato de hora inválido. Use HHMM.', flags: 'Ephemeral' });
        }

        if (conteudo.length > 512) {
            return interaction.reply({ content: 'O conteúdo do lembrete deve ter no máximo 512 caracteres.', flags: 'Ephemeral' });
        }

        try {
            await client.connect();
            const db = client.db('ignis');
            const remindersCollection = db.collection('reminders');

            const now = new Date();
            const reminderTime = new Date();
            reminderTime.setHours(parseInt(hora.slice(0, 2)), parseInt(hora.slice(2)), 0, 0);

            if (reminderTime <= now) {
                return interaction.reply({ content: 'O horário do lembrete deve ser no futuro.' });
            }

            const reminder = {
                hora,
                conteudo,
                channelId: interaction.channelId,
                userId: interaction.user.id,
            };

            const result = await remindersCollection.insertOne(reminder);

            const delay = reminderTime.getTime() - now.getTime();

            setTimeout(async () => {
                try {
                    // Notifique o usuário
                    await interaction.followUp({
                        content: `Lembrete: ${conteudo}`,
                        flags: 'Ephemeral',
                    });

                    // Remova o lembrete do banco de dados
                    await remindersCollection.deleteOne({ _id: result.insertedId });
                } catch (error) {
                    console.error('Erro ao notificar ou remover lembrete:', error);
                }
            }, delay);

            await interaction.reply({ content: `Lembrete salvo com sucesso para ${hora}: ${conteudo}`, flags: 'Ephemeral' });
        } catch (error) {
            console.error('Erro ao salvar lembrete:', error);
            await interaction.reply({ content: 'Erro ao salvar o lembrete.' });
        }
    },
};
