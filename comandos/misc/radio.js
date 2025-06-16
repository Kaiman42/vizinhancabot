const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, VoiceConnectionStatus, AudioPlayerStatus } = require('@discordjs/voice');
const path = require('path');
const mongodb = require(path.resolve(__dirname, '../../mongodb.js'));
const { gerarCorAleatoria } = require(path.resolve(__dirname, '../../configuracoes/randomColor.js'));

// Configuração do player de áudio
const player = createAudioPlayer({
    behaviors: {
        noSubscriber: 'pause',
    }
});

// Monitoramento de status do player
player.on(AudioPlayerStatus.Playing, () => {
    console.log('O player começou a tocar!');
});

player.on(AudioPlayerStatus.Idle, () => {
    console.log('O player está ocioso.');
});

player.on('error', error => {
    console.error(`Erro no player: ${error.message}`);
});

// Função utilitária para buscar mensagem de erro do banco
async function getMensagemErroRadio(codigo, data = {}) {
    try {
        const errosComando = await mongodb.getErrosComando();
        let mensagem;
        
        // Procura primeiro nos erros específicos da rádio
        if (errosComando?.erros?.radio?.[codigo]?.content) {
            mensagem = errosComando.erros.radio[codigo].content;
        }
        // Se não encontrar, procura nos erros gerais
        else if (errosComando?.erros?.gerais?.[codigo]?.content) {
            mensagem = errosComando.erros.gerais[codigo].content;
        }
        else {
            return `❌ Erro inesperado [${codigo}]`;
        }

        // Substituir placeholders
        if (data.userId) {
            mensagem = mensagem.replace('[USER]', `<@${data.userId}>`);
        }
        if (data.roleId) {
            mensagem = mensagem.replace('ROLE_ID', data.roleId);
        }
        if (data.channelId) {
            mensagem = mensagem.replace('CHANNEL_ID', data.channelId);
        }

        return mensagem;
    } catch (e) {
        return `❌ Erro inesperado [${codigo}]`;
    }
}

// Classes de erro
class RadioError extends Error {
    constructor(code, data = {}) {
        super();
        this.name = 'RadioError';
        this.code = code;
        this.data = data;
    }
}

// Estados globais
const players = new Map();
const connections = new Map();
const radioMessages = new Map();
const radioOwners = new Map();
const voiceTimeouts = new Map();

// Cache das rádios
let radioCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 300000; // 5 minutos

// Constantes e limitações
const LIMITS = {
    REQUISICOES: {
        max: 3,
        window: 10000
    },
    TIMER_INATIVIDADE: 15000,
    DEFAULT_VOLUME: 0.3, // 30% de volume para proteger os ouvidos
    VOLUME_MAX: 1.0
};

// Funções de verificação e permissões
async function hasDjRole(member) {
    try {
        const configDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'escopos' });
        
        if (!configDoc?.cargos?.dj) {
            return true;
        }
        
        return configDoc.cargos?.dj?.id ? member.roles.cache.has(configDoc.cargos.dj.id) : true;
    } catch (error) {
        console.error('Erro ao verificar cargo DJ:', error);
        return true;
    }
}

async function getChannels(guildId) {
    try {
        const configDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
        
        if (!configDoc || !configDoc.categorias) {
            return null;
        }
        
        let botChannelId = null;
        
        if (configDoc.categorias) {
            for (const categoria of configDoc.categorias) {
                if (!categoria.canais) continue;
                
                for (const canal of categoria.canais) {
                    if (canal.nome === 'bot') {
                        botChannelId = canal.id;
                        break;
                    }
                }
                if (botChannelId) break;
            }
        }
        
        return { botChannelId };
    } catch (error) {
        console.error('Erro ao buscar canal de bot:', error);
        return null;
    }
}

async function checkRadioPermissions(interaction) {
    // Verifica cargo DJ
    if (!(await hasDjRole(interaction.member))) {
        throw new RadioError('CARGO_NECESSARIO', { roleId: interaction.guild.roles.cache.find(r => r.name === 'DJ')?.id });
    }

    // Obtém os canais antes de verificá-los
    const channels = await getChannels(interaction.guild.id);

    if (!channels) {
      throw new RadioError('CANAL_NAO_ENCONTRADO');
    }
    
    if (!channels?.botChannelId) {
        throw new RadioError('CANAL_NAO_ENCONTRADO');
    }

    if (interaction.channel.id !== channels.botChannelId) {
        throw new RadioError('CANAL_ERRADO', { channelId: channels.botChannelId });
    }

    // Verifica canal de voz
    if (!interaction.member.voice.channel) {
        throw new RadioError('CANAL_VOZ');
    }

    // Verifica dono da rádio
    const guildId = interaction.guild.id;
    if (radioOwners.has(guildId) && radioOwners.get(guildId) !== interaction.user.id) {
        throw new RadioError('NAO_HOST', { userId: radioOwners.get(guildId) });
    }

    return { channels };
}

