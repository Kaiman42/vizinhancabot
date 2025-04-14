const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ajuda-regras')
        .setDescription('Exibe os termos de convivência do servidor.'),
    async execute(interaction) {
        await interaction.reply({
            content: 'Confira os termos de convivência do servidor aqui: <https://discord.com/channels/1285036325304537088/1285036329821802529/1357206441680703591>',
            flags: 'Ephemeral',
        });
    },
};