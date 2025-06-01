const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const mongodb = require('../../../configuracoes/mongodb');
const { RadioError, ERROS_RADIO, handleRadioError } = require('./erros');
const { LIMITS, validateRadioSelection, getPageLimits } = require('./limites');
const { checkRadioPermissions } = require('./permissoes');
const { 
    players, 
    connections, 
    radioMessages, 
    radioOwners, 
    setupEmptyCheck, 
    clearRadioState 
} = require('./estado');

async function loadRadios() {
    try {
        const radiosDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'radios' });
        if (!radiosDoc) return {};
        const { _id, ...radiosData } = radiosDoc;
        return radiosData;
    } catch (error) {
        console.error('Erro ao carregar rádios:', error);
        return {};
    }
}

async function playRadio(interaction, country, radioIndex) {
    try {
        const radios = await loadRadios();
        const radio = validateRadioSelection(radios, country, radioIndex);
        
        const voiceChannel = interaction.member.voice.channel;
        const guildId = interaction.guild.id;
        
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
        
        const resource = createAudioResource(radio.url, {
            inlineVolume: true,
        });
        resource.volume?.setVolume(LIMITS.DEFAULT_VOLUME);
        player.play(resource);
        
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`🎵 Rádio: ${radio.name}`)
            .setDescription(radio.description || 'Sem descrição')
            .addFields(
                { name: '📍 Local', value: radio.place || 'Desconhecido' },
                { name: '🎧 Canal', value: `<#${voiceChannel.id}>` },
                { name: '🎭 DJ', value: `<@${radioOwners.get(guildId)}>` }
            )
            .setFooter({ text: `Rádio ${radioIndex + 1}/${radios[country].length} de ${country}` })
            .setTimestamp();
        
        const countries = Object.keys(radios).filter(c => Array.isArray(radios[c]) && radios[c].length > 0);
        
        const countryMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('radio_country_select')
                .setPlaceholder('Mudar país')
                .addOptions(countries.map(c => ({
                    label: c,
                    description: `${radios[c].length} rádios disponíveis`,
                    value: c,
                    default: c === country
                })))
        );
        
        const controlButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('radio_prev')
                .setLabel('⏮️ Anterior')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('radio_stop')
                .setLabel('⏹️ Parar')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('radio_next')
                .setLabel('⏭️ Próxima')
                .setStyle(ButtonStyle.Secondary)
        );

        const oldMessage = radioMessages.get(guildId);
        if (oldMessage) {
            try {
                await oldMessage.delete();
            } catch (error) {}
        }

        const message = await interaction.followUp({
            embeds: [embed],
            components: [countryMenu, controlButtons],
            fetchReply: true
        });

        radioMessages.set(guildId, message);
        setupEmptyCheck(guildId, voiceChannel.id, interaction.client);
        
        return true;
    } catch (error) {
        await handleRadioError(error, interaction);
        return false;
    }
}

