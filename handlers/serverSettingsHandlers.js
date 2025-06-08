const { EmbedBuilder } = require('discord.js');

// Handler de configurações do servidor (exemplo básico)
module.exports = function setupServerSettingsHandlers(client, configCollection) {
    // Log de atualização de configurações do servidor
    client.on('guildUpdate', async (oldGuild, newGuild) => {
        const logChannel = await findServerLogChannel(client, configCollection, newGuild.id);
        if (!logChannel) return;
        let changes = [];
        if (oldGuild.name !== newGuild.name) {
            changes.push({ name: 'Nome do servidor', value: `De: ${oldGuild.name}\nPara: ${newGuild.name}` });
        }
        if (oldGuild.icon !== newGuild.icon) {
            changes.push({ name: 'Ícone do servidor', value: `[Ver novo ícone](${newGuild.iconURL({ dynamic: true })})` });
        }
        if (oldGuild.banner !== newGuild.banner) {
            changes.push({ name: 'Banner do servidor', value: `[Ver novo banner](${newGuild.bannerURL({ dynamic: true })})` });
        }
        if (changes.length === 0) return;
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚙️ Configuração do servidor alterada')
            .setDescription(`Servidor: ${newGuild.name} (${newGuild.id})`)
            .addFields(changes)
            .setTimestamp();
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
