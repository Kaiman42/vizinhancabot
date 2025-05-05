const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { limparMensagens } = require('./permissoes');
const { responderErro } = require('./erros');
const { registrarLogLimpeza } = require('./logs');

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
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Limpar mensagens apenas deste usuário')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('ignorar_usuario')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('ignorar_usuario2')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('ignorar_usuario3')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('ignorar_usuario4')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('ignorar_usuario5')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false)),

    async execute(interaction) {
        try {
            const amount = interaction.options.getInteger('quantidade');
            const usuario = interaction.options.getUser('usuario');
            const ignorarUsuario = interaction.options.getBoolean('ignorar_usuario') ?? false;
            const ignorarUsuario2 = interaction.options.getBoolean('ignorar_usuario2') ?? false;
            const ignorarUsuario3 = interaction.options.getBoolean('ignorar_usuario3') ?? false;
            const ignorarUsuario4 = interaction.options.getBoolean('ignorar_usuario4') ?? false;
            const ignorarUsuario5 = interaction.options.getBoolean('ignorar_usuario5') ?? false;

            // Se qualquer ignorarUsuario* for true, não filtra por usuário
            const usuarioFiltro = (ignorarUsuario || ignorarUsuario2 || ignorarUsuario3 || ignorarUsuario4 || ignorarUsuario5) ? null : usuario;

            const { deletedCount, notFound } = await limparMensagens(interaction, amount, usuarioFiltro, canal);

            if (notFound) {
                return responderErro(interaction, 'Não foram encontradas mensagens para deletar com os critérios especificados.');
            }

            // Log de limpeza
            registrarLogLimpeza(interaction, deletedCount, usuarioFiltro, canal, motivo);

            // Responde com o resultado
            let responseMessage = `✅ ${deletedCount} mensagem(ns) foram deletadas`;
            if (usuarioFiltro) {
                responseMessage += ` do usuário ${usuarioFiltro.tag}`;
            }
            if (canal && canal.id !== interaction.channel.id) {
                responseMessage += ` no canal ${canal}`;
            }
            responseMessage += `\nMotivo: ${motivo}`;
            if (deletedCount < amount) {
                responseMessage += '\n⚠️ Algumas mensagens não puderam ser deletadas (muito antigas ou não encontradas)';
            }
            await interaction.reply({
                content: responseMessage,
                ephemeral: !mostrarLog
            });
        } catch (error) {
            console.error('Erro ao limpar mensagens:', error);
            await responderErro(interaction, 'Ocorreu um erro ao tentar limpar as mensagens.');
        }
    },
};