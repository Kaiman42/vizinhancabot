const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const mongodb = require('../../../configuracoes/mongodb');
const { RadioError, handleRadioError } = require('./erros');
const { LIMITS } = require('./limites');
const { checkRadioPermissions } = require('./permissoes');
const { players, connections, radioMessages, radioOwners, setupEmptyCheck, clearRadioState } = require('./estado');

// Cache das rádios
let radioCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 300000; // 5 minutos

// Funções auxiliares
async function getCachedRadios() {
    const now = Date.now();
    if (!radioCache || now - lastCacheTime > CACHE_DURATION) {
        const radiosDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'radios' });
        if (!radiosDoc?.Kaiman?.length) {
            throw new RadioError('❌ Nenhuma rádio encontrada na configuração.');
        }
        
        radioCache = radiosDoc.Kaiman.map((radio, index) => ({
            name: radio.name || 'Sem nome',
            place: radio.place || 'Desconhecido',
            description: radio.description || 'Sem descrição',
            url: radio.url
        })).filter(radio => radio.url);

        if (!radioCache.length) {
            throw new RadioError('❌ Nenhuma rádio válida encontrada.');
        }
        
        lastCacheTime = now;
    }
    return radioCache;
}

// Gerenciamento de conexão e player
async function setupVoiceConnection(interaction) {
    const guildId = interaction.guild.id;
    const voiceChannel = interaction.member.voice.channel;
    
    let connection = connections.get(guildId);
    if (!connection) {
        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });
        connections.set(guildId, connection);
        radioOwners.set(guildId, interaction.user.id);
    }

    let player = players.get(guildId);
    if (!player) {
        player = createAudioPlayer();
        players.set(guildId, player);
        connection.subscribe(player);
    }

    return { connection, player, voiceChannel };
}

const { gerarCorAleatoria } = require('../../../configuracoes/randomColor');

// Criação de embed para rádio
function createRadioEmbed(radio, interaction, radioIndex, totalRadios, voiceChannel) {
    return new EmbedBuilder()
        .setColor(gerarCorAleatoria())
        .setTitle(`🎵 ${radio.name} 🎶`)
        .setDescription(radio.description)
        .addFields(
            { name: '📍 Local', value: radio.place },
            { name: '🎧 Canal', value: `<#${voiceChannel.id}>` },
            { name: '🎭 DJ', value: `<@${interaction.user.id}>` }
        )
        .setFooter({ text: `Rádio ${radioIndex + 1}/${totalRadios}` })
        .setTimestamp();
}

// Gerenciamento de paginação
function createPaginationComponents(radios, currentPage, radiosPerPage) {
    const totalPages = Math.ceil(radios.length / radiosPerPage);
    const startIndex = currentPage * radiosPerPage;
    const endIndex = Math.min((currentPage + 1) * radiosPerPage, radios.length);

    const options = radios
        .slice(startIndex, endIndex)
        .map((radio, index) => ({
            label: radio.name,
            description: radio.place || 'Desconhecido',
            value: (index + startIndex).toString()
        }));

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('radio_play')
            .setPlaceholder('Selecione uma rádio')
            .addOptions(options)
    );

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`radio_prev_page_${currentPage}`)
            .setLabel('Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`radio_next_page_${currentPage}`)
            .setLabel('Próxima')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages - 1)
    );

    return { row, buttonRow, totalPages };
}

// Funções principais
async function handlePlay(interaction) {
    try {
        await checkRadioPermissions(interaction);
        const radioIndex = parseInt(interaction.values[0]);
        const radios = await getCachedRadios();
        
        if (radioIndex < 0 || radioIndex >= radios.length) {
            throw new RadioError('❌ Índice de rádio inválido.');
        }

        const radio = radios[radioIndex];
        const { player, voiceChannel } = await setupVoiceConnection(interaction);

        const resource = createAudioResource(radio.url, {
            inlineVolume: true,
        });
        resource.volume?.setVolume(LIMITS.DEFAULT_VOLUME);
        player.play(resource);        const embed = createRadioEmbed(radio, interaction, radioIndex, radios.length, voiceChannel);
          // Criar menu seletor paginado para troca rápida
        const radiosPerPage = 24; // Máximo de 25 opções, deixando 24 para melhor divisão
        const currentPage = Math.floor(radioIndex / radiosPerPage);
        const startIndex = currentPage * radiosPerPage;
        const endIndex = Math.min(startIndex + radiosPerPage, radios.length);
        
        const pageOptions = radios
            .slice(startIndex, endIndex)
            .map((r, index) => ({
                label: r.name,
                description: r.place || 'Desconhecido',
                value: (index + startIndex).toString(),
                default: (index + startIndex) === radioIndex
            }));

        const selectMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('radio_play')
                .setPlaceholder(`Trocar rádio (${currentPage + 1}/${Math.ceil(radios.length / radiosPerPage)})`)
                .addOptions(pageOptions)
        );

        // Botões de navegação e controle
        const controlButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('radio_stop')
                .setLabel('⏹️ Parar')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`radio_prev_page_${currentPage}`)
                .setLabel('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId(`radio_next_page_${currentPage}`)
                .setLabel('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(endIndex >= radios.length)
        );
        
        const guildId = interaction.guild.id;
        
        // Apagar mensagem antiga do player de rádio, se existir
        const oldMessage = radioMessages.get(guildId);
        if (oldMessage) {
            try {
                await oldMessage.delete();
            } catch (error) {
                console.error("Erro ao apagar mensagem antiga:", error);
            }
        }        // Apagar a mensagem original de seleção
        try {
            await interaction.message.delete();
        } catch (error) {
            // Ignora erro 10008 (Unknown Message) pois significa que a mensagem já foi deletada
            if (error.code !== 10008) {
                console.error("Erro ao apagar mensagem de seleção:", error);
            }
        }        // Criar nova mensagem com o player da rádio
        const message = await interaction.channel.send({
            embeds: [embed],
            components: [selectMenu, controlButtons]
        });

        radioMessages.set(guildId, message);
        setupEmptyCheck(guildId, voiceChannel.id, interaction.client);

    } catch (error) {
        await handleRadioError(error, interaction);
    }
}

