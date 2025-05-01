const COLLECTIONS = {
  DADOS_USUARIOS: 'dadosUsuarios',
  CONFIGURACOES: 'configuracoes',
  TEMPORARIO: 'temporario'
};

function getCollection(collectionName) {
  if (!global.ignisContext || !global.ignisContext.database) {
    throw new Error('Contexto de banco de dados não inicializado. Verifique se o MongoDB está conectado.');
  }
  
  return global.ignisContext.database.collection(collectionName);
}

function getClient() {
  if (!global.ignisContext) {
    throw new Error('Contexto de banco de dados não inicializado.');
  }
  
  return global.ignisContext.database.client;
}

async function find(collectionName, query, options = {}) {
  try {
    const collection = getCollection(collectionName);
    if (options.findOne) {
      return await collection.findOne(query);
    } else {
      return await collection.find(query).toArray();
    }
  } catch (error) {
    console.error(`Erro ao buscar em ${collectionName}:`, error);
    throw error;
  }
}

async function findOne(collectionName, query) {
  return find(collectionName, query, { findOne: true });
}

async function insertOne(collectionName, document) {
  try {
    const collection = getCollection(collectionName);
    return await collection.insertOne(document);
  } catch (error) {
    console.error(`Erro ao inserir em ${collectionName}:`, error);
    throw error;
  }
}

async function insertMany(collectionName, documents) {
  try {
    const collection = getCollection(collectionName);
    return await collection.insertMany(documents);
  } catch (error) {
    console.error(`Erro ao inserir múltiplos em ${collectionName}:`, error);
    throw error;
  }
}

async function updateOne(collectionName, query, update, options = {}) {
  try {
    const collection = getCollection(collectionName);
    return await collection.updateOne(query, update, options);
  } catch (error) {
    console.error(`Erro ao atualizar em ${collectionName}:`, error);
    throw error;
  }
}

async function updateMany(collectionName, query, update, options = {}) {
  try {
    const collection = getCollection(collectionName);
    return await collection.updateMany(query, update, options);
  } catch (error) {
    console.error(`Erro ao atualizar múltiplos em ${collectionName}:`, error);
    throw error;
  }
}

async function deleteOne(collectionName, query) {
  try {
    const collection = getCollection(collectionName);
    return await collection.deleteOne(query);
  } catch (error) {
    console.error(`Erro ao deletar em ${collectionName}:`, error);
    throw error;
  }
}

async function deleteMany(collectionName, query) {
  try {
    const collection = getCollection(collectionName);
    return await collection.deleteMany(query);
  } catch (error) {
    console.error(`Erro ao deletar múltiplos em ${collectionName}:`, error);
    throw error;
  }
}

async function upsert(collectionName, query, update) {
  return await updateOne(collectionName, query, update, { upsert: true });
}

async function ensureCollection(collectionName, defaultDoc = null) {
  try {
    // Validação para garantir que collectionName seja uma string não vazia
    if (!collectionName || typeof collectionName !== 'string') {
      throw new Error(`Nome de coleção inválido: ${collectionName}`);
    }
    
    const db = global.ignisContext.database;
    const collections = await db.listCollections().toArray();
    
    const collectionExists = collections.some(col => col.name === collectionName);
    
    if (!collectionExists) {
      await db.createCollection(collectionName);

      
      if (defaultDoc) {
        await insertOne(collectionName, defaultDoc);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Erro ao verificar/criar coleção ${collectionName}:`, error);
    return false;
  }
}

async function close() {
  console.log('Função close() em mongodb.js não faz nada. A conexão é gerenciada pelo index.js');
}

async function initializeCollections() {
  try {
    // Iniciando coleção dadosUsuarios e seus documentos
    await ensureCollection(COLLECTIONS.DADOS_USUARIOS);
    //await upsert(COLLECTIONS.DADOS_USUARIOS, { _id: 'niveis' }, { $setOnInsert: { _id: 'niveis' } });
    await upsert(COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' }, { $setOnInsert: { _id: 'economias' } });
    await upsert(COLLECTIONS.DADOS_USUARIOS, { _id: 'evitar_spam' }, { $setOnInsert: { _id: 'evitar_spam' } });
    // Iniciando coleção ignis (configuracoes) e seus documentos
    await ensureCollection(COLLECTIONS.CONFIGURACOES);
    await upsert(COLLECTIONS.CONFIGURACOES, { _id: 'cores' }, { $setOnInsert: { _id: 'cores' } });
    await upsert(COLLECTIONS.CONFIGURACOES, { _id: 'escopos' }, { $setOnInsert: { _id: 'escopos' } });
    await upsert(COLLECTIONS.CONFIGURACOES, { _id: 'patentes' }, { $setOnInsert: { _id: 'patentes' } });
    await upsert(COLLECTIONS.CONFIGURACOES, { _id: 'canais' }, { $setOnInsert: { _id: 'canais' } });

    return true;
  } catch (error) {
    console.error('Erro ao inicializar coleções:', error);
    return false;
  }
}

// Função para acessar documentos específicos da coleção de configurações
async function getConfig(configName) {
  return await findOne(COLLECTIONS.CONFIGURACOES, { _id: configName });
}

// Função para atualizar ou criar configurações
async function updateConfig(configName, update) {
  return await upsert(COLLECTIONS.CONFIGURACOES, { _id: configName }, update);
}

module.exports = {
  COLLECTIONS,
  getCollection,
  getClient,
  find,
  findOne,
  insertOne,
  insertMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
  upsert,
  ensureCollection,
  initializeCollections,
  getConfig,
  updateConfig,
  close
};