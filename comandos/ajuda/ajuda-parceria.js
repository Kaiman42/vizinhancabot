const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ajuda-parceria')
        .setDescription('Exibe os requisitos para a formação de uma parceria.'),
    async execute(interaction) {
        const requisitos = `
**Requisitos para a formação de uma parceria:**
1. Ter um servidor, de pelo menos 50 membros.
2. Seguir as regras do Discord.
3. Oferecer reciprocidade na divulgação.
4. Estar disposto a manter uma comunicação aberta.

Clique no botão abaixo e notifique sua intenção de parceria e você será respondido em breve.
        `;

        const button = new ButtonBuilder()
            .setCustomId('notificar_responsavel')
            .setLabel('📥 Notificar Responsável')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({ content: requisitos, components: [row], flags: 'Ephemeral' });

        const filter = (i) => i.customId === 'notificar_responsavel' && i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (i) => {
            if (i.customId === 'notificar_responsavel') {
                const responsavelId = '1199908820135194677';
                const userId = interaction.user.id;

                try {
                    const responsavel = await interaction.client.users.fetch(responsavelId);
                    await responsavel.send(`O usuário com ID ${userId} solicitou informações sobre parceria.`);

                    // Atualize o botão para desativá-lo
                    const disabledButton = ButtonBuilder.from(button).setDisabled(true);
                    const updatedRow = new ActionRowBuilder().addComponents(disabledButton);

                    await i.update({ content: 'O responsável foi notificado com sucesso!', components: [updatedRow] });
                } catch (error) {
                    console.error('Erro ao enviar mensagem ao responsável:', error);

                    // Atualize o botão para desativá-lo mesmo em caso de erro
                    const disabledButton = ButtonBuilder.from(button).setDisabled(true);
                    const updatedRow = new ActionRowBuilder().addComponents(disabledButton);

                    await i.update({ content: 'Não foi possível notificar o responsável. Tente novamente mais tarde.', components: [updatedRow] });
                }
            }
        });
    },
};