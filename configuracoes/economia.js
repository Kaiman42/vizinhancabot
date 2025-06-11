const path = require('path');
const mongodb = require(path.resolve(__dirname, '../mongodb.js'));

const ECONOMIA = {
  DEFAULT_BALANCE: 0,
  DAILY_AMOUNT: 100,
  DAILY_COOLDOWN: 24 * 60 * 60 * 1000
};

// Nova versão: cada usuário é um documento separado na coleção 'economias'
class SistemaEconomiaNovo {
  static async obterSaldo(userId) {
    const doc = await mongodb.findOne('economias', { _id: userId });
    return doc?.saldo || ECONOMIA.DEFAULT_BALANCE;
  }

  static async alterarSaldo(userId, amount) {
    if (!userId || isNaN(amount)) return false;
    const update = await mongodb.updateOne(
      'economias',
      { _id: userId },
      { $inc: { saldo: amount } },
      { upsert: true }
    );
    return update.modifiedCount > 0 || update.upsertedCount > 0;
  }

  static async receberDiario(userId, valorRecompensa) {
    const doc = await mongodb.findOne('economias', { _id: userId });
    const ultimoDaily = doc?.ultimoDaily || 0;
    const tempoPassado = Date.now() - ultimoDaily;
    if (tempoPassado < ECONOMIA.DAILY_COOLDOWN) {
      return { success: false, tempoRestante: ECONOMIA.DAILY_COOLDOWN - tempoPassado };
    }
    await mongodb.updateOne(
      'economias',
      { _id: userId },
      { $inc: { saldo: valorRecompensa }, $set: { ultimoDaily: Date.now() } },
      { upsert: true }
    );
    return {
      success: true,
      novoSaldo: await this.obterSaldo(userId),
      quantiaRecebida: valorRecompensa
    };
  }
}

module.exports = {
  ...ECONOMIA,
  obterSaldo: SistemaEconomiaNovo.obterSaldo,
  alterarSaldo: SistemaEconomiaNovo.alterarSaldo,
  receberDiario: SistemaEconomiaNovo.receberDiario
};