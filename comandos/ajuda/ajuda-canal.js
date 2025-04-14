const { SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ajuda-canal')
        .setDescription('Exibe informações sobre um canal.')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Selecione um canal para obter informações.')
                .addChannelTypes(ChannelType.GuildText) // Apenas canais de texto
        ),
    async execute(interaction) {
        const canal = interaction.options.getChannel('canal') || interaction.channel;

        if (!canal) {
            return interaction.reply({ content: 'Não foi possível encontrar o canal.', flags: 'Ephemeral' });
        }

        const descricao = canal.topic || 'Este canal não possui uma descrição definida.';
        await interaction.reply({ content: `Descrição do canal **${canal.name}**: ${descricao}`, flags: 'Ephemeral' });
    },
};