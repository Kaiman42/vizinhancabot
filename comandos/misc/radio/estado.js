const players = new Map();
const connections = new Map();
const radioMessages = new Map();
const radioOwners = new Map();
const voiceTimeouts = new Map();

function isChannelEmpty(channel) {
    return channel.members.filter(member => !member.user.bot).size === 0;
}

async function handleVoiceStateUpdate(oldState, newState) {
    const guildId = oldState.guild.id;
    
    // Se não tiver rádio tocando neste servidor, ignora
    if (!connections.has(guildId)) return;

    const connection = connections.get(guildId);
    const channelId = connection.joinConfig.channelId;

    const channel = oldState.guild.channels.cache.get(channelId);
    if (!channel) return;

    // Se alguém entrou no canal, limpa o timeout se existir
    if (newState.channelId === channelId) {
        // {{change 1: Only clear timeout if the user is not a bot}}
        if (!newState.member.user.bot && voiceTimeouts.has(guildId)) {
            clearTimeout(voiceTimeouts.get(guildId));
            voiceTimeouts.delete(guildId);
        }
    }
    // Se alguém saiu do canal e agora está vazio
    else if (oldState.channelId === channelId && isChannelEmpty(channel)) {
        // {{change 1: Prevent multiple empty checks}}
        if (!voiceTimeouts.has(guildId)) {
            setupEmptyCheck(guildId, channelId, oldState.client);
        }
    }
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
                    const { getChannels } = require('./permissoes');
                    const channels = await getChannels(guildId);
                    if (channels?.botChannelId) {
                        const botChannel = await client.channels.fetch(channels.botChannelId);
                        await botChannel.send('📻 A rádio foi desligada automaticamente por inatividade.');
                    }
                    const { stopRadio } = require('./radio');
                    await stopRadio(guildId, null, true);
                }
            } catch (error) {
                console.error('Erro ao verificar canal vazio:', error);
            }
        }, 15000);

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

module.exports = {
    players,
    connections,
    radioMessages,
    radioOwners,
    voiceTimeouts,
    isChannelEmpty,
    setupEmptyCheck,
    clearRadioState,
    handleVoiceStateUpdate // Adicionando a exportação da função
};