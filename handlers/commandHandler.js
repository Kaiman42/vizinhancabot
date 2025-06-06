const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

class CommandHandler {
    constructor(client) {
        this.commands = [];
        this.client = client;
        this.rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    }

    load(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(file => {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                this.load(fullPath);
                return;
            }
            if (!file.name.endsWith('.js')) return;
            
            const command = require(fullPath);
            if (command.data?.toJSON && typeof command.execute === 'function') {
                this.commands.push({ ...command.data.toJSON(), execute: command.execute });
            }
        });
    }

    async register() {
        return this.rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: this.commands.map(({ execute, ...data }) => data) }
        );
    }

    async handleCommand(interaction) {
        const command = this.commands.find(cmd => cmd.name === interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, global.ignisContext);
        } catch {
            const replyData = { 
                content: 'Ocorreu um erro ao executar este comando.', 
                ephemeral: true 
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(replyData);
            } else {
                await interaction.reply(replyData);
            }
        }
    }
}

module.exports = CommandHandler;