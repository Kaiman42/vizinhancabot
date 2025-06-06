const { EmbedBuilder } = require('discord.js');
const { gerarCorAleatoria } = require('../configuracoes/randomColor.js');
const database = require('../configuracoes/mongodb.js');

function initialize(client, ignisContext) {
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (newMember.user.bot || oldMember.roles.cache.size > 1 || newMember.roles.cache.size <= 1) return;

    const userId = newMember.user.id;
    const evitarSpamDoc = await database.findOne(database.COLLECTIONS.DADOS_USUARIOS, { _id: 'evitar_spam' });
    if (evitarSpamDoc?.usuarios?.some(user => user.userId === userId)) return;

    const welcomeChannel = await findWelcomeChannel(newMember.guild, ignisContext);
    if (!welcomeChannel) return;

    const welcomeMessage = await welcomeChannel.send({
      content: `<@${userId}>`,
      embeds: [createWelcomeEmbed(newMember)]
    });

    await database.upsert(
      database.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'evitar_spam' },
      { $push: { usuarios: { userId } } }
    );

    setTimeout(() => welcomeMessage.delete().catch(() => {}), 60000);
  });
}

function createWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setColor(gerarCorAleatoria())
    .setTitle(`✨ Boas-vindas à ${member.guild.name}! ✨`)
    .setDescription(
      `Olá ${member.user.username}!\n\n` +
      `Temos o prazer em te receber aqui na nossa comunidade!\nSinta-se à vontade para participar do que houvermos a oferecer.\n` +
      `Oferecemos meios de divulgações, confira os canais da categoria #divulgações.\n\n` +
      `Não se esqueça de conferir a descrição de canais e as regras do servidor para uma melhor convivência!`
    )
    .addFields({
      name: '📚 Comandos úteis para começar:',
      value: '• `/ajuda-parceria` - Como fazer parcerias\n' +
             '• `/perfil` - Ver seu perfil\n' +
             '• `/cor` - Personalizar sua cor'
    })
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setFooter({ text: `Aproveite sua estadia!` })
    .setTimestamp();
}

async function findWelcomeChannel(guild, ignisContext) {
  const canalConfig = await database.findOne(database.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
  if (!canalConfig?.categorias) return null;

  const canal = canalConfig.categorias
    .flatMap(categoria => categoria.canais || [])
    .find(c => ['boas-vindas', 'conversas-gerais'].includes(c.nome));

  return canal ? guild.channels.fetch(canal.id).catch(() => null) : null;
}

module.exports = { initialize };