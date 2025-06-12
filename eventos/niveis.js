const { EmbedBuilder } = require('discord.js');
const { gerarCorAleatoria } = require('../configuracoes/randomColor.js');
const path = require('path');
const database = require(path.resolve(__dirname, '../mongodb.js'));
const { criarBarraProgresso } = require('../configuracoes/barraProgresso.js');
const economia = require('../configuracoes/economia.js');

// --- Funções utilitárias centralizadas ---
function logError(context, error) {
  console.error(`[${context}]`, error);
}

function normalizeUserData(userData) {
  return {
    userId: userData?.userId || '',
    username: userData?.username || '',
    xp: Number(userData?.xp) || 0,
    level: Number(userData?.level) || 0,
    lastRole: userData?.lastRole || null
  };
}

async function ensureUsername(userData, userId, ignisContext) {
  if (!ignisContext || !ignisContext.client) {
    logError('ensureUsername', 'ignisContext ou ignisContext.client está indefinido');
    return userData;
  }
  if (!userData.username) {
    try {
      const user = await ignisContext.client.users.fetch(userId);
      if (user) {
        userData.username = user.username;
        // Atualiza o campo username no documento do usuário na coleção NIVEIS
        await database.updateOne(
          database.COLLECTIONS.NIVEIS,
          { _id: userId },
          { $set: { username: user.username } }
        );
      }
    } catch (e) {
      logError('ensureUsername', e);
    }
  }
  return userData;
}

function getCargoApropriado(cargos, level, cargosOrdenadosCache = null) {
  const lista = cargosOrdenadosCache || [...cargos].sort((a, b) => b.nivel - a.nivel);
  return lista.find(c => level >= c.nivel) || null;
}

async function removeRolesIfPresent(member, cargosIds) {
  const rolesToRemove = cargosIds.filter(cargoId => member.roles.cache.has(cargoId));
  if (rolesToRemove.length) await member.roles.remove(rolesToRemove);
}

function findChannel(configuracao, { id, nome }) {
  if (!configuracao?.categorias) return null;
  for (const categoria of configuracao.categorias) {
    if (!Array.isArray(categoria.canais)) continue;
    if (id) {
      const canal = categoria.canais.find(c => c.id === id);
      if (canal) return canal;
    }
    if (nome) {
      const canal = categoria.canais.find(c => c.nome === nome);
      if (canal) return canal;
    }
  }
  return null;
}

function createLevelUpEmbed(user, newLevel, recompensaTotal, barraRecompensa) {
  return new EmbedBuilder()
    .setTitle('Promoção de nível')
    .setDescription(`Novo nível: **${newLevel}**`)
    .addFields({ name: `Ganho: ${recompensaTotal} Gramas`, value: `\`${barraRecompensa.barra}\`` })
    .setColor(gerarCorAleatoria())
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();
}
// --- Fim das funções utilitárias ---

class DatabaseService {
  static async initializeCollections(ignisContext) {
    if (!ignisContext?.database) return;
    await database.ensureCollection(database.COLLECTIONS.NIVEIS);
  }

  static async getUserRankData(userId, ignisContext) {
    if (!ignisContext || !ignisContext.client) {
      logError('getUserRankData', 'ignisContext ou ignisContext.client está indefinido');
      return normalizeUserData({ userId });
    }
    await this.initializeCollections(ignisContext);
    // Busca o documento do usuário na coleção NIVEIS
    let userDoc = await database.findOne(database.COLLECTIONS.NIVEIS, { _id: userId });
    if (userDoc) {
      let userData = normalizeUserData(userDoc);
      userData = await ensureUsername(userData, userId, ignisContext);
      return userData;
    }
    // Novo usuário
    let newUserData = normalizeUserData({ userId });
    try {
      const user = await ignisContext.client.users.fetch(userId);
      if (user) newUserData.username = user.username;
    } catch (e) {
      logError('getUserRankData', e);
    }
    // Insere novo documento na coleção NIVEIS
    await database.getCollection(database.COLLECTIONS.NIVEIS).insertOne({ ...newUserData, _id: userId });
    return newUserData;
  }

