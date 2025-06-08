const { Events } = require('discord.js');
const path = require('path');
const mongodb = require(path.resolve(__dirname, '../mongodb.js'));
const { gerarCorAleatoria } = require(path.resolve(__dirname, '../configuracoes/randomColor.js'));

const DISBOARD_BOT_ID = '302050872383242240';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function getTemporarioCollection() {
  // Usa a função getCollection do mongodb.js, que já usa o contexto global corretamente
  return mongodb.getCollection(mongodb.COLLECTIONS.TEMPORARIO);
}

async function restaurarLembretesBump(client) {
  const temporarioCollection = getTemporarioCollection();
  const agora = new Date();
  const lembretes = await temporarioCollection.find({ tipo: 'bump', agendadoPara: { $gt: agora } }).toArray();

  for (const lembrete of lembretes) {
    const tempoRestante = new Date(lembrete.agendadoPara) - agora;
    if (tempoRestante > 0) {
      setTimeout(async () => {
        try {
          const channel = await client.channels.fetch(lembrete.canalId);
          await channel.send('<@&1357740740058419391> É hora de dar um novo bump! Use `/bump` para promover o servidor.');
          await temporarioCollection.deleteOne({ _id: lembrete._id });
        } catch (error) {
          console.error('Erro ao enviar lembrete de bump restaurado:', error);
        }
      }, tempoRestante);
    }
  }
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Otimização: retorna cedo se não for do canal bump ou do bot correto
    if (!message.guild || !message.channel || message.author.id !== DISBOARD_BOT_ID) return;

    const channelConfig = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
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

    const embed = {
      color: gerarCorAleatoria(),
      title: 'Lembrete de Bump Agendado',
      description: 'Foi agendado uma notificação que será enviada em 2 horas.',
      timestamp: new Date().toISOString()
    };
    await message.reply({ embeds: [embed] });

    try {
      const reminderTime = new Date(Date.now() + TWO_HOURS_MS);
      const bumpReminder = {
        tipo: 'bump',
        agendadoPara: reminderTime,
        canalId: bumpChannel.id
      };
      const temporarioCollection = getTemporarioCollection();
      const result = await temporarioCollection.insertOne(bumpReminder);
      setTimeout(async () => {
        try {
          const channel = await client.channels.fetch(bumpChannel.id);
          await channel.send('<@&1357740740058419391> É hora de dar um novo bump! Use `/bump` para promover o servidor.');
          await getTemporarioCollection().deleteOne({ _id: result.insertedId });
        } catch (error) {
          console.error('Erro ao enviar lembrete de bump:', error);
        }
      }, TWO_HOURS_MS);
    } catch (error) {
      console.error('Erro ao armazenar lembrete de bump no banco de dados:', error);
    }
  },
  restaurarLembretesBump
};