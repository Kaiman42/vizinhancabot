const { handleVoiceStateUpdate } = require('../comandos/misc/radio');

class EventHandler {
    constructor(client) {
        this.client = client;
    }

    setupEvents() {
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
            const radioCommand = require('../comandos/misc/radio');
            if (customId.startsWith('radio_') || customId === 'select_radio' || customId.endsWith('_radio')) {
                if (customId === 'radio_country_select' || customId.startsWith('radio_')) {
                    await (customId === 'radio_country_select' ? 
                        radioCommand.handleCountrySelect(interaction) : 
                        radioCommand.handleButton(interaction));
                } else if (customId === 'select_radio') {
                    await radioCommand.handleSelectMenu?.(interaction);
                } else {
                    await radioCommand.handleButton?.(interaction);
                }
            }
        } catch (error) {
            console.error(`Erro ao processar interação de componente (${customId}):`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'Ocorreu um erro ao processar esta interação.',
                    ephemeral: true
                }).catch(console.error);
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