  static async fetchConfiguracao(ignisContext) {
    try {
      await this.initializeCollections(ignisContext);
      return await database.findOne(database.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
    } catch (e) {
      logError('fetchConfiguracao', e);
      return null;
    }
  }

  static async getLeaderboard(ignisContext, limit = 10) {
    await this.initializeCollections(ignisContext);
    // Busca todos os documentos da coleção NIVEIS
    const users = await database.find(database.COLLECTIONS.NIVEIS, {});
    return users.length ?
      users.map(normalizeUserData).sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, limit) : [];
  }

  static async addRoleToLevel(level, roleId, ignisContext) {
    try {
      await this.initializeCollections(ignisContext);
      const collection = ignisContext.database.collection('cargosNivel');
      const cargo = { nivel: level, id: roleId };
      const doc = await collection.findOne({});
      if (!doc?.cargos) return collection.insertOne({ cargos: [cargo] });
      const cargoObj = doc.cargos.find(c => c.nivel === level);
      return collection.updateOne({}, cargoObj
        ? { $set: { [`cargos.${doc.cargos.indexOf(cargoObj)}.id`]: roleId } }
        : { $push: { cargos: cargo } }
      );
    } catch (error) {
      logError('addRoleToLevel', error);
    }
  }

  static async removeRoleFromLevel(level, ignisContext) {
    try {
      await this.initializeCollections(ignisContext);
      return await ignisContext.database.collection('cargosNivel').updateOne(
        {},
        { $pull: { cargos: { nivel: level } } }
      );
    } catch (error) {
      logError('removeRoleFromLevel', error);
    }
  }

  static async updateUserXP(userId, userData, xpGained, ignisContext) {
    if (userData.level >= 80) {
      return {
        newLevel: userData.level,
        previousLevel: userData.level,
        newXP: userData.xp,
        leveledUp: false
      };
    }
    if (!xpGained || isNaN(xpGained) || xpGained <= 0) {
      return {
        newLevel: userData.level,
        previousLevel: userData.level,
        newXP: userData.xp,
        leveledUp: false
      };
    }
    let newXP = userData.xp + xpGained;
    let newLevel = userData.level;
    let leveledUp = false;
    let requiredForCurrentLevel = LevelSystem.calculateRequiredXP(newLevel);
    while (newXP >= requiredForCurrentLevel && newLevel < 80) {
      newXP -= requiredForCurrentLevel;
      newLevel++;
      leveledUp = true;
      requiredForCurrentLevel = LevelSystem.calculateRequiredXP(newLevel);
    }
    // Se chegou ao 80, trava o XP
    if (newLevel >= 80) {
      newXP = 0;
      newLevel = 80;
    }
    await database.updateOne(
      database.COLLECTIONS.NIVEIS,
      { _id: userId },
      {
        $set: {
          xp: newXP,
          level: newLevel
        }
      }
    );
    return {
      newLevel,
      previousLevel: userData.level,
      newXP,
      leveledUp
    };
  }

  static async recordLevelUpHistory(ignisContext, userId, username, newLevel, guildId) {
    try {
      await database.ensureCollection(database.COLLECTIONS.TEMPORARIO);
      await database.getCollection(database.COLLECTIONS.TEMPORARIO).insertOne({
        type: 'levelUp',
        userId, // salva o id do usuário em outro campo
        username,
        level: newLevel,
        guildId
      });
    } catch (e) {
      logError('recordLevelUpHistory', e);
    }
  }
}

class LevelSystem {
  static messageCooldowns = new Map();
  static voiceUsers = new Map();

  static calculateRequiredXP(level) {
    // Até o nível 80, aumenta de forma randômica e progressiva
    if (level >= 80) return Infinity;
    // Exigência base aumenta de forma não linear e com fator randômico
    const base = 200 + (level ** 1.5) * 12;
    const variacao = Math.floor(Math.random() * (40 + level * 2));
    return Math.floor(base + variacao);
  }

  static findChannelById(channelId, configuracao) {
    return findChannel(configuracao, { id: channelId });
  }

  static findEscadariaChannelId(configuracao) {
    const canal = findChannel(configuracao, { nome: 'escadaria' });
    return canal ? canal.id : null;
  }

