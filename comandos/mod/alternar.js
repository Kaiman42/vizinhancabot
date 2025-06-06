const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { findOne, upsert } = require('../../configuracoes/mongodb');

// Constantes de erros
const ERROS = {
  CANAL_NAO_ENCONTRADO: {
    content: '❌ Este canal não foi encontrado na configuração.',
    flags: 'Ephemeral'
  },
  PERMISSAO_NEGADA: {
    content: '❌ Você não tem permissão para alterar este canal.',
    flags: 'Ephemeral'
  },
  ERRO_GENERICO: (erro) => ({
    content: `❌ Ocorreu um erro ao alternar permissões: ${erro?.message || erro}`,
    flags: 'Ephemeral'
  })
};

// Funções utilitárias
function responderErro(interaction, erro) {
  const resposta = typeof erro === 'string' ? { content: erro, flags: 'Ephemeral' } : erro;
  return interaction.editReply(resposta);
}

async function verificarPermissoes(interaction, canal) {
  const member = interaction.member;
  const permissions = canal.permissionsFor(member);
  return permissions.has(PermissionFlagsBits.ManageChannels);
}

async function alternarCanalUnico(interaction, canalId, canalConfig, guildId) {
  let canalEncontrado = false;
  let canalAlterado = null;
  const COLLECTION_NAME = 'configuracoes';
  
  const statusConfig = await findOne('configuracoes', { _id: 'status' });
  const { positive, negative } = statusConfig;
  
  outerLoop: for (const categoria of canalConfig.categorias) {
    for (const canal of categoria.canais) {
      if (canal.id === canalId) {
        const canalDiscord = interaction.guild.channels.cache.get(canal.id);
        if (!canalDiscord) return [];
        
        if (!await verificarPermissoes(interaction, canalDiscord)) {
          throw ERROS.PERMISSAO_NEGADA;
        }

        canal.visivel = !canal.visivel;
        canalAlterado = canal;
        canalEncontrado = true;
        break outerLoop;
      }
    }
  }

  if (canalEncontrado) {
    await upsert(COLLECTION_NAME, { _id: 'canais' }, { $set: canalConfig });
    return [canalAlterado];
  }

  return [];
}

async function alternarTodosCanais(interaction, canalConfig, guildId) {
  const canaisAlterados = [];
  const COLLECTION_NAME = 'configuracoes';

  for (const categoria of canalConfig.categorias) {
    for (const canal of categoria.canais) {
      const canalDiscord = interaction.guild.channels.cache.get(canal.id);
      if (!canalDiscord) continue;

      if (!await verificarPermissoes(interaction, canalDiscord)) {
        continue;
      }

      canal.visivel = !canal.visivel;
      canaisAlterados.push(canal);
    }
  }

  if (canaisAlterados.length > 0) {
    await upsert(COLLECTION_NAME, { _id: 'canais' }, { $set: canalConfig });
  }

  return canaisAlterados;
}

async function registrarLog(interaction, canaisAfetados = []) {
  try {
    const canalConfig = await findOne('configuracoes', { _id: 'canais' });
    const statusConfig = await findOne('configuracoes', { _id: 'status' });
    
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

    const embed = new EmbedBuilder()
      .setColor(statusConfig.positive)
      .setTitle('🔄 Permissões Alternadas')
      .setDescription(`${interaction.user.tag} alterou as permissões de ${canaisAfetados.length} canal(is)`)
      .addFields(
        { 
          name: 'Canais Afetados', 
          value: canaisAfetados.map(c => `<#${c.id}>`).join('\n').slice(0, 1024) || 'Nenhum canal afetado'
        }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao registrar log:', error);
  }
}

// Exportação do comando
module.exports = {
  data: new SlashCommandBuilder()
    .setName('alternar')
    .setDescription('Alterna as permissões de visualização de um ou mais canais')
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
    await interaction.deferReply({ ephemeral: true });

    try {
      const escopo = interaction.options.getString('escopo') || 'esse_canal';
      const canalAtual = interaction.channel;
      const guildId = interaction.guildId;

      const canalConfig = await findOne('configuracoes', { _id: 'canais' });
      if (!canalConfig || !canalConfig.categorias) {
        return responderErro(interaction, ERROS.CANAL_NAO_ENCONTRADO);
      }

      let canaisAfetados = [];

      if (escopo === 'esse_canal') {
        canaisAfetados = await alternarCanalUnico(interaction, canalAtual.id, canalConfig, guildId);
      } else {
        canaisAfetados = await alternarTodosCanais(interaction, canalConfig, guildId);
      }

      if (!canaisAfetados || canaisAfetados.length === 0) {
        return responderErro(interaction, ERROS.CANAL_NAO_ENCONTRADO);
      }

      await registrarLog(interaction, canaisAfetados);

      const mensagem = escopo === 'esse_canal' 
        ? `✅ Permissões do canal ${canalAtual} foram alteradas com sucesso!`
        : `✅ Permissões de ${canaisAfetados.length} canais foram alteradas com sucesso!`;

      await interaction.editReply({
        content: mensagem,
        flags: 'Ephemeral'
      });

    } catch (erro) {
      console.error('Erro ao executar comando alternar:', erro);
      return responderErro(interaction, ERROS.ERRO_GENERICO(erro));
    }
  }
};