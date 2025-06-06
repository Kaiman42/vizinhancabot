const { EmbedBuilder } = require('discord.js');
const { gerarCorAleatoria } = require('../configuracoes/randomColor.js');
const database = require('../configuracoes/mongodb.js');
const { criarBarraProgresso } = require('../configuracoes/barraProgresso.js');
const economia = require('../configuracoes/economia.js');

class DatabaseService {
  static async initializeCollections(ignisContext) {
    if (!ignisContext?.database) return;
    
    await database.ensureCollection(database.COLLECTIONS.DADOS_USUARIOS);
    await database.upsert(
      database.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'niveis' },
      { $setOnInsert: { _id: 'niveis', users: [] } }
    );
  }

  static async getUserRankData(userId, ignisContext) {
    await this.initializeCollections(ignisContext);
    const mainDoc = await database.findOne(database.COLLECTIONS.DADOS_USUARIOS, { _id: 'niveis' });
    
    if (!mainDoc) {
      const newUserData = this.createNewUserData(userId);
      await database.upsert(
        database.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'niveis' },
        { $set: { users: [newUserData] } }
      ).catch(() => {});
      
      try {
        const user = await ignisContext.client.users.fetch(userId);
        if (user) newUserData.username = user.username;
      } catch {
        // Silently ignore errors when fetching user
      }
      
      return newUserData;
    }
    
    if (!Array.isArray(mainDoc.users)) {
      await database.updateOne(
        database.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'niveis' },
        { $set: { users: [] } }
      );
      mainDoc.users = [];
    }
    
    const userIndex = mainDoc.users.findIndex(user => user?.userId === userId);
    
    if (userIndex >= 0) {
      const userData = this.normalizeUserData(mainDoc.users[userIndex]);
      
      if (!userData.username) {
        try {
          const user = await ignisContext.client.users.fetch(userId);
          if (user) {
            userData.username = user.username;
            await database.updateOne(
              database.COLLECTIONS.DADOS_USUARIOS,
              { _id: 'niveis' },
              { $set: { [`users.${userIndex}.username`]: user.username } }
            );
          }
        } catch {
          // Silently ignore errors when fetching user
        }
      }
      
      return userData;
    }
    
    const newUserData = this.createNewUserData(userId);
    
    try {
      const user = await ignisContext.client.users.fetch(userId);
      if (user) newUserData.username = user.username;
    } catch {
      // Silently ignore errors when fetching user
    }
    
    await database.updateOne(
      database.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'niveis' },
      { $push: { users: newUserData } }
    ).catch(() => {});
    
    return newUserData;
  }
  
  static createNewUserData(userId) {
    return {
      userId,
      username: "",
      xp: 0,
      level: 0,
      lastRole: null,
      lastUpdated: new Date().toISOString()
    };
  }
  
  static normalizeUserData(userData) {
    if (!userData) return this.createNewUserData("");
    
    return {
      userId: userData.userId || "",
      username: userData.username || "",
      xp: userData.xp || 0,
      level: userData.level || 0,
      lastRole: userData.lastRole || null,
      lastUpdated: userData.lastUpdated || new Date().toISOString()
    };
  }
  
  static async fetchConfiguracao(ignisContext) {
    try {
      await this.initializeCollections(ignisContext);
      return await database.findOne(database.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
    } catch {
      return null;
    }
  }
  
  static async getLeaderboard(ignisContext, limit = 10) {
    await this.initializeCollections(ignisContext);
    const doc = await database.findOne(database.COLLECTIONS.DADOS_USUARIOS, { _id: 'niveis' });
    return doc?.users?.length ? 
      [...doc.users]
        .sort((a, b) => b.level - a.level || b.xp - a.xp)
        .slice(0, limit) 
      : [];
  }
  
  static async addRoleToLevel(level, roleId, ignisContext) {
    try {
      await this.initializeCollections(ignisContext);
      const collection = ignisContext.database.collection('cargosNivel');
      const cargo = { nivel: level, id: roleId };
      const doc = await collection.findOne({});
      
      if (!doc?.cargos) {
        return collection.insertOne({ cargos: [cargo] });
      }

      const idx = doc.cargos.findIndex(c => c.nivel === level);
      return collection.updateOne({}, idx >= 0 
        ? { $set: { [`cargos.${idx}.id`]: roleId } }
        : { $push: { cargos: cargo } }
      );
    } catch (error) {
      console.error('Erro ao adicionar cargo a nível:', error);
    }
  }
  
  static async removeRoleFromLevel(level, ignisContext) {
    try {
      await this.initializeCollections(ignisContext);
      const cargoRankCollection = ignisContext.database.collection('cargosNivel');
      
      return await cargoRankCollection.updateOne(
        {},
        { $pull: { cargos: { nivel: level } } }
      );
    } catch (error) {
      console.error('Erro ao remover cargo de nível:', error);
    }
  }
  
  static async updateUserXP(userId, userData, xpGained, ignisContext) {
    if (!xpGained || isNaN(xpGained) || xpGained <= 0) {
      return { 
        newLevel: userData.level, 
        previousLevel: userData.level, 
        newXP: userData.xp,
        leveledUp: false
      };
    }

    const requiredForCurrentLevel = LevelSystem.calculateRequiredXP(userData.level);
    let newXP = userData.xp + xpGained;
    let newLevel = userData.level;
    let leveledUp = false;
    
    if (newXP >= requiredForCurrentLevel) {
      newLevel++;
      leveledUp = true;
      newXP = newXP - requiredForCurrentLevel;
      
      let nextLevelRequired = LevelSystem.calculateRequiredXP(newLevel);
      while (newXP >= nextLevelRequired) {
        newLevel++;
        newXP -= nextLevelRequired;
        nextLevelRequired = LevelSystem.calculateRequiredXP(newLevel);
      }
    }
    
    const mainDoc = await database.findOne(database.COLLECTIONS.DADOS_USUARIOS, { _id: 'niveis' });
    if (!mainDoc) {
      return { 
        newLevel: userData.level, 
        previousLevel: userData.level, 
        newXP: userData.xp,
        leveledUp: false
      };
    }
    
    const userIndex = mainDoc.users.findIndex(user => user.userId === userId);
    
    if (userIndex >= 0) {
      await database.updateOne(
        database.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'niveis' },
        { 
          $set: { 
            [`users.${userIndex}.xp`]: newXP,
            [`users.${userIndex}.level`]: newLevel,
            [`users.${userIndex}.lastUpdated`]: new Date().toISOString()
          } 
        }
      );
    }
    
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
      await database.insertOne(database.COLLECTIONS.TEMPORARIO, {
        type: 'levelUp',
        userId,
        username,
        level: newLevel,
        guildId
      });
    } catch {
    }
  }
}

