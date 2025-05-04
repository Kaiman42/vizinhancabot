const { EmbedBuilder } = require('discord.js');
const { gerarCorAleatoria } = require('../configuracoes/randomColor.js');
const database = require('../configuracoes/mongodb.js');

async function initialize(client, ignisContext) {
  try {
    setupWelcomeHandler(client, ignisContext);
  } catch (error) {
    console.error('Erro ao inicializar módulo de boas-vindas:', error);
  }
}

function setupWelcomeHandler(client, ignisContext) {
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      if (newMember.user.bot) return;

      const hadRolesBefore = oldMember.roles.cache.size > 1;
      const hasRolesNow = newMember.roles.cache.size > 1;
      if (hadRolesBefore || !hasRolesNow) return;

      const userId = newMember.user.id;
      if (await verificarUsuarioEmEvitarSpam(userId)) return;

      const welcomeChannel = await findWelcomeChannel(newMember.guild, ignisContext);
      if (!welcomeChannel) return;

      const embed = createWelcomeEmbed(newMember);
      const welcomeMessage = await welcomeChannel.send({ 
        content: `<@${newMember.id}>`,
        embeds: [embed]
      });

      await adicionarUsuarioEmEvitarSpam(userId);

      setTimeout(() => {
        welcomeMessage.delete().catch(error => 
          console.error('Não foi possível excluir a mensagem de boas-vindas:', error)
        );
      }, 60 * 1000);
    } catch (error) {
      console.error('Erro ao enviar mensagem de boas-vindas após onboarding:', error);
    }
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
    .addFields(
      { 
        name: '📚 Comandos úteis para começar:', 
        value: '• `/ajuda-parceria` - Como fazer parcerias\n' +
               '• `/perfil` - Ver seu perfil\n' +
               '• `/cor` - Personalizar sua cor'
      }
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setFooter({ text: `Aproveite sua estadia!` })
    .setTimestamp();
}

async function findWelcomeChannel(guild, ignisContext) {
  try {
    const canalConfig = await database.findOne(database.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
    if (!canalConfig?.categorias) return null;

    for (const categoria of canalConfig.categorias) {
      if (!categoria.canais) continue;
      let canal = categoria.canais.find(c => c.nome === 'boas-vindas') ||
                  categoria.canais.find(c => c.nome === 'conversas-gerais');
      if (canal) {
        const channel = await guild.channels.fetch(canal.id).catch(() => null);
        if (channel) return channel;
      }
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar canal de boas-vindas:', error);
    return null;
  }
}

async function verificarUsuarioEmEvitarSpam(userId) {
  try {
    const evitarSpamDoc = await database.findOne(database.COLLECTIONS.DADOS_USUARIOS, { _id: 'evitar_spam' });
    return evitarSpamDoc?.usuarios?.some(user => user.userId === userId) || false;
  } catch (error) {
    console.error(`Erro ao verificar usuário ${userId} na lista de evitar_spam:`, error);
    return false;
  }
}

async function adicionarUsuarioEmEvitarSpam(userId) {
  try {
    const evitarSpamDoc = await database.findOne(database.COLLECTIONS.DADOS_USUARIOS, { _id: 'evitar_spam' });
    if (!evitarSpamDoc?.usuarios) {
      await database.upsert(
        database.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'evitar_spam' },
        { $set: { usuarios: [{ userId }] } }
      );
      return true;
    }
    if (evitarSpamDoc.usuarios.some(user => user.userId === userId)) return false;
    await database.updateOne(
      database.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'evitar_spam' },
      { $push: { usuarios: { userId } } }
    );
    return true;
  } catch (error) {
    console.error(`Erro ao adicionar usuário ${userId} à lista de evitar_spam:`, error);
    return false;
  }
}

module.exports = { initialize };