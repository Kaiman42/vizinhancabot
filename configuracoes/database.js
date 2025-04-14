/**
 * Módulo para acessar o banco de dados MongoDB já inicializado no index.js
 */

/**
 * Obtém uma coleção do banco de dados global do Ignis
 * @param {string} collectionName - Nome da coleção
 * @returns {Collection} Coleção do MongoDB
 */
function getCollection(collectionName) {
  if (!global.ignisContext || !global.ignisContext.database) {
    throw new Error('Contexto de banco de dados não inicializado. Verifique se o MongoDB está conectado.');
  }
  
  return global.ignisContext.database.collection(collectionName);
}

/**
 * Obtém o cliente MongoDB
 * @returns {MongoClient} Cliente MongoDB
 */
function getClient() {
  if (!global.ignisContext) {
    throw new Error('Contexto de banco de dados não inicializado.');
  }
  
  return global.ignisContext.database.client;
}

/**
 * Fecha a conexão com o MongoDB (apenas para referência, não usado em produção)
 * O gerenciamento da conexão é feito no index.js
 */
async function close() {
  console.log('Função close() em database.js não faz nada. A conexão é gerenciada pelo index.js');
}

module.exports = {
  getCollection,
  getClient,
  close
};