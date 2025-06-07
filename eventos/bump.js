const { Events } = require('discord.js');
const path = require('path');
const mongodb = require(path.resolve(__dirname, '../mongodb.js'));
const { gerarCorAleatoria } = require(path.resolve(__dirname, '../configuracoes/randomColor.js'));

const DISBOARD_BOT_ID = '302050872383242240';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function getTemporarioCollection() {
  if (mongodb.db && typeof mongodb.db.collection === 'function') {
    return mongodb.db.collection(mongodb.COLLECTIONS.TEMPORARIO);
  }
  if (typeof mongodb.collection === 'function') {
    return mongodb.collection(mongodb.COLLECTIONS.TEMPORARIO);
  }
  throw new Error('Não foi possível obter a coleção temporario a partir do módulo mongodb.');
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    console.log('Nova mensagem recebida:', {
      authorId: message.author.id,
      content: message.content,
      embeds: message.embeds?.length,
      guildId: message.guild?.id
    });

    const guildId = message.guild?.id;
    if (!guildId) return;

    const channelConfig = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
    if (!channelConfig) return;

    const bumpChannel = channelConfig.categorias.flatMap(c => c.canais).find(canal => canal.nome === 'bump');
    if (!bumpChannel) return;

    // Adicionado: só processa se a mensagem for no canal bump
    if (message.channel.id !== bumpChannel.id) return;

    if (message.author.id !== DISBOARD_BOT_ID) return;

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
        canalId: bumpChannel.id,
        guildId,
        conteudo: `<@&1357740740058419391> É hora de dar um novo bump! Use \`/bump\` para promover o servidor.`
      };
      const temporarioCollection = getTemporarioCollection();
      const result = await temporarioCollection.insertOne(bumpReminder);
      setTimeout(async () => {
        try {
          const channel = await client.channels.fetch(bumpChannel.id);
          await channel.send(bumpReminder.conteudo);
          await getTemporarioCollection().deleteOne({ _id: result.insertedId });
        } catch (error) {
          console.error('Erro ao enviar lembrete de bump:', error);
        }
      }, TWO_HOURS_MS);
    } catch (error) {
      console.error('Erro ao armazenar lembrete de bump no banco de dados:', error);
    }
  },
};