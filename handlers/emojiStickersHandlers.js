// Handler de emojis e figurinhas do servidor
const { AuditLogEvent } = require('discord.js');

module.exports = function setupEmojiStickersHandlers(client, configCollection) {
    // Log de criação de emoji
    client.on('emojiCreate', async emoji => {
        const guild = emoji.guild;
        const logChannel = await findServerLogChannel(client, configCollection, guild.id);
        if (!logChannel) return;
        const embed = {
            color: 0x57F287,
            title: 'Emoji criado',
            description: `Nome: ${emoji.name}\nID: ${emoji.id}`,
            thumbnail: { url: emoji.url },
            timestamp: new Date()
        };
        logChannel.send({ embeds: [embed] });
    });

    // Log de exclusão de emoji
    client.on('emojiDelete', async emoji => {
        const guild = emoji.guild;
        const logChannel = await findServerLogChannel(client, configCollection, guild.id);
        if (!logChannel) return;
        const embed = {
            color: 0xED4245,
            title: 'Emoji excluído',
            description: `Nome: ${emoji.name}\nID: ${emoji.id}`,
            timestamp: new Date()
        };
        logChannel.send({ embeds: [embed] });
    });

    // Log de criação de sticker
    client.on('stickerCreate', async sticker => {
        const guild = sticker.guild;
        const logChannel = await findServerLogChannel(client, configCollection, guild.id);
        if (!logChannel) return;
        const embed = {
            color: 0x57F287,
            title: 'Sticker criado',
            description: `Nome: ${sticker.name}\nID: ${sticker.id}`,
            timestamp: new Date()
        };
        logChannel.send({ embeds: [embed] });
    });

    // Log de exclusão de sticker
    client.on('stickerDelete', async sticker => {
        const guild = sticker.guild;
        const logChannel = await findServerLogChannel(client, configCollection, guild.id);
        if (!logChannel) return;
        const embed = {
            color: 0xED4245,
            title: 'Sticker excluído',
            description: `Nome: ${sticker.name}\nID: ${sticker.id}`,
            timestamp: new Date()
        };
        logChannel.send({ embeds: [embed] });
    });
};

// Função utilitária para buscar o canal de log
async function findServerLogChannel(client, configCollection, guildId) {
    const config = await configCollection.findOne({
        _id: 'canais',
        'categorias.canais.nome': 'registro-servidor'
    });
    if (!config) return null;
    const canal = config.categorias
        .flatMap(cat => cat.canais)
        .find(c => c.nome === 'registro-servidor');
    if (!canal) return null;
    try {
        const channel = await client.channels.fetch(canal.id);
        return channel && channel.isTextBased() ? channel : null;
    } catch {
        return null;
    }
}
