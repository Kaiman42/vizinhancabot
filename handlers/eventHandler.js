const { handleVoiceStateUpdate } = require('../comandos/misc/radio/estado');
const fs = require('fs');
const path = require('path');

class EventHandler {
    constructor(client) {
        this.client = client;
    }

    setupEvents() {
        // Carrega eventos automáticos da pasta eventos
        const eventsPath = path.join(__dirname, '..', 'eventos');
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            const event = require(filePath);
            if (event.once) {
                this.client.once(event.name, (...args) => event.execute(...args));
            } else {
                this.client.on(event.name, (...args) => event.execute(...args));
            }
        }

        // Eventos existentes
        this.client.once('ready', this.handleReady.bind(this));
        this.client.on('interactionCreate', this.handleInteraction.bind(this));
        this.client.on('voiceStateUpdate', this.handleVoiceState.bind(this));
        this.setupErrorHandler();
    }

    handleReady() {
        console.log(`Bot está online como ${this.client.user.tag}!`);
        this.setupCleanup();
    }

    setupCleanup() {
        const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
        setTimeout(() => {
            this.cleanupRemovedUsersLevels();
            setInterval(() => this.cleanupRemovedUsersLevels(), CLEANUP_INTERVAL_MS);
        }, 60 * 60 * 1000);
    }

    async handleVoiceState(oldState, newState) {
        try {
            await handleVoiceStateUpdate(oldState, newState);
        } catch (error) {
            console.error('Erro ao processar mudança de estado de voz:', error);
        }
    }

    async handleInteraction(interaction) {
        if (interaction.isCommand()) {
            await global.commandHandler.handleCommand(interaction);
        } else if (interaction.isStringSelectMenu() || interaction.isButton()) {
            await this.handleComponentInteraction(interaction);
        }
    }

    async handleComponentInteraction(interaction) {
        const customId = interaction.customId;
        try {
            // Deferir a interação imediatamente para evitar timeout
            await interaction.deferUpdate().catch(error => {
                if (error.code !== 10062) {
                    console.error('Erro ao deferir interação:', error);
                }
            });

            // Verificar se a interação ainda é válida
            if (!interaction.isRepliable()) {
                console.warn('Interação não é mais respondível:', customId);
                return;
            }

            const radioCommand = require('../comandos/misc/radio/radio');
            if (customId.startsWith('radio_') || customId === 'radio_play' ) {

            if (customId === 'radio_play') {
                await radioCommand.handlePlay(interaction);
            } else {
                await radioCommand.handleButton(interaction);
            }
        }
        } catch (error) {
            console.error(`Erro ao processar interação de componente (${customId}):`, error);
            if (interaction.isRepliable()) {
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'Ocorreu um erro ao processar esta interação.',
                            ephemeral: true
                        });
                    } else if (interaction.deferred) {
                        await interaction.editReply({
                            content: 'Ocorreu um erro ao processar esta interação.',
                        });
                    }
                } catch (replyError) {
                    if (replyError.code !== 10062) {
                        console.error('Erro ao tentar responder à interação:', replyError);
                    }
                }
            }
        }
    }

    setupErrorHandler() {
        process.on('unhandledRejection', (error) => {
            if (error?.code === 10008) {
                console.warn('Aviso: Tentativa de interagir com uma mensagem que não existe mais');
                if (error.url) console.warn('URL da requisição:', error.url);
                return;
            }
            console.error('Erro não tratado:', error);
        });
    }

    async cleanupRemovedUsersLevels() {
        try {
            const { findOne, updateOne, COLLECTIONS } = require('../configuracoes/mongodb');
            const guildId = process.env.GUILD_ID;
            if (!guildId) return console.error('GUILD_ID não definido');
            
            const guild = await this.client.guilds.fetch(guildId);
            await guild.members.fetch();
            const currentMemberIds = guild.members.cache.map(member => member.id);
            
            const niveisDoc = await findOne(COLLECTIONS.DADOS_USUARIOS, { _id: 'niveis' });
            if (!niveisDoc?.users?.length) return;
            
            const newUsersArray = niveisDoc.users.filter(user => currentMemberIds.includes(user.userId));
            await updateOne(
                COLLECTIONS.DADOS_USUARIOS,
                { _id: 'niveis' },
                { $set: { users: newUsersArray } }
            );
        } catch (error) {
            console.error('Erro durante a limpeza de níveis:', error);
        }
    }
}

module.exports = EventHandler;