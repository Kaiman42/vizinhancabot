const { upsert } = require('../../../configuracoes/mongodb');
const { PermissionFlagsBits } = require('discord.js');

async function verificarPermissoes(interaction, canal) {
  const member = interaction.member;
  const permissions = canal.permissionsFor(member);
  return permissions.has(PermissionFlagsBits.ManageChannels);
}

async function alternarCanalUnico(interaction, canalId, canalConfig, guildId) {
  let canalEncontrado = false;
  let canalAlterado = null;
  const COLLECTION_NAME = 'configuracoes';
  
  // Encontrar e alterar as permissões do canal específico
  outerLoop: for (const categoria of canalConfig.categorias) {
    for (const canal of categoria.canais) {
      if (canal.id === canalId) {
        const canalDiscord = interaction.guild.channels.cache.get(canal.id);
        if (!canalDiscord) return [];
        
        if (!await verificarPermissoes(interaction, canalDiscord)) {
          return null;  // Indica permissão negada
        }

        if (!canal.permissoes) {
          canal.permissoes = {
            enviarMensagens: false,
            adicionarReacoes: false
          };
        }
        
        canal.permissoes.enviarMensagens = !canal.permissoes.enviarMensagens;
        canal.permissoes.adicionarReacoes = !canal.permissoes.adicionarReacoes;
        canalEncontrado = true;
        canalAlterado = {
          nome: canal.nome,
          id: canal.id,
          categoria: categoria.nome,
          permissoes: canal.permissoes
        };
        break outerLoop;
      }
    }
  }

  if (!canalEncontrado) return [];
  
  // Aplicar as permissões no Discord
  const canal = interaction.channel;
  const cargoEveryone = interaction.guild.roles.cache.find(role => role.name === '@everyone');
  await canal.permissionOverwrites.edit(cargoEveryone, {
    SendMessages: canalAlterado.permissoes.enviarMensagens,
    AddReactions: canalAlterado.permissoes.adicionarReacoes
  });
  
  // Salvar alterações no MongoDB
  await upsert(COLLECTION_NAME, { _id: 'canais' }, { $set: canalConfig });
  return [canalAlterado];
}

async function alternarTodosCanais(interaction, canalConfig, guildId) {
  const canaisAfetados = [];
  const COLLECTION_NAME = 'configuracoes';

  for (const categoria of canalConfig.categorias) {
    for (const canal of categoria.canais) {
      if (!canal.permissoes) continue;
      
      const canalDiscord = interaction.guild.channels.cache.get(canal.id);
      if (!canalDiscord) continue;

      if (!await verificarPermissoes(interaction, canalDiscord)) {
        continue;  // Pula canais sem permissão
      }

      canal.permissoes.enviarMensagens = !canal.permissoes.enviarMensagens;
      canal.permissoes.adicionarReacoes = !canal.permissoes.adicionarReacoes;
      
      const cargoEveryone = interaction.guild.roles.cache.find(role => role.name === '@everyone');
      await canalDiscord.permissionOverwrites.edit(cargoEveryone, {
        SendMessages: canal.permissoes.enviarMensagens,
        AddReactions: canal.permissoes.adicionarReacoes
      });

      canaisAfetados.push({
        nome: canal.nome,
        id: canal.id,
        categoria: categoria.nome,
        permissoes: canal.permissoes
      });
    }
  }

  if (canaisAfetados.length > 0) {
    await upsert(COLLECTION_NAME, { _id: 'canais' }, { $set: canalConfig });
  }
  return canaisAfetados;
}

module.exports = {
  alternarCanalUnico,
  alternarTodosCanais
};
