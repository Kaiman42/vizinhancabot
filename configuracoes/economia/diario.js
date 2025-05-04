const { DAILY_COOLDOWN, DAILY_AMOUNT } = require('./constantes');
const { obterSaldo, adicionarSaldo } = require('./saldo');
const mongodb = require('../mongodb');

async function verificarDiario(userId) {
  try {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    if (!doc || !doc.usuarios) return true;
    const usuario = doc.usuarios.find(u => u.userId === userId);
    if (!usuario || !usuario.ultimoDaily) return true;
    const agora = new Date().getTime();
    const tempoPassado = agora - usuario.ultimoDaily;
    return tempoPassado >= DAILY_COOLDOWN;
  } catch (error) {
    console.error(`Erro ao verificar daily para o usuário ${userId}:`, error);
    return false;
  }
}

async function receberDiario(userId) {
  try {
    const podeReceber = await verificarDiario(userId);
    if (!podeReceber) {
      const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
      const usuario = doc.usuarios.find(u => u.userId === userId);
      const ultimoDaily = usuario?.ultimoDaily || 0;
      const tempoRestante = DAILY_COOLDOWN - (new Date().getTime() - ultimoDaily);
      return {
        success: false,
        message: 'Você já recebeu sua recompensa diária',
        tempoRestante
      };
    }
    const novoSaldo = await adicionarSaldo(userId, DAILY_AMOUNT);
    await mongodb.updateOne(
      mongodb.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'economias', 'usuarios.userId': userId },
      { $set: { 'usuarios.$.ultimoDaily': new Date().getTime() } }
    );
    return {
      success: true,
      message: `Você recebeu ${DAILY_AMOUNT} moedas!`,
      novoSaldo
    };
  } catch (error) {
    console.error(`Erro ao processar daily para o usuário ${userId}:`, error);
    return { success: false, message: 'Ocorreu um erro ao processar sua recompensa diária' };
  }
}

module.exports = {
  verificarDiario,
  receberDiario
};