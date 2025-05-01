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

// Sistema de limpeza diária de usuários que saíram
async function cleanupRemovedUsersLevels() {
    try {
        console.log('Iniciando limpeza automática de níveis de usuários que saíram...');
        
        // Obter servidor principal
        const guildId = process.env.GUILD_ID;
        if (!guildId) {
            console.error('GUILD_ID não definido no arquivo .env');
            return;
        }
        
        const guild = await botClient.guilds.fetch(guildId);
        if (!guild) {
            console.error(`Não foi possível encontrar o servidor com ID ${guildId}`);
            return;
        }
        
        // Buscar todos os membros do servidor
        await guild.members.fetch();
        const currentMemberIds = guild.members.cache.map(member => member.id);
        
        // Buscar dados de níveis no MongoDB
        //const niveisDoc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'niveis' });
        
        if (!niveisDoc || !niveisDoc.users || !Array.isArray(niveisDoc.users)) {
            console.log('Nenhum dado de níveis encontrado ou formato inválido.');
            return;
        }
        
        // Identificar usuários que saíram do servidor
        const usersNotInServer = niveisDoc.users.filter(user => !currentMemberIds.includes(user.userId));
        
        if (usersNotInServer.length === 0) {
            console.log('Não há usuários removidos para limpar.');
            return;
        }
        
        // Remover usuários que saíram
        const newUsersArray = niveisDoc.users.filter(user => currentMemberIds.includes(user.userId));
        
        // Atualizar o documento no MongoDB
        await mongodb.updateOne(
            mongodb.COLLECTIONS.DADOS_USUARIOS,
            //{ _id: 'niveis' },
            { $set: { users: newUsersArray } }
        );
        
        console.log(`Limpeza concluída. Removidos ${usersNotInServer.length} usuários.`);
        
        // Lista detalhada dos usuários removidos
        usersNotInServer.forEach(user => {
            console.log(`- Removido: ID: ${user.userId}, Nome: ${user.username}, Nível: ${user.level}, XP: ${user.xp}`);
        });
    } catch (error) {
        console.error('Erro durante a limpeza de níveis:', error);
    }
}

const commands = [];
const commandsPath = path.join(__dirname, 'comandos');
const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

function loadCommands(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            loadCommands(fullPath);
        } else if (file.name.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if (command.data && typeof command.data.toJSON === 'function') {
                    const commandData = command.data.toJSON();
                    commands.push({
                        ...commandData,
                        execute: command.execute,
                    });
                } else {
                    console.warn(`O arquivo ${fullPath} não possui um comando válido.`);
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
            { body: commands },
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
        
        const ignis = {
            database: db,
            client: botClient
        };
        
        global.ignisContext = ignis;
        
        // Inicializar todas as coleções do sistema
        await mongodb.initializeCollections();
        
        //const niveisModule = require('./eventos/niveis');
        const registroMembroModule = require('./eventos/registroMembro.js');
        const registroServerModule = require('./eventos/registroServer.js');
        const boasVindasModule = require('./eventos/boas-vindas.js');
        const economiaModule = require('./configuracoes/economia.js');
        
        await registroMembroModule.initialize(botClient, ignis);
        await registroServerModule.initialize(botClient, ignis);
        await boasVindasModule.initialize(botClient, ignis);
        await economiaModule.inicializarEconomia();
        
        //if (niveisModule.utils && typeof niveisModule.utils.initializeCollections === 'function') {
            //await niveisModule.utils.initializeCollections(ignis);
           // console.log('Coleções específicas de níveis inicializadas com sucesso');
        //}
        
        //await niveisModule.initialize(botClient, ignis);
        
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
        
        // Configurar intervalo de limpeza diária
        const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
        
        // Realizar a primeira limpeza após 1 hora online (para garantir que tudo esteja carregado)
        setTimeout(() => {
            cleanupRemovedUsersLevels();
            
            // Configurar limpeza diária
            setInterval(cleanupRemovedUsersLevels, CLEANUP_INTERVAL_MS);
            console.log(`Limpeza automática de níveis configurada. Próxima execução em 24 horas.`);
        }, 60 * 60 * 1000); // 1 hora
    });
    
    botClient.on('interactionCreate', handleInteraction);
    
    botClient.on('messageCreate', async (message) => {
        try {
            //const niveisModule = require('./eventos/niveis');
            //await niveisModule.execute(message, global.ignisContext);
        } catch (error) {
            console.error('Error processing message for XP:', error);
        }
    });
    
    //botClient.on('voiceStateUpdate', async (oldState, newState) => {
        //try {
            //const niveisModule = require('./eventos/niveis');
            //if (niveisModule.utils && typeof niveisModule.utils.handleVoiceStateUpdate === 'function') {
                //await niveisModule.utils.handleVoiceStateUpdate(oldState, newState, global.ignisContext);
            //}
        //} catch (error) {
            //console.error('Error handling voice state update:', error);
        //}
   // });
    
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
        if (error && error.code === 10008) {
            console.warn('Aviso: Tentativa de interagir com uma mensagem que não existe mais');
            if (error.url) {
                console.warn('URL da requisição:', error.url);
            }
            return;
        }
        
        console.error('Erro não tratado (unhandledRejection):', error);
    });
}

async function handleInteraction(interaction) {
    try {
        if (interaction.isCommand()) {
            handleCommandInteraction(interaction);
        } else if (interaction.isStringSelectMenu() || interaction.isButton()) {
            handleComponentInteraction(interaction);
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
}

async function handleComponentInteraction(interaction) {
    const customId = interaction.customId;
    
    try {
        // Processamento para o comando de rádio
        if (customId === 'radio_country_select' || customId.startsWith('radio_')) {
            const radioCommand = require('./comandos/misc/radio');
            
            if (customId === 'radio_country_select') {
                await radioCommand.handleCountrySelect(interaction);
            } else {
                await radioCommand.handleButton(interaction);
            }
            return;
        }
        
        // Processamento para o comando de menus de rádio existentes
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
                
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'Ocorreu um erro ao processar esta interação.', 
                        ephemeral: true 
                    }).catch(err => console.error('Não foi possível responder após erro:', err));
                }
            }
        }
    } catch (error) {
        console.error(`Erro ao processar interação de componente (${customId}):`, error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'Ocorreu um erro ao processar esta interação.',
                ephemeral: true
            }).catch(err => console.error('Erro ao responder após falha:', err));
        }
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