  static isSpamMessage(message) {
    const content = message.content;
    if (!content || content.length < 5) return false;
    return this.hasRepeatedCharacters(content) || this.hasRepeatedWords(content);
  }

  static hasRepeatedCharacters(text) {
    return /(.)\1{4,}/.test(text);
  }

  static hasRepeatedWords(text) {
    const normalizedText = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    const words = normalizedText.split(/\s+/).filter(word => word.length > 0);
    if (words.length >= 4) {
      for (let i = 0; i < words.length - 3; i++) {
        if (words[i].length < 2) continue;
        if (words[i] === words[i+1] && words[i] === words[i+2] && words[i] === words[i+3]) return true;
      }
    }
    for (const word of words) {
      if (word.length < 2) continue;
      for (let patternLength = 2; patternLength <= Math.floor(word.length / 4); patternLength++) {
        const pattern = word.substring(0, patternLength);
        let isRepeating = true, repeatCount = 0;
        for (let i = 0; i < word.length; i += patternLength) {
          const segment = word.substring(i, i + patternLength);
          if (segment !== pattern) { isRepeating = false; break; }
          repeatCount++;
        }
        if (isRepeating && repeatCount >= 4) return true;
      }
    }
    return false;
  }

  static calculateMessageXP(message, userLevel = 0) {
    const userId = message.author.id, now = Date.now();
    if (this.isSpamMessage(message)) return 0;
    if (this.messageCooldowns.has(userId) && now < this.messageCooldowns.get(userId)) return 0;
    // XP randômico, mas menor para níveis altos
    let minXP = 10, maxXP = 35;
    if (userLevel >= 60) { minXP = 5; maxXP = 15; }
    else if (userLevel >= 40) { minXP = 7; maxXP = 22; }
    else if (userLevel >= 20) { minXP = 8; maxXP = 28; }
    const xpGained = Math.floor(Math.random() * (maxXP - minXP + 1)) + minXP;
    this.messageCooldowns.set(userId, now + 15000);
    return xpGained;
  }

  static setupVoiceXPTimer(ignisContext) {
    setInterval(async () => {
      const promises = [];
      for (const [userId, userData] of this.voiceUsers.entries()) {
        if (!userData.guild) continue;
        promises.push((async () => {
          const configuracao = await DatabaseService.fetchConfiguracao(ignisContext, userData.guild.id);
          if (!configuracao) return;
          const now = Date.now();
          if (now - userData.joinTime < 30000) return;
          if (userData.lastXpTime && now - userData.lastXpTime < 15000) return;
          const userRankData = await DatabaseService.getUserRankData(userId, ignisContext);
          const voiceXP = 8;
          userData.lastXpTime = now;
          this.voiceUsers.set(userId, userData);
          const { newLevel, previousLevel } = await DatabaseService.updateUserXP(
            userId, userRankData, voiceXP, ignisContext
          );
          if (newLevel > previousLevel && userData.member) {
            await NotificationService.sendLevelUpNotification(
              userData.member, userData.guild, newLevel, configuracao
            );
            await RoleService.handleRoleAssignment(
              userData.member, newLevel, userRankData.lastRole, ignisContext
            );
          }
        })());
      }
      await Promise.all(promises);
    }, 5000);
  }

  static async handleVoiceStateUpdate(oldState, newState, ignisContext) {
    const userId = newState.member.id;
    if (newState.member.user.bot) return;
    if (!newState.channelId || newState.deaf || newState.selfDeaf || newState.mute || newState.selfMute) {
      this.voiceUsers.delete(userId);
      return;
    }
    const configuracao = await DatabaseService.fetchConfiguracao(ignisContext, newState.guild.id);
    if (!configuracao) return;
    this.voiceUsers.set(userId, {
      channelId: newState.channelId,
      joinTime: Date.now(),
      member: newState.member,
      guild: newState.guild,
      lastXpTime: null
    });
  }
}

