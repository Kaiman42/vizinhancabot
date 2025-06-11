const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const path = require('path');
const { findOne, updateOne } = require(path.resolve(__dirname, '../../mongodb.js'));
const { gerarCorAleatoria } = require('../../configuracoes/randomColor.js');

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
        // Ignorar canal bloqueado
        if (canal.tipo === 'bloqueado') return [];
        const canalDiscord = interaction.guild.channels.cache.get(canal.id);
        if (!canalDiscord) return [];
        
        if (!await verificarPermissoes(interaction, canalDiscord)) {
          throw ERROS.PERMISSAO_NEGADA;
        }

        // Alterna as permissões do objeto de configuração
        if (canal.permissoes) {
          for (const chave in canal.permissoes) {
            canal.permissoes[chave] = !canal.permissoes[chave];
          }
        }
        canalAlterado = canal;
        canalEncontrado = true;
        // --- ALTERAÇÃO REAL DAS PERMISSÕES ---
        const everyoneRole = interaction.guild.roles.everyone;
        // Mapeamento das permissões customizadas para Discord.js
        const map = {
          enviarMensagens: 'SendMessages',
          adicionarReacoes: 'AddReactions'
        };
        let perms = {};
        if (canal.permissoes) {
          for (const chave in canal.permissoes) {
            if (map[chave]) {
              // Se for desbloquear (true), setar como null para neutro
              if (canal.permissoes[chave] === true) {
                perms[map[chave]] = null;
              } else {
                perms[map[chave]] = false;
              }
            }
          }
        }
        await canalDiscord.permissionOverwrites.edit(everyoneRole, perms);
        // --------------------------------------
        break outerLoop;
      }
    }
  }

  if (canalEncontrado) {
    await updateOne(COLLECTION_NAME, { _id: 'canais' }, { $set: canalConfig }, { upsert: true });
    return [canalAlterado];
  }

  return [];
}

