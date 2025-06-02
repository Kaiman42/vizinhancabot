const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { MongoClient, ObjectId } = require('mongodb');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor');

const MAX_REMINDERS = 3;
const COLLECTION_NAME = 'temporario';
const INTERACTION_TIMEOUT = 3_600_000;

class ReminderManager {
    constructor(client, interaction) {
        this.client = client;
        this.interaction = interaction;
        this.db = client.db('ignis');
        this.collection = this.db.collection(COLLECTION_NAME);
        this.tempData = new Map();
    }

    createEmbed(reminders = []) {
        const embed = new EmbedBuilder()
            .setColor(gerarCorAleatoria())
            .setTitle('Seus Lembretes')
            .setDescription(this.getDescription(reminders));

        const validReminders = Array.isArray(reminders) ? reminders.filter(r => r && r.hora && r.conteudo) : [];
        
        if (validReminders.length > 0) {
            embed.addFields(
                validReminders.map((reminder, index) => ({
                    name: `${index + 1}. ${reminder.hora}`,
                    value: reminder.conteudo?.length > 100 ? 
                        `${reminder.conteudo.substring(0, 97)}...` : 
                        reminder.conteudo || 'Sem conteúdo'
                }))
            );
        }

        return embed;
    }

    getDescription(reminders = []) {
        if (!Array.isArray(reminders) || reminders.length === 0) {
            return 'Você não possui lembretes ativos.\nSelecione "Criar Lembrete" no menu abaixo!';
        }
        if (reminders.length >= MAX_REMINDERS) {
            return `Você atingiu o limite de ${MAX_REMINDERS} lembretes.\nRemova algum para criar novos!`;
        }
        return 'Use o menu abaixo para criar ou gerenciar seus lembretes.';
    }

    createMenu() {
        const menu = new StringSelectMenuBuilder()
            .setCustomId('reminder_menu')
            .setPlaceholder('Escolha uma opção')
            .addOptions([
                {
                    label: 'Criar Lembrete',
                    description: 'Adicionar um novo lembrete',
                    value: 'create',
                    emoji: '➕'
                },
                {
                    label: 'Excluir Lembrete',
                    description: 'Remover um lembrete existente',
                    value: 'delete',
                    emoji: '🗑️'
                },
                {
                    label: 'Como Notificar',
                    description: 'Informações sobre notificações',
                    value: 'help',
                    emoji: '❓'
                }
            ]);

        return new ActionRowBuilder().addComponents(menu);
    }

    createHourMenu() {
        const menu = new StringSelectMenuBuilder()
            .setCustomId('hour_select')
            .setPlaceholder('Selecione a hora');

        for (let i = 0; i <= 23; i++) {
            menu.addOptions({
                label: `${i.toString().padStart(2, '0')}:00`,
                value: i.toString()
            });
        }

        return new ActionRowBuilder().addComponents(menu);
    }    createMinuteMenu() {        const menu = new StringSelectMenuBuilder()
            .setCustomId('minute_select')
            .setPlaceholder('Selecione os minutos/segundos se desejar');

        // 60 dividido por 24 = 2.5 minutos de intervalo
        const hour = this.tempData.get(this.interaction.user.id)?.hour || '00';
        for (let i = 0; i <= 57.5; i += 2.5) {
            menu.addOptions({
                label: `${hour.padStart(2, '0')}:${Math.floor(i).toString().padStart(2, '0')}:${i % 1 === 0 ? '00' : '30'}`,
                value: i.toFixed(1)
            });
        }

        return new ActionRowBuilder().addComponents(menu);
    }

    createRepeatMenu() {
        const menu = new StringSelectMenuBuilder()
            .setCustomId('repeat_select')
            .setPlaceholder('Selecione a repetição')
            .addOptions([
                {
                    label: 'Domingo',
                    value: '0',
                    description: 'Repetir todo domingo',
                    emoji: '🛋️'
                },
                {
                    label: 'Segunda-feira',
                    value: '1',
                    description: 'Repetir toda segunda-feira',
                    emoji: '☕'
                },
                {
                    label: 'Terça-feira',
                    value: '2',
                    description: 'Repetir toda terça-feira',
                    emoji: '🏃‍♀️'
                },
                {
                    label: 'Quarta-feira',
                    value: '3',
                    description: 'Repetir toda quarta-feira',
                    emoji: '⚖️'
                },
                {
                    label: 'Quinta-feira',
                    value: '4',
                    description: 'Repetir toda quinta-feira',
                    emoji: '📞'
                },
                {
                    label: 'Sexta-feira',
                    value: '5',
                    description: 'Repetir toda sexta-feira',
                    emoji: '🎉'
                },
                {
                    label: 'Sábado',
                    value: '6',
                    description: 'Repetir todo sábado',
                    emoji: '🗓️'
                },
                {
                    label: 'Não',
                    value: 'none',
                    description: 'Lembrete único',
                    emoji: '❌'
                }
            ]);

        return new ActionRowBuilder().addComponents(menu);
    }

