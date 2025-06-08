const { EmbedBuilder } = require('discord.js');

// Handler de cargos do servidor (exemplo básico)
module.exports = function setupRoleHandlers(client, configCollection) {
    // Log de criação de cargo
    client.on('roleCreate', async role => {
        const guild = role.guild;
        const logChannel = await findServerLogChannel(client, configCollection, guild.id);
        if (!logChannel) return;
        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Cargo criado')
            .setDescription(`Nome: ${role.name}\nID: ${role.id}`)
            .setTimestamp();
        logChannel.send({ embeds: [embed] });
    });

    // Log de exclusão de cargo
    client.on('roleDelete', async role => {
        const guild = role.guild;
        const logChannel = await findServerLogChannel(client, configCollection, guild.id);
        if (!logChannel) return;
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Cargo excluído')
            .setDescription(`Nome: ${role.name}\nID: ${role.id}`)
            .setTimestamp();
        logChannel.send({ embeds: [embed] });
    });

    // Log de atualização de cargo
    client.on('roleUpdate', async (oldRole, newRole) => {
        const guild = newRole.guild;
        const logChannel = await findServerLogChannel(client, configCollection, guild.id);
        if (!logChannel) return;
        let changes = [];
        if (oldRole.name !== newRole.name) {
            changes.push({ name: 'Nome do cargo', value: `De: ${oldRole.name}\nPara: ${newRole.name}` });
        }
        if (oldRole.color !== newRole.color) {
            changes.push({ name: 'Cor do cargo', value: `De: #${oldRole.color.toString(16).padStart(6, '0')}\nPara: #${newRole.color.toString(16).padStart(6, '0')}` });
        }
        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
            changes.push({ name: 'Permissões', value: `De: ${oldRole.permissions.toArray().join(', ') || 'Nenhuma'}\nPara: ${newRole.permissions.toArray().join(', ') || 'Nenhuma'}` });
        }
        if (changes.length === 0) return;
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('Cargo atualizado')
            .setDescription(`ID: ${newRole.id}`)
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
