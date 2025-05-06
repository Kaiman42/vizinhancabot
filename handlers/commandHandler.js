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
        for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                this.load(fullPath);
            } else if (file.name.endsWith('.js')) {
                try {
                    const command = require(fullPath);
                    if (command.data?.toJSON && typeof command.execute === 'function') {
                        this.commands.push({ ...command.data.toJSON(), execute: command.execute });
                    }
                } catch (error) {
                    console.error(`Erro ao carregar comando de ${fullPath}:`, error);
                }
            }
        }
    }

    async register() {
        try {
            await this.rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: this.commands.map(({ execute, ...data }) => data) }
            );
        } catch (error) {
            console.error('Erro ao registrar comandos:', error);
        }
    }

    async handleCommand(interaction) {
        const command = this.commands.find(cmd => cmd.name === interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction, global.ignisContext);
        } catch (error) {
            console.error(`Erro ao executar o comando ${interaction.commandName}:`, error);
            const replyData = { content: 'Houve um erro ao executar este comando.', flags: 'Ephemeral' };
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(replyData).catch(console.error);
            } else {
                await interaction.reply(replyData).catch(console.error);
            }
        }
    }
}

module.exports = CommandHandler;