class NotificationService {
  static async sendLevelUpNotification(userOrMember, guild, newLevel, configuracao) {
    try {
      const user = userOrMember.user || userOrMember.author || userOrMember;
      const userId = user.id;
      const recompensaTotal = 75 + Math.floor(Math.random() * 76);
      await economia.alterarSaldo(userId, recompensaTotal);
      const barraRecompensa = criarBarraProgresso(recompensaTotal, 150, {
        comprimento: 15, caracterPreenchido: '■', caracterVazio: '□', incluirPorcentagem: true
      });
      const escadariaChannelId = LevelSystem.findEscadariaChannelId(configuracao);
      const embed = createLevelUpEmbed(user, newLevel, recompensaTotal, barraRecompensa);
      if (escadariaChannelId) {
        try {
          const escadariaChannel = await guild.channels.fetch(escadariaChannelId);
          if (escadariaChannel) {
            await escadariaChannel.send({ content: `${user}`, embeds: [embed] });
            return;
          }
        } catch (error) {
          logError('sendLevelUpNotification:escadaria', error);
        }
      }
      if (userOrMember.channel) {
        await userOrMember.channel.send({ content: `${user}`, embeds: [embed] });
      }
    } catch (error) {
      logError('sendLevelUpNotification', error);
    }
  }
}

class RoleService {
  static async handleRoleAssignment(member, level, lastRole, ignisContext) {
    try {
      let cargos = null;
      const patentesDoc = await database.findOne(database.COLLECTIONS.CONFIGURACOES, { _id: 'patentes' });
      if (Array.isArray(patentesDoc?.cargos)) {
        cargos = patentesDoc.cargos;
      } else {
        const cargosNivelDoc = await ignisContext.database.collection('cargosNivel').findOne({});
        if (Array.isArray(cargosNivelDoc?.cargos)) {
          cargos = cargosNivelDoc.cargos;
        } else {
          const [roleConfig] = await ignisContext.database.collection('cargoRank')
            .find({ level: { $lte: level } })
            .sort({ level: -1 })
            .limit(1)
            .toArray();
          if (!roleConfig) return null;
          if (lastRole === roleConfig.roleId) return lastRole;
          if (lastRole && member.roles.cache.has(lastRole)) await removeRolesIfPresent(member, [lastRole]);
          await member.roles.add(roleConfig.roleId);
          await this.updateUserRole(member.id, roleConfig.roleId, member.user.username, ignisContext);
          return roleConfig.roleId;
        }
      }
      const cargoApropriado = getCargoApropriado(cargos, level);
      if (!cargoApropriado || lastRole === cargoApropriado.id) return lastRole;
      const cargosIds = cargos.map(c => c.id);
      await removeRolesIfPresent(member, cargosIds);
      await member.roles.add(cargoApropriado.id);
      await this.updateUserRole(member.id, cargoApropriado.id, member.user.username, ignisContext);
      return cargoApropriado.id;
    } catch (error) {
      logError('handleRoleAssignment', error);
      return lastRole;
    }
  }

  static async updateUserRole(userId, roleId, username, ignisContext) {
    try {
      // Atualiza o documento do usuário na coleção NIVEIS
      await database.updateOne(
        database.COLLECTIONS.NIVEIS,
        { _id: userId },
        { $set: { lastRole: roleId, username } }
      );
    } catch (error) {
      logError('updateUserRole', error);
    }
  }
}

// Verificação diária para remover usuários que não estão mais em nenhum servidor
async function verificarUsuariosInativos(client, ignisContext) {
  try {
    const mainGuildId = process.env.GUILD_ID;
    const guild = client.guilds.cache.get(mainGuildId);
    if (!guild) {
      logError('verificarUsuariosInativos', `Guild principal (${mainGuildId}) não encontrada.`);
      return;
    }
    // Busca apenas os usuários que têm documento de nível
    const usuarios = await database.find(database.COLLECTIONS.NIVEIS, {});
    let removidos = 0;
    for (const usuario of usuarios) {
      const userId = usuario._id;
      // Verifica se o usuário ainda está no servidor
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        await database.getCollection(database.COLLECTIONS.NIVEIS).deleteOne({ _id: userId });
        removidos++;
      }
    }
    console.log(`[NÍVEIS] Limpeza diária: ${removidos} usuários removidos da coleção de níveis.`);
  } catch (err) {
    logError('verificarUsuariosInativos', err);
  }
}

