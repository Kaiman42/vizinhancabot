const { DAILY_COOLDOWN, DAILY_AMOUNT } = require('./constantes');
const { adicionarSaldo } = require('./saldo');
const mongodb = require('../mongodb');

const verificarDiario = async (userId) => {
  try {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    const ultimoDaily = doc?.usuarios?.find(u => u.userId === userId)?.ultimoDaily || 0;
    return Date.now() - ultimoDaily >= DAILY_COOLDOWN;
  } catch {
    return false;
  }
};

const receberDiario = async (userId) => {
  try {
    if (!await verificarDiario(userId)) {
      const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
      const ultimoDaily = doc?.usuarios?.find(u => u.userId === userId)?.ultimoDaily || 0;
      return {
        success: false,
        tempoRestante: DAILY_COOLDOWN - (Date.now() - ultimoDaily)
      };
    }

    const novoSaldo = await adicionarSaldo(userId, DAILY_AMOUNT);
    await mongodb.updateOne(
      mongodb.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'economias', 'usuarios.userId': userId },
      { $set: { 'usuarios.$.ultimoDaily': Date.now() } }
    );

    return { success: true, novoSaldo };
  } catch {
    return { success: false, message: 'Erro ao processar daily' };
  }
};

module.exports = { verificarDiario, receberDiario };