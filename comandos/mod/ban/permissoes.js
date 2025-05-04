const mongodb = require('../../../configuracoes/mongodb.js');
const ERROS = require('./erros');

async function verificarPermissoes(interaction) {
    const escopos = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'escopos' });
    if (!escopos?.cargos) {
        return { 
            success: false, 
            response: ERROS.CONFIGURACAO_NAO_ENCONTRADA 
        };
    }

    // Encontrar o cargo mais alto do usuário com permissão de mod
    let cargoMod = null;
    for (const cargo of Object.values(escopos.cargos)) {
        if (cargo.mod && interaction.member.roles.cache.has(cargo.id)) {
            cargoMod = cargo;
            break;
        }
    }

    if (!cargoMod) {
        return { 
            success: false, 
            response: ERROS.SEM_PERMISSAO 
        };
    }

    return { 
        success: true, 
        cargo: cargoMod 
    };
}

async function verificarPermissoesMembro(interaction, member) {
    if (!member) return { success: true };
    
    if (!member.bannable) {
        return {
            success: false,
            response: ERROS.NAO_BANIVEL
        };
    }
    
    if (interaction.member.roles.highest.position <= member.roles.highest.position) {
        return {
            success: false,
            response: ERROS.CARGO_SUPERIOR
        };
    }

    return { success: true };
}

module.exports = {
    verificarPermissoes,
    verificarPermissoesMembro
};