class LevelSystem {
  static messageCooldowns = new Map();
  static voiceUsers = new Map();
  
  static calculateRequiredXP(level) {
    if (level === 0) return 250;
    
// baseXP * (1.5^level)
    return Math.round(250 * Math.pow(1.5, level));
  }
  
  static findChannelById(channelId, configuracao) {
    if (!configuracao?.categorias) return null;
    
    for (const categoria of configuracao.categorias) {
      if (!Array.isArray(categoria.canais)) continue;
      
      const canal = categoria.canais.find(c => c.id === channelId);
      if (canal) return canal;
    }
    return null;
  }
  
  static findEscadariaChannelId(configuracao) {
    if (!configuracao?.categorias) return null;
    
    for (const categoria of configuracao.categorias) {
      if (!Array.isArray(categoria.canais)) continue;
      
      const escadariaCanal = categoria.canais.find(canal => canal.nome === 'escadaria');
      if (escadariaCanal) return escadariaCanal.id;
    }
    return null;
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
        if (words[i] === words[i+1] && words[i] === words[i+2] && words[i] === words[i+3]) {
          return true;
        }
      }
    }
    
    for (const word of words) {
      if (word.length < 2) continue;
      for (let patternLength = 2; patternLength <= Math.floor(word.length / 4); patternLength++) {
        const pattern = word.substring(0, patternLength);
        let isRepeating = true;
        let repeatCount = 0;
        
        for (let i = 0; i < word.length; i += patternLength) {
          const segment = word.substring(i, i + patternLength);
          if (segment !== pattern) {
            isRepeating = false;
            break;
          }
          repeatCount++;
        }
        
        if (isRepeating && repeatCount >= 4) return true;
      }
    }
    return false;
  }
  
  static calculateMessageXP(message) {
    const userId = message.author.id;
    const now = Date.now();
    
    if (this.isSpamMessage(message)) return 0;
    
    if (this.messageCooldowns.has(userId) && now < this.messageCooldowns.get(userId)) {
      return 0;
    }
    
    const xpGained = 25 + Math.floor(Math.random() * 26);
    this.messageCooldowns.set(userId, now + 15000);
    
    return xpGained;
  }
  
  static setupVoiceXPTimer(ignisContext) {
    setInterval(async () => {
      for (const [userId, userData] of this.voiceUsers.entries()) {
        try {
          if (!userData.guild) continue;
          
          const configuracao = await DatabaseService.fetchConfiguracao(ignisContext, userData.guild.id);
          if (!configuracao) continue;
          
          const now = Date.now();
          
          if (now - userData.joinTime < 30000) continue;
          if (userData.lastXpTime && now - userData.lastXpTime < 15000) continue;
          
          const userRankData = await DatabaseService.getUserRankData(userId, ignisContext);
          const voiceXP = 15 + Math.floor(Math.random() * 51);
          
          userData.lastXpTime = now;
          this.voiceUsers.set(userId, userData);
          
          const { newLevel, previousLevel } = await DatabaseService.updateUserXP(
            userId, 
            userRankData, 
            voiceXP, 
            ignisContext
          );
          
          if (newLevel > previousLevel && userData.member) {
            await NotificationService.sendLevelUpNotification(
              userData.member,
              userData.guild,
              newLevel,
              configuracao
            );
            
            await RoleService.handleRoleAssignment(
              userData.member,
              newLevel,
              userRankData.lastRole,
              ignisContext
            );
          }
        } catch (error) {
          console.error(`Erro ao processar XP por voz: ${error}`);
        }
      }
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
    
    if (this.voiceUsers.has(userId)) {
      const userData = this.voiceUsers.get(userId);
      
      if (userData.channelId !== newState.channelId) {
        this.voiceUsers.set(userId, {
          channelId: newState.channelId,
          joinTime: Date.now(),
          member: newState.member,
          guild: newState.guild,
          lastXpTime: null
        });
      }
      return;
    }
    
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
      
      const recompensaFixa = 75;
      const recompensaVariavel = Math.floor(Math.random() * 76);
      const recompensaTotal = recompensaFixa + recompensaVariavel;
      
      const porcentagemRecompensa = Math.floor((recompensaTotal / 150) * 100);
      const novoSaldo = await economia.adicionarSaldo(userId, recompensaTotal);
      
      const barraRecompensa = criarBarraProgresso(recompensaTotal, 150, {
        comprimento: 15,
        caracterPreenchido: '■',
        caracterVazio: '□',
        incluirPorcentagem: true
      });
      
      const escadariaChannelId = LevelSystem.findEscadariaChannelId(configuracao);
      
      if (escadariaChannelId) {
        try {
          const escadariaChannel = await guild.channels.fetch(escadariaChannelId);
          
          if (escadariaChannel) {
            const embed = new EmbedBuilder()
              .setTitle('Promoção de nível')
              .setDescription(`Novo nível: **${newLevel}**`)
              .addFields({ 
                name: `Ganho: ${recompensaTotal} Gramas`, 
                value: `\`${barraRecompensa.barra}\`` 
              })
              .setColor(gerarCorAleatoria())
              .setThumbnail(user.displayAvatarURL({ dynamic: true }))
              .setTimestamp();
            
            await escadariaChannel.send({ content: `${user}`, embeds: [embed] });
            return;
          }
        } catch (error) {
          console.error('Erro ao enviar notificação para o canal escadaria:', error);
        }
      }
      
      if (userOrMember.channel) {
        const embed = new EmbedBuilder()
          .setTitle('Promoção de nível')
          .setDescription(`Novo nível: **${newLevel}**`)
          .addFields({ 
            name: `Ganho: ${recompensaTotal} Gramas`, 
            value: `\`${barraRecompensa.barra}\`` 
          })
          .setColor(gerarCorAleatoria())
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setTimestamp();
        
        await userOrMember.channel.send({ content: `${user}`, embeds: [embed] });
      }
    } catch (error) {
      console.error('Erro ao enviar notificação de nível:', error);
    }
  }
}

