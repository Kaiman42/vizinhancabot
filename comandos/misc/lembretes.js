const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { ObjectId } = require('mongodb');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor');

const MAX_REMINDERS = 3; // Valor base para quando não houver configurações
const COLLECTION_NAME = 'temporario';
const INTERACTION_TIMEOUT = 3_600_000;

class ReminderManager {
    constructor(client, interaction) {
        this.client = client;
        this.interaction = interaction;
        this.collection = global.ignisContext.database.collection(COLLECTION_NAME);
        this.escoposCollection = global.ignisContext.database.collection('escopos');
        this.tempData = new Map();
    }

    static formatarTempo(hora, minuto) {
        const minutos = minuto ? Math.floor(parseFloat(minuto)).toString().padStart(2, '0') : '00';
        const segundos = minuto?.includes('.') && minuto.split('.')[1] === '5' ? ':30' : '';
        return `${hora.padStart(2, '0')}:${minutos}${segundos}`;
    }

    criarEmbed(lembretes = [], maxLembretes) {
        const embed = new EmbedBuilder()
            .setColor(gerarCorAleatoria())
            .setTitle('Seus Lembretes')
            .setDescription(this.obterDescricao(lembretes, maxLembretes))
            .setFooter({ text: `Lembretes: ${lembretes.length}/${maxLembretes}` }); // Adiciona o footer

        if (lembretes?.length) {
            embed.addFields(
                lembretes.map((lembrete, index) => ({
                    name: `${index + 1}. ${lembrete.hora}`,
                    value: this.formatarValorLembrete(lembrete.conteudo)
                }))
            );
        }

        return embed;
    }

    formatarValorLembrete(conteudo) {
        return conteudo?.length > 100 ? `${conteudo.substring(0, 97)}...` : conteudo || 'Sem conteúdo';
    }

    obterDescricao(lembretes = [], maxLembretes) {
        if (!lembretes?.length) {
            return 'Você não possui lembretes ativos.\nSelecione "Criar Lembrete" no menu abaixo!';
        }
        if (lembretes.length >= maxLembretes) {
            return `Você atingiu o limite de ${maxLembretes} lembretes.\nRemova algum para criar novos!`;
        }
        return 'Use o menu abaixo para criar ou gerenciar seus lembretes.';
    }

