const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { MongoClient } = require('mongodb');

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
    
    // Usar a conexão MongoDB do index.js
    const client = new MongoClient(process.env.MONGO_URI);
    
    try {
      // Conectar ao MongoDB
      await client.connect();
      const db = client.db('ignis'); // Usar o mesmo nome de banco de dados do index.js
      const collection = db.collection('channelConfigs');
      
      // Buscar configuração no MongoDB
      let channelConfig = await collection.findOne({ guildId });
      
      // Se não existir, importar do arquivo JSON e salvar no MongoDB
      if (!channelConfig) {
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(__dirname, '../../configuracoes/channel.json');
        
        if (fs.existsSync(configPath)) {
          const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          
          // Verificar e adicionar objeto permissions a todos os canais que não o possuem
          for (const category of configData.categories) {
            for (const channel of category.channels) {
              if (!channel.permissions) {
                channel.permissions = {
                  send_messages: false,
                  add_reactions: false
                };
              }
            }
          }
          
          channelConfig = {
            guildId,
            categories: configData.categories
          };
          await collection.insertOne(channelConfig);
        } else {
          await client.close();
          return interaction.editReply('Erro: Arquivo de configuração não encontrado.');
        }
      } else {
        // Verificar e adicionar objeto permissions para canais no MongoDB
        let updated = false;
        for (const category of channelConfig.categories) {
          for (const channel of category.channels) {
            if (!channel.permissions) {
              channel.permissions = {
                send_messages: false,
                add_reactions: false
              };
              updated = true;
            }
          }
        }
        
        // Se algum canal foi atualizado, salvamos as alterações
        if (updated) {
          await collection.updateOne({ guildId }, { $set: channelConfig });
        }
      }
      
      if (escopo === 'esse_canal') {
        // Alternar permissões apenas para o canal atual
        let channelFound = false;
        let channelName = '';
        
        for (const category of channelConfig.categories) {
          for (const channel of category.channels) {
            if (channel.id === currentChannelId) {
              // Verificar se permissions existe
              if (!channel.permissions) {
                channel.permissions = {
                  send_messages: false,
                  add_reactions: false
                };
              }
              
              // Inverter todas as permissões
              for (const perm in channel.permissions) {
                channel.permissions[perm] = !channel.permissions[perm];
              }
              channelFound = true;
              channelName = channel.name;
              break;
            }
          }
          if (channelFound) break;
        }
        
        if (!channelFound) {
          await client.close();
          return interaction.editReply('Este canal não foi encontrado na configuração.');
        }
        
        // Aplicar as permissões no Discord
        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.cache.find(role => role.name === '@everyone');
        
        const channelData = channelConfig.categories
          .flatMap(category => category.channels)
          .find(c => c.id === currentChannelId);
        
        await channel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: channelData.permissions.send_messages,
          AddReactions: channelData.permissions.add_reactions
        });
        
        await interaction.editReply(`Permissões do canal #${channelName} foram alternadas com sucesso.`);
      } else {
        // Alternar permissões para todos os canais
        const affectedChannels = [];
        
        for (const category of channelConfig.categories) {
          for (const channel of category.channels) {
            // Verificar se permissions existe
            if (!channel.permissions) {
              channel.permissions = {
                send_messages: false,
                add_reactions: false
              };
            }
            
            // Inverter todas as permissões
            for (const perm in channel.permissions) {
              channel.permissions[perm] = !channel.permissions[perm];
            }
            
            // Aplicar as permissões no Discord
            const discordChannel = interaction.guild.channels.cache.get(channel.id);
            if (discordChannel) {
              const everyoneRole = interaction.guild.roles.cache.find(role => role.name === '@everyone');
              
              await discordChannel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: channel.permissions.send_messages,
                AddReactions: channel.permissions.add_reactions
              });
              
              // Adicionar à lista de canais afetados
              affectedChannels.push({
                name: channel.name,
                id: channel.id,
                category: category.name,
                permissions: channel.permissions
              });
            }
          }
        }
        
        // Criar a embed com as informações
        const embed = new EmbedBuilder()
          .setTitle('Permissões Alternadas')
          .setColor('#00FF00')
          .setDescription(`Foram alternadas as permissões de ${affectedChannels.length} canais.`)
          .setTimestamp();
          
        // Agrupar canais por categoria para a embed
        const categorizedChannels = {};
        for (const channel of affectedChannels) {
          if (!categorizedChannels[channel.category]) {
            categorizedChannels[channel.category] = [];
          }
          categorizedChannels[channel.category].push(channel);
        }
        
        // Adicionar campos por categoria (limite de 25 campos no total)
        const maxFields = 25;
        let fieldCount = 0;
        
        for (const category in categorizedChannels) {
          if (fieldCount >= maxFields) break;
          
          // Criar texto com os canais desta categoria
          let channelList = '';
          for (const channel of categorizedChannels[category]) {
            const status = channel.permissions.send_messages ? '✅' : '❌';
            channelList += `${status} <#${channel.id}>\n`;
            
            // Evitar exceder o limite de 1024 caracteres por campo
            if (channelList.length > 900) {
              channelList += '... e mais canais';
              break;
            }
          }
          
          embed.addFields({ name: `📁 ${category}`, value: channelList || 'Nenhum canal afetado', inline: false });
          fieldCount++;
        }
        
        // Adicionar campo de legenda
        if (fieldCount < maxFields) {
          embed.addFields({ 
            name: 'Legenda', 
            value: '🔓 - Envio de mensagens permitido\n🔒 - Envio de mensagens bloqueado', 
            inline: false 
          });
        }
        
        // Enviar embed com os resultados
        await interaction.editReply({ embeds: [embed] });
      }
      
      // Salvar as alterações no MongoDB
      await collection.updateOne(
        { guildId },
        { $set: channelConfig },
        { upsert: true }
      );
      
    } catch (error) {
      console.error('Erro ao alternar permissões:', error);
      await interaction.editReply('Ocorreu um erro ao alternar as permissões dos canais.');
    } finally {
      // Fechar conexão com MongoDB
      await client.close();
    }
  },
};
