const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { findOne, upsert } = require('../../configuracoes/mongodb');
const fs = require('fs');
const path = require('path');

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
      
      // Buscar configuração no MongoDB
      let canalConfig = await findOne(COLLECTION_NAME, { _id: DOCUMENT_ID });
      
      if (!canalConfig) {
        return interaction.editReply('Erro: Configuração de canais não encontrada.');
      }
      
      // Verificar e processar os canais conforme o escopo selecionado
      if (escopo === 'esse_canal') {
        await alternarCanalUnico(interaction, currentChannelId, canalConfig, guildId);
      } else {
        await alternarTodosCanais(interaction, canalConfig, guildId);
      }
      
    } catch (error) {
      console.error('Erro ao alternar permissões:', error);
      await interaction.editReply('Ocorreu um erro ao alternar as permissões dos canais.');
    }
  },
};

async function alternarCanalUnico(interaction, canalId, canalConfig, guildId) {
  let canalEncontrado = false;
  let canalAlterado = null;
  const COLLECTION_NAME = 'configuracoes';
  
  // Encontrar e alterar as permissões do canal específico
  outerLoop: for (const categoria of canalConfig.categorias) {
    for (const canal of categoria.canais) {
      if (canal.id === canalId) {
        if (!canal.permissoes) {
          canal.permissoes = {
            enviarMensagens: false,
            adicionarReacoes: false
          };
        }
        
        // Inverter permissões
        canal.permissoes.enviarMensagens = !canal.permissoes.enviarMensagens;
        canal.permissoes.adicionarReacoes = !canal.permissoes.adicionarReacoes;
        
        canalEncontrado = true;
        canalAlterado = { 
          nome: canal.nome, 
          permissoes: canal.permissoes 
        };
        break outerLoop;
      }
    }
  }
  
  if (!canalEncontrado) {
    return interaction.editReply('Este canal não foi encontrado na configuração.');
  }
  
  // Aplicar as permissões no Discord
  const canal = interaction.channel;
  const cargoEveryone = interaction.guild.roles.cache.find(role => role.name === '@everyone');
  
  await canal.permissionOverwrites.edit(cargoEveryone, {
    SendMessages: canalAlterado.permissoes.enviarMensagens,
    AddReactions: canalAlterado.permissoes.adicionarReacoes
  });
  
  // Salvar alterações no MongoDB
  await upsert(COLLECTION_NAME, { _id: 'canais' }, { $set: canalConfig });
  
  // Responder ao usuário
  const status = canalAlterado.permissoes.enviarMensagens ? 'liberadas' : 'bloqueadas';
  await interaction.editReply(`Permissões do canal #${canalAlterado.nome} foram ${status}.`);
}

async function alternarTodosCanais(interaction, canalConfig, guildId) {
  const canaisAfetados = [];
  const COLLECTION_NAME = 'configuracoes';
  
  for (const categoria of canalConfig.categorias) {
    for (const canal of categoria.canais) {
      // Ignorar canais sem permissões definidas no DB
      if (!canal.permissoes) continue;
      
      // Inverter permissões
      canal.permissoes.enviarMensagens = !canal.permissoes.enviarMensagens;
      canal.permissoes.adicionarReacoes = !canal.permissoes.adicionarReacoes;
      
      // Aplicar as permissões no Discord
      const canalDiscord = interaction.guild.channels.cache.get(canal.id);
      if (canalDiscord) {
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
  }
  
  // Salvar alterações no MongoDB
  await upsert(COLLECTION_NAME, { _id: 'canais' }, { $set: canalConfig });
  
  // Criar embed com resultados
  const embed = criarEmbedResultados(canaisAfetados);
  
  // Responder ao usuário
  await interaction.editReply({ embeds: [embed] });
}

function criarEmbedResultados(canaisAfetados) {
  const embed = new EmbedBuilder()
    .setTitle('Permissões Alternadas')
    .setColor('#00FF00')
    .setDescription(`Foram alternadas as permissões de ${canaisAfetados.length} canais.`)
    .setTimestamp();
    
  // Agrupar canais por categoria
  const canaisPorCategoria = {};
  for (const canal of canaisAfetados) {
    if (!canaisPorCategoria[canal.categoria]) {
      canaisPorCategoria[canal.categoria] = [];
    }
    canaisPorCategoria[canal.categoria].push(canal);
  }
  
  // Adicionar campos por categoria (limite de 25 campos no total)
  const maxCampos = 25;
  let contadorCampos = 0;
  
  for (const categoria in canaisPorCategoria) {
    if (contadorCampos >= maxCampos) break;
    
    let listaCanais = '';
    for (const canal of canaisPorCategoria[categoria]) {
      const status = canal.permissoes.enviarMensagens ? '✅' : '❌';
      listaCanais += `${status} <#${canal.id}>\n`;
      
      if (listaCanais.length > 900) {
        listaCanais += '... e mais canais';
        break;
      }
    }
    
    embed.addFields({ name: `📁 ${categoria}`, value: listaCanais || 'Nenhum canal afetado', inline: false });
    contadorCampos++;
  }
  
  // Adicionar legenda
  if (contadorCampos < maxCampos) {
    embed.addFields({ 
      name: 'Legenda', 
      value: '✅ - Envio de mensagens permitido\n❌ - Envio de mensagens bloqueado', 
      inline: false 
    });
  }
  
  return embed;
}
