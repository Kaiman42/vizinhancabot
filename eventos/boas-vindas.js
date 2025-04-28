const { EmbedBuilder } = require('discord.js');
const { gerarCorAleatoria } = require('../configuracoes/randomColor');
const database = require('../configuracoes/mongodb');

// Inicialização do módulo
async function initialize(client, ignisContext) {
  try {
    // Configurar o manipulador de eventos para novos membros
    setupWelcomeHandler(client, ignisContext);
    console.log('Módulo de boas-vindas inicializado com sucesso!');
  } catch (error) {
    console.error('Erro ao inicializar módulo de boas-vindas:', error);
  }
}

function setupWelcomeHandler(client, ignisContext) {
  // Evento acionado quando um membro completa o onboarding (recebe todas as roles do servidor)
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      // Ignorar bots
      if (newMember.user.bot) return;
      
      // Verificar se o membro completou o processo de onboarding
      // Isso pode ser detectado verificando se as roles do membro mudaram
      // e se agora ele tem a role específica que é concedida após o onboarding
      
      // Se o membro não tinha roles antes e agora tem, ou se as roles aumentaram
      const hadRolesBefore = oldMember.roles.cache.size > 1; // > 1 porque @everyone é uma role
      const hasRolesNow = newMember.roles.cache.size > 1;
      
      // Se o membro já tinha roles ou não adquiriu novas roles, não considerar como onboarding concluído
      if (hadRolesBefore || !hasRolesNow) return;
      
      // Verificar se o usuário está na lista de evitar_spam
      const userId = newMember.user.id;
      const evitarSpam = await verificarUsuarioEmEvitarSpam(userId);
      
      // Se o usuário estiver na lista de evitar_spam, não envia a mensagem de boas-vindas
      if (evitarSpam) {
        console.log(`Usuário ${newMember.user.tag} (${userId}) está na lista de evitar_spam. Mensagem de boas-vindas não enviada.`);
        return;
      }
      
      // Buscar o canal de boas-vindas
      const welcomeChannel = await findWelcomeChannel(newMember.guild, ignisContext);
      if (!welcomeChannel) {
        console.log(`Canal de boas-vindas não encontrado para o servidor ${newMember.guild.name}`);
        return;
      }
      
      // Criar a embed de boas-vindas
      const embed = createWelcomeEmbed(newMember);
      
      // Enviar a mensagem de boas-vindas
      const welcomeMessage = await welcomeChannel.send({ 
        content: `<@${newMember.id}>`,
        embeds: [embed]
      });
      
      // Adicionar o usuário à lista de evitar_spam
      await adicionarUsuarioEmEvitarSpam(userId);
      
      // Configurar a exclusão da mensagem após 1 minuto
      setTimeout(() => {
        welcomeMessage.delete().catch(error => 
          console.error('Não foi possível excluir a mensagem de boas-vindas:', error)
        );
      }, 60 * 1000); // 1 minuto em milissegundos
      
      console.log(`Mensagem de boas-vindas enviada para ${newMember.user.tag}`);
    } catch (error) {
      console.error('Erro ao enviar mensagem de boas-vindas após onboarding:', error);
    }
  });
}

// Função para criar a embed de boas-vindas
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
        value: '• `/ajuda-canal` - Informações sobre canais\n' +
               '• `/ajuda-parceria` - Como fazer parcerias\n' +
               '• `/ajuda-regras` - Termos de convivência\n' +
               '• `/perfil` - Ver seu perfil\n' +
               '• `/cor` - Personalizar sua cor'
      }
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setFooter({ text: `Aproveite sua estadia!` })
    .setTimestamp();
}

// Função para encontrar o canal de boas-vindas
async function findWelcomeChannel(guild, ignisContext) {
  try {
    // Buscar a configuração de canais no MongoDB
    const canalConfig = await database.findOne(database.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
    
    if (!canalConfig || !canalConfig.categorias) {
      console.log('Configuração de canais não encontrada');
      return null;
    }
    
    // Procurar o canal de boas-vindas (geralmente conversas-gerais ou boas-vindas)
    for (const categoria of canalConfig.categorias) {
      if (!categoria.canais) continue;
      
      // Primeiro procura um canal específico "boas-vindas"
      let canal = categoria.canais.find(c => c.nome === 'boas-vindas');
      
      // Se não encontrar, tenta o canal "conversas-gerais"
      if (!canal) {
        canal = categoria.canais.find(c => c.nome === 'conversas-gerais');
      }
      
      // Se encontrou algum canal, retorna-o
      if (canal) {
        return await guild.channels.fetch(canal.id).catch(() => null);
      }
    }
    
    // Se não encontrou nenhum canal adequado
    return null;
  } catch (error) {
    console.error('Erro ao buscar canal de boas-vindas:', error);
    return null;
  }
}

// Função para verificar se um usuário está na lista de evitar_spam
async function verificarUsuarioEmEvitarSpam(userId) {
  try {
    const evitarSpamDoc = await database.findOne(database.COLLECTIONS.DADOS_USUARIOS, { _id: 'evitar_spam' });
    
    // Se o documento não existir ou não tiver a propriedade usuarios, o usuário não está na lista
    if (!evitarSpamDoc || !evitarSpamDoc.usuarios) return false;
    
    // Verificar se o ID do usuário está na lista
    return evitarSpamDoc.usuarios.some(user => user.userId === userId);
  } catch (error) {
    console.error(`Erro ao verificar usuário ${userId} na lista de evitar_spam:`, error);
    return false; // Em caso de erro, assume que o usuário não está na lista
  }
}

// Função para adicionar um usuário à lista de evitar_spam
async function adicionarUsuarioEmEvitarSpam(userId) {
  try {
    const evitarSpamDoc = await database.findOne(database.COLLECTIONS.DADOS_USUARIOS, { _id: 'evitar_spam' });
    
    // Se o documento não existir ou não tiver a propriedade usuarios, inicialize-a
    if (!evitarSpamDoc || !evitarSpamDoc.usuarios) {
      await database.upsert(
        database.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'evitar_spam' },
        { $set: { usuarios: [{ userId }] } }
      );
      console.log(`Usuário ${userId} adicionado à nova lista de evitar_spam`);
      return true;
    }
    
    // Verificar se o usuário já está na lista
    if (evitarSpamDoc.usuarios.some(user => user.userId === userId)) {
      console.log(`Usuário ${userId} já está na lista de evitar_spam`);
      return false;
    }
    
    // Adicionar o usuário à lista
    await database.updateOne(
      database.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'evitar_spam' },
      { $push: { usuarios: { userId } } }
    );
    
    console.log(`Usuário ${userId} adicionado à lista de evitar_spam`);
    return true;
  } catch (error) {
    console.error(`Erro ao adicionar usuário ${userId} à lista de evitar_spam:`, error);
    return false;
  }
}

module.exports = { initialize };