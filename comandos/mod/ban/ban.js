const { SlashCommandBuilder } = require('discord.js');
const { verificarPermissoes, verificarPermissoesMembro, criarBanEmbed, registrarBan, enviarLog } = require('./utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bane um usuário do servidor')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O usuário que será banido')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('motivo')
                .setDescription('O motivo do banimento')
                .setRequired(false))
        .addBooleanOption(option => 
            option.setName('limpar_mensagens')
                .setDescription('Limpar mensagens dos últimos 7 dias')
                .setRequired(false)),

    async execute(interaction) {
        // Adiar a resposta imediatamente
        await interaction.deferReply({ flags: 'Ephemeral' });

        // Verificar permissões do executor
        const permResult = await verificarPermissoes(interaction);
        if (!permResult.success) {
            return interaction.editReply(permResult.response);
        }

        // Obter dados do comando
        const user = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('motivo') || 'Nenhum motivo fornecido';
        const deleteMsgs = interaction.options.getBoolean('limpar_mensagens') || false;

        // Verificar auto-ban
        if (user.id === interaction.user.id) {
            return interaction.editReply(ERROS.AUTO_BAN);
        }

        // Verificar permissões sobre o alvo
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const targetPermResult = await verificarPermissoesMembro(interaction, member);
        if (!targetPermResult.success) {
            return interaction.editReply(targetPermResult.response);
        }

        try {
            // Executar ban
            const deleteDays = deleteMsgs ? 7 : 0;
            await interaction.guild.members.ban(user, {
                reason: reason,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });

            // Registrar banimento
            await registrarBan(interaction, user);

            // Criar e enviar embed
            const banEmbed = criarBanEmbed(
                user,
                reason,
                deleteMsgs,
                interaction,
                permResult.cargo
            );

            // Enviar log
            await enviarLog(interaction, banEmbed);

            // Responder ao comando
            return interaction.editReply({
                content: `✅ O usuário ${user.tag} foi banido com sucesso.`
            });

        } catch (error) {
            console.error(error);
            return interaction.editReply({ content: `❌ Ocorreu um erro ao tentar banir ${user.tag}. Erro: ${error.message}` });
        }
    },
};
