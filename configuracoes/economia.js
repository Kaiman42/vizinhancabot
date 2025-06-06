const mongodb = require('./mongodb');

const ECONOMIA = {
  DEFAULT_BALANCE: 0,
  DAILY_AMOUNT: 100,
  DAILY_COOLDOWN: 24 * 60 * 60 * 1000
};

class SistemaEconomia {
  static async obterSaldo(userId) {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    return doc?.usuarios?.find(u => u.userId === userId)?.saldo || ECONOMIA.DEFAULT_BALANCE;
  }

  static async alterarSaldo(userId, amount) {
    if (!userId || isNaN(amount)) return false;
    const update = await mongodb.updateOne(
      mongodb.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'economias', 'usuarios.userId': userId },
      { $inc: { 'usuarios.$.saldo': amount } },
      { upsert: true }
    );
    return update.modifiedCount > 0;
  }

  static async transferirSaldo(fromUserId, toUserId, amount) {
    if (!fromUserId || !toUserId || isNaN(amount) || amount <= 0 || fromUserId === toUserId) {
      return { success: false, message: 'Parâmetros inválidos' };
    }

    const saldoRemetente = await this.obterSaldo(fromUserId);
    if (saldoRemetente < amount) {
      return { success: false, message: 'Saldo insuficiente' };
    }

    const removido = await this.alterarSaldo(fromUserId, -amount);
    const adicionado = await this.alterarSaldo(toUserId, amount);

    if (!adicionado && removido) {
      await this.alterarSaldo(fromUserId, amount);
      return { success: false, message: 'Erro na transferência' };
    }

    return {
      success: true,
      message: 'Transferência realizada',
      novoSaldoRemetente: await this.obterSaldo(fromUserId),
      novoSaldoDestinatario: await this.obterSaldo(toUserId)
    };
  }

  static async receberDiario(userId) {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    const ultimoDaily = doc?.usuarios?.find(u => u.userId === userId)?.ultimoDaily || 0;
    const tempoPassado = Date.now() - ultimoDaily;

    if (tempoPassado < ECONOMIA.DAILY_COOLDOWN) {
      return { success: false, tempoRestante: ECONOMIA.DAILY_COOLDOWN - tempoPassado };
    }

    const sucesso = await this.alterarSaldo(userId, ECONOMIA.DAILY_AMOUNT);
    if (!sucesso) return { success: false, message: 'Erro ao processar daily' };

    await mongodb.updateOne(
      mongodb.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'economias', 'usuarios.userId': userId },
      { $set: { 'usuarios.$.ultimoDaily': Date.now() } }
    );

    return {
      success: true,
      novoSaldo: await this.obterSaldo(userId),
      quantiaRecebida: ECONOMIA.DAILY_AMOUNT
    };
  }
}

module.exports = {
  ...ECONOMIA,
  obterSaldo: SistemaEconomia.obterSaldo,
  adicionarSaldo: amount => SistemaEconomia.alterarSaldo.bind(SistemaEconomia, amount),
  removerSaldo: (userId, amount) => SistemaEconomia.alterarSaldo(userId, -amount),
  transferirSaldo: SistemaEconomia.transferirSaldo,
  receberDiario: SistemaEconomia.receberDiario
};