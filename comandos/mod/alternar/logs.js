const { EmbedBuilder } = require('discord.js');
const { findOne } = require('../../../configuracoes/mongodb');

async function registrarLog(interaction, canaisAfetados = []) {
  try {
    const canalConfig = await findOne('configuracoes', { _id: 'canais' });
    if (!canalConfig || !canalConfig.categorias) return;
    let logChannelId = null;
    for (const categoria of canalConfig.categorias) {
      if (!categoria.canais) continue;
      const canal = categoria.canais.find(c => c.nome === 'registros-servidor');
      if (canal) {
        logChannelId = canal.id;
        break;
      }
    }
    if (!logChannelId) return;
    const guild = interaction.guild;
    if (!guild) return;
    const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel) return;

    const usuario = interaction.user ? `<@${interaction.user.id}> (${interaction.user.tag})` : 'Desconhecido';
    let embed;

    // Caso geral (múltiplos canais)
    if (canaisAfetados && canaisAfetados.length > 1) {
      const bloqueio = canaisAfetados.every(c => c.permissoes && c.permissoes.enviarMensagens === false);
      const desbloqueio = canaisAfetados.every(c => c.permissoes && c.permissoes.enviarMensagens === true);
      const titulo = bloqueio ? 'Canais Bloqueados em Massa' : desbloqueio ? 'Canais Desbloqueados em Massa' : 'Permissões de Canais Alteradas';
      const descricao = bloqueio
        ? 'Foram bloqueados múltiplos canais para envio de mensagens.'
        : desbloqueio
        ? 'Foram liberados múltiplos canais para envio de mensagens.'
        : 'Permissões de múltiplos canais foram alteradas.';
      embed = new EmbedBuilder()
        .setTitle(titulo)
        .setColor(0x00FFFF)
        .setDescription(descricao)
        .addFields({ name: 'Usuário', value: usuario, inline: false });
      // Agrupar canais por categoria
      const canaisPorCategoria = {};
      for (const canal of canaisAfetados) {
        if (!canaisPorCategoria[canal.categoria]) canaisPorCategoria[canal.categoria] = [];
        canaisPorCategoria[canal.categoria].push(canal);
      }
      for (const categoria in canaisPorCategoria) {
        let listaCanais = '';
        for (const canal of canaisPorCategoria[categoria]) {
          const status = canal.permissoes.enviarMensagens ? '✅' : '❌';
          listaCanais += `${status} <#${canal.id}>\n`;
        }
        embed.addFields({ name: `📁 ${categoria}`, value: listaCanais || 'Nenhum canal afetado', inline: false });
      }
      embed.addFields({
        name: 'Legenda',
        value: '✅ - Envio de mensagens permitido\n❌ - Envio de mensagens bloqueado',
        inline: false
      });
    } else if (canaisAfetados && canaisAfetados.length === 1) {
      // Caso singular
      const canal = canaisAfetados[0];
      const bloqueado = canal.permissoes && canal.permissoes.enviarMensagens === false;
      const titulo = bloqueado ? 'Canal Bloqueado' : 'Canal Desbloqueado';
      const descricao = bloqueado
        ? `O canal <#${canal.id}> foi bloqueado para envio de mensagens.`
        : `O canal <#${canal.id}> foi liberado para envio de mensagens.`;
      embed = new EmbedBuilder()
        .setTitle(titulo)
        .setColor(0x00FFFF)
        .setDescription(descricao)
        .addFields(
          { name: 'Usuário', value: usuario, inline: false },
          { name: 'Canal', value: `<#${canal.id}>`, inline: false },
          { name: 'Status', value: bloqueado ? '❌ Bloqueado' : '✅ Liberado', inline: false }
        );
    } else {
      // Fallback caso não haja canaisAfetados
      embed = new EmbedBuilder()
        .setTitle('Permissões de Canal Alteradas')
        .setColor(0x00FFFF)
        .setDescription('As permissões do canal foram alteradas.')
        .addFields(
          { name: 'Usuário', value: usuario, inline: false },
          { name: 'Canal', value: `<#${interaction.channelId}>`, inline: false }
        );
    }
    embed.setTimestamp();
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Erro ao registrar log de moderação:', err);
  }
}

module.exports = {
  registrarLog
};