// Estado e gerenciamento do canal
function isChannelEmpty(channel) {
    return channel.members.filter(member => !member.user.bot).size === 0;
}

function setupEmptyCheck(guildId, channelId, client) {
    if (voiceTimeouts.has(guildId)) {
        clearTimeout(voiceTimeouts.get(guildId));
    }

    const channel = client.channels.cache.get(channelId);
    if (channel && isChannelEmpty(channel)) {
        const timeout = setTimeout(async () => {
            try {
                const refreshedChannel = await client.channels.fetch(channelId);
                if (refreshedChannel && isChannelEmpty(refreshedChannel)) {
                    const channels = await getChannels(guildId);
                    if (channels?.botChannelId) {
                        const botChannel = await client.channels.fetch(channels.botChannelId);
                        await botChannel.send('📻 A rádio foi desligada automaticamente por inatividade.');
                    }
                    await stopRadio(guildId, null, true);
                }
            } catch (error) {
                console.error('Erro ao verificar canal vazio:', error);
            }
        }, LIMITS.TIMER_INATIVIDADE);
        
        voiceTimeouts.set(guildId, timeout);
    }
}

function clearRadioState(guildId) {
    players.delete(guildId);
    connections.delete(guildId);
    radioOwners.delete(guildId);
    radioMessages.delete(guildId);
    if (voiceTimeouts.has(guildId)) {
        clearTimeout(voiceTimeouts.get(guildId));
        voiceTimeouts.delete(guildId);
    }
}

async function handleVoiceStateUpdate(oldState, newState) {
    const guildId = oldState.guild.id;
    
    if (!connections.has(guildId)) return;

    const connection = connections.get(guildId);
    const channelId = connection.joinConfig.channelId;

    const channel = oldState.guild.channels.cache.get(channelId);
    if (!channel) return;

    if (newState.channelId === channelId) {
        if (!newState.member.user.bot && voiceTimeouts.has(guildId)) {
            clearTimeout(voiceTimeouts.get(guildId));
            voiceTimeouts.delete(guildId);
        }
    }
    else if (oldState.channelId === channelId && isChannelEmpty(channel)) {
        setupEmptyCheck(guildId, channelId, oldState.client);
    }
}

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

async function handleRadioError(error, interaction) {
    let mensagem = error.message;
    if (error instanceof RadioError && error.code) {
        mensagem = await getMensagemErroRadio(error.code, error.data);
    }
    try {
        const options = { 
            content: mensagem,
            flags: ['Ephemeral']
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(options);
        } else {
            await interaction.reply(options);
        }
    } catch (err) {
        console.error("Failed to send error message:", err);
    }
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
            selfDeaf: false,
            selfMute: false
        });

        // Adiciona tratamento de eventos da conexão
        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log(`Conexão pronta em ${guildId}`);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                connection.destroy();
                connections.delete(guildId);
                players.delete(guildId);
                radioOwners.delete(guildId);
            }
        });

        connections.set(guildId, connection);
        radioOwners.set(guildId, interaction.user.id);
    }

    let player = players.get(guildId);
    if (!player) {
        player = createAudioPlayer({
            behaviors: {
                noSubscriber: 'pause',
            }
        });

        player.on('error', error => {
            console.error(`Erro no player do servidor ${guildId}: ${error.message}`);
        });

        players.set(guildId, player);
        connection.subscribe(player);
    }

    return { connection, player, voiceChannel };
}

function validateRadioSelection(radios, country, radioIndex) {
    if (!radios[country] || !Array.isArray(radios[country])) {
        throw new RadioError('SEM_SESSAO');
    }

    if (radioIndex < 0 || radioIndex >= radios[country].length) {
        throw new RadioError('CANAL_ERRADO');
    }

    const radio = radios[country][radioIndex];
    if (!radio.url) {
        throw new RadioError('URL_INVALIDA');
    }

    return radio;
}

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

        try {
            const resource = createAudioResource(radio.url, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true,
                // Forçando o uso do FFmpeg ao invés do prism-media
                format: {
                    type: 'arbitrary',
                    encoder: 'ffmpeg',
                    demuxer: 'ffmpeg'
                }
            });
            
            resource.volume?.setVolume(LIMITS.DEFAULT_VOLUME);
            
            player.play(resource);
            
            // Aguardar o início da reprodução ou erro
            await new Promise((resolve, reject) => {
                const playTimeout = setTimeout(() => {
                    reject(new Error('Timeout ao iniciar reprodução'));
                }, 10000);

                player.once(AudioPlayerStatus.Playing, () => {
                    clearTimeout(playTimeout);
                    resolve();
                });

                player.once('error', (error) => {
                    clearTimeout(playTimeout);
                    reject(error);
                });
            });

        } catch (error) {
            console.error(`Erro ao reproduzir rádio: ${error.message}`);
            throw error;
        }

        const embed = createRadioEmbed(radio, interaction, radioIndex, radios.length, voiceChannel);
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
    handlePlay,
    handleVoiceStateUpdate
};
