const { Events } = require('discord.js');
const path = require('path');
const mongodb = require(path.resolve(__dirname, '../mongodb.js'));
const { gerarCorAleatoria } = require(path.resolve(__dirname, '../configuracoes/randomColor.js'));

const DISBOARD_BOT_ID = '302050872383242240';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function getBumpCollection() {
    return mongodb.getCollection(mongodb.COLLECTIONS.BUMP);
}

async function limparLembretesAntigos() {
    try {
        const bumpCollection = getBumpCollection();
        const agora = new Date();
        // Remove todos os lembretes que já passaram do tempo
        await bumpCollection.deleteMany({ agendadoPara: { $lt: agora } });
    } catch (error) {
        console.error('Erro ao limpar lembretes antigos:', error);
    }
}

async function restaurarLembretesBump(client) {
    const bumpCollection = getBumpCollection();
    const agora = new Date();
    
    try {
        // Primeiro, limpa lembretes antigos
        await limparLembretesAntigos();
        
        // Busca apenas lembretes futuros
        const lembretes = await bumpCollection.find({ agendadoPara: { $gt: agora } }).toArray();

        for (const lembrete of lembretes) {
            const tempoRestante = new Date(lembrete.agendadoPara) - agora;
            if (tempoRestante > 0) {
                setTimeout(async () => {
                    try {
                        const channel = await client.channels.fetch(lembrete.canalId);
                        await channel.send('<@&1357740740058419391> É hora de dar um novo bump! Use `/bump` para promover o servidor.');
                        // Remove o lembrete após ser usado
                        await bumpCollection.deleteOne({ _id: lembrete._id });
                    } catch (error) {
                        console.error('Erro ao enviar lembrete de bump restaurado:', error);
                    }
                }, tempoRestante);
            }
        }
    } catch (error) {
        console.error('Erro ao restaurar lembretes de bump:', error);
    }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        try {
            // Otimização: retorna cedo se não for do canal bump ou do bot correto
            if (!message.guild || !message.channel || message.author.id !== DISBOARD_BOT_ID) return;

            const channelConfig = await mongodb.find(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' }, { findOne: true });
            if (!channelConfig) return;
            
            const bumpChannel = channelConfig.categorias.flatMap(c => c.canais).find(canal => canal.nome === 'bump');
            if (!bumpChannel || message.channel.id !== bumpChannel.id) return;

            let isBumpDone = false;
            if (message.content?.toLowerCase().includes('bump done')) {
                isBumpDone = true;
            } else if (message.embeds?.length) {
                isBumpDone = message.embeds.some(e =>
                    e.description?.toLowerCase().includes('bump done') ||
                    e.title?.toLowerCase().includes('bump done')
                );
            }
            if (!isBumpDone) return;

            // Limpa lembretes antigos antes de criar um novo
            await limparLembretesAntigos();

            const embed = {
                color: gerarCorAleatoria(),
                title: 'Lembrete de Bump Agendado',
                description: 'Foi agendado uma notificação que será enviada em 2 horas.',
                timestamp: new Date().toISOString()
            };
            await message.reply({ embeds: [embed] });

            const reminderTime = new Date(Date.now() + TWO_HOURS_MS);
            const bumpReminder = {
                tipo: 'bump',
                agendadoPara: reminderTime,
                canalId: bumpChannel.id,
                criadoEm: new Date()
            };

            const bumpCollection = getBumpCollection();
            const result = await bumpCollection.insertOne(bumpReminder);

            setTimeout(async () => {
                try {
                    const channel = await client.channels.fetch(bumpChannel.id);
                    await channel.send('<@&1357740740058419391> É hora de dar um novo bump! Use `/bump` para promover o servidor.');
                    // Remove o lembrete após ser usado
                    await bumpCollection.deleteOne({ _id: result.insertedId });
                } catch (error) {
                    console.error('Erro ao enviar lembrete de bump:', error);
                }
            }, TWO_HOURS_MS);
        } catch (error) {
            console.error('Erro ao processar bump:', error);
        }
    },
    restaurarLembretesBump
};