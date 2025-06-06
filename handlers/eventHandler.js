const { handleVoiceStateUpdate } = require('../comandos/misc/radio/estado');
const fs = require('fs');
const path = require('path');

class EventHandler {
    constructor(client) {
        this.client = client;
    }

    setupEvents() {
        const eventsPath = path.join(__dirname, '..', 'eventos');
        fs.readdirSync(eventsPath)
            .filter(file => file.endsWith('.js'))
            .forEach(file => {
                const event = require(path.join(eventsPath, file));
                const handler = (...args) => event.execute(...args);
                event.once ? this.client.once(event.name, handler) : this.client.on(event.name, handler);
            });

        this.client.once('ready', () => {
            this.setupCleanup();
        });
        this.client.on('interactionCreate', this.handleInteraction.bind(this));
        this.client.on('voiceStateUpdate', this.handleVoiceState.bind(this));
        
        process.on('unhandledRejection', error => {
            if (error?.code !== 10008) console.error(error);
        });
    }

    setupCleanup() {
        const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
        setTimeout(() => {
            this.cleanupRemovedUsersLevels();
            setInterval(this.cleanupRemovedUsersLevels.bind(this), CLEANUP_INTERVAL);
        }, 60 * 60 * 1000);
    }

    async handleVoiceState(oldState, newState) {
        await handleVoiceStateUpdate(oldState, newState).catch(() => {});
    }

    async handleInteraction(interaction) {
        if (interaction.isCommand()) {
            await global.commandHandler.handleCommand(interaction);
            return;
        }

        if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

        const radioCommand = require('../comandos/misc/radio/radio');
        const customId = interaction.customId;

        if (!customId.startsWith('radio_') && customId !== 'radio_play') return;

        try {
            if (customId === 'radio_play') {
                await radioCommand.handlePlay(interaction);
            } else {
                await radioCommand.handleButton(interaction);
            }
        } catch {
            if (!interaction.replied && interaction.isRepliable()) {
                await interaction.reply({ content: 'Erro ao processar interação.', ephemeral: true });
            }
        }
    }

    async cleanupRemovedUsersLevels() {
        const { findOne, updateOne, COLLECTIONS } = require('../configuracoes/mongodb');
        const guildId = process.env.GUILD_ID;
        if (!guildId) return;

        try {
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
        } catch {}
    }
}

module.exports = EventHandler;