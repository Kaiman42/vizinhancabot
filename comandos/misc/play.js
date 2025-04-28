const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor.js');
const { incrementJamendoApiUsage } = require('../admin/api.js');
const https = require('https');

// Configurações do Jamendo
const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;
const JAMENDO_CLIENT_SECRET = process.env.JAMENDO_CLIENT_SECRET;
const JAMENDO_API_VERSION = 'v3.0';
const JAMENDO_API_BASE = 'https://api.jamendo.com';

// Mapa global para armazenar conexões de voz atuais
const connections = new Map();
module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Toca músicas de diversas fontes')
        .addStringOption(option => 
            option.setName('termo')
                .setDescription('Músicas livres de direitos autorais')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        // Verificar se as credenciais do Jamendo estão definidas
        if (!JAMENDO_CLIENT_ID || !JAMENDO_CLIENT_SECRET) {
            return interaction.editReply({
                content: '❌ Erro de configuração: Credenciais do Jamendo não definidas no arquivo .env'
            });
        }

        try {
            // Verificar permissões
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Connect) || 
                !interaction.member.permissions.has(PermissionsBitField.Flags.Speak)) {
                return interaction.editReply({
                    content: '❌ Você não tem permissão para conectar ou falar em um canal de voz.'
                });
            }

            // Verificar se o usuário está em um canal de voz
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.editReply({
                    content: '❌ Você precisa estar em um canal de voz para usar este comando.'
                });
            }

            // Obter o termo de busca ou link
            const query = interaction.options.getString('termo');
            const guildId = interaction.guildId;

            // Informar ao usuário que estamos buscando...
            await interaction.editReply({
                content: `🔍 Buscando "${query}" no Jamendo...`
            });

            // Verificar se é um link direto do Jamendo ou um termo de busca
            let trackData;
            if (query.includes('jamendo.com')) {
                // Extrair ID da faixa do link do Jamendo
                const trackIdMatch = query.match(/track\/(\d+)/);
                if (trackIdMatch && trackIdMatch[1]) {
                    const trackId = trackIdMatch[1];
                    trackData = await getJamendoTrackById(trackId);
                } else {
                    return interaction.editReply({
                        content: '❌ Link do Jamendo inválido. Certifique-se de que é um link de faixa válido.'
                    });
                }
            } else {
                // Buscar faixa pelo termo de várias maneiras
                // 1. Primeiro, tentar por nome de música
                trackData = await searchJamendoTrack(query, 'namesearch');
                
                // 2. Se não encontrar, tentar por nome de artista
                if (!trackData) {
                    trackData = await searchJamendoTrack(query, 'artistname');
                }
                
                // 3. Se ainda não encontrar, tentar por tags
                if (!trackData) {
                    trackData = await searchJamendoTrack(query, 'tags');
                }
            }

            if (!trackData) {
                return interaction.editReply({
                    content: `❌ Não foi possível encontrar músicas para "${query}" no Jamendo. Tente usar termos mais gerais ou em inglês.`
                });
            }

            // Criar embed com informações da faixa
            const embed = new EmbedBuilder()
                .setColor(gerarCorAleatoria())
                .setTitle(`🎵 ${trackData.name}`)
                .setURL(trackData.shareurl || trackData.audiodownload)
                .setDescription(`**Artista:** ${trackData.artist_name}\n**Álbum:** ${trackData.album_name}`)
                .setThumbnail(trackData.image || trackData.album_image)
                .setFooter({ text: 'Música fornecida por Jamendo' });

            // Tentar conectar ao canal de voz e reproduzir a música
            try {
                // Se já tem uma conexão ativa neste servidor, desconectar primeiro
                if (connections.has(guildId)) {
                    const existingConnection = connections.get(guildId);
                    try {
                        if (existingConnection && existingConnection.player) {
                            existingConnection.player.stop();
                        }
                        
                        if (existingConnection && existingConnection.connection) {
                            // Verificar se a conexão ainda não foi destruída
                            if (existingConnection.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                                existingConnection.connection.destroy();
                            }
                        }
                    } catch (err) {
                        console.warn('Aviso ao limpar conexão existente:', err.message);
                    }
                    connections.delete(guildId);
                }

                // Criar uma nova conexão usando a API correta do @discordjs/voice
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                // Criar player e recurso de áudio
                const player = createAudioPlayer();
                const resource = createAudioResource(trackData.audio);

                // Conectar player e connection
                connection.subscribe(player);
                
                // Reproduzir a música
                player.play(resource);
                
                // Armazenar a conexão no mapa
                connections.set(guildId, {
                    connection: connection,
                    player: player,
                    track: trackData,
                    destroy: () => {
                        try {
                            // Parar o player se estiver ativo
                            if (player) {
                                player.stop();
                            }
                            
                            // Destruir a conexão se ainda não foi destruída
                            if (connection && connection.state && connection.state.status !== VoiceConnectionStatus.Destroyed) {
                                connection.destroy();
                            }
                        } catch (err) {
                            console.warn('Aviso ao destruir conexão:', err.message);
                        }
                    }
                });

                // Configurar eventos
                player.on(AudioPlayerStatus.Idle, () => {
                    interaction.followUp({
                        content: `✅ Música "${trackData.name}" terminou de tocar.`
                    }).catch(console.error);
                    
                    if (connections.has(guildId)) {
                        const connectionData = connections.get(guildId);
                        if (connectionData) {
                            try {
                                if (connectionData.player) {
                                    connectionData.player.stop();
                                }
                                
                                if (connectionData.connection && 
                                    connectionData.connection.state && 
                                    connectionData.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                                    connectionData.connection.destroy();
                                }
                            } catch (err) {
                                console.warn('Aviso ao limpar conexão após término:', err.message);
                            }
                        }
                        connections.delete(guildId);
                    }
                });

                connection.on(VoiceConnectionStatus.Disconnected, () => {
                    if (connections.has(guildId)) {
                        const connectionData = connections.get(guildId);
                        if (connectionData) {
                            try {
                                if (connectionData.player) {
                                    connectionData.player.stop();
                                }
                            } catch (err) {
                                console.warn('Aviso ao parar player após desconexão:', err.message);
                            }
                        }
                        connections.delete(guildId);
                    }
                });

                return interaction.editReply({
                    content: `🎵 Reproduzindo agora:`,
                    embeds: [embed]
                });
            } catch (error) {
                console.error('Erro ao conectar ao canal de voz:', error);
                return interaction.editReply({
                    content: `❌ Ocorreu um erro ao reproduzir a música: ${error.message}`
                });
            }
        } catch (error) {
            console.error('Erro ao executar o comando play:', error);
            return interaction.editReply({
                content: `❌ Ocorreu um erro ao executar o comando: ${error.message}`
            });
        }
    }
};