// Agendamento da verificação diária ao iniciar o bot
async function initialize(client, ignisContext) {
  await DatabaseService.initializeCollections(ignisContext);
  LevelSystem.messageCooldowns.clear();
  LevelSystem.setupVoiceXPTimer(ignisContext);

  // Limpeza diária de usuários inativos
  await verificarUsuariosInativos(client, ignisContext);
  setInterval(() => verificarUsuariosInativos(client, ignisContext), 24 * 60 * 60 * 1000);

  // --- Adiciona usuários já em chamadas de voz ao voiceUsers ao iniciar ---
  try {
    for (const guild of client.guilds.cache.values()) {
      // Garante que o cache de voiceStates está populado
      await guild.members.fetch().catch(() => {});
      for (const [userId, voiceState] of guild.voiceStates.cache) {
        const member = guild.members.cache.get(userId);
        if (!member || member.user.bot) continue;
        const channel = voiceState.channel;
        if (!channel) continue;
        LevelSystem.voiceUsers.set(userId, {
          channelId: channel.id,
          joinTime: Date.now(),
          member: member,
          guild: guild,
          lastXpTime: null
        });
      }
    }
    console.log('[IGNIS] Sistema de níveis pronto. Usuários em call inicializados.');
  } catch (err) {
    logError('initialize:voiceUsersOnStartup', err);
  }
}

async function execute(message, ignisContext) {
  if (!ignisContext || !ignisContext.client) {
    // Tenta usar o contexto global se não foi passado
    if (global.ignisContext && global.ignisContext.client) {
      ignisContext = global.ignisContext;
    } else {
      logError('execute', 'ignisContext ou ignisContext.client está indefinido');
      return;
    }
  }
  if (message.author.bot || !message.guild) return;
  try {
    const configuracao = await DatabaseService.fetchConfiguracao(ignisContext, message.guild.id);
    const rankData = await DatabaseService.getUserRankData(message.author.id, ignisContext);
    // Passa o nível do usuário para o cálculo de XP
    const xpGained = LevelSystem.calculateMessageXP(message, rankData.level);
    let xpConcedido = 0;
    if (xpGained > 0) {
      const { newLevel, previousLevel, leveledUp } = await DatabaseService.updateUserXP(
        message.author.id, rankData, xpGained, ignisContext
      );
      xpConcedido = 1;
      if (leveledUp && newLevel > previousLevel) {
        await DatabaseService.recordLevelUpHistory(
          ignisContext, message.author.id, message.author.username, newLevel, message.guild.id
        );
        await NotificationService.sendLevelUpNotification(
          message, message.guild, newLevel, configuracao
        );
        await RoleService.handleRoleAssignment(
          message.member, newLevel, rankData.lastRole, ignisContext
        );
      }
    }
    if (xpConcedido > 0) {
      console.log(`[NÍVEIS] XP concedido para ${xpConcedido} usuário(s).`);
    }
  } catch (error) {
    logError('execute', error);
  }
}

module.exports = {
  name: 'messageCreate',
  once: false,
  initialize,
  execute,
  getUserRankData: DatabaseService.getUserRankData.bind(DatabaseService),
  calculateRequiredXP: LevelSystem.calculateRequiredXP.bind(LevelSystem),
  getLeaderboard: DatabaseService.getLeaderboard.bind(DatabaseService),
  addRoleToLevel: DatabaseService.addRoleToLevel.bind(DatabaseService),
  removeRoleFromLevel: DatabaseService.removeRoleFromLevel.bind(DatabaseService),
  handleRoleAssignment: RoleService.handleRoleAssignment.bind(RoleService),
  initializeCollections: DatabaseService.initializeCollections.bind(DatabaseService),
  findChannelById: LevelSystem.findChannelById.bind(LevelSystem),
  fetchConfiguracao: DatabaseService.fetchConfiguracao.bind(DatabaseService),
  handleVoiceStateUpdate: LevelSystem.handleVoiceStateUpdate.bind(LevelSystem)
};