    createNotifyTypeMenu() {
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('notify_type')
                .setPlaceholder('Escolha onde receber as notificações')
                .addOptions([
                    {
                        label: 'Notificar no Canal',
                        description: 'Receber notificações apenas neste canal',
                        value: 'channel',
                        emoji: '📢'
                    },
                    {
                        label: 'Notificar por DM',
                        description: 'Receber notificações apenas por mensagem direta',
                        value: 'dm',
                        emoji: '📩'
                    },
                    {
                        label: 'Notificar em Ambos',
                        description: 'Receber notificações tanto no canal quanto por DM',
                        value: 'both',
                        emoji: '📬'
                    }
                ])
        );
    }

    createNotifyVisibilityMenu() {
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('notify_visibility')
                .setPlaceholder('Escolha a visibilidade das notificações')
                .addOptions([
                    {
                        label: 'Notificação Pública',
                        description: 'Todos no canal podem ver a notificação',
                        value: 'public',
                        emoji: '👥'
                    },
                    {
                        label: 'Notificação Privada',
                        description: 'Apenas você pode ver a notificação',
                        value: 'private',
                        emoji: '🔒'
                    }
                ])
        );
    }

    async startReminderCreation(interaction) {
        const embed = new EmbedBuilder()
            .setColor(gerarCorAleatoria())
            .setTitle('Criar Lembrete - Hora')
            .setDescription('Primeiro, selecione a hora do seu lembrete');

        await interaction.update({
            embeds: [embed],
            components: [this.createHourMenu()]
        });
    }

    async handleReminderCreation(interaction, reminders) {
        const customId = interaction.customId;
        const userId = interaction.user.id;
        const userData = this.tempData.get(userId) || {};
        
        if (customId === 'hour_select') {
            const hour = interaction.values[0];
            const embed = new EmbedBuilder()
                .setColor(gerarCorAleatoria())
                .setTitle('Criar Lembrete - Minutos/Segundos')
                .setDescription(`Hora selecionada: ${hour.padStart(2, '0')}:00\nAgora, selecione os minutos e segundos se desejar`);

            this.tempData.set(userId, { ...userData, hour });
            
            await interaction.update({
                embeds: [embed],
                components: [this.createMinuteMenu()]
            });
        }
        else if (customId === 'minute_select') {
            if (!userData.hour) {
                // Se não tiver hora salva, volta para a seleção de hora
                return this.startReminderCreation(interaction);
            }            const minute = interaction.values[0];            const formattedMinute = Math.floor(parseFloat(minute)).toString().padStart(2, '0');
            let formattedTime = '';
            if (minute % 1 === 0) {
                formattedTime = `${userData.hour.padStart(2, '0')}:${formattedMinute}`;
            } else {
                formattedTime = `${userData.hour.padStart(2, '0')}:${formattedMinute}:30`;
            }
            
            const embed = new EmbedBuilder()
                .setColor(gerarCorAleatoria())
                .setTitle('Criar Lembrete - Repetição')
                .setDescription(`Horário selecionado: ${formattedTime}\nAgora, escolha se o lembrete deve se repetir:`);

            this.tempData.set(userId, { ...userData, minute, formattedTime });
            
            await interaction.update({
                embeds: [embed],
                components: [this.createRepeatMenu()]
            });
        }
        else if (customId === 'repeat_select') {
            if (!userData.hour || !userData.minute) {
                // Se não tiver hora ou minuto salvos, volta para a seleção de hora
                return this.startReminderCreation(interaction);
            }

            const repeat = interaction.values[0];
            // Formatar horário para exibição correta (hh:mm ou hh:mm:ss)
            let horarioExibicao = '';
            if (userData.minute && userData.minute.includes('.')) {
                const [min, dec] = userData.minute.split('.');
                if (dec === '5') {
                    horarioExibicao = `${userData.hour.padStart(2, '0')}:${min.padStart(2, '0')}:30`;
                } else {
                    horarioExibicao = `${userData.hour.padStart(2, '0')}:${min.padStart(2, '0')}:00`;
                }
            } else {
                horarioExibicao = `${userData.hour.padStart(2, '0')}:${userData.minute ? userData.minute.padStart(2, '0') : '00'}`;
            }
            const embed = new EmbedBuilder()
                .setColor(gerarCorAleatoria())
                .setTitle('Criar Lembrete - Conteúdo')
                .setDescription(`Horário: ${horarioExibicao}\nRepetição: ${repeat === 'none' ? 'Não repetir' : `Todo ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][parseInt(repeat)]}`}\n\nPor fim, **envie uma mensagem** com o conteúdo do seu lembrete:`);

            this.tempData.set(userId, { ...userData, repeat });
            
            await interaction.update({
                embeds: [embed],
                components: []
            });

            // Criar coletor para a próxima mensagem do usuário
            const filter = m => m.author.id === interaction.user.id;
            const messageCollector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

            messageCollector.on('collect', async message => {
                const reminderData = this.tempData.get(userId);                // Buscar configurações de notificação do usuário
                const userConfig = await this.collection.findOne(
                    { userId: interaction.user.id, notifyConfig: { $exists: true } }
                );
                
                const notifyConfig = userConfig?.notifyConfig || {
                    type: 'channel',
                    visibility: 'public',
                    channelId: message.channel.id
                };

                const newReminder = {
                    userId: interaction.user.id,
                    hora: reminderData.formattedTime,
                    conteudo: message.content,
                    repeat: reminderData.repeat === 'none' ? null : parseInt(reminderData.repeat),
                    channelId: message.channel.id,
                    notifyConfig
                };

                await this.collection.insertOne(newReminder);
                const updatedReminders = [...reminders, newReminder];

                const notifyDesc = notifyConfig.type === 'both' ? 
                    `No canal e por DM (${notifyConfig.visibility === 'public' ? 'público' : 'privado'})` :
                    notifyConfig.type === 'channel' ? 
                    `Apenas no canal (${notifyConfig.visibility === 'public' ? 'público' : 'privado'})` :
                    'Apenas por DM';

                const finalEmbed = new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Lembrete Criado!')
                    .setDescription(
                        `Seu lembrete foi criado com sucesso!\n\n` +
                        `⏰ Horário: ${newReminder.hora}\n` +
                        `🔄 Repetição: ${reminderData.repeat === 'none' ? 'Não repetir' : `Todo ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][parseInt(reminderData.repeat)]}`}\n` +
                        `📝 Conteúdo: ${newReminder.conteudo}\n\n` +
                        `📢 Notificações: ${notifyDesc}`
                    );

                await message.delete().catch(() => {});
                // Limpa os dados temporários após criar o lembrete
                this.tempData.delete(userId);
                
                await interaction.editReply({
                    embeds: [finalEmbed],
                    components: [this.createMenu()]
                });
            });

            messageCollector.on('end', collected => {
                if (collected.size === 0) {
                    this.tempData.delete(userId); // Limpa os dados temporários em caso de timeout
                    interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(gerarCorAleatoria())
                                .setTitle('Tempo Esgotado')
                                .setDescription('Você demorou muito para enviar o conteúdo do lembrete.\nTente criar um novo lembrete.')
                        ],
                        components: [this.createMenu()]
                    });
                }
            });
        }
    }

    async handleNotifyConfig(interaction, userId) {
        const customId = interaction.customId;
        const value = interaction.values[0];
        const userData = this.tempData.get(userId) || {};

        if (customId === 'notify_type') {
            this.tempData.set(userId, { ...userData, notifyType: value });

            if (value === 'dm') {
                const embed = new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Configuração Salva')
                    .setDescription('Você receberá as notificações por mensagem direta.\n\nLembre-se de manter suas DMs abertas para o bot!');

                await interaction.update({
                    embeds: [embed],
                    components: [this.createMenu()]
                });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Configuração de Notificação')
                    .setDescription('Como você quer que as notificações apareçam no canal?');

                await interaction.update({
                    embeds: [embed],
                    components: [this.createNotifyVisibilityMenu()]
                });
            }
        } else if (customId === 'notify_visibility') {
            const notifyData = {
                type: userData.notifyType,
                visibility: value,
                channelId: interaction.channelId,
                userId: userId
            };

            // Salvar configuração no banco de dados
            if (!this.client.topology || !this.client.topology.isConnected()) {
                await this.client.connect();
            }

            await this.collection.updateOne(
                { userId: userId },
                { 
                    $set: { 
                        notifyConfig: notifyData 
                    }
                },
                { upsert: true }
            );

            const embed = new EmbedBuilder()
                .setColor(gerarCorAleatoria())
                .setTitle('Configuração Salva!')
                .setDescription(
                    `Suas notificações serão enviadas:\n\n` +
                    `${notifyData.type === 'both' ? '• No canal e por DM\n' : 
                      notifyData.type === 'channel' ? '• Apenas no canal\n' : 
                      '• Apenas por DM\n'}` +
                    `${notifyData.type !== 'dm' ? 
                      `• ${notifyData.visibility === 'public' ? 'Visíveis para todos no canal' : 
                        'Visíveis apenas para você'}` : ''}`
                );

            await interaction.update({
                embeds: [embed],
                components: [this.createMenu()]
            });
        }
    }

    async handleMenuInteraction(interaction) {
        switch (interaction.values[0]) {
            case 'create':
                if (!interaction.tempData) interaction.tempData = {};
                await this.startReminderCreation(interaction);
                break;

            case 'delete':
                let reminders = await this.collection.find({ userId: this.interaction.user.id }).toArray();
                reminders = Array.isArray(reminders) ? reminders.filter(r => r && r.hora && r.conteudo) : [];
                
                if (reminders.length === 0) {
                    const noRemindersEmbed = new EmbedBuilder()
                        .setColor(gerarCorAleatoria())
                        .setTitle('Nenhum Lembrete')
                        .setDescription('Você não possui lembretes para excluir.');
                    
                    await interaction.update({
                        embeds: [noRemindersEmbed],
                        components: [this.createMenu()]
                    });
                    break;
                }

                const deleteMenu = new StringSelectMenuBuilder()
                    .setCustomId('delete_select')
                    .setPlaceholder('Selecione um lembrete para excluir')
                    .addOptions(
                        reminders.map((reminder, index) => ({
                            label: `${index + 1}. ${reminder.hora}`,
                            description: (reminder.conteudo || '').substring(0, 95) + (reminder.conteudo?.length > 95 ? '...' : ''),
                            value: reminder._id.toString()
                        }))
                    );

                const backButton = new ButtonBuilder()
                    .setCustomId('back_to_main')
                    .setLabel('Voltar')
                    .setStyle(ButtonStyle.Secondary);

                const deleteRow = new ActionRowBuilder().addComponents(deleteMenu);
                const buttonRow = new ActionRowBuilder().addComponents(backButton);

                await interaction.update({
                    embeds: [this.createEmbed(reminders)],
                    components: [deleteRow, buttonRow]
                });
                break;

            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Configurar Notificações')
                    .setDescription('Configure como você quer receber seus lembretes:')
                    .addFields(
                        { name: 'Onde Receber', value: 'Escolha entre receber no canal atual, por mensagem direta (DM), ou ambos.' },
                        { name: 'Visibilidade', value: 'Para notificações no canal, escolha se elas devem ser públicas ou privadas.' },
                        { name: '⚠️ Importante', value: 'Para receber DMs, certifique-se de que suas mensagens diretas estejam abertas para o bot.' }
                    );
                
                await interaction.update({
                    embeds: [helpEmbed],
                    components: [this.createNotifyTypeMenu()]
                });
                break;
        }
    }

    async execute() {
        try {
            let reminders = await this.collection.find({ 
                userId: this.interaction.user.id 
            }).toArray();

            reminders = Array.isArray(reminders) ? reminders.filter(r => r && r.hora && r.conteudo) : [];
            const embed = this.createEmbed(reminders);
            const menu = this.createMenu();

            const response = await this.interaction.reply({
                embeds: [embed],
                components: [menu],
                ephemeral: true
            });

            const collector = response.createMessageComponentCollector({
                time: INTERACTION_TIMEOUT
            });

            let messageCollector = null;

            collector.on('collect', async (interaction) => {
                if (interaction.user.id !== this.interaction.user.id) {
                    return interaction.reply({
                        content: 'Você não pode interagir com este menu.',
                        ephemeral: true
                    });
                }

                if (messageCollector) {
                    messageCollector.stop();
                }

                if (interaction.customId === 'reminder_menu') {
                    await this.handleMenuInteraction(interaction);
                } else if (interaction.customId === 'notify_type' || 
                          interaction.customId === 'notify_visibility') {
                    await this.handleNotifyConfig(interaction, interaction.user.id);
                } else if (interaction.customId === 'hour_select' || 
                          interaction.customId === 'minute_select' || 
                          interaction.customId === 'repeat_select') {
                    await this.handleReminderCreation(interaction, reminders);
                    
                    if (interaction.customId === 'repeat_select') {
                        const userId = interaction.user.id;
                        const userData = this.tempData.get(userId);
                        
                        messageCollector = interaction.channel.createMessageCollector({
                            filter: m => m.author.id === interaction.user.id,
                            time: 60000,
                            max: 1
                        });

                        messageCollector.on('collect', async message => {
                            try {
                                const reminderData = this.tempData.get(userId);                                // Formatar hora corretamente: hh:mm se não houver segundos, hh:mm:ss se houver
                                let horaFormatada = '';
                                if (reminderData.minute && reminderData.minute.includes('.')) {
                                    const [min, dec] = reminderData.minute.split('.');
                                    if (dec === '5') {
                                        horaFormatada = `${reminderData.hour.padStart(2, '0')}:${min.padStart(2, '0')}:30`;
                                    } else {
                                        horaFormatada = `${reminderData.hour.padStart(2, '0')}:${min.padStart(2, '0')}:00`;
                                    }
                                } else {
                                    horaFormatada = `${reminderData.hour.padStart(2, '0')}:${reminderData.minute ? reminderData.minute.padStart(2, '0') : '00'}`;
                                }
                                const newReminder = {
                                    userId: interaction.user.id,
                                    hora: horaFormatada,
                                    conteudo: message.content,
                                    repeat: reminderData.repeat === 'none' ? null : parseInt(reminderData.repeat),
                                    channelId: message.channel.id
                                };

                                // Reconectar se necessário
                                if (!this.client.topology || !this.client.topology.isConnected()) {
                                    await this.client.connect();
                                }

                                await this.collection.insertOne(newReminder);
                                const updatedReminders = [...reminders, newReminder];                                const finalEmbed = new EmbedBuilder()
                                    .setColor(gerarCorAleatoria())
                                    .setTitle('⏳ Lembrete Definido 🌓')
                                    .setDescription(`Horário: ${newReminder.hora}\nRepetição: ${reminderData.repeat === 'none' ? 'Não repetir' : `Todo ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][parseInt(reminderData.repeat)]}`}\nConteúdo: ${newReminder.conteudo}`);

                                await message.delete().catch(() => {});
                                this.tempData.delete(userId);
                                
                                await interaction.editReply({
                                    embeds: [finalEmbed],
                                    components: [this.createMenu()]
                                });
                            } catch (error) {
                                console.error('Erro ao criar lembrete:', error);
                                await interaction.editReply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setColor(gerarCorAleatoria())
                                            .setTitle('Erro')
                                            .setDescription('Ocorreu um erro ao criar o lembrete. Tente novamente.')
                                    ],
                                    components: [this.createMenu()]
                                });
                            }
                        });

                        messageCollector.on('end', collected => {
                            if (collected.size === 0) {
                                this.tempData.delete(userId);
                                interaction.editReply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setColor(gerarCorAleatoria())
                                            .setTitle('Tempo Esgotado')
                                            .setDescription('Você demorou muito para enviar o conteúdo do lembrete.\nTente criar um novo lembrete.')
                                    ],
                                    components: [this.createMenu()]
                                });
                            }
                        });
                    }
                } else if (interaction.customId === 'delete_select') {
                    if (!this.client.topology || !this.client.topology.isConnected()) {
                        await this.client.connect();
                    }
                    await this.collection.deleteOne({ _id: new ObjectId(interaction.values[0]) });
                    const updatedReminders = reminders.filter(r => r._id.toString() !== interaction.values[0]);
                    const updatedEmbed = this.createEmbed(updatedReminders);

                    await interaction.update({
                        embeds: [updatedEmbed],
                        components: [this.createMenu()]
                    });
                } else if (interaction.customId === 'back_to_main') {
                    await interaction.update({
                        embeds: [this.createEmbed(reminders)],
                        components: [this.createMenu()]
                    });
                }
            });

            collector.on('end', () => {
                if (messageCollector) {
                    messageCollector.stop();
                }
            });

        } catch (error) {
            console.error('Erro ao gerenciar lembretes:', error);
            return this.interaction.reply({
                content: 'Erro ao gerenciar seus lembretes. Tente novamente mais tarde.',
                ephemeral: true
            });
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lembretes')
        .setDescription('Mostra seus lembretes ativos.'),

    async execute(interaction) {
        const client = new MongoClient(process.env.MONGO_URI);
        try {
            await client.connect();
            const manager = new ReminderManager(client, interaction);
            await manager.execute();
        } finally {
            await client.close();
        }
    },
};