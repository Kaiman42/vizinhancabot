require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');
const CommandHandler = require('./handlers/commandHandler');
const EventHandler = require('./handlers/eventHandler');
const DatabaseHandler = require('./handlers/databaseHandler');
const niveis = require('./eventos/niveis');

const botClient = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
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
    global.ignisContext = { client: botClient, database: databaseHandler };
    
    commandHandler.load(path.join(__dirname, 'comandos'));
    await commandHandler.register();
    
    eventHandler.setupEvents();
    await databaseHandler.connect(botClient);
    
    console.log('[BOOT] Iniciando login do bot...');
    await botClient.login(process.env.BOT_TOKEN);
    console.log('[BOOT] Login realizado, aguardando evento ready...');
    botClient.once('ready', async () => {
        console.log('[READY] Evento ready disparado. Inicializando sistema de níveis...');
        try {
            // Inicializa o sistema de níveis normalmente, mas não espera a limpeza diária
            niveis.initialize(botClient, global.ignisContext)
                .then(() => console.log('[INIT] Sistema de níveis inicializado após o ready.'))
                .catch(err => console.error('[INIT ERROR] Erro ao inicializar sistema de níveis:', err));
        } catch (err) {
            console.error('[INIT ERROR] Erro ao inicializar sistema de níveis:', err);
        }
    });
}

initializeBot().catch(console.error);