const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mod-limpar')
        .setDescription('Limpa mensagens do canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(option =>
            option.setName('quantidade')
                .setDescription('Quantidade de mensagens para limpar (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('ignorar_antigas')
                .setDescription('Ignorar mensagens com mais de 14 dias')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Limpar mensagens apenas deste usuário')
                .setRequired(false)),

    async execute(interaction) {
        try {
            const amount = interaction.options.getInteger('quantidade');
            const ignorarAntigas = interaction.options.getBoolean('ignorar_antigas') ?? true;
            const usuario = interaction.options.getUser('usuario');

            // Primeiro, obtemos as mensagens
            const messages = await interaction.channel.messages.fetch({ 
                limit: amount 
            });

            // Filtra as mensagens com base nos parâmetros
            let messagesToDelete = messages;

            if (usuario) {
                messagesToDelete = messages.filter(msg => msg.author.id === usuario.id);
            }

            if (ignorarAntigas) {
                // Filtra mensagens mais antigas que 14 dias
                const dateLimitTimestamp = Date.now() - (14 * 24 * 60 * 60 * 1000);
                messagesToDelete = messagesToDelete.filter(msg => msg.createdTimestamp > dateLimitTimestamp);
            }

            // Se não houver mensagens para deletar
            if (messagesToDelete.size === 0) {
                return interaction.reply({
                    content: 'Não foram encontradas mensagens para deletar com os critérios especificados.',
                    flags: 'Ephemeral'
                });
            }

            // Delete as mensagens
            const deletedCount = await interaction.channel.bulkDelete(messagesToDelete, true)
                .then(deleted => deleted.size);

            // Responde com o resultado
            let responseMessage = `✅ ${deletedCount} mensagem(ns) foram deletadas`;
            
            if (usuario) {
                responseMessage += ` do usuário ${usuario.tag}`;
            }

            if (deletedCount < amount) {
                responseMessage += '\n⚠️ Algumas mensagens não puderam ser deletadas (muito antigas ou não encontradas)';
            }

            await interaction.reply({
                content: responseMessage,
                flags: 'Ephemeral'
            });

        } catch (error) {
            console.error('Erro ao limpar mensagens:', error);
            await interaction.reply({
                content: 'Ocorreu um erro ao tentar limpar as mensagens.',
                flags: 'Ephemeral'
            });
        }
    },
};