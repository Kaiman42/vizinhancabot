const mongodb = require('../../../configuracoes/mongodb');
const { RadioError, ERROS_RADIO } = require('./erros');
const { radioOwners } = require('./estado');

async function hasDjRole(member) {
    try {
        const configDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'escopos' });
        
        if (!configDoc?.cargos?.dj) {
            return true;
        }
        
        return member.roles.cache.has(configDoc.cargos.dj.id);
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
        
        return { botChannelId };
    } catch (error) {
        console.error('Erro ao buscar canal de bot:', error);
        return null;
    }
}

async function checkRadioPermissions(interaction) {
    // Verifica cargo DJ
    if (!(await hasDjRole(interaction.member))) {
        throw new RadioError(ERROS_RADIO.NO_DJ_ROLE);
    }

    // Obtém os canais antes de verificá-los
    const channels = await getChannels(interaction.guild.id);
    
    if (!channels?.botChannelId) {
        throw new RadioError('❌ Configuração de canais não encontrada.');
    }

    if (interaction.channel.id !== channels.botChannelId) {
        throw new RadioError(ERROS_RADIO.CANAL_ERRADO(channels.botChannelId));
    }

    // Verifica canal de voz
    if (!interaction.member.voice.channel) {
        throw new RadioError(ERROS_RADIO.NENHUM_CANAL);
    }

    // Verifica dono da rádio
    const guildId = interaction.guild.id;
    if (radioOwners.has(guildId) && radioOwners.get(guildId) !== interaction.user.id) {
        throw new RadioError(ERROS_RADIO.CONTROLADOR_SOMENTE(radioOwners.get(guildId)));
    }

    return { channels };
}

module.exports = {
    hasDjRole,
    getChannels,
    checkRadioPermissions
};