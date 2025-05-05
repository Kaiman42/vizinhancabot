const { EmbedBuilder } = require('discord.js');
const mongodb = require('../../../configuracoes/mongodb');

// Função para logs de limpeza
async function registrarLogLimpeza(interaction, quantidade, usuario) {
    try {
        // Buscar configuração de canais
        const canalConfig = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
        if (!canalConfig || !canalConfig.categorias) return;
        let logChannelId = null;
    
        for (const categoria of canalConfig.categorias) {
            if (!categoria.canais) continue;
            const canal = categoria.canais.find(c => c.nome === 'registros-servidor');
            if (canal) {
                logChannelId = canal.id;
                break;
            }
        }
        if (!logChannelId) return;
        const guild = interaction.guild;
        if (!guild) return;
        const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
        if (!logChannel) return;
        // Montar embed de log
        const embed = new EmbedBuilder()
            .setTitle('Limpeza de Mensagens')
            .setColor('#FFA500')
            .setDescription(`O comando de limpeza foi executado.`)
            .addFields(
                { name: 'Usuário', value: usuario ? `<@${usuario.id}> (${usuario.tag})` : 'Desconhecido', inline: true },
                { name: 'Canal', value: `<#${interaction.channelId}>`, inline: true },
                { name: 'Quantidade', value: quantidade ? quantidade.toString() : 'Desconhecida', inline: true }
            )
            .setTimestamp();
        await logChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error('Erro ao registrar log de limpeza:', err);
    }
}

module.exports = {
    registrarLogLimpeza
};