// Função para buscar uma faixa pelo ID no Jamendo
async function getJamendoTrackById(trackId) {
    return new Promise((resolve) => {
        // Construindo a URL conforme o formato com ambas as credenciais
        const url = `${JAMENDO_API_BASE}/${JAMENDO_API_VERSION}/tracks/?client_id=${JAMENDO_CLIENT_ID}&client_secret=${JAMENDO_CLIENT_SECRET}&id=${trackId}&format=json&include=musicinfo`;
        
        // Incrementar o contador de uso da API
        incrementJamendoApiUsage().catch(err => 
            console.error('Erro ao incrementar contador de API Jamendo:', err)
        );
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.headers.status === 'success' && response.results.length > 0) {
                        // Formatar a resposta para uso interno
                        const track = response.results[0];
                        resolve({
                            id: track.id,
                            name: track.name,
                            artist_name: track.artist_name,
                            album_name: track.album_name,
                            audio: track.audio,
                            shareurl: track.shareurl,
                            image: track.image,
                            album_image: track.album_image
                        });
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    console.error('Erro ao analisar resposta do Jamendo:', error);
                    resolve(null);
                }
            });
        }).on('error', (error) => {
            console.error('Erro na requisição ao Jamendo:', error);
            resolve(null);
        });
    });
}

// Função para buscar faixas no Jamendo por diferentes parâmetros
async function searchJamendoTrack(query, searchType = 'namesearch') {
    return new Promise((resolve) => {
        // Codificar o termo de busca para URL
        const encodedQuery = encodeURIComponent(query);
        
        // Construir URL com base no tipo de busca
        let url;
        if (searchType === 'artistname') {
            url = `${JAMENDO_API_BASE}/${JAMENDO_API_VERSION}/tracks/?client_id=${JAMENDO_CLIENT_ID}&client_secret=${JAMENDO_CLIENT_SECRET}&artist_name=${encodedQuery}&format=json&limit=1&order=popularity_total`;
        } else if (searchType === 'tags') {
            url = `${JAMENDO_API_BASE}/${JAMENDO_API_VERSION}/tracks/?client_id=${JAMENDO_CLIENT_ID}&client_secret=${JAMENDO_CLIENT_SECRET}&tags=${encodedQuery}&format=json&limit=1&order=popularity_total`;
        } else {
            // Por padrão, busca por nome da música
            url = `${JAMENDO_API_BASE}/${JAMENDO_API_VERSION}/tracks/?client_id=${JAMENDO_CLIENT_ID}&client_secret=${JAMENDO_CLIENT_SECRET}&namesearch=${encodedQuery}&format=json&limit=1&order=popularity_total&include=musicinfo`;
        }
        
        // Incrementar o contador de uso da API
        incrementJamendoApiUsage().catch(err => 
            console.error('Erro ao incrementar contador de API Jamendo:', err)
        );
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.headers.status === 'success' && response.results.length > 0) {
                        // Formatar a resposta para uso interno
                        const track = response.results[0];
                        resolve({
                            id: track.id,
                            name: track.name,
                            artist_name: track.artist_name,
                            album_name: track.album_name || "Desconhecido",
                            audio: track.audio,
                            shareurl: track.shareurl,
                            image: track.image,
                            album_image: track.album_image
                        });
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    console.error('Erro ao analisar resposta do Jamendo:', error);
                    resolve(null);
                }
            });
        }).on('error', (error) => {
            console.error('Erro na requisição ao Jamendo:', error);
            resolve(null);
        });
    });
}