async function handleButton(interaction) {
    try {
        await checkRadioPermissions(interaction);
        if (!interaction.isButton()) return;

        const customId = interaction.customId;
        const guildId = interaction.guild.id;

        if (customId === 'radio_stop') {
            await stopRadio(guildId, interaction);
            return;
        }

        const radios = await getCachedRadios();
        const radiosPerPage = 24; // Consistente com handlePlay
        const currentPage = parseInt(customId.split('_')[3]) || 0;
        const newPage = customId.includes('next_page') ? currentPage + 1 : currentPage - 1;

        if (interaction.message.embeds.length > 0) {
            // Se estiver na tela da rádio (tem embed), atualizar o menu de troca rápida
            const startIndex = newPage * radiosPerPage;
            const endIndex = Math.min(startIndex + radiosPerPage, radios.length);
            
            const pageOptions = radios
                .slice(startIndex, endIndex)
                .map((r, index) => ({
                    label: r.name,
                    description: r.place || 'Desconhecido',
                    value: (index + startIndex).toString()
                }));

            const selectMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('radio_play')
                    .setPlaceholder(`Trocar rádio (${newPage + 1}/${Math.ceil(radios.length / radiosPerPage)})`)
                    .addOptions(pageOptions)
            );

            const controlButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('radio_stop')
                    .setLabel('⏹️ Parar')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`radio_prev_page_${newPage}`)
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(newPage === 0),
                new ButtonBuilder()
                    .setCustomId(`radio_next_page_${newPage}`)
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(endIndex >= radios.length)
            );            // Se estiver na tela da rádio, enviar nova mensagem
            const newMessage = await interaction.channel.send({
                embeds: [interaction.message.embeds[0]],
                components: [selectMenu, controlButtons]
            });

            // Apagar a mensagem antiga
            try {
                await interaction.message.delete();
            } catch (error) {
                console.error("Erro ao apagar mensagem antiga:", error);
            }

            // Atualizar a referência da mensagem
            radioMessages.set(guildId, newMessage);
        } else {
            // Se estiver na tela de seleção inicial
            if (!interaction.deferred) {
                await interaction.deferUpdate();
            }
            
            const { row, buttonRow, totalPages } = createPaginationComponents(radios, newPage, radiosPerPage);

            await interaction.editReply({
                content: `📻 Selecione uma rádio (Página ${newPage + 1}/${totalPages}):`,
                components: [row, buttonRow]
            });
        }
    } catch (error) {
        await handleRadioError(error, interaction);
    }
}

async function stopRadio(guildId, interaction, skipMessage = false) {
    try {
        // Destruir conexão de voz
        const connection = connections.get(guildId);
        if (connection) {
            connection.destroy();
            connections.delete(guildId);
        }
        clearRadioState(guildId);

        if (interaction && !skipMessage) {
            // Excluir a mensagem da embed da rádio
            const oldMessage = radioMessages.get(guildId);
            if (oldMessage) {
                try {
                    await oldMessage.delete();
                } catch (error) {
                    console.error("Erro ao apagar mensagem antiga:", error);
                }
            }
            
            // Se for uma interação de botão, remover a mensagem original
            if (interaction.isButton()) {
                try {
                    await interaction.message.delete();
                } catch (error) {
                    console.error("Erro ao apagar mensagem do botão:", error);
                }
            }

            // Enviar mensagem de confirmação
            await interaction.channel.send({
                content: '✅ Rádio desconectada com sucesso!'
            });
        }

        return true;
    } catch (error) {
        if (interaction && !skipMessage) {
            await handleRadioError(error, interaction);
        }
        return false;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Toca uma rádio no canal de voz dedicado'),

    async execute(interaction) {
        await interaction.deferReply();
        try {
            await checkRadioPermissions(interaction);
            const radios = await getCachedRadios();
            
            const { row, buttonRow, totalPages } = createPaginationComponents(radios, 0, 25);

            await interaction.editReply({
                content: '📻 Selecione uma rádio:',
                components: [row, buttonRow]
            });
        } catch (error) {
            await handleRadioError(error, interaction);
        }
    },

    handleButton,
    handlePlay
};
