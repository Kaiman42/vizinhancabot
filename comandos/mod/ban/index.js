const { verificarPermissoes, verificarPermissoesMembro } = require('./permissoes');
const { verificarLimiteDiario, registrarBan } = require('./limites');
const { criarBanEmbed, enviarLog } = require('./logs');
const { SlashCommandBuilder } = require('discord.js');
const ERROS = require('./erros');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mod')
        .setDescription('Comandos de moderação')
        .addSubcommand(subcommand =>
            subcommand
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
                        .setRequired(false))),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'ban') {
            // Adiar a resposta imediatamente
            await interaction.deferReply({ ephemeral: true });

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

            // Verificar limite diário
            const limiteResult = await verificarLimiteDiario(interaction, permResult.cargo);
            if (!limiteResult.success) {
                return interaction.editReply(limiteResult.response);
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

                // Registrar estatísticas
                await registrarBan(
                    limiteResult.statsKey,
                    interaction,
                    user,
                    reason,
                    permResult.cargo
                );

                // Criar e enviar embed
                const banEmbed = criarBanEmbed(
                    user,
                    reason,
                    deleteMsgs,
                    interaction,
                    permResult.cargo,
                    limiteResult.bansHoje
                );

                // Enviar log
                await enviarLog(interaction, banEmbed);

                // Responder ao comando
                return interaction.editReply({
                    content: `✅ O usuário ${user.tag} foi banido com sucesso.`
                });

            } catch (error) {
                console.error(error);
                return interaction.editReply(ERROS.ERRO_GENERICO(user, error));
            }
        }
    },
};
