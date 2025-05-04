const { DEFAULT_BALANCE } = require('./constantes');
const mongodb = require('../mongodb');

async function obterSaldo(userId) {
  try {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    if (!doc || !doc.usuarios) return DEFAULT_BALANCE;
    const usuario = doc.usuarios.find(u => u.userId === userId);
    return usuario ? usuario.saldo || DEFAULT_BALANCE : DEFAULT_BALANCE;
  } catch (error) {
    console.error(`Erro ao obter saldo do usuário ${userId}:`, error);
    return DEFAULT_BALANCE;
  }
}

async function adicionarSaldo(userId, amount) {
  if (!userId || typeof amount !== 'number' || isNaN(amount)) {
    console.error('Parâmetros inválidos para adicionarSaldo:', { userId, amount });
    return false;
  }
  try {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    if (!doc) {
      await mongodb.upsert(
        mongodb.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'economias' },
        { $set: { usuarios: [{ userId, saldo: amount }] } }
      );
      return amount;
    }
    if (!doc.usuarios) {
      await mongodb.updateOne(
        mongodb.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'economias' },
        { $set: { usuarios: [{ userId, saldo: amount }] } }
      );
      return amount;
    }
    const usuarioExistente = doc.usuarios.find(u => u.userId === userId);
    if (usuarioExistente) {
      const novoSaldo = (usuarioExistente.saldo || 0) + amount;
      await mongodb.updateOne(
        mongodb.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'economias', 'usuarios.userId': userId },
        { $set: { 'usuarios.$.saldo': novoSaldo } }
      );
      return novoSaldo;
    } else {
      await mongodb.updateOne(
        mongodb.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'economias' },
        { $push: { usuarios: { userId, saldo: amount } } }
      );
      return amount;
    }
  } catch (error) {
    console.error(`Erro ao adicionar saldo para o usuário ${userId}:`, error);
    return false;
  }
}

async function removerSaldo(userId, amount) {
  if (!userId || typeof amount !== 'number' || isNaN(amount)) {
    console.error('Parâmetros inválidos para removerSaldo:', { userId, amount });
    return false;
  }
  try {
    const saldoAtual = await obterSaldo(userId);
    if (saldoAtual < amount) return false;
    const novoSaldo = saldoAtual - amount;
    await mongodb.updateOne(
      mongodb.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'economias', 'usuarios.userId': userId },
      { $set: { 'usuarios.$.saldo': novoSaldo } }
    );
    return novoSaldo;
  } catch (error) {
    console.error(`Erro ao remover saldo do usuário ${userId}:`, error);
    return false;
  }
}

async function transferirSaldo(fromUserId, toUserId, amount) {
  if (!fromUserId || !toUserId || typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    console.error('Parâmetros inválidos para transferirSaldo:', { fromUserId, toUserId, amount });
    return { success: false, message: 'Parâmetros inválidos para transferência' };
  }
  try {
    const saldoRemetente = await obterSaldo(fromUserId);
    if (saldoRemetente < amount) {
      return { success: false, message: 'Saldo insuficiente para transferência' };
    }
    const novoSaldoRemetente = await removerSaldo(fromUserId, amount);
    const novoSaldoDestinatario = await adicionarSaldo(toUserId, amount);
    if (novoSaldoRemetente === false || novoSaldoDestinatario === false) {
      if (novoSaldoRemetente === false && novoSaldoDestinatario !== false) {
        await removerSaldo(toUserId, amount);
      } else if (novoSaldoRemetente !== false && novoSaldoDestinatario === false) {
        await adicionarSaldo(fromUserId, amount);
      }
      return { success: false, message: 'Erro durante a transferência' };
    }
    return {
      success: true,
      message: 'Transferência realizada com sucesso',
      novoSaldoRemetente,
      novoSaldoDestinatario
    };
  } catch (error) {
    console.error('Erro ao transferir saldo:', error);
    return { success: false, message: 'Erro durante a transferência' };
  }
}

module.exports = {
  obterSaldo,
  adicionarSaldo,
  removerSaldo,
  transferirSaldo
};