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

    // Hierarquia de cargos em ordem decrescente de poder
    const hierarquia = ['dono', 'alto', 'medio', 'baixo'];
    
    // Encontrar o cargo mais alto do usuário com permissão de mod
    let cargoMaisAlto = null;
    let nivelMaisAlto = Number.MAX_SAFE_INTEGER;

    for (const cargo of Object.values(escopos.cargos)) {
        if (cargo.mod && cargo.tipo && interaction.member.roles.cache.has(cargo.id)) {
            const nivel = hierarquia.indexOf(cargo.tipo);
            if (nivel !== -1 && nivel < nivelMaisAlto) {
                cargoMaisAlto = cargo;
                nivelMaisAlto = nivel;
            }
        }
    }

    if (!cargoMaisAlto) {
        return { 
            success: false, 
            response: ERROS.SEM_PERMISSAO 
        };
    }

    return { 
        success: true, 
        cargo: cargoMaisAlto 
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

    const escopos = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'escopos' });
    if (!escopos?.cargos) return { success: true };

    // Hierarquia de cargos em ordem decrescente de poder
    const hierarquia = ['dono', 'alto', 'medio', 'baixo'];
    
    // Encontrar o nível mais alto do executor e do alvo
    let nivelExecutor = Number.MAX_SAFE_INTEGER;
    let nivelAlvo = Number.MAX_SAFE_INTEGER;

    for (const cargo of Object.values(escopos.cargos)) {
        if (!cargo.mod || !cargo.tipo) continue;

        const nivel = hierarquia.indexOf(cargo.tipo);
        if (nivel === -1) continue;

        if (interaction.member.roles.cache.has(cargo.id)) {
            if (nivel < nivelExecutor) {
                nivelExecutor = nivel;
            }
        }

        if (member.roles.cache.has(cargo.id)) {
            if (nivel < nivelAlvo) {
                nivelAlvo = nivel;
            }
        }
    }

    // Se o alvo não tem cargo de mod
    if (nivelAlvo === Number.MAX_SAFE_INTEGER) return { success: true };

    // Se o alvo tem nível maior ou igual poder (número menor ou igual)
    if (nivelAlvo <= nivelExecutor) {
        return {
            success: false,
            response: nivelAlvo === nivelExecutor ? ERROS.CARGO_IGUAL : ERROS.CARGO_SUPERIOR
        };
    }

    return { success: true };
}

module.exports = {
    verificarPermissoes,
    verificarPermissoesMembro
};