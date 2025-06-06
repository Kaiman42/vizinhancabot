const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ajuda-parceria')
        .setDescription('Exibe os requisitos para a formação de uma parceria.'),
    async execute(interaction) {
        const button = new ButtonBuilder()
            .setCustomId('notificar_responsavel')
            .setLabel('📥 Notificar Responsável')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({
            content: `**Requisitos para a formação de uma parceria:**
1. Ter um servidor, de pelo menos 50 membros.
2. Seguir as regras do Discord.
3. Oferecer reciprocidade na divulgação.
4. Estar disposto a manter uma comunicação aberta.

Clique no botão abaixo e notifique sua intenção de parceria e você será respondido em breve.`,
            components: [row],
            flags: 'Ephemeral'
        });

        const collector = interaction.channel.createMessageComponentCollector({
            filter: i => i.customId === 'notificar_responsavel' && i.user.id === interaction.user.id,
            time: 60000,
            max: 1
        });

        collector.on('collect', async i => {
            const disabledRow = new ActionRowBuilder()
                .addComponents(ButtonBuilder.from(button).setDisabled(true));

            try {
                const responsavel = await interaction.client.users.fetch('1199908820135194677');
                const { user, member } = interaction;

                const embed = new EmbedBuilder()
                    .setColor(0x4B0082)
                    .setTitle('Nova Solicitação de Parceria')
                    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ dynamic: true }) })
                    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
                    .setDescription(`O usuário [${user.username}](https://discord.com/users/${user.id}) solicitou informações sobre parceria.`)
                    .addFields(
                        { name: '📋 Nome', value: user.username, inline: true },
                        { name: '🆔 ID', value: user.id, inline: true },
                        { name: '📅 Conta Criada', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                        member?.joinedTimestamp ? {
                            name: '📥 Entrou no Servidor',
                            value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
                            inline: true
                        } : null
                    ).filter(field => field)
                    .setTimestamp();

                await responsavel.send({ embeds: [embed] });
                await i.update({ content: 'O responsável foi notificado com sucesso!', components: [disabledRow] });
            } catch {
                await i.update({ content: 'Não foi possível notificar o responsável.', components: [disabledRow] });
            }
        });
    }
};