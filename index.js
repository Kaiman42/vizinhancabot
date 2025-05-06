require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');
const CommandHandler = require('./handlers/commandHandler');
const EventHandler = require('./handlers/eventHandler');
const DatabaseHandler = require('./handlers/databaseHandler');

const botClient = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration
    ] 
});

async function initializeBot() {
    const commandHandler = new CommandHandler(botClient);
    const eventHandler = new EventHandler(botClient);
    const databaseHandler = new DatabaseHandler();

    global.commandHandler = commandHandler;
    
    commandHandler.load(path.join(__dirname, 'comandos'));
    await commandHandler.register();
    
    eventHandler.setupEvents();
    await databaseHandler.connect(botClient);
    
    await botClient.login(process.env.BOT_TOKEN);
}

initializeBot().catch(console.error);