async function stopRadio(guildId, interaction, skipMessage = false) {
    try {
        const connection = connections.get(guildId);
        if (connection) {
            connection.destroy();
            connections.delete(guildId);
        }
        clearRadioState(guildId);

        if (interaction && !skipMessage) {
            const oldMessage = radioMessages.get(guildId);
            if (oldMessage) {
                try {
                    await oldMessage.delete();
                } catch (error) {
                    console.error("Erro ao apagar mensagem:", error);
                }
            }
            await interaction.channel.send({
                content: '✅ Rádio desconectada com sucesso!',
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





async function handlePlay(interaction) {
    await interaction.deferReply();
     try {
        await checkRadioPermissions(interaction);
        const radioIndex = parseInt(interaction.values[0]);
        const guildId = interaction.guild.id;

        const fs = require('fs').promises;
        const path = require('path');
        const filePath = path.join(__dirname, '../../../configuracoes/radiosKaiman.json');
        const data = await fs.readFile(filePath, 'utf8');
        const radiosData = JSON.parse(data);
        const kaimanRadios = radiosData.Kaiman || [];

         if (kaimanRadios.length === 0) {
            throw new RadioError('❌ Nenhuma rádio encontrada na categoria Kaiman.');
        }

        const radio = kaimanRadios[radioIndex];

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

        const resource = createAudioResource(radio.url, {
            inlineVolume: true,
        });
        resource.volume?.setVolume(LIMITS.DEFAULT_VOLUME);
        player.play(resource);

        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`🎵 Rádio: ${radio.name}`)
            .setDescription(radio.description || 'Sem descrição')
            .addFields(
                { name: '📍 Local', value: radio.place || 'Desconhecido' },
                { name: '🎧 Canal', value: `<#${voiceChannel.id}>` },
                { name: '🎭 DJ', value: `<@${radioOwners.get(guildId)}>` }
            )
            .setFooter({ text: `Rádio ${radioIndex + 1}/${kaimanRadios.length} de Kaiman` })
            .setTimestamp();


         const controlButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('radio_stop')
                    .setLabel('⏹️ Parar')
                    .setStyle(ButtonStyle.Danger)
            );

        const oldMessage = radioMessages.get(guildId);
        if (oldMessage) {
            try {
                await oldMessage.delete();
            } catch (error) { }
        }

        const message = await interaction.update({
            embeds: [embed],
            components: [controlButtons],
            fetchReply: true
        });
        radioMessages.set(guildId, message);
        setupEmptyCheck(guildId, voiceChannel.id, interaction.client);


    } catch (error) { // Lidar com erros ao reproduzir a rádio
        await handleRadioError(error, interaction);
    }
}

async function handleButton(interaction) {
    await interaction.deferReply();
    try {
        await checkRadioPermissions(interaction);
        if (!interaction.isButton()) return;

        const customId = interaction.customId;

        if (customId === 'radio_stop') {
            try {
                await interaction.message.delete();
            } catch (error) {
                console.error("Erro ao apagar mensagem:", error);
            }
            await stopRadio(interaction.guild.id, interaction);
        } else {
            const page = parseInt(customId.split('_')[3]);

            if (customId.startsWith('radio_next_page')) {
                // {{change 1: Skip if next page is out of range}}
            } else if (customId.startsWith('radio_prev_page')) {
                 // {{change 2: Skip if previous page is out of range}}
            }
        }
    } catch (error) {
        await handleRadioError(error, interaction);
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

            const fs = require('fs').promises;
            const path = require('path');
            const filePath = path.join(__dirname, '../../../configuracoes/radiosKaiman.json');
            const data = await fs.readFile(filePath, 'utf8');
            const radiosData = JSON.parse(data);
            const kaimanRadios = radiosData.Kaiman || [];

            if (kaimanRadios.length === 0) {
                throw new RadioError('❌ Nenhuma rádio encontrada na categoria Kaiman.');
            }

            let page = 0;
            const radiosPerPage = 25;
            const totalPages = Math.ceil(kaimanRadios.length / radiosPerPage);

            const options = kaimanRadios.slice(page * radiosPerPage, (page + 1) * radiosPerPage).map((radio, index) => ({
                label: radio.name,
                description: radio.place || 'Desconhecido',
                value: (index + page * radiosPerPage).toString(),
            }));

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('radio_play')
                    .setPlaceholder('Selecione uma rádio')
                    .addOptions(options)
            );

            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`radio_prev_page_${page}`)
                        .setLabel('Anterior')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId(`radio_next_page_${page}`)
                        .setLabel('Próxima')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(totalPages <= 1 || page === totalPages - 1)
                );

            // Check if interaction has been replied to
            if (!interaction.replied && !interaction.deferred) {
                await interaction.editReply({
                    content: '📻 Selecione uma rádio:',
                    components: [row, buttonRow]
                });
            }

        } catch (error) {
            await handleRadioError(error, interaction);
        }
    },

    handleButton,
    handlePlay
};
