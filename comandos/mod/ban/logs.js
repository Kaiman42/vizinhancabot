const { EmbedBuilder } = require('discord.js');
const mongodb = require('../../../configuracoes/mongodb.js');

function criarBanEmbed(user, reason, deleteMsgs, interaction, cargoMod, bansHoje) {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('⛔ Usuário Banido')
        .addFields(
            { name: 'Usuário', value: `${user.tag} (<@${user.id}>)` },
            { name: 'ID do Usuário', value: user.id },
            { name: 'Motivo', value: reason },
            { name: 'Mensagens deletadas', value: deleteMsgs ? 'Sim (últimos 7 dias)' : 'Não' },
            { name: 'Sentenciador', value: `${interaction.user.tag} (<@${interaction.user.id}>)` },
            { name: 'Bans restantes hoje', value: cargoMod.maxban === "infinito" ? "∞" : `${cargoMod.maxban - (bansHoje + 1)}` }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();
}

async function enviarLog(interaction, embed) {
    const canalConfig = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
    
    let userlogsChannelId = null;
    if (canalConfig && canalConfig.categorias) {
        for (const categoria of canalConfig.categorias) {
            const userlogsChannel = categoria.canais ? categoria.canais.find(canal => canal.nome === 'userlogs') : null;
            if (userlogsChannel) {
                userlogsChannelId = userlogsChannel.id;
                break;
            }
        }
    }
    
    if (userlogsChannelId) {
        const userlogsChannel = await interaction.guild.channels.fetch(userlogsChannelId);
        if (userlogsChannel) {
            await userlogsChannel.send({ embeds: [embed] });
        }
    }
}

module.exports = {
    criarBanEmbed,
    enviarLog
};