class RoleService {
  static async handleRoleAssignment(member, level, lastRole, ignisContext) {
    try {
      const patentesDoc = await database.findOne(database.COLLECTIONS.CONFIGURACOES, { _id: 'patentes' });
      
      if (patentesDoc?.cargos && Array.isArray(patentesDoc.cargos)) {
        const cargosOrdenados = [...patentesDoc.cargos].sort((a, b) => b.nivel - a.nivel);
        
        let cargoApropriado = null;
        for (const cargo of cargosOrdenados) {
          if (level >= cargo.nivel) {
            cargoApropriado = cargo;
            break;
          }
        }
        
        if (!cargoApropriado || lastRole === cargoApropriado.id) return lastRole;
        
        if (patentesDoc.cargos && Array.isArray(patentesDoc.cargos)) {
          const cargosIds = patentesDoc.cargos.map(c => c.id);
          let cargosRemovidos = 0;
          
          for (const cargoId of cargosIds) {
            if (member.roles.cache.has(cargoId)) {
              await member.roles.remove(cargoId);
              cargosRemovidos++;
            }
          }
        }
        
        await member.roles.add(cargoApropriado.id);
        await this.updateUserRole(member.id, cargoApropriado.id, member.user.username, ignisContext);
        
        return cargoApropriado.id;
      }
      
      const cargosNivelCollection = ignisContext.database.collection('cargosNivel');
      const cargosNivelDoc = await cargosNivelCollection.findOne({});
      
      if (!cargosNivelDoc?.cargos || !Array.isArray(cargosNivelDoc.cargos)) {
        const roleConfigs = await ignisContext.database.collection('cargoRank')
          .find({ level: { $lte: level } })
          .sort({ level: -1 })
          .limit(1)
          .toArray();
        
        if (roleConfigs.length === 0) return null;
        
        const highestRole = roleConfigs[0].roleId;
        if (lastRole === highestRole) return lastRole;
        
        if (lastRole && member.roles.cache.has(lastRole)) {
          await member.roles.remove(lastRole);
        }
        
        await member.roles.add(highestRole);
        await this.updateUserRole(member.id, highestRole, member.user.username, ignisContext);
        
        return highestRole;
      }
      
      const cargosOrdenados = [...cargosNivelDoc.cargos].sort((a, b) => b.nivel - a.nivel);
      
      let cargoApropriado = null;
      for (const cargo of cargosOrdenados) {
        if (level >= cargo.nivel) {
          cargoApropriado = cargo;
          break;
        }
      }
      
      if (!cargoApropriado || lastRole === cargoApropriado.id) return lastRole;
      
      const cargosIds = cargosNivelDoc.cargos.map(c => c.id);
      
      for (const cargoId of cargosIds) {
        if (member.roles.cache.has(cargoId)) {
          await member.roles.remove(cargoId);
        }
      }
      
      await member.roles.add(cargoApropriado.id);
      await this.updateUserRole(member.id, cargoApropriado.id, member.user.username, ignisContext);
      
      return cargoApropriado.id;
    } catch (error) {
      console.error('Erro ao atribuir cargo de nível:', error);
      return lastRole;
    }
  }
  
