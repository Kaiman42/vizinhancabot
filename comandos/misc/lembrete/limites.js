// Define o limite de lembretes ativos por usuário
const lembretesTotal = 3;

async function atingiuLimiteLembretes(temporarioCollection, userId) {
    const activeReminders = await temporarioCollection.countDocuments({ userId });
    return activeReminders >= lembretesTotal;
}

module.exports = {
    lembretesTotal,
    atingiuLimiteLembretes
};