    criarMenuPrincipal() {
        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('reminder_menu')
                    .setPlaceholder('Escolha uma opção')
                    .addOptions([
                        { label: 'Criar Lembrete', description: 'Adicionar um novo lembrete', value: 'create', emoji: '➕' },
                        { label: 'Excluir Lembrete', description: 'Remover um lembrete existente', value: 'delete', emoji: '🗑️' },
                        { label: 'Como Notificar', description: 'Informações sobre notificações', value: 'help', emoji: '❓' }
                    ])
            );
    }

    criarMenuHoras() {
        const opcoes = Array.from({ length: 24 }, (_, i) => ({
            label: `${i.toString().padStart(2, '0')}:00`,
            value: i.toString()
        }));

        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('hour_select')
                    .setPlaceholder('Selecione a hora do dia')
                    .addOptions(opcoes)
            );
    }

    criarMenuMinutos() {
        const hora = this.tempData.get(this.interaction.user.id)?.hour || '00';
        const opcoes = Array.from({ length: 24 }, (_, i) => {
            const valor = i * 2.5;
            const minutos = Math.floor(valor).toString().padStart(2, '0');
            const segundos = valor % 1 !== 0 ? ':30' : '';
            const label = `${hora.padStart(2, '0')}:${minutos}${segundos}`;
            return { label, value: valor.toFixed(1) };
        });

        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('minute_select')
                    .setPlaceholder('Selecione os minutos/segundos se desejar')
                    .addOptions(opcoes)
            );
    }

    criarMenuRepeticao() {
        const diasDaSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const emojis = ['🛋️', '☕', '🏃‍♀️', '⚖️', '📞', '🎉', '🗓️'];

        const opcoes = diasDaSemana.map((dia, index) => ({
            label: dia,
            value: index.toString(),
            description: `Repetir toda ${dia}`,
            emoji: emojis[index]
        }));

        opcoes.push({ label: 'Não', value: 'none', description: 'Lembrete único', emoji: '❌' });

        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('repeat_select')
                    .setPlaceholder('Selecione a repetição')
                    .addOptions(opcoes)
            );
    }

    criarMenuTipoNotificacao() {
        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('notify_type')
                    .setPlaceholder('Escolha onde receber as notificações')
                    .addOptions([
                        { label: 'Notificar no Canal', description: 'Receber notificações apenas neste canal', value: 'channel', emoji: '📢' },
                        { label: 'Notificar por DM', description: 'Receber notificações apenas por mensagem direta', value: 'dm', emoji: '📩' },
                        { label: 'Notificar em Ambos', description: 'Receber notificações tanto no canal quanto por DM', value: 'both', emoji: '📬' }
                    ])
            );
    }

    criarMenuVisibilidadeNotificacao() {
        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('notify_visibility')
                    .setPlaceholder('Escolha a visibilidade das notificações')
                    .addOptions([
                        { label: 'Notificação Pública', description: 'Todos no canal podem ver a notificação', value: 'public', emoji: '👥' },
                        { label: 'Notificação Privada', description: 'Apenas você pode ver a notificação', value: 'private', emoji: '🔒' }
                    ])
            );
    }

    async iniciarCriacaoLembrete(interaction) {
        const embed = new EmbedBuilder()
            .setColor(gerarCorAleatoria())
            .setTitle('Criar Lembrete - Hora')
            .setDescription('Primeiro, selecione a hora do seu lembrete');

        await interaction.update({
            embeds: [embed],
            components: [this.criarMenuHoras()]
        });
    }

    async manipularCriacaoLembrete(interaction, lembretes) {
        const { customId, user, values, channelId, guild } = interaction;
        const userId = user.id;
        const userData = this.tempData.get(userId) || {};

        const maxLembretes = await this.obterLimitesLembretesPorCargo(guild, user);

        switch (customId) {
            case 'hour_select': {
                const hora = values[0];
                this.tempData.set(userId, { ...userData, hour: hora });
                const embed = new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Criar Lembrete - Minutos/Segundos')
                    .setDescription(`Hora selecionada: ${hora.padStart(2, '0')}:00\nAgora, selecione os minutos e segundos se desejar`);
                await interaction.update({ embeds: [embed], components: [this.criarMenuMinutos()] });
                break;
            }
            case 'minute_select': {
                if (!userData.hour) return this.iniciarCriacaoLembrete(interaction);
                const minuto = values[0];
                const tempoFormatado = ReminderManager.formatarTempo(userData.hour, minuto);
                this.tempData.set(userId, { ...userData, minute: minuto, formattedTime: tempoFormatado });
                const embed = new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Criar Lembrete - Repetição')
                    .setDescription(`Horário selecionado: ${tempoFormatado}\nAgora, escolha se o lembrete deve se repetir:`);
                await interaction.update({ embeds: [embed], components: [this.criarMenuRepeticao()] });
                break;
            }
            case 'repeat_select': {
                if (!userData.hour || !userData.minute) return this.iniciarCriacaoLembrete(interaction);
                const repeticao = values[0];
                this.tempData.set(userId, { ...userData, repeat: repeticao });
                const tempoFormatado = ReminderManager.formatarTempo(userData.hour, userData.minute);
                const embed = new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Criar Lembrete - Conteúdo')
                    .setDescription(`Horário: ${tempoFormatado}\nRepetição: ${repeticao === 'none' ? 'Não' : `Todos/as ${['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'][parseInt(repeticao)]}`}\n\nPor fim, **envie uma mensagem** com o conteúdo do seu lembrete:`);
                await interaction.update({ embeds: [embed], components: [] });

                const messageCollector = interaction.channel.createMessageCollector({
                    filter: m => m.author.id === userId,
                    time: 60000,
                    max: 1
                });

                messageCollector.on('collect', async message => {
                    try {
                        const lembreteData = this.tempData.get(userId);
                        const configuracaoUsuario = await this.collection.findOne({ userId: userId });
                        const configuracaoNotificacao = configuracaoUsuario?.notifyConfig || {
                            type: 'channel',
                            visibility: 'public',
                            channelId: channelId
                        };

                        const novoLembrete = {
                            userId: userId,
                            hora: lembreteData.formattedTime,
                            conteudo: message.content,
                            repeat: lembreteData.repeat === 'none' ? null : parseInt(lembreteData.repeat),
                            channelId: channelId,
                            notifyConfig: configuracaoNotificacao
                        };

                        await this.collection.insertOne(novoLembrete);
                        const descricaoNotificacao = this.obterDescricaoNotificacao(configuracaoNotificacao);

                        const embedFinal = new EmbedBuilder()
                            .setColor(gerarCorAleatoria())
                            .setTitle('Lembrete Agendado! ⏳')
                            .setDescription(
                                `Seu lembrete foi agendado com sucesso!\n\n` +
                                `⏰ Horário escolhido: ${novoLembrete.hora}\n` +
                                `🔄 Repetir: ${lembreteData.repeat === 'none' ? 'Não' : `Todos/as ${['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'][parseInt(lembreteData.repeat)]}`}\n` +
                                `📢 Notificar: ${descricaoNotificacao}\n` +
                                `📝 Lembrar: ${novoLembrete.conteudo}`
                            );

                        await message.delete().catch(() => { });
                        this.tempData.delete(userId);
                        await interaction.editReply({ embeds: [embedFinal], components: [this.criarMenuPrincipal()] });
                    } catch (error) {
                        console.error('Erro ao criar lembrete:', error);
                        await interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(gerarCorAleatoria())
                                    .setTitle('Erro')
                                    .setDescription('Ocorreu um erro ao criar o lembrete. Tente novamente.')
                            ],
                            components: [this.criarMenuPrincipal()]
                        });
                    }
                });

                messageCollector.on('end', collected => {
                    if (collected.size === 0) {
                        this.manipularTimeout(interaction, userId);
                    }
                });
                break;
            }
        }
    }

    async obterLimitesLembretesPorCargo(guild, user) {
        try {
            const member = await guild.members.fetch(user.id);
            const cargosDoUsuario = member.roles.cache.map(role => role.id);

            if (!cargosDoUsuario || cargosDoUsuario.length === 0) {
                return MAX_REMINDERS;
            }

            // Buscar corretamente da coleção configuracoes
            const configuracoesCargos = await global.ignisContext.database.collection('configuracoes').findOne({ _id: 'escopos' });

            if (!configuracoesCargos?.cargos) {
                return MAX_REMINDERS;
            }

            let maxAgendarTotal = 0;
            const cargoConfigs = Object.values(configuracoesCargos.cargos);

            for (const cargoId of cargosDoUsuario) {
                const cargoConfig = cargoConfigs.find(cargo => cargo.id === cargoId);
                if (cargoConfig?.maxAgendar) {
                    maxAgendarTotal += cargoConfig.maxAgendar; // Soma os valores de maxAgendar
                }
            }

            return maxAgendarTotal > 0 ? maxAgendarTotal : MAX_REMINDERS;
        } catch (error) {
            console.error('Erro ao obter limites de lembretes por cargo:', error);
            return MAX_REMINDERS;
        }
    }

    obterDescricaoNotificacao(configuracaoNotificacao) {
        const { type, visibility } = configuracaoNotificacao;
        switch (type) {
            case 'both':
                return `No canal e por DM (${visibility === 'public' ? 'público' : 'privado'})`;
            case 'channel':
                return `Apenas no canal (${visibility === 'public' ? 'público' : 'privado'})`;
            default:
                return 'Apenas por DM';
        }
    }

    manipularTimeout(interaction, userId) {
        this.tempData.delete(userId);
        interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Tempo Esgotado')
                    .setDescription('Você demorou muito para enviar o conteúdo do lembrete.\nTente criar um novo lembrete.')
            ],
            components: [this.criarMenuPrincipal()]
        });
    }

    async manipularConfiguracaoNotificacao(interaction, userId) {
        const { customId, values, channelId } = interaction;
        const userData = this.tempData.get(userId) || {};

        switch (customId) {
            case 'notify_type': {
                const tipoNotificacao = values[0];
                this.tempData.set(userId, { ...userData, notifyType: tipoNotificacao });

                if (tipoNotificacao === 'dm') {
                    const embed = new EmbedBuilder()
                        .setColor(gerarCorAleatoria())
                        .setTitle('Configuração Salva')
                        .setDescription('Você receberá as notificações por mensagem direta.\n\nLembre-se de manter suas DMs abertas para o bot!');
                    await interaction.update({ embeds: [embed], components: [this.criarMenuPrincipal()] });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(gerarCorAleatoria())
                        .setTitle('Configuração de Notificação')
                        .setDescription('Como você quer que as notificações apareçam no canal?');
                    await interaction.update({ embeds: [embed], components: [this.criarMenuVisibilidadeNotificacao()] });
                }
                break;
            }
            case 'notify_visibility': {
                const visibilidade = values[0];
                const configuracaoNotificacao = {
                    type: userData.notifyType,
                    visibility: visibilidade,
                    channelId: channelId,
                    userId: userId
                };

                if (!this.client.topology || !this.client.topology.isConnected()) {
                    await this.client.connect();
                }

                await this.collection.updateOne(
                    { userId: userId },
                    { $set: { notifyConfig: configuracaoNotificacao } },
                    { upsert: true }
                );

                const embed = new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Configuração Salva!')
                    .setDescription(
                        `Suas notificações serão enviadas:\n\n` +
                        `${configuracaoNotificacao.type === 'both' ? '• No canal e por DM\n' :
                            configuracaoNotificacao.type === 'channel' ? '• Apenas no canal\n' :
                                '• Apenas por DM\n'}` +
                        `${configuracaoNotificacao.type !== 'dm' ?
                            `• ${configuracaoNotificacao.visibility === 'public' ? 'Visíveis para todos no canal' :
                                'Visíveis apenas para você'}` : ''}`
                    );
                await interaction.update({ embeds: [embed], components: [this.criarMenuPrincipal()] });
                break;
            }
        }
    }

    async manipularInteracaoMenu(interaction, lembretes, maxLembretes) {
        switch (interaction.values[0]) {
            case 'create':
                 if (lembretes.length >= maxLembretes) {
                    const embedLimite = new EmbedBuilder()
                        .setColor(gerarCorAleatoria())
                        .setTitle('Limite de Lembretes Atingido')
                        .setDescription(`Você atingiu o limite de ${maxLembretes} lembretes para os seus cargos.\nRemova um lembrete existente para criar um novo.`);
                    return interaction.reply({ embeds: [embedLimite], flags: 'Ephemeral' });
                }
                await this.iniciarCriacaoLembrete(interaction);
                break;

            case 'delete': {
                let lembretes = await this.collection.find({ userId: this.interaction.user.id }).toArray();
                lembretes = Array.isArray(lembretes) ? lembretes.filter(l => l && l.hora && l.conteudo) : [];

                if (lembretes.length === 0) {
                    const embed = new EmbedBuilder()
                        .setColor(gerarCorAleatoria())
                        .setTitle('Nenhum Lembrete')
                        .setDescription('Você não possui lembretes para excluir.');
                    await interaction.update({ embeds: [embed], components: [this.criarMenuPrincipal()] });
                    break;
                }

                const opcoes = lembretes.map((lembrete, index) => ({
                    label: `${index + 1}. ${lembrete.hora}`,
                    description: this.formatarValorLembrete(lembrete.conteudo),
                    value: lembrete._id.toString()
                }));

                const menuExcluir = new StringSelectMenuBuilder()
                    .setCustomId('delete_select')
                    .setPlaceholder('Selecione um lembrete para excluir')
                    .addOptions(opcoes);

                const linhaMenu = new ActionRowBuilder().addComponents(menuExcluir);

                await interaction.update({
                    embeds: [this.criarEmbed(lembretes)],
                    components: [linhaMenu]
                });
                break;
            }

            case 'help': {
                const embed = new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('Configurar Notificações')
                    .setDescription('Configure como você quer receber seus lembretes:')
                    .addFields(
                        { name: 'Onde Receber', value: 'Escolha entre receber no canal atual, por mensagem direta (DM), ou ambos.' },
                        { name: 'Visibilidade', value: 'Para notificações no canal, escolha se elas devem ser públicas ou privadas.' },
                        { name: '⚠️ Importante', value: 'Para receber DMs, certifique-se de que suas mensagens diretas estejam abertas para o bot.' }
                    );
                await interaction.update({ embeds: [embed], components: [this.criarMenuTipoNotificacao()] });
                break;
            }
        }
    }

    async executar() {
        try {
            let lembretes = await this.collection.find({ userId: this.interaction.user.id }).toArray();
            lembretes = Array.isArray(lembretes) ? lembretes.filter(l => l && l.hora && l.conteudo) : [];

            const maxLembretes = await this.obterLimitesLembretesPorCargo(this.interaction.guild, this.interaction.user, this.escoposCollection);
            const embed = this.criarEmbed(lembretes, maxLembretes);
            const menu = this.criarMenuPrincipal();

            const response = await this.interaction.reply({
                embeds: [embed],
                components: [menu],
                flags: 'Ephemeral'
            });

            const collector = response.createMessageComponentCollector({ time: INTERACTION_TIMEOUT });

            collector.on('collect', async interaction => {
                if (interaction.user.id !== this.interaction.user.id) {
                    return interaction.reply({ content: 'Você não pode interagir com este menu.', flags: 'Ephemeral' });
                }

                switch (interaction.customId) {
                    case 'reminder_menu':
                        await this.manipularInteracaoMenu(interaction, lembretes, maxLembretes);
                        break;
                    case 'notify_type':
                    case 'notify_visibility':
                        await this.manipularConfiguracaoNotificacao(interaction, interaction.user.id);
                        break;
                    case 'hour_select':
                    case 'minute_select':
                    case 'repeat_select':
                        await this.manipularCriacaoLembrete(interaction, lembretes);
                        break;
                    case 'delete_select': {
                        if (!this.client.topology || !this.client.topology.isConnected()) {
                            await this.client.connect();
                        }
                        await this.collection.deleteOne({ _id: new ObjectId(interaction.values[0]) });
                        lembretes = lembretes.filter(l => l._id.toString() !== interaction.values[0]);
                        const embedAtualizado = this.criarEmbed(lembretes, maxLembretes);
                        await interaction.update({ embeds: [embedAtualizado], components: [this.criarMenuPrincipal()] });
                        break;
                    }
                }
            });

            collector.on('end', () => { });

        } catch (error) {
            console.error('Erro ao gerenciar lembretes:', error);
            return this.interaction.reply({
                content: 'Erro ao gerenciar seus lembretes. Tente novamente mais tarde.',
                flags: 'Ephemeral'
            });
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lembretes')
        .setDescription('Mostra seus lembretes ativos.'),

    async execute(interaction) {
        try {
            const manager = new ReminderManager(global.ignisContext.database.client, interaction);
            await manager.executar();
        } catch (error) {
            console.error('Erro ao executar comando de lembretes:', error);
            await interaction.reply({
                content: 'Ocorreu um erro ao gerenciar os lembretes. Tente novamente mais tarde.',
                flags: 'Ephemeral'
            });
        }
    },
};