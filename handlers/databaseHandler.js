const path = require('path');
const mongodb = require(path.resolve(__dirname, '../mongodb.js'));
const boasVindasModule = require('../eventos/boas-vindas');

class DatabaseHandler {
    constructor() {
        this.isConnected = false;
    }

    async connect(botClient) {
        try {
            console.log('[DB] Iniciando conexão com MongoDB...');
            // Estabelece a conexão com o banco de dados
            const database = await mongodb.connect(process.env.MONGO_URI);
            this.isConnected = true;
            
            // Inicializa o Map de cooldowns
            global.cooldowns = new Map();
            
            // Inicializa as coleções necessárias
            await mongodb.initializeCollections();
            
            // Atualiza o contexto com o client do bot
            if (global.ignisContext) {
                global.ignisContext.client = botClient;
            }
            
            // Inicializa o módulo de boas-vindas
            await boasVindasModule.initialize(botClient, global.ignisContext);
            
            console.log('[DB] Conexão e inicialização concluídas com sucesso');
            return global.ignisContext;
        } catch (error) {
            console.error('[DB] Erro durante a conexão:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.isConnected && mongodb.isConnected()) {
            await mongodb.disconnect();
            this.isConnected = false;
            console.log('[DB] Conexão com MongoDB encerrada');
        }
    }
}

module.exports = DatabaseHandler;