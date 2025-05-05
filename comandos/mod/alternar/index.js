const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { findOne } = require('../../../configuracoes/mongodb');
const { alternarCanalUnico, alternarTodosCanais } = require('./permissoes');
const { registrarLog } = require('./logs');
const { responderErro, ERROS } = require('./erros');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod-alternar')
    .setDescription('Alterna as permissões de um ou mais canais')
    .addStringOption(option =>
      option.setName('escopo')
        .setDescription('Escolha o escopo das alterações')
        .setRequired(false)
        .addChoices(
          { name: 'Esse canal', value: 'esse_canal' },
          { name: 'Todos canais', value: 'todos_canais' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.deferReply({ flags: 'Ephemeral' });
    const escopo = interaction.options.getString('escopo') || 'esse_canal';
    const currentChannelId = interaction.channelId;
    const guildId = interaction.guildId;
    
    try {
      const COLLECTION_NAME = 'configuracoes';
      const DOCUMENT_ID = 'canais';
      let canalConfig = await findOne(COLLECTION_NAME, { _id: DOCUMENT_ID });
      if (!canalConfig) {
        return responderErro(interaction, ERROS.CONFIGURACAO_NAO_ENCONTRADA);
      }

      let canaisAfetados;
      if (escopo === 'esse_canal') {
        canaisAfetados = await alternarCanalUnico(interaction, currentChannelId, canalConfig, guildId);
        if (canaisAfetados === null) {
          return responderErro(interaction, ERROS.PERMISSAO_NEGADA);
        }
        if (!canaisAfetados || canaisAfetados.length === 0) {
          return responderErro(interaction, ERROS.CANAL_NAO_ENCONTRADO);
        }
      } else {
        canaisAfetados = await alternarTodosCanais(interaction, canalConfig, guildId);
        if (!canaisAfetados || canaisAfetados.length === 0) {
          return responderErro(interaction, ERROS.PERMISSAO_NEGADA(error));
        }
      }

      // Registrar log e responder ao usuário
      await registrarLog(interaction, canaisAfetados);
      const mensagem = escopo === 'esse_canal' 
        ? `✅ Permissões do canal ${canaisAfetados[0].permissoes.enviarMensagens ? 'liberadas' : 'bloqueadas'} com sucesso.`
        : `✅ Permissões de ${canaisAfetados.length} canais alternadas com sucesso.`;
      
      await interaction.editReply({ content: mensagem, flags: 'Ephemeral' });
      
    } catch (error) {
      console.error('Erro ao alternar permissões:', error);
      return responderErro(interaction, ERROS.ERRO_GENERICO(error));
    }
  },
};
