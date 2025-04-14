require('dotenv').config(); // Carrega as variáveis do arquivo .env
const { MongoClient } = require('mongodb');
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuração do MongoDB
const uri = process.env.MONGO_URI; // Obtém o MONGO_URI do arquivo .env
const client = new MongoClient(uri);

// Adicionando o intent GuildPresences para poder verificar o status dos usuários
const botClient = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,    // Necessary for member information
        GatewayIntentBits.GuildPresences,   // Necessary for online/offline status
        GatewayIntentBits.GuildMessages,    // Necessary to receive messages
        GatewayIntentBits.MessageContent,   // Necessary to read message content
        GatewayIntentBits.GuildVoiceStates  // Necessary for voice channel tracking
    ] 
});

botClient.once('ready', () => {
    console.log(`Bot está online como ${botClient.user.tag}!`);
});

botClient.on('interactionCreate', async interaction => {
    try {
        if (interaction.isCommand()) {
            const command = commands.find(cmd => cmd.name === interaction.commandName);
            if (!command) return;

            try {
                // Passar o objeto ignis como segundo parâmetro para o comando
                await command.execute(interaction, global.ignisContext);
            } catch (error) {
                console.error(`Erro ao executar o comando ${interaction.commandName}:`, error);
                // Verifica se a interação ainda pode ser respondida
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ 
                        content: 'Houve um erro ao executar este comando.', 
                        ephemeral: true 
                    }).catch(err => console.error('Erro ao responder após falha no comando:', err));
                } else {
                    await interaction.reply({ 
                        content: 'Houve um erro ao executar este comando.', 
                        ephemeral: true 
                    }).catch(err => console.error('Erro ao responder após falha no comando:', err));
                }
            }
        } else if (interaction.isStringSelectMenu() || interaction.isButton()) {
            // Atualizando de isSelectMenu() para isStringSelectMenu() conforme recomendação
            const customId = interaction.customId;
            
            // Verifica interações do sistema de rádio
            if (customId === 'select_radio' || customId.endsWith('_radio')) {
                try {
                    const radioCommand = require('./comandos/misc/radio');
                    
                    if (customId === 'select_radio' && typeof radioCommand.handleSelectMenu === 'function') {
                        await radioCommand.handleSelectMenu(interaction);
                    } else if (typeof radioCommand.handleButton === 'function') {
                        await radioCommand.handleButton(interaction);
                    }
                } catch (error) {
                    console.error(`Erro ao processar interação de rádio (${customId}):`, error);
                    
                    // Tentar responder à interação se possível
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ 
                            content: 'Ocorreu um erro ao processar esta interação.', 
                            ephemeral: true 
                        }).catch(err => console.error('Não foi possível responder após erro:', err));
                    }
                }
            }
            
            // Adicione outros manipuladores de interação conforme necessário
        }
    } catch (error) {
        console.error('Erro geral no manipulador de interações:', error);
    }
});

const commands = [];
const commandsPath = path.join(__dirname, 'comandos');

// Função para carregar comandos de forma recursiva
function loadCommands(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            loadCommands(fullPath); // Recursivamente carrega subpastas
        } else if (file.name.endsWith('.js')) {
            const command = require(fullPath);
            if (command.data && typeof command.data.toJSON === 'function') {
                commands.push({
                    ...command.data.toJSON(),
                    execute: command.execute,
                });
            } else {
                console.warn(`O arquivo ${fullPath} não possui um comando válido.`);
            }
        }
    }
}

loadCommands(commandsPath);

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('Iniciando o registro de comandos de barra...');
        // Registra ou atualiza os comandos
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID), // Para comandos globais
            { body: commands },
        );
        console.log('Comandos registrados ou atualizados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
})();

botClient.login(process.env.BOT_TOKEN);

// Create a database context for the bot
async function setupDatabase() {
    try {
        await client.connect();
        console.log('Conectado ao MongoDB com sucesso!');
        
        // Create the ignis database context
        const db = client.db('ignis'); // Make sure to use the right case for your database name
        
        // Create an ignis context object with database access
        const ignis = {
            database: db,
            client: botClient
        };
        
        // Create required collections
        const collections = ['rank', 'cargoRank', 'channelConfigs'];
        for (const collectionName of collections) {
            ignis.database[collectionName] = db.collection(collectionName);
            console.log(`Collection '${collectionName}' initialized`);
        }
        
        // Make ignis context available globally
        global.ignisContext = ignis;
        console.log('Contexto ignis disponibilizado globalmente');
        
        // Initialize the level system with proper context
        const niveisModule = require('./eventos/niveis');
        
        // Inicializa as coleções necessárias
        if (niveisModule.utils && typeof niveisModule.utils.initializeCollections === 'function') {
            await niveisModule.utils.initializeCollections(ignis);
            console.log('Coleções inicializadas com sucesso');
        }
        
        // Initialize the level system
        await niveisModule.initialize(botClient, ignis);
        
        // Setup event listener for the level system
        botClient.on('messageCreate', async (message) => {
            try {
                await niveisModule.execute(message, ignis);
            } catch (error) {
                console.error('Error processing message for XP:', error);
            }
        });
        
        // Set up voice state update handler for voice XP
        botClient.on('voiceStateUpdate', async (oldState, newState) => {
            try {
                if (niveisModule.utils && typeof niveisModule.utils.handleVoiceStateUpdate === 'function') {
                    await niveisModule.utils.handleVoiceStateUpdate(oldState, newState, ignis);
                }
            } catch (error) {
                console.error('Error handling voice state update:', error);
            }
        });
        
        // Export cooldowns for XP system
        global.cooldowns = new Map();
        global.voiceJoinTimes = new Map();
        
        console.log('Sistema de níveis inicializado com sucesso!');
        return ignis;
    } catch (error) {
        console.error('Erro ao configurar o banco de dados:', error);
        throw error;
    }
}

setupDatabase().catch(console.error);

// Adicionar um tratamento para erros não capturados
process.on('unhandledRejection', (error) => {
    // Tratar especificamente erros de mensagem desconhecida para não derrubar o bot
    if (error && error.code === 10008) {
        console.warn('Aviso: Tentativa de interagir com uma mensagem que não existe mais (provavelmente foi excluída)');
        if (error.url) {
            console.warn('URL da requisição:', error.url);
        }
        return;
    }
    
    console.error('Erro não tratado (unhandledRejection):', error);
});