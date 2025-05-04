const mongodb = require('../../../configuracoes/mongodb.js');
const ERROS = require('./erros');

async function verificarLimiteDiario(interaction, cargoMod) {
    const hoje = new Date().toISOString().split('T')[0];
    const statsKey = `bans_${hoje}_${interaction.user.id}`;
    
    const banStats = await mongodb.findOne(mongodb.COLLECTIONS.TEMPORARIO, { _id: statsKey });
    const bansHoje = banStats ? banStats.quantidade : 0;

    if (cargoMod.maxban !== "infinito" && bansHoje >= cargoMod.maxban) {
        return {
            success: false,
            response: ERROS.LIMITE_DIARIO(cargoMod.maxban)
        };
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