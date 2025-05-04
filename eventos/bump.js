const { Events } = require('discord.js');
const mongodb = require('../configuracoes/mongodb.js');

const DISBOARD_BOT_ID = '302050872383242240';
const BUMP_ROLE_ID = '1361684563344232671';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Log para depuração
    console.log('Nova mensagem recebida:', {
      authorId: message.author.id,
      content: message.content,
      embeds: message.embeds?.length,
      guildId: message.guild?.id
    });

    const guildId = message.guild?.id;
    if (!guildId) {
      console.log('Mensagem sem guildId, ignorando.');
      return;
    }
    
    const channelConfig = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
    if (!channelConfig) {
      console.log('Configuração de canais não encontrada.');
      return;
    }
    
    const bumpChannel = channelConfig.categorias
      .flatMap(categoria => categoria.canais)
      .find(canal => canal.nome === 'bump');
    if (!bumpChannel) {
      console.log('Canal de bump não encontrado na configuração.');
      return;
    }
    
    if (message.author.id !== DISBOARD_BOT_ID) {
      console.log('Mensagem não é do bot do Disboard.');
      return;
    }

    // Detecção robusta da resposta do Disboard ao /bump
    let isBumpDone = false;
    if (message.content && message.content.toLowerCase().includes('bump done')) {
      isBumpDone = true;
    } else if (message.embeds && message.embeds.length > 0) {
      isBumpDone = message.embeds.some(embed => {
        return (
          (embed.description && embed.description.toLowerCase().includes('bump done')) ||
          (embed.title && embed.title.toLowerCase().includes('bump done'))
        );
      });
    }

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
