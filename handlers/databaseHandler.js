const { MongoClient } = require('mongodb');
const mongodb = require('../configuracoes/mongodb');
const boasVindasModule = require('../eventos/boas-vindas');

class DatabaseHandler {
    constructor() {
        this.mongoClient = new MongoClient(process.env.MONGO_URI);
    }

    async connect(botClient) {
        try {
            await this.mongoClient.connect();
            console.log('Conectado ao MongoDB com sucesso!');
            
            const db = this.mongoClient.db('ignis');
            const ignis = { database: db, client: botClient };
            global.ignisContext = ignis;
            
            await mongodb.initializeCollections();
            await boasVindasModule.initialize(botClient, ignis);
            
            global.cooldowns = new Map();
            global.voiceJoinTimes = new Map();
            
            return ignis;
        } catch (error) {
            console.error('Erro ao configurar o banco de dados:', error);
            throw error;
        }
    }

    async disconnect() {
        await this.mongoClient.close();
    }
}

module.exports = DatabaseHandler;