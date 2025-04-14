const { EmbedBuilder } = require('discord.js');
const { gerarCorAleatoria } = require('../configuracoes/randomColor');

class DatabaseService {
  static async initializeCollections(ignis) {
    if (!ignis.database.rank) {
      ignis.database.rank = ignis.database.collection('rank');
      const mainUserDoc = await ignis.database.rank.findOne({ _id: 'main' });
      if (!mainUserDoc) {
        await ignis.database.rank.insertOne({
          _id: 'main',
          users: [],
          createdAt: new Date().toISOString()
        });
      }
    }
    if (!ignis.database.cargoRank) ignis.database.cargoRank = ignis.database.collection('cargoRank');
    if (!ignis.database.channelConfigs) ignis.database.channelConfigs = ignis.database.collection('channelConfigs');
  }

  static async getUserRankData(userId, ignis) {
    await this.initializeCollections(ignis);
    const mainDoc = await ignis.database.rank.findOne({ _id: 'main' });
    
    if (!mainDoc) {
      try {
        await ignis.database.rank.insertOne({
          _id: 'main',
          users: [],
          createdAt: new Date().toISOString()
        });
        
        const newUserData = {
          userId,
          username: "",
          xp: 0,
          level: 0,
          lastRole: null,
          lastUpdated: new Date().toISOString()
        };
        
        try {
          const user = await ignis.client.users.fetch(userId);
          if (user) newUserData.username = user.username;
        } catch (error) {}
        
        return newUserData;
      } catch (error) {
        return {
          userId,
          username: "",
          xp: 0,
          level: 0,
          lastRole: null,
          lastUpdated: new Date().toISOString()
        };
      }
    }
    
    if (!mainDoc.users || !Array.isArray(mainDoc.users)) {
      await ignis.database.rank.updateOne(
        { _id: 'main' },
        { $set: { users: [] } }
      );
      mainDoc.users = [];
    }
    
    const userIndex = mainDoc.users.findIndex(user => user && user.userId === userId);
    
    if (userIndex >= 0) {
      const userData = mainDoc.users[userIndex];
      
      if (!userData.level) userData.level = 0;
      if (!userData.xp) userData.xp = 0;
      if (!userData.lastRole) userData.lastRole = null;
      if (!userData.lastUpdated) userData.lastUpdated = new Date().toISOString();
      
      if (!userData.username || userData.username === "") {
        try {
          const user = await ignis.client.users.fetch(userId);
          if (user) {
            userData.username = user.username;
            await ignis.database.rank.updateOne(
              { _id: 'main' },
              { $set: { [`users.${userIndex}.username`]: user.username } }
            );
          }
        } catch (error) {}
      }
      
      return userData;
    }
    
    const newUserData = {
      userId,
      username: "",
      xp: 0,
      level: 0,
      lastRole: null,
      lastUpdated: new Date().toISOString()
    };
    
    try {
      const user = await ignis.client.users.fetch(userId);
      if (user) newUserData.username = user.username;
    } catch (error) {}
    
    try {
      await ignis.database.rank.updateOne(
        { _id: 'main' },
        { $push: { users: newUserData } }
      );
    } catch (error) {}
    
    return newUserData;
  }
  
  static async fetchChannelConfigs(ignis, guildId) {
    try {
      await this.initializeCollections(ignis);
      return await ignis.database.channelConfigs.findOne({ guildId });
    } catch (error) {
      return null;
    }
  }
  
  static async getLeaderboard(ignis, limit = 10) {
    await this.initializeCollections(ignis);
    
    const mainDoc = await ignis.database.rank.findOne({ _id: 'main' });
    if (!mainDoc?.users?.length) return [];
    
    const sortedUsers = [...mainDoc.users].sort((a, b) => {
      if (a.level !== b.level) return b.level - a.level;
      return b.xp - a.xp;
    });
    
    return sortedUsers.slice(0, limit);
  }
  
  static async addRoleToLevel(level, roleId, ignis) {
    await this.initializeCollections(ignis);
    const existingRole = await ignis.database.cargoRank.findOne({ level });
    
    if (existingRole) {
      return ignis.database.cargoRank.updateOne(
        { level },
        { $set: { roleId } }
      );
    } else {
      return ignis.database.cargoRank.insertOne({ level, roleId });
    }
  }
  
  static async removeRoleFromLevel(level, ignis) {
    await this.initializeCollections(ignis);
    return ignis.database.cargoRank.deleteOne({ level });
  }
  
