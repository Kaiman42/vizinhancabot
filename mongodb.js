const COLLECTIONS = {
  CONFIGURACOES: 'configuracoes',
  LEMBRETES: 'lembretes',
  NIVEIS: 'niveis',
  PRESTIGIOS: 'prestigios',
  BUMP: 'bump'
};

let client = null;
let database = null;

const handleDbError = (operation, collection, error) => {
  console.error(`Erro ao ${operation} em ${collection}:`, error);
  throw error;
};

async function connect(mongoUri) {
  try {
    if (!client) {
      const { MongoClient } = require('mongodb');
      client = new MongoClient(mongoUri);
      
      await client.connect();
      database = client.db('ignis');
      global.ignisContext = { database };
      
      console.log('[DB] Conexão com MongoDB estabelecida com sucesso');
    }
    return database;
  } catch (error) {
    console.error('[DB] Erro ao conectar com MongoDB:', error);
    throw error;
  }
}

function getCollection(collectionName) {
  if (!database) {
    throw new Error('Conexão com o banco de dados não inicializada. Chame connect() primeiro.');
  }
  return database.collection(collectionName);
}

async function find(collectionName, query, options = {}) {
  try {
    const collection = getCollection(collectionName);
    if (options.findOne) {
      return await collection.findOne(query);
    }
    return await collection.find(query).toArray();
  } catch (error) {
    handleDbError('buscar', collectionName, error);
  }
}

async function updateOne(collectionName, query, update, options = {}) {
  try {
    return await getCollection(collectionName).updateOne(query, update, options);
  } catch (error) {
    handleDbError('atualizar', collectionName, error);
  }
}

async function ensureCollection(collectionName, defaultDoc = null) {
  try {
    if (!collectionName || typeof collectionName !== 'string') {
      throw new Error(`Nome de coleção inválido: ${collectionName}`);
    }
    
    if (!database) {
      throw new Error('Banco de dados não inicializado');
    }

    const collections = await database.listCollections().toArray();
    
    if (!collections.some(col => col.name === collectionName)) {
      await database.createCollection(collectionName);
      if (defaultDoc) {
        await getCollection(collectionName).insertOne(defaultDoc);
      }
    }
    return true;
  } catch (error) {
    handleDbError('verificar/criar coleção', collectionName, error);
  }
}

async function initializeCollections() {
  try {
    await ensureCollection(COLLECTIONS.NIVEIS);
    await ensureCollection(COLLECTIONS.PRESTIGIOS);
    await ensureCollection(COLLECTIONS.BUMP);
    return true;
  } catch (error) {
    console.error('Erro ao inicializar coleções:', error);
    return false;
  }
}

function isConnected() {
  return database !== null && client?.topology?.isConnected();
}

async function disconnect() {
  if (client) {
    await client.close();
    client = null;
    database = null;
    console.log('[DB] Desconectado do MongoDB');
  }
}

// Exportando todas as funções necessárias
module.exports = {
    COLLECTIONS,
    connect,
    disconnect,
    find,
    updateOne,
    getCollection,
    ensureCollection,
    initializeCollections,
    isConnected
};