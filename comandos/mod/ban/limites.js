const mongodb = require('../../../configuracoes/mongodb.js');
const ERROS = require('./erros');

async function verificarLimiteDiario(interaction, cargoMod) {
    const hoje = new Date().toISOString().split('T')[0];
    const statsKey = `bans_${hoje}_${interaction.user.id}`;
    
    const banStats = await mongodb.findOne(mongodb.COLLECTIONS.TEMPORARIO, { _id: statsKey });
    const bansHoje = banStats ? banStats.quantidade : 0;

    // Verificar limite diário
    if (cargoMod.maxban !== "infinito" && bansHoje >= cargoMod.maxban) {
        return {
            success: false,
            response: ERROS.LIMITE_DIARIO(cargoMod.maxban)
        };
    }

    // Verificar cooldown se não for o dono
    if (cargoMod.cooldownBase && banStats?.ultimoBan) {
        const agora = new Date();
        const ultimoBan = new Date(banStats.ultimoBan);
        const diferenca = Math.floor((agora - ultimoBan) / 1000); // Diferença em segundos
        
        if (diferenca < cargoMod.cooldownBase) {
            const tempoRestante = Math.ceil(cargoMod.cooldownBase - diferenca);
            return {
                success: false,
                response: ERROS.COOLDOWN(tempoRestante)
            };
        }
    }

    return {
        success: true,
        statsKey,
        bansHoje
    };
}

async function registrarBan(statsKey, interaction, user, reason, cargoMod) {
    await mongodb.upsert(
        mongodb.COLLECTIONS.TEMPORARIO,
        { _id: statsKey },
        {
            $inc: { quantidade: 1 },
            $set: {
                userId: interaction.user.id,
                username: interaction.user.tag,
                cargo: cargoMod.nome,
                ultimoBan: new Date(),
                expiraEm: new Date(new Date().setHours(24, 0, 0, 0))
            },
            $push: {
                bans: {
                    userId: user.id,
                    username: user.tag,
                    reason: reason,
                    timestamp: new Date()
                }
            }
        }
    );
}

module.exports = {
    verificarLimiteDiario,
    registrarBan
};