  static async updateUserXP(userId, userData, xpGained, ignis) {
    if (!xpGained || isNaN(xpGained) || xpGained <= 0) {
      return { 
        newLevel: userData.level, 
        previousLevel: userData.level, 
        newXP: userData.xp 
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
    
    const mainDoc = await ignis.database.rank.findOne({ _id: 'main' });
    if (!mainDoc) {
      return { 
        newLevel: userData.level, 
        previousLevel: userData.level, 
        newXP: userData.xp 
      };
    }
    
    const userIndex = mainDoc.users.findIndex(user => user.userId === userId);
    
    if (userIndex >= 0) {
      await ignis.database.rank.updateOne(
        { _id: 'main' },
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

  static async recordLevelUpHistory(ignis, userId, username, newLevel, guildId) {
    return;
  }
}

class LevelSystem {
  static messageCooldowns = new Map();
  static voiceUsers = new Map();
  
  static calculateRequiredXP(level) {
    // XP base para cada nível
    const baseXP = 250;
    
    // Determinar o multiplicador com base na faixa de nível
    let multiplier = 1.0;
    
    if (level < 10) {
      multiplier = 1.0;  // Níveis 0-9: multiplicador 1.0
    } else if (level < 20) {
      multiplier = 1.25; // Níveis 10-19: multiplicador 1.25
    } else if (level < 30) {
      multiplier = 1.5;  // Níveis 20-29: multiplicador 1.5
    } else if (level < 40) {
      multiplier = 1.75; // Níveis 30-39: multiplicador 1.75
    } else if (level < 50) {
      multiplier = 2.0;  // Níveis 40-49: multiplicador 2.0
    } else if (level < 60) {
      multiplier = 2.25; // Níveis 50-59: multiplicador 2.25
    } else if (level < 70) {
      multiplier = 2.5;  // Níveis 60-69: multiplicador 2.5
    } else if (level < 80) {
      multiplier = 2.75; // Níveis 70-79: multiplicador 2.75
    } else {
      multiplier = 3.0;  // Níveis 80+: multiplicador 3.0
    }
    
    // Aplicar o multiplicador ao XP base e arredondar para o número inteiro mais próximo
    return Math.round(baseXP * multiplier * (1 + Math.floor(level / 10) * 0.5));
  }
  
  static findChannelById(channelId, channelConfigs) {
    if (!channelConfigs?.categories) return null;
    
    for (const category of channelConfigs.categories) {
      for (const channel of category.channels) {
        if (channel.id === channelId) return channel;
      }
    }
    return null;
  }
  
  static findLevelUpChannel(channelConfigs) {
    if (!channelConfigs?.categories) return null;
    
    for (const category of channelConfigs.categories) {
      for (const channel of category.channels) {
        if (channel.name === 'novonivel') return channel.id;
      }
    }
    return null;
  }
  
  static isSpamMessage(message) {
    const content = message.content;
    if (content.length < 5) return false;
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
  
  static calculateMessageXP(message, channelConfigs) {
    const userId = message.author.id;
    const now = Date.now();
    
    if (this.isSpamMessage(message)) return 0;
    
    if (this.messageCooldowns.has(userId)) {
      const cooldownExpires = this.messageCooldowns.get(userId);
      if (now < cooldownExpires) return 0;
    }
    
    let xpGained = Math.floor(Math.random() * 10) + 15;
    
    if (channelConfigs?.categories) {
      const channel = this.findChannelById(message.channel.id, channelConfigs);
      if (channel) {
        xpGained = 25 + Math.floor(Math.random() * 25);
        if (channel.xpBoost) xpGained = Math.floor(xpGained * channel.xpBoost);
      }
    }
    
    this.messageCooldowns.set(userId, now + 15000);
    return xpGained;
  }
  
  static setupVoiceXPTimer(ignis) {
    console.log('Iniciando sistema de XP por voz');
    
    setInterval(async () => {
      for (const [userId, userData] of this.voiceUsers.entries()) {
        try {
          if (!userData.guild) continue;
          
          const channelConfigs = await DatabaseService.fetchChannelConfigs(ignis, userData.guild.id);
          if (!channelConfigs) continue;
          
          const now = Date.now();
          
          if (now - userData.joinTime < 30000) continue;
          
          if (userData.lastXpTime && now - userData.lastXpTime < 15000) continue;
          
          const userRankData = await DatabaseService.getUserRankData(userId, ignis);
          
          let voiceXP = 50;
          
          const channel = this.findChannelById(userData.channelId, channelConfigs);
          if (channel?.xpBoost) voiceXP = Math.floor(voiceXP * channel.xpBoost);
          
          userData.lastXpTime = now;
          this.voiceUsers.set(userId, userData);
          
          console.log(`Concedendo ${voiceXP} XP por voz para ${userRankData.username || userId}`);
          
          const { newLevel, previousLevel } = await DatabaseService.updateUserXP(
            userId, 
            userRankData, 
            voiceXP, 
            ignis
          );
          
          if (newLevel > previousLevel && userData.member) {
            console.log(`Usuário ${userRankData.username || userId} subiu para o nível ${newLevel} por voz`);
            
            await NotificationService.sendLevelUpNotification(
              userData.member,
              userData.guild,
              newLevel,
              channelConfigs
            );
            
            await RoleService.handleRoleAssignment(
              userData.member,
              newLevel,
              userRankData.lastRole,
              ignis
            );
          }
        } catch (error) {
          console.error(`Erro ao processar XP por voz: ${error}`);
        }
      }
    }, 5000);
  }
  
  static async handleVoiceStateUpdate(oldState, newState, ignis) {
    const userId = newState.member.id;
    
    if (newState.member.user.bot) return;
    
    if (!newState.channelId || newState.deaf || newState.selfDeaf || newState.mute || newState.selfMute) {
      if (this.voiceUsers.has(userId)) {
        console.log(`Usuário ${userId} removido do sistema de XP por voz (saiu ou ficou mudo/surdo)`);
        this.voiceUsers.delete(userId);
      }
      return;
    }
    
    const channelConfigs = await DatabaseService.fetchChannelConfigs(ignis, newState.guild.id);
    if (!channelConfigs) return;
    
    if (this.voiceUsers.has(userId)) {
      const userData = this.voiceUsers.get(userId);
      
      if (userData.channelId !== newState.channelId) {
        console.log(`Usuário ${userId} mudou de canal de voz para ${newState.channelId}`);
        
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
    
    console.log(`Adicionando usuário ${userId} ao sistema de XP por voz (canal: ${newState.channelId})`);
    
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
  static async sendLevelUpNotification(userOrMember, guild, newLevel, channelConfigs) {
    try {
      if (channelConfigs) {
        const levelUpChannelId = LevelSystem.findLevelUpChannel(channelConfigs);
        
        if (levelUpChannelId) {
          try {
            const levelUpChannel = await guild.channels.fetch(levelUpChannelId);
            
            if (levelUpChannel) {
              const user = userOrMember.author || userOrMember;
              const nextLevelXP = LevelSystem.calculateRequiredXP(newLevel);
              
              const embed = new EmbedBuilder()
                .setTitle('🎉 Novo Nível!')
                .setDescription(`${user} alcançou o nível **${newLevel}**!`)
                .addFields({ 
                  name: 'Progresso', 
                  value: `XP necessário para o próximo nível: **${nextLevelXP}**` 
                })
                .setColor(gerarCorAleatoria())
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
              
              await levelUpChannel.send({ embeds: [embed] });
              return;
            }
          } catch (error) {
            console.error('Erro ao enviar notificação de nível:', error);
          }
        }
      }
      
      if (userOrMember.channel) {
        const user = userOrMember.author;
        const nextLevelXP = LevelSystem.calculateRequiredXP(newLevel);
        
        const embed = new EmbedBuilder()
          .setTitle('🎉 Level Up!')
          .setDescription(`Parabéns ${user}! Você alcançou o nível **${newLevel}**!`)
          .addFields({ 
            name: 'Progresso', 
            value: `XP necessário para o próximo nível: **${nextLevelXP}**` 
          })
          .setColor(gerarCorAleatoria())
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setTimestamp();
        
        await userOrMember.channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Erro ao enviar notificação de nível:', error);
    }
  }
}

class RoleService {
  static async handleRoleAssignment(member, level, lastRole, ignis) {
    try {
      // Buscar configuração de cargos na coleção cargosNivel
      const cargosNivelCollection = ignis.database.collection('cargosNivel');
      const cargosNivelDoc = await cargosNivelCollection.findOne({});
      
      // Se não encontrar a configuração de cargos, usar o sistema antigo
      if (!cargosNivelDoc || !cargosNivelDoc.cargos || !Array.isArray(cargosNivelDoc.cargos)) {
        // Fallback para o sistema antigo de cargos
        const roleConfigs = await ignis.database.cargoRank
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
        
        // Atualizar no banco de dados
        await this.updateUserRole(member.id, highestRole, member.user.username, ignis);
        
        return highestRole;
      }
      
      // Sistema novo usando cargosNivel
      // Ordenar cargos por nível (do maior para o menor)
      const cargosOrdenados = [...cargosNivelDoc.cargos].sort((a, b) => b.nivel - a.nivel);
      
      // Encontrar o cargo de nível mais alto que o usuário deveria ter
      let cargoApropriado = null;
      for (const cargo of cargosOrdenados) {
        if (level >= cargo.nivel) {
          cargoApropriado = cargo;
          break;
        }
      }
      
      // Se não encontrar cargo apropriado, não fazer nada
      if (!cargoApropriado) return lastRole;
      
      // Se o cargo atual já for o correto, não fazer nada
      if (lastRole === cargoApropriado.id) return lastRole;
      
      // Remover TODOS os cargos de nível que o usuário tem atualmente
      const cargosIds = cargosNivelDoc.cargos.map(c => c.id);
      let cargosRemovidos = 0;
      
      for (const cargoId of cargosIds) {
        if (member.roles.cache.has(cargoId)) {
          await member.roles.remove(cargoId);
          cargosRemovidos++;
        }
      }
      
      // Adicionar o novo cargo
      await member.roles.add(cargoApropriado.id);
      console.log(`Cargo atualizado para ${member.user.username}: de ${lastRole || 'nenhum'} para ${cargoApropriado.id} (nível ${cargoApropriado.nivel}). Removidos ${cargosRemovidos} cargos antigos.`);
      
      // Atualizar no banco de dados
      await this.updateUserRole(member.id, cargoApropriado.id, member.user.username, ignis);
      
      return cargoApropriado.id;
    } catch (error) {
      console.error('Erro ao atribuir cargo de nível:', error);
      return lastRole;
    }
  }
  
  static async updateUserRole(userId, roleId, username, ignis) {
    try {
      const mainDoc = await ignis.database.rank.findOne({ _id: 'main' });
      if (!mainDoc) return;
      
      const userIndex = mainDoc.users.findIndex(user => user.userId === userId);
      if (userIndex >= 0) {
        await ignis.database.rank.updateOne(
          { _id: 'main' },
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

module.exports = {
  name: 'messageCreate',
  once: false,
  
  initialize: async (client, ignis) => {
    LevelSystem.setupVoiceXPTimer(ignis);
  },
  
  execute: async (message, ignis) => {
    if (message.author.bot || !message.guild) return;
    
    try {
      const channelConfigs = await DatabaseService.fetchChannelConfigs(ignis, message.guild.id);
      const rankData = await DatabaseService.getUserRankData(message.author.id, ignis);
      const xpGained = LevelSystem.calculateMessageXP(message, channelConfigs);
      
      if (xpGained > 0) {
        const { newLevel, previousLevel } = await DatabaseService.updateUserXP(
          message.author.id, 
          rankData, 
          xpGained, 
          ignis
        );
        
        if (newLevel > previousLevel) {
          await DatabaseService.recordLevelUpHistory(
            ignis,
            message.author.id,
            message.author.username,
            newLevel,
            message.guild.id
          );
          
          await NotificationService.sendLevelUpNotification(
            message, 
            message.guild,
            newLevel, 
            channelConfigs
          );
          
          await RoleService.handleRoleAssignment(
            message.member, 
            newLevel, 
            rankData.lastRole, 
            ignis
          );
        }
      }
    } catch (error) {}
  },
  
  utils: {
    getUserRankData: DatabaseService.getUserRankData.bind(DatabaseService),
    calculateRequiredXP: LevelSystem.calculateRequiredXP.bind(LevelSystem),
    getLeaderboard: DatabaseService.getLeaderboard.bind(DatabaseService),
    addRoleToLevel: DatabaseService.addRoleToLevel.bind(DatabaseService),
    removeRoleFromLevel: DatabaseService.removeRoleFromLevel.bind(DatabaseService),
    handleRoleAssignment: RoleService.handleRoleAssignment.bind(RoleService),
    initializeCollections: DatabaseService.initializeCollections.bind(DatabaseService),
    findChannelById: LevelSystem.findChannelById.bind(LevelSystem),
    fetchChannelConfigs: DatabaseService.fetchChannelConfigs.bind(DatabaseService),
    handleVoiceStateUpdate: LevelSystem.handleVoiceStateUpdate.bind(LevelSystem)
  }
};
