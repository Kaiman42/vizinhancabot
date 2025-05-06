const players = new Map();
const connections = new Map();
const radioMessages = new Map();
const radioOwners = new Map();
const voiceTimeouts = new Map();

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
    clearRadioState
};