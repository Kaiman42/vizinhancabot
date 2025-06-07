const { MongoClient } = require('mongodb');
const path = require('path');
const mongodb = require(path.resolve(__dirname, '../mongodb.js'));
const boasVindasModule = require('../eventos/boas-vindas');

class DatabaseHandler {
    constructor() {
        this.mongoClient = new MongoClient(process.env.MONGO_URI);
    }

    async connect(botClient) {
        try {
            await this.mongoClient.connect();
            const db = this.mongoClient.db('ignis');
            const ignis = { database: db, client: botClient };
            
            global.ignisContext = ignis;
            global.cooldowns = new Map();
            
            await mongodb.initializeCollections();
            await boasVindasModule.initialize(botClient, ignis);
            
            return ignis;
        } catch (error) {
            throw error;
        }
    }

    async disconnect() {
        await this.mongoClient.close();
    }
}

module.exports = DatabaseHandler;