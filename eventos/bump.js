const { Events } = require('discord.js');
const mongodb = require('../configuracoes/mongodb.js');

const DISBOARD_BOT_ID = '302050872383242240';
const BUMP_ROLE_ID = '1357740740058419391';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    const guildId = message.guild.id;
    
    const channelConfig = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
    
    if (!channelConfig) return;
    
    const bumpChannel = channelConfig.categorias
      .flatMap(categoria => categoria.canais)
      .find(canal => canal.nome === 'bump');
    
    if (!bumpChannel || message.channel.id !== bumpChannel.id) return;
    if (message.author.id !== DISBOARD_BOT_ID) return;

    const isBumpDone = message.content.includes('Bump done') || 
        (message.embeds.length > 0 && message.embeds[0].description?.includes('Bump done'));
    
    if (isBumpDone) {
      console.log('Bump detectado do bot DISBOARD! Registrando para notificar em 2 horas.');
      
      try {
        const now = new Date();
        const reminderTime = new Date(now.getTime() + TWO_HOURS_MS);
        
        const bumpReminder = {
          tipo: 'bump',
          agendadoPara: reminderTime,
          canalId: bumpChannel.id,
          guildId: guildId,
          conteudo: `<@&${BUMP_ROLE_ID}> É hora de dar um novo bump! Use \`/bump\` para promover o servidor.`
        };
        
        const result = await mongodb.insertOne(mongodb.COLLECTIONS.TEMPORARIO, bumpReminder);
        console.log(`Lembrete de bump armazenado no banco de dados com ID: ${result.insertedId}`);
        
        setTimeout(async () => {
          try {
            const channel = await client.channels.fetch(bumpChannel.id);
            await channel.send(bumpReminder.conteudo);
            
            await mongodb.deleteOne(mongodb.COLLECTIONS.TEMPORARIO, { _id: result.insertedId });
            console.log('Lembrete de bump enviado com sucesso e removido do banco de dados.');
          } catch (error) {
            console.error('Erro ao enviar lembrete de bump:', error);
          }
        }, TWO_HOURS_MS);
      } catch (error) {
        console.error('Erro ao armazenar lembrete de bump no banco de dados:', error);
      }
    }
  },
};