  static async updateUserRole(userId, roleId, username, ignisContext) {
    try {
      const mainDoc = await database.findOne(database.COLLECTIONS.DADOS_USUARIOS, { _id: 'niveis' });
      if (!mainDoc) return;
      
      const userIndex = mainDoc.users.findIndex(user => user.userId === userId);
      if (userIndex >= 0) {
        await database.updateOne(
          database.COLLECTIONS.DADOS_USUARIOS,
          { _id: 'niveis' },
          { 
            $set: { 
              [`users.${userIndex}.lastRole`]: roleId,
              [`users.${userIndex}.username`]: username
            } 
          }
        );
      }
    } catch (error) {
      console.error('Erro ao atualizar cargo do usuário no banco de dados:', error);
    }
  }
}

async function initialize(client, ignisContext) {
  await DatabaseService.initializeCollections(ignisContext);
  LevelSystem.messageCooldowns.clear();
  LevelSystem.setupVoiceXPTimer(ignisContext);
}

async function execute(message, ignisContext) {
  if (message.author.bot || !message.guild) return;
  
  try {
    const configuracao = await DatabaseService.fetchConfiguracao(ignisContext, message.guild.id);
    const rankData = await DatabaseService.getUserRankData(message.author.id, ignisContext);
    const xpGained = LevelSystem.calculateMessageXP(message);
    
    if (xpGained > 0) {
      const { newLevel, previousLevel, leveledUp } = await DatabaseService.updateUserXP(
        message.author.id, 
        rankData, 
        xpGained, 
        ignisContext
      );
      
      if (leveledUp && newLevel > previousLevel) {
        await DatabaseService.recordLevelUpHistory(
          ignisContext,
          message.author.id,
          message.author.username,
          newLevel,
          message.guild.id
        );
        
        await NotificationService.sendLevelUpNotification(
          message, 
          message.guild,
          newLevel, 
          configuracao
        );
        
        await RoleService.handleRoleAssignment(
          message.member, 
          newLevel, 
          rankData.lastRole, 
          ignisContext
        );
      }
    }
  } catch (error) {
    console.error('Erro ao processar XP da mensagem:', error);
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