async function alternarTodosCanais(interaction, canalConfig, guildId, filtroTipo = null) {
  const canaisAlterados = [];
  const COLLECTION_NAME = 'configuracoes';

  for (const categoria of canalConfig.categorias) {
    for (const canal of categoria.canais) {
      // Ignorar canais bloqueados
      if (canal.tipo === 'bloqueado') continue;
      // Filtrar por tipo se necessário
      if (filtroTipo && !filtroTipo.includes(canal.tipo)) continue;
      const canalDiscord = interaction.guild.channels.cache.get(canal.id);
      if (!canalDiscord) continue;

      if (!await verificarPermissoes(interaction, canalDiscord)) {
        continue;
      }

      // Alterna as permissões do objeto de configuração
      if (canal.permissoes) {
        for (const chave in canal.permissoes) {
          canal.permissoes[chave] = !canal.permissoes[chave];
        }
      }
      canaisAlterados.push(canal);
      // --- ALTERAÇÃO REAL DAS PERMISSÕES ---
      const everyoneRole = interaction.guild.roles.everyone;
      const map = {
        enviarMensagens: 'SendMessages',
        adicionarReacoes: 'AddReactions',
        verCanal: 'ViewChannel',
      };
      let perms = {};
      if (canal.permissoes) {
        for (const chave in canal.permissoes) {
          if (map[chave]) {
            if (canal.permissoes[chave] === true) {
              perms[map[chave]] = null;
            } else {
              perms[map[chave]] = false;
            }
          }
        }
      }
      await canalDiscord.permissionOverwrites.edit(everyoneRole, perms);
      // --------------------------------------
    }
  }

  if (canaisAlterados.length > 0) {
    await updateOne(COLLECTION_NAME, { _id: 'canais' }, { $set: canalConfig }, { upsert: true });
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

    // Novo embed igual ao ephemeral, mas com extras
    let embed;
    const userTag = `<@${interaction.user.id}>`;
    if (canaisAfetados.length === 1) {
      const canal = canaisAfetados[0];
      const canalDiscord = interaction.guild.channels.cache.get(canal.id);
      const everyoneRole = interaction.guild.roles.everyone;
      const perms = canalDiscord.permissionOverwrites.cache.get(everyoneRole.id);
      const bloqueado = perms && ((perms.deny.has('ViewChannel')) || perms.deny.has('SendMessages'));
      // Descobrir quais permissões mudaram
      const map = {
        enviarMensagens: 'SendMessages',
        adicionarReacoes: 'AddReactions'
      };
      let alteradas = [];
      if (canal.permissoes) {
        for (const chave in canal.permissoes) {
          if (map[chave]) alteradas.push(map[chave]);
        }
      }
      embed = new EmbedBuilder()
        .setColor(gerarCorAleatoria())
        .setTitle(bloqueado ? '🔒 Canal Bloqueado' : '🔓 Canal Desbloqueado')
        .setDescription(`O canal <#${canal.id}> foi ${bloqueado ? 'bloqueado' : 'desbloqueado'} para conversação.`)
        .addFields(
          { name: 'Usuário', value: userTag, inline: true },
          { name: 'Permissões alteradas', value: alteradas.length ? `\`${alteradas.join(', ')}\`` : 'Nenhuma' }
        )
        .setFooter({ text: `ID do canal: ${canal.id}` })
        .setTimestamp();
    } else {
      // Para todos canais, mostrar resumo
      const bloqueados = canaisAfetados.filter(c => c.visivel === false).length;
      const desbloqueados = canaisAfetados.length - bloqueados;
      // Permissões alteradas (únicas)
      let alteradas = new Set();
      const map = {
        enviarMensagens: 'SendMessages',
        adicionarReacoes: 'AddReactions',
        verCanal: 'ViewChannel',
      };
      canaisAfetados.forEach(canal => {
        if (canal.permissoes) {
          for (const chave in canal.permissoes) {
            if (map[chave]) alteradas.add(map[chave]);
          }
        }
      });
      embed = new EmbedBuilder()
        .setColor(gerarCorAleatoria())
        .setTitle('🔄 Permissões Alteradas')
        .setDescription(`${userTag} alterou as permissões de ${canaisAfetados.length} canal(is).`)
        .addFields(
          { name: 'Canais bloqueados', value: String(bloqueados), inline: true },
          { name: 'Canais desbloqueados', value: String(desbloqueados), inline: true },
          { name: 'Permissões alteradas', value: alteradas.size ? `\`${[...alteradas].join(', ')}\`` : 'Nenhuma' }
        )
        .setTimestamp();
    }
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
          { name: 'Todos canais de texto', value: 'todos_texto' },
          { name: 'Todos canais de voz', value: 'todos_voz' },
          { name: 'Todos canais de texto e voz', value: 'todos_texto_voz' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const escopo = interaction.options.getString('escopo');
      const canalAtual = interaction.channel;
      const guildId = interaction.guildId;

      const canalConfig = await findOne('configuracoes', { _id: 'canais' });
      if (!canalConfig || !canalConfig.categorias) {
        return responderErro(interaction, ERROS.CANAL_NAO_ENCONTRADO);
      }

      let canaisAfetados = [];
      if (!escopo) {
        // Ignorar se o canal for bloqueado
        let canalInfo = null;
        for (const categoria of canalConfig.categorias) {
          canalInfo = categoria.canais.find(c => c.id === canalAtual.id);
          if (canalInfo) break;
        }
        if (canalInfo && canalInfo.tipo === 'bloqueado') {
          return responderErro(interaction, '❌ Este canal está bloqueado e não pode ser alterado.');
        }
        canaisAfetados = await alternarCanalUnico(interaction, canalAtual.id, canalConfig, guildId);
      } else {
        // Filtros de tipo
        let filtroTipo = null;
        if (escopo === 'todos_texto') filtroTipo = ['texto'];
        else if (escopo === 'todos_voz') filtroTipo = ['voz'];
        else if (escopo === 'todos_texto_voz') filtroTipo = ['texto', 'voz'];
        canaisAfetados = await alternarTodosCanais(interaction, canalConfig, guildId, filtroTipo);
      }

      if (!canaisAfetados || canaisAfetados.length === 0) {
        return responderErro(interaction, ERROS.CANAL_NAO_ENCONTRADO);
      }

      await registrarLog(interaction, canaisAfetados);

      // Novo embed de resposta intuitivo
      let embed;
      if (escopo === 'esse_canal') {
        const canal = canaisAfetados[0];
        // Verifica o estado real das permissões após a alteração
        const canalDiscord = interaction.guild.channels.cache.get(canal.id);
        const everyoneRole = interaction.guild.roles.everyone;
        const perms = canalDiscord.permissionOverwrites.cache.get(everyoneRole.id);
        // Considera bloqueado se não pode ver ou enviar mensagens
        const bloqueado = perms && ((perms.deny.has('ViewChannel')) || perms.deny.has('SendMessages'));
        embed = new EmbedBuilder()
          .setColor(gerarCorAleatoria())
          .setTitle(bloqueado ? '🔒 Canal Bloqueado' : '🔓 Canal Desbloqueado')
          .setDescription(`O canal ${canalAtual} foi ${bloqueado ? 'bloqueado' : 'desbloqueado'} para conversação.`)
          .setFooter({ text: `ID do canal: ${canalAtual.id}` })
          .setTimestamp();
      } else {
        // Para todos canais, mostrar resumo
        const bloqueados = canaisAfetados.filter(c => c.visivel === false).length;
        const desbloqueados = canaisAfetados.length - bloqueados;
        embed = new EmbedBuilder()
          .setColor(gerarCorAleatoria())
          .setTitle('🔄 Permissões Alteradas')
          .setDescription(`Foram alteradas as permissões de ${canaisAfetados.length} canais.`)
          .addFields(
            { name: 'Canais bloqueados', value: String(bloqueados), inline: true },
            { name: 'Canais desbloqueados', value: String(desbloqueados), inline: true }
          )
          .setTimestamp();
      }

      await interaction.editReply({ embeds: [embed], flags: 'Ephemeral' });

    } catch (erro) {
      console.error('Erro ao executar comando alternar:', erro);
      return responderErro(interaction, ERROS.ERRO_GENERICO(erro));
    }
  }
};