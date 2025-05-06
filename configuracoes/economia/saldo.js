const { DEFAULT_BALANCE } = require('./constantes');
const mongodb = require('../mongodb');

const obterSaldo = async (userId) => {
  try {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    return doc?.usuarios?.find(u => u.userId === userId)?.saldo || DEFAULT_BALANCE;
  } catch {
    return DEFAULT_BALANCE;
  }
};

const adicionarSaldo = async (userId, amount) => {
  if (!userId || isNaN(amount)) return false;
  try {
    const update = await mongodb.updateOne(
      mongodb.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'economias', 'usuarios.userId': userId },
      { $inc: { 'usuarios.$.saldo': amount } },
      { upsert: true }
    );
    return update.modifiedCount > 0;
  } catch {
    return false;
  }
};

const removerSaldo = async (userId, amount) => {
  if (!userId || isNaN(amount)) return false;
  const saldo = await obterSaldo(userId);
  if (saldo < amount) return false;
  const success = await adicionarSaldo(userId, -amount);
  return success;
};

const transferirSaldo = async (fromUserId, toUserId, amount) => {
  if (!fromUserId || !toUserId || isNaN(amount) || amount <= 0) {
    return { success: false, message: 'Parâmetros inválidos' };
  }
  try {
    const saldoRemetente = await obterSaldo(fromUserId);
    if (saldoRemetente < amount) {
      return { success: false, message: 'Saldo insuficiente' };
    }
    await removerSaldo(fromUserId, amount);
    const success = await adicionarSaldo(toUserId, amount);
    if (!success) {
      return { success: false, message: 'Erro ao adicionar saldo ao destinatário' };
    }
    return { 
      success: true, 
      message: 'Transferência realizada',
      novoSaldoRemetente: await obterSaldo(fromUserId),
      novoSaldoDestinatario: await obterSaldo(toUserId)
    };
  } catch {
    return { success: false, message: 'Erro na transferência' };
  }
};

module.exports = { obterSaldo, adicionarSaldo, removerSaldo, transferirSaldo };