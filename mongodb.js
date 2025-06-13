const COLLECTIONS = {
  DADOS_USUARIOS: 'dadosUsuarios',
  CONFIGURACOES: 'configuracoes',
  LEMBRETES: 'lembretes',
  NIVEIS: 'niveis',
  PRESTIGIOS: 'prestigios'
};

// Função auxiliar para tratamento de erros
const handleDbError = (operation, collection, error) => {
  console.error(`Erro ao ${operation} em ${collection}:`, error);
  throw error;
};

function getCollection(collectionName) {
  if (!global.ignisContext?.database) {
    throw new Error('Contexto de banco de dados não inicializado.');
  }
  return global.ignisContext.database.collection(collectionName);
}

// Operações básicas do banco de dados
async function find(collectionName, query, options = {}) {
  try {
    const collection = getCollection(collectionName);
    return options.findOne 
      ? await collection.findOne(query)
      : await collection.find(query).toArray();
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
    
    const db = global.ignisContext.database;
    const collections = await db.listCollections().toArray();
    
    if (!collections.some(col => col.name === collectionName)) {
      await db.createCollection(collectionName);
      if (defaultDoc) {
        await getCollection(collectionName).insertOne(defaultDoc);
      }
    }
    return true;
  } catch (error) {
    handleDbError('verificar/criar coleção', collectionName, error);
  }
}

// Configurações iniciais
const DEFAULT_CONFIGS = {
  radios: { Kaiman: [] },
  cores: {},
  escopos: {},
  patentes: {},
  canais: {}
};

async function initializeCollections() {
  try {

    // Inicializar coleção de níveis
    await ensureCollection(COLLECTIONS.NIVEIS);

    // Inicializar configurações
    await ensureCollection(COLLECTIONS.CONFIGURACOES);
    await Promise.all(Object.entries(DEFAULT_CONFIGS).map(([config, defaultValue]) =>
      updateOne(COLLECTIONS.CONFIGURACOES,
        { _id: config },
        { $setOnInsert: { _id: config, ...defaultValue } },
        { upsert: true }
      )
    ));

    // Inicializar coleção de prestígios
    await ensureCollection(COLLECTIONS.PRESTIGIOS);

    return true;
  } catch (error) {
    console.error('Erro ao inicializar coleções:', error);
    return false;
  }
}

async function getRegistroMembrosChannelId(mongoUri) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri);
    try {
        await client.connect();
        const db = client.db('ignis');
        const canaisDoc = await db.collection('configuracoes').findOne({ _id: 'canais' });
        if (!canaisDoc || !Array.isArray(canaisDoc.categorias)) return null;
        for (const categoria of canaisDoc.categorias) {
            if (!Array.isArray(categoria.canais)) continue;
            const canal = categoria.canais.find(c => c.nome === 'registros-membros');
            if (canal) return canal.id;
        }
        return null;
    } finally {
        await client.close();
    }
}

async function getErrosComando() {
    return await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'erros-comando' });
}

// Exportar apenas o necessário
module.exports = {
  COLLECTIONS,
  getCollection,
  find,
  findOne: (collectionName, query) => find(collectionName, query, { findOne: true }),
  updateOne,
  ensureCollection,
  initializeCollections,
  getRegistroMembrosChannelId, // exporta a função utilitária
  getErrosComando,
};