const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URI;

async function createLembretesEmbed(reminders) {
    const embed = new EmbedBuilder()
        .setColor('#2E0854')
        .setTitle('Lembretes Ativos')
        .setDescription(reminders.length === 0 ? 'Você não possui lembretes ativos.' : 'Selecione um lembrete no menu abaixo para mais opções.');

    reminders.forEach((reminder, index) => {
        embed.addFields({
            name: `${index + 1}. ${reminder.hora}`,
            value: reminder.conteudo.length > 100 ? 
                reminder.conteudo.substring(0, 97) + '...' : 
                reminder.conteudo
        });
    });

    return embed;
}

async function createReminderDetailEmbed(reminder, index) {
    return new EmbedBuilder()
        .setColor('#2E0854')
        .setTitle(`Lembrete #${index + 1}`)
        .addFields(
            { name: 'Horário', value: reminder.hora, inline: true },
            { name: 'Canal', value: `<#${reminder.channelId}>`, inline: true },
            { name: 'Conteúdo', value: reminder.conteudo }
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lembretes')
        .setDescription('Mostra seus lembretes ativos.'),

    async execute(interaction) {
        const client = new MongoClient(uri);

        try {
            await client.connect();
            const db = client.db('ignis');
            const temporario = db.collection('temporario');

            // Buscar todos os lembretes do usuário
            const reminders = await temporario.find({
                userId: interaction.user.id
            }).toArray();

            const embed = await createLembretesEmbed(reminders);

            if (reminders.length === 0) {
                await client.close();
                return interaction.reply({
                    embeds: [embed],
                    flags: 'Ephemeral'
                });
            }

            // Criar menu seletor
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('reminder_select')
                .setPlaceholder('Selecione um lembrete para ver detalhes')
                .addOptions(
                    reminders.map((reminder, index) => ({
                        label: `${index + 1}. ${reminder.hora}`,
                        description: reminder.conteudo.substring(0, 95) + (reminder.conteudo.length > 95 ? '...' : ''),
                        value: reminder._id.toString()
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const response = await interaction.reply({
                embeds: [embed],
                components: [row],
                flags: 'Ephemeral'
            });

            // Coletor para o menu seletor
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 3_600_000 // 1 hora
            });

            let currentButtonCollector = null;

            collector.on('collect', async (selectInteraction) => {
                if (selectInteraction.user.id !== interaction.user.id) {
                    return selectInteraction.reply({
                        content: 'Você não pode interagir com este menu.',
                        flags: 'Ephemeral'
                    });
                }

                // Limpar o coletor de botões anterior se existir
                if (currentButtonCollector) {
                    currentButtonCollector.stop();
                }

                const selectedReminder = reminders.find(r => r._id.toString() === selectInteraction.values[0]);
                const selectedIndex = reminders.findIndex(r => r._id.toString() === selectInteraction.values[0]);
                
                const detailEmbed = await createReminderDetailEmbed(selectedReminder, selectedIndex);

                // Botões de ação
                const buttons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('back_to_list')
                            .setLabel('Voltar')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('delete_reminder')
                            .setLabel('Cancelar Lembrete')
                            .setStyle(ButtonStyle.Danger)
                    );

                await selectInteraction.update({
                    embeds: [detailEmbed],
                    components: [buttons]
                });

                // Coletor para os botões
                currentButtonCollector = response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 3_600_000 // 1 hora
                });

                currentButtonCollector.on('collect', async (buttonInteraction) => {
                    if (buttonInteraction.user.id !== interaction.user.id) {
                        return buttonInteraction.reply({
                            content: 'Você não pode interagir com estes botões.',
                            flags: 'Ephemeral'
                        });
                    }

                    try {
                        if (buttonInteraction.customId === 'back_to_list') {
                            await buttonInteraction.update({
                                embeds: [embed],
                                components: [row]
                            });
                            // Parar o coletor de botões atual ao voltar
                            currentButtonCollector.stop();
                        } else if (buttonInteraction.customId === 'delete_reminder') {
                            // Criar uma nova conexão para a operação de exclusão
                            const deleteClient = new MongoClient(uri);
                            try {
                                await deleteClient.connect();
                                const deleteDb = deleteClient.db('ignis');
                                const deleteCollection = deleteDb.collection('temporario');
                                
                                await deleteCollection.deleteOne({ _id: new ObjectId(selectInteraction.values[0]) });
                                
                                // Atualizar a lista de lembretes
                                const updatedReminders = reminders.filter(r => r._id.toString() !== selectInteraction.values[0]);
                                const updatedEmbed = await createLembretesEmbed(updatedReminders);

                                if (updatedReminders.length === 0) {
                                    await buttonInteraction.update({
                                        embeds: [updatedEmbed],
                                        components: []
                                    });
                                } else {
                                    const updatedSelectMenu = new StringSelectMenuBuilder()
                                        .setCustomId('reminder_select')
                                        .setPlaceholder('Selecione um lembrete para ver detalhes')
                                        .addOptions(
                                            updatedReminders.map((reminder, index) => ({
                                                label: `${index + 1}. ${reminder.hora}`,
                                                description: reminder.conteudo.substring(0, 95) + (reminder.conteudo.length > 95 ? '...' : ''),
                                                value: reminder._id.toString()
                                            }))
                                        );

                                    const updatedRow = new ActionRowBuilder().addComponents(updatedSelectMenu);

                                    await buttonInteraction.update({
                                        embeds: [updatedEmbed],
                                        components: updatedReminders.length > 0 ? [updatedRow] : []
                                    });
                                }
                            } finally {
                                await deleteClient.close();
                            }
                            // Parar o coletor de botões atual após deletar
                            currentButtonCollector.stop();
                        }
                    } catch (error) {
                        console.error('Erro ao processar interação:', error);
                        if (!buttonInteraction.replied) {
                            await buttonInteraction.reply({
                                content: 'Ocorreu um erro ao processar sua solicitação. Tente novamente mais tarde.',
                                flags: 'Ephemeral'
                            });
                        }
                    }
                });
            });

            // Quando o coletor principal expirar, fechar a conexão
            collector.on('end', async () => {
                if (client) {
                    await client.close();
                }
            });
        } catch (error) {
            console.error('Erro ao buscar lembretes:', error);
            await interaction.reply({
                content: 'Erro ao buscar seus lembretes. Tente novamente mais tarde.',
                flags: 'Ephemeral'
            });
            if (client) {
                await client.close();
            }
        }
    },
};