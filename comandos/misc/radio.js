const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const { getCollection } = require('../../configuracoes/database');

const players = new Map();
const connections = new Map();
const lastMessages = new Map();
const radioOwners = new Map();
const disconnectTimers = new Map();

const safeDelete = async (msg) => {
    if (!msg) return false;
    
    try {
        await msg.delete();
        return true;
    } catch (error) {
        if (error.code === 10008) {
            console.log('Tentativa de excluir mensagem que não existe mais:', error.url);
            return true;
        }
        console.error('Erro ao excluir mensagem:', error);
        return false;
    }
};

const safeEdit = async (msg, opts) => {
    if (!msg) return null;
    
    try {
        const editedMsg = await msg.edit(opts);
        return editedMsg;
    } catch (error) {
        if (error.code === 10008) {
            console.log('Tentativa de editar mensagem que não existe mais:', error.url);
            return null;
        }
        console.error('Erro ao editar mensagem:', error);
        return null;
    }
};

async function loadConfig() {
    const collection = await getCollection('radios');
    const config = await collection.findOne({});
    return config || { radios: [], guildConfigs: {} };
}

async function getChannelIds(guildId) {
    try {
        const collection = await getCollection('channelConfigs');
        const config = await collection.findOne({ guildId });
        
        if (!config) return null;
        
        let botChannelId = null;
        let radioChannelId = null;
        
        for (const category of config.categories || []) {
            for (const channel of category.channels || []) {
                if (channel.name === 'bot') {
                    botChannelId = channel.id;
                }
                if (channel.name === 'radio247') {
                    radioChannelId = channel.id;
                }
                
                if (botChannelId && radioChannelId) {
                    return { botChannelId, radioChannelId };
                }
            }
        }
        
        return { botChannelId, radioChannelId };
    } catch (error) {
        console.error('Erro ao buscar IDs dos canais:', error);
        return null;
    }
}

async function hasDjRole(member) {
    try {
        const collection = await getCollection('escopo');
        const cargoConfig = await collection.findOne({ _id: 'cargos' });
        
        if (!cargoConfig?.cargos?.dj) {
            console.error('Configuração de cargo DJ não encontrada');
            return false;
        }
        
        return member.roles.cache.has(cargoConfig.cargos.dj.id);
    } catch (error) {
        console.error('Erro ao verificar cargo de DJ:', error);
        return false;
    }
}

function canControlRadio(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    
    if (!radioOwners.has(guildId)) return true;
    return radioOwners.get(guildId) === userId;
}

function createPlayer(guildId) {
    if (!players.has(guildId)) {
        const player = createAudioPlayer();
        player.on('error', console.error);
        players.set(guildId, player);
    }
    return players.get(guildId);
}

async function disconnectRadio(guildId, client) {
    try {
        const player = players.get(guildId);
        if (player) {
            player.stop();
            players.delete(guildId);
        }
        
        const connection = connections.get(guildId);
        if (connection) {
            connection.destroy();
            connections.delete(guildId);
        }
        
        const message = lastMessages.get(guildId);
        if (message) {
            await safeDelete(message);
            lastMessages.delete(guildId);
        }
        
        if (disconnectTimers.has(guildId)) {
            clearTimeout(disconnectTimers.get(guildId));
            disconnectTimers.delete(guildId);
        }
        
        radioOwners.delete(guildId);
        
        console.log(`Rádio desconectada no servidor ${guildId} devido à saída do líder`);
    } catch (error) {
        console.error(`Erro ao desconectar rádio no servidor ${guildId}:`, error);
    }
}

async function isUserInVoiceChannel(userId, guildId, channelId, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return false;
        
        const member = await guild.members.fetch(userId);
        if (!member) return false;
        
        return member.voice.channelId === channelId;
    } catch (error) {
        console.error('Erro ao verificar presença em canal de voz:', error);
        return false;
    }
}

async function setupLeaderMonitoring(interaction, guildId, userId, channelId) {
    if (disconnectTimers.has(guildId)) {
        clearTimeout(disconnectTimers.get(guildId));
        disconnectTimers.delete(guildId);
    }
    
    const checkInterval = setInterval(async () => {
        if (!connections.has(guildId) || !radioOwners.has(guildId)) {
            clearInterval(checkInterval);
            return;
        }
        
        const isLeaderInCall = await isUserInVoiceChannel(userId, guildId, channelId, interaction.client);
        
        if (!isLeaderInCall) {
            console.log(`Líder da rádio ${userId} saiu do canal de voz em ${guildId}. Agendando desconexão em 1 minuto.`);
            
            if (!disconnectTimers.has(guildId)) {
                const timer = setTimeout(() => {
                    disconnectRadio(guildId, interaction.client);
                    clearInterval(checkInterval);
                }, 60000);
                
                disconnectTimers.set(guildId, timer);
                
                const channelIds = await getChannelIds(guildId).catch(() => null);
                if (channelIds?.botChannelId) {
                    const botChannel = await interaction.client.channels.fetch(channelIds.botChannelId).catch(() => null);
                    if (botChannel) {
                        botChannel.send({
                            content: `⚠️ O DJ responsável <@${userId}> saiu do canal de voz. A rádio será desligada em 1 minuto caso não retorne.`
                        }).catch(console.error);
                    }
                }
            }
        } else if (disconnectTimers.has(guildId)) {
            clearTimeout(disconnectTimers.get(guildId));
            disconnectTimers.delete(guildId);
            
            console.log(`Líder da rádio ${userId} retornou ao canal de voz em ${guildId}. Cancelando desconexão.`);
            
            const channelIds = await getChannelIds(guildId).catch(() => null);
            if (channelIds?.botChannelId) {
                const botChannel = await interaction.client.channels.fetch(channelIds.botChannelId).catch(() => null);
                if (botChannel) {
                    botChannel.send({
                        content: `✅ DJ responsável <@${userId}> retornou ao canal de voz. A rádio continuará funcionando normalmente.`
                    }).catch(console.error);
                }
            }
        }
    }, 15000);
}

async function playRadio(interaction, radioData, message = null) {
    const config = await loadConfig();
    
    let radioName, radioPlace;
    
    if (radioData.includes('_')) {
        [radioName, radioPlace] = radioData.split('_');
    } else {
        radioName = radioData;
    }
    
    const radio = radioPlace
        ? config.radios.find(r => r.name === radioName && r.place === radioPlace)
        : config.radios.find(r => r.name === radioName);
        
    if (!radio) {
        await interaction.followUp({ content: '❌ Rádio não encontrada', ephemeral: true }).catch(console.error);
        return;
    }

    try {
        const channelIds = await getChannelIds(interaction.guild.id);
        if (!channelIds?.radioChannelId) {
            await interaction.followUp({
                content: '❌ Canal de voz para rádio não configurado',
                ephemeral: true
            }).catch(console.error);
            return;
        }

        const voiceChannelId = channelIds.radioChannelId;
        const guildId = interaction.guild.id;
        let connection = connections.get(guildId);
        
        if (!connection) {
            radioOwners.set(guildId, interaction.user.id);
            setupLeaderMonitoring(interaction, guildId, interaction.user.id, voiceChannelId);
            
            connection = joinVoiceChannel({
                channelId: voiceChannelId,
                guildId: guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator
            });
            connections.set(guildId, connection);
        }

        const player = createPlayer(guildId);
        const resource = createAudioResource(radio.url, { inlineVolume: true });
        resource.volume.setVolume(0.4);
        
        player.play(resource);
        connection.subscribe(player);

        const embed = new EmbedBuilder()
            .setColor(0x9146FF)
            .setTitle(`Tocando: ${radio.name}`)
            .setDescription(radio.description)
            .addFields(
                { name: 'Canal', value: `<#${voiceChannelId}>` },
                { name: 'Local', value: radio.place },
                { name: 'DJ Responsável', value: `<@${radioOwners.get(guildId)}>` }
            )
            .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('previous_radio').setLabel('⏮️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('next_radio').setLabel('⏭️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('stop_radio').setLabel('⏹️').setStyle(ButtonStyle.Danger)
        );

        if (message) {
            await safeEdit(message, { embeds: [embed], components: [buttons] });
        } else {
            const msg = await interaction.followUp({ 
                embeds: [embed], 
                components: [buttons],
                fetchReply: true
            }).catch(console.error);
            
            if (msg) lastMessages.set(interaction.guild.id, msg);
        }

    } catch (error) {
        console.error('Erro ao tocar rádio:', error);
        await interaction.followUp({ content: '❌ Erro ao tocar rádio', ephemeral: true }).catch(console.error);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Toca uma rádio no canal de voz dedicado'),

    async execute(interaction) {
        await interaction.deferReply().catch(console.error);
        
        try {
            const isDj = await hasDjRole(interaction.member);
            if (!isDj) {
                return await interaction.editReply({ 
                    content: '❌ Você precisa ter o cargo de DJ para usar este comando.',
                    ephemeral: true 
                }).catch(console.error);
            }
            
            const channelIds = await getChannelIds(interaction.guild.id);
            
            if (!channelIds?.botChannelId || !channelIds?.radioChannelId) {
                return await interaction.editReply({ 
                    content: '❌ Os canais "bot" e "radio247" não foram encontrados na configuração. Verifique se eles existem.',
                    ephemeral: true 
                }).catch(console.error);
            }
            
            if (interaction.channel.id !== channelIds.botChannelId) {
                return await interaction.editReply({ 
                    content: `❌ Esse comando só pode ser usado no canal <#${channelIds.botChannelId}>.`,
                    ephemeral: true 
                }).catch(console.error);
            }
            
            const radioVoiceChannel = interaction.guild.channels.cache.get(channelIds.radioChannelId);
            if (!radioVoiceChannel) {
                return await interaction.editReply({ 
                    content: '❌ O canal de voz da rádio não foi encontrado.',
                    ephemeral: true 
                }).catch(console.error);
            }
            
            const guildId = interaction.guild.id;
            if (connections.has(guildId) && !canControlRadio(interaction)) {
                return await interaction.editReply({ 
                    content: `❌ Apenas <@${radioOwners.get(guildId)}> pode controlar a rádio nesta sessão.`,
                    ephemeral: true 
                }).catch(console.error);
            }
            
            await safeDelete(lastMessages.get(interaction.guild.id));
            
            const config = await loadConfig();
            
            const menuOptions = config.radios.map((r, index) => ({
                label: `${r.name} (${r.place})`,
                description: r.description || 'Sem descrição',
                value: `${index}_${r.name}_${r.place}`
            }));
            
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_radio')
                    .setPlaceholder('Escolha uma rádio')
                    .addOptions(menuOptions)
            );
            
            const reply = await interaction.editReply({
                content: 'Selecione uma rádio:',
                components: [menu]
            }).catch(console.error);
            
            if (reply) lastMessages.set(interaction.guild.id, reply);
        } catch (error) {
            console.error('Erro ao executar comando de rádio:', error);
            await interaction.editReply({
                content: '❌ Ocorreu um erro ao processar o comando.',
                ephemeral: true
            }).catch(console.error);
        }
    },

    async handleSelectMenu(interaction) {
        await interaction.deferUpdate().catch(console.error);
        
        try {
            const isDj = await hasDjRole(interaction.member);
            if (!isDj) {
                await interaction.followUp({ 
                    content: '❌ Você precisa ter o cargo de DJ para usar este comando.',
                    ephemeral: true 
                }).catch(console.error);
                return;
            }
            
            const guildId = interaction.guild.id;
            if (connections.has(guildId) && !canControlRadio(interaction)) {
                await interaction.followUp({ 
                    content: `❌ Apenas <@${radioOwners.get(guildId)}> pode controlar a rádio nesta sessão.`,
                    ephemeral: true 
                }).catch(console.error);
                return;
            }
            
            const channelIds = await getChannelIds(interaction.guild.id);
            if (!channelIds?.botChannelId || !channelIds?.radioChannelId) return;
            
            if (interaction.channel.id !== channelIds.botChannelId) return;
            
            const selectedValue = interaction.values[0];
            const parts = selectedValue.split('_');
            
            if (parts.length >= 3) {
                const index = parts[0];
                const place = parts[parts.length - 1];
                
                const config = await loadConfig();
                const radioIndex = parseInt(index);
                
                if (!isNaN(radioIndex) && radioIndex >= 0 && radioIndex < config.radios.length) {
                    const radio = config.radios[radioIndex];
                    await playRadio(interaction, radio.name + "_" + radio.place);
                }
            }
            
            if (interaction.message) {
                await interaction.message.delete().catch(() => {});
            }
        } catch (error) {
            console.error('Erro ao processar seleção de rádio:', error);
        }
    },

    async handleButton(interaction) {
        if (!interaction.customId.endsWith('radio')) return;
        
        await interaction.deferUpdate().catch(console.error);
        
        try {
            const isDj = await hasDjRole(interaction.member);
            if (!isDj) {
                await interaction.followUp({ 
                    content: '❌ Você precisa ter o cargo de DJ para usar este comando.',
                    ephemeral: true 
                }).catch(console.error);
                return;
            }
            
            const guildId = interaction.guild.id;
            if (!canControlRadio(interaction)) {
                await interaction.followUp({ 
                    content: `❌ Apenas <@${radioOwners.get(guildId)}> pode controlar a rádio nesta sessão.`,
                    ephemeral: true 
                }).catch(console.error);
                return;
            }
            
            const channelIds = await getChannelIds(interaction.guild.id);
            if (!channelIds?.botChannelId || !channelIds?.radioChannelId) return;
            
            if (interaction.channel.id !== channelIds.botChannelId) return;
            
            const config = await loadConfig();
            const radioName = interaction.message.embeds[0].title.split(': ')[1];
            const radioPlace = interaction.message.embeds[0].fields.find(field => field.name === 'Local')?.value;
            
            let currentIndex = -1;
            if (radioPlace) {
                currentIndex = config.radios.findIndex(r => r.name === radioName && r.place === radioPlace);
            } else {
                currentIndex = config.radios.findIndex(r => r.name === radioName);
            }
            
            if (currentIndex === -1) {
                currentIndex = config.radios.findIndex(r => r.name === radioName);
            }
            
            if (interaction.customId === 'stop_radio') {
                await disconnectRadio(guildId, interaction.client);
                return;
            }
            
            const newIndex = interaction.customId === 'previous_radio' 
                ? (currentIndex - 1 + config.radios.length) % config.radios.length
                : (currentIndex + 1) % config.radios.length;
            
            const nextRadio = config.radios[newIndex];
            await playRadio(interaction, `${nextRadio.name}_${nextRadio.place}`, interaction.message);
        } catch (error) {
            console.error('Erro ao processar botão de rádio:', error);
        }
    },
    
    disconnectRadio
};

module.exports.connections = connections;
module.exports.radioOwners = radioOwners;
module.exports.disconnectTimers = disconnectTimers;