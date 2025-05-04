// Exporta todas as funções do sistema de economia
module.exports = {
  ...require('./saldo'),
  ...require('./diario'),
  ...require('./constantes')
};
