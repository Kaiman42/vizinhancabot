require('dotenv').config();
const { MongoClient } = require('mongodb');
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongodb = require('./configuracoes/mongodb.js');

const uri = process.env.MONGO_URI;
const mongoClient = new MongoClient(uri);
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

const commands = [];
const commandsPath = path.join(__dirname, 'comandos');
const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

function loadCommands(dir) {
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            loadCommands(fullPath);
        } else if (file.name.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if (command.data?.toJSON && typeof command.execute === 'function') {
                    commands.push({ ...command.data.toJSON(), execute: command.execute });
                }
            } catch (error) {
                console.error(`Erro ao carregar comando de ${fullPath}:`, error);
            }
        }
    }
}

async function registerCommands() {
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands.map(({ execute, ...data }) => data) },
        );
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
}

async function setupDatabase() {
    try {
        await mongoClient.connect();
        console.log('Conectado ao MongoDB com sucesso!');
        const db = mongoClient.db('ignis');
        const ignis = { database: db, client: botClient };
        global.ignisContext = ignis;
        await mongodb.initializeCollections();
        const registroMembroModule = require('./eventos/registroMembro.js');
        const registroServerModule = require('./eventos/registroServer.js');
        const boasVindasModule = require('./eventos/boas-vindas.js');
        const bumpModule = require('./eventos/bump.js');
        await Promise.all([
            registroMembroModule.initialize(botClient, ignis),
            registroServerModule.initialize(botClient, ignis),
            boasVindasModule.initialize(botClient, ignis),
            bumpModule.initialize(botClient, ignis)
        ]);
        global.cooldowns = new Map();
        global.voiceJoinTimes = new Map();
        return ignis;
    } catch (error) {
        console.error('Erro ao configurar o banco de dados:', error);
        throw error;
    }
}

function setupEventListeners() {
    botClient.once('ready', () => {
        console.log(`Bot está online como ${botClient.user.tag}!`);
        const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
        setTimeout(() => {
            cleanupRemovedUsersLevels();
            setInterval(cleanupRemovedUsersLevels, CLEANUP_INTERVAL_MS);
            console.log('Limpeza automática de níveis configurada. Próxima execução em 24 horas.');
        }, 60 * 60 * 1000);
    });
    botClient.on('interactionCreate', handleInteraction);
    botClient.on('voiceStateUpdate', async (oldState, newState) => {
        try {
            const radioModule = require('./comandos/misc/radio');
            if (radioModule.handleVoiceStateUpdate) {
                await radioModule.handleVoiceStateUpdate(oldState, newState);
            }
        } catch (error) {
            console.error('Erro ao processar mudança de estado de voz:', error);
        }
    });
    process.on('unhandledRejection', (error) => {
        if (error?.code === 10008) {
            console.warn('Aviso: Tentativa de interagir com uma mensagem que não existe mais');
            if (error.url) console.warn('URL da requisição:', error.url);
            return;
        }
        console.error('Erro não tratado (unhandledRejection):', error);
    });
}

async function handleInteraction(interaction) {
    try {
        if (interaction.isCommand()) {
            await handleCommandInteraction(interaction);
        } else if (interaction.isStringSelectMenu() || interaction.isButton()) {
            await handleComponentInteraction(interaction);
        }
    } catch (error) {
        console.error('Erro geral no manipulador de interações:', error);
    }
}

async function handleCommandInteraction(interaction) {
    const command = commands.find(cmd => cmd.name === interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction, global.ignisContext);
    } catch (error) {
        console.error(`Erro ao executar o comando ${interaction.commandName}:`, error);
        const replyData = { content: 'Houve um erro ao executar este comando.', flags: 'Ephemeral' };
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(replyData).catch(err => console.error('Erro ao responder após falha no comando:', err));
        } else {
            await interaction.reply(replyData).catch(err => console.error('Erro ao responder após falha no comando:', err));
        }
    }
}

async function handleComponentInteraction(interaction) {
    const customId = interaction.customId;
    try {
        if (customId === 'radio_country_select' || customId.startsWith('radio_')) {
            const radioCommand = require('./comandos/misc/radio');
            if (customId === 'radio_country_select') {
                await radioCommand.handleCountrySelect(interaction);
            } else {
                await radioCommand.handleButton(interaction);
            }
            return;
        }
        if (customId === 'select_radio' || customId.endsWith('_radio')) {
            const radioCommand = require('./comandos/misc/radio');
            if (customId === 'select_radio' && typeof radioCommand.handleSelectMenu === 'function') {
                await radioCommand.handleSelectMenu(interaction);
            } else if (typeof radioCommand.handleButton === 'function') {
                await radioCommand.handleButton(interaction);
            }
            return;
        }
    } catch (error) {
        console.error(`Erro ao processar interação de componente (${customId}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'Ocorreu um erro ao processar esta interação.',
                flags: 'Ephemeral'
            }).catch(err => console.error('Erro ao responder após falha:', err));
        }
    }
}

async function cleanupRemovedUsersLevels() {
    try {
        console.log('Iniciando limpeza automática de níveis de usuários que saíram...');
        const guildId = process.env.GUILD_ID;
        if (!guildId) return console.error('GUILD_ID não definido no arquivo .env');
        const guild = await botClient.guilds.fetch(guildId).catch(() => null);
        if (!guild) return console.error(`Não foi possível encontrar o servidor com ID ${guildId}`);
        await guild.members.fetch();
        const currentMemberIds = guild.members.cache.map(member => member.id);
        const niveisDoc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'niveis' });
        if (!niveisDoc?.users || !Array.isArray(niveisDoc.users)) {
            console.log('Nenhum dado de níveis encontrado ou formato inválido.');
            return;
        }
        const usersNotInServer = niveisDoc.users.filter(user => !currentMemberIds.includes(user.userId));
        if (!usersNotInServer.length) {
            console.log('Não há usuários removidos para limpar.');
            return;
        }
        const newUsersArray = niveisDoc.users.filter(user => currentMemberIds.includes(user.userId));
        await mongodb.updateOne(
            mongodb.COLLECTIONS.DADOS_USUARIOS,
            { _id: 'niveis' },
            { $set: { users: newUsersArray } }
        );
        console.log(`Limpeza concluída. Removidos ${usersNotInServer.length} usuários.`);
        usersNotInServer.forEach(user => {
            console.log(`- Removido: ID: ${user.userId}, Nome: ${user.username}, Nível: ${user.level}, XP: ${user.xp}`);
        });
    } catch (error) {
        console.error('Erro durante a limpeza de níveis:', error);
    }
}

async function initializeBot() {
    loadCommands(commandsPath);
    await registerCommands();
    setupEventListeners();
    await setupDatabase();
    botClient.login(process.env.BOT_TOKEN);
}

initializeBot().catch(console.error);