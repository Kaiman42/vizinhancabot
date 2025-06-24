require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');
const CommandHandler = require('./handlers/commandHandler');
const EventHandler = require('./handlers/eventHandler');
const DatabaseHandler = require('./handlers/databaseHandler');
const niveis = require('./eventos/niveis');
const { handleAuditLogEntry } = require('./handlers/auditLogHandler');

const botClient = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers, // Adicionado para eventos de entrada/saída de membros
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildModeration // Inclui audit log events
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.GuildMember,
        Partials.User
    ] 
});

async function initializeBot() {
    const commandHandler = new CommandHandler(botClient);
    const eventHandler = new EventHandler(botClient);
    const databaseHandler = new DatabaseHandler();

    global.commandHandler = commandHandler;
    
    // Inicializa o banco de dados
    await databaseHandler.connect(botClient);
    
    // Adiciona o client ao contexto existente
    if (global.ignisContext) {
        global.ignisContext.client = botClient;
    }
    
    commandHandler.load(path.join(__dirname, 'comandos'));
    await commandHandler.register();
    
    eventHandler.setupEvents();
    
    console.log('[BOOT] Iniciando login do bot...');
    await botClient.login(process.env.BOT_TOKEN);
    console.log('[BOOT] Login realizado, aguardando evento ready...');
    botClient.once('ready', async () => {
        console.log('[READY] Evento ready disparado. Inicializando sistema de níveis...');
        try {
            niveis.initialize(botClient, global.ignisContext)
                .then(() => console.log('[INIT] Sistema de níveis inicializado após o ready.'))
                .catch(err => console.error('[INIT ERROR] Erro ao inicializar sistema de níveis:', err));
        } catch (err) {
            console.error('[INIT ERROR] Erro ao inicializar sistema de níveis:', err);
        }
    });
}

botClient.on('guildAuditLogEntryCreate', (entry) => handleAuditLogEntry(entry, botClient));

initializeBot().catch(console.error);