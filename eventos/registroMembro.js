const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { MongoClient } = require('mongodb');

const COLORS = {
    POSITIVE: '#32CD32',
    NEGATIVE: '#FF0000',
    NEUTRAL: '#FFA500'
};

async function initialize(client, ignisContext) {
    const { database } = ignisContext;
    
    try {
        const configuracoesCollection = database.collection('configuracoes');
        
        setupEventHandlers(client, configuracoesCollection);
        
        console.log('Módulo de registro de membros inicializado com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar módulo de registro de membros:', error);
    }
}

function setupEventHandlers(client, configCollection) {
    setupMemberRoleUpdateHandler(client, configCollection);
    setupUserUpdateHandler(client, configCollection);
    setupBanUnbanHandler(client, configCollection);
    setupMemberUpdateHandler(client, configCollection);
    setupVoiceStateHandler(client, configCollection);
    setupGuildMemberHandler(client, configCollection);
}

function setupMemberRoleUpdateHandler(client, configCollection) {
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        if (newMember.user.bot) return;
        
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
        
        if (addedRoles.size === 0 && removedRoles.size === 0) return;

        try {
            const userLogChannel = await findUserLogChannel(configCollection, newMember.guild.id);
            if (!userLogChannel) return;
            
            const auditLogs = await newMember.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberRoleUpdate,
                limit: 1,
            });
            
            const roleUpdateLog = auditLogs.entries.first();
            const moderator = roleUpdateLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const embed = new EmbedBuilder()
                .setTitle('Atualização de Cargos')
                .setColor(COLORS.NEUTRAL)
                .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `ID do usuário: ${newMember.id}` })
                .setTimestamp();
            
            if (addedRoles.size > 0) {
                embed.addFields({
                    name: '✅ Cargos Adicionados',
                    value: addedRoles.map(role => `<@&${role.id}>`).join(', '),
                    inline: false
                });
            }
            
            if (removedRoles.size > 0) {
                embed.addFields({
                    name: '❌ Cargos Removidos',
                    value: removedRoles.map(role => `<@&${role.id}>`).join(', '),
                    inline: false
                });
            }
            
            embed.addFields({
                name: 'Alterado por',
                value: `<@${moderator.id}> (${moderator.tag})`,
                inline: false
            });
            
            await userLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar atualização de cargos:', error);
        }
    });
}

function setupUserUpdateHandler(client, configCollection) {
    client.on('userUpdate', async (oldUser, newUser) => {
        if (newUser.bot) return;
        
        const changes = [];
        const embedColor = COLORS.NEUTRAL;
        
        const usernameChanged = oldUser.username !== newUser.username || oldUser.discriminator !== newUser.discriminator;
        const avatarChanged = oldUser.avatar !== newUser.avatar;
        
        if (!usernameChanged && !avatarChanged) return;
        
        if (usernameChanged) {
            changes.push({
                name: 'Nome de Usuário Alterado',
                value: `**Antigo:** ${oldUser.tag}\n**Novo:** ${newUser.tag}`,
            });
        }
        
        if (avatarChanged) {
            changes.push({
                name: 'Avatar Alterado',
                value: 'O usuário alterou seu avatar.',
            });
        }
        
        try {
            for (const guild of client.guilds.cache.values()) {
                const member = guild.members.cache.get(newUser.id) || await guild.members.fetch(newUser.id).catch(() => null);
                if (!member) continue;
                
                const userLogChannel = await findUserLogChannel(configCollection, guild.id);
                if (!userLogChannel) continue;
                
                const embed = new EmbedBuilder()
                    .setTitle('Perfil de Usuário Atualizado')
                    .setColor(embedColor)
                    .setDescription(`O usuário <@${newUser.id}> atualizou seu perfil.`)
                    .setTimestamp()
                    .setFooter({ text: `ID do usuário: ${newUser.id}` });
                
                if (avatarChanged) {
                    if (oldUser.avatar) {
                        embed.setThumbnail(oldUser.displayAvatarURL({ dynamic: true, size: 256 }));
                    }
                    if (newUser.avatar) {
                        embed.setImage(newUser.displayAvatarURL({ dynamic: true, size: 256 }));
                    }
                } else {
                    embed.setThumbnail(newUser.displayAvatarURL({ dynamic: true }));
                }
                
                embed.addFields(changes);
                await userLogChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Erro ao registrar atualização de usuário:', error);
        }
    });
}

function setupBanUnbanHandler(client, configCollection) {
    client.on('guildBanAdd', async (ban) => {
        try {
            const { user, guild } = ban;
            
            const userLogChannel = await findUserLogChannel(configCollection, guild.id);
            if (!userLogChannel) return;
            
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.MemberBanAdd,
                limit: 1,
            });
            
            const banLog = auditLogs.entries.first();
            const moderator = banLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            const reason = banLog?.reason || 'Nenhum motivo fornecido';
            
            const embed = new EmbedBuilder()
                .setTitle('Usuário Banido')
                .setColor(COLORS.NEGATIVE)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Usuário', value: `<@${user.id}> (${user.tag})`, inline: true },
                    { name: 'Banido por', value: `<@${moderator.id}> (${moderator.tag})`, inline: true },
                    { name: 'Motivo', value: reason, inline: false }
                )
                .setFooter({ text: `ID do usuário: ${user.id}` })
                .setTimestamp();
            
            await userLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar banimento:', error);
        }
    });
    
    client.on('guildBanRemove', async (ban) => {
        try {
            const { user, guild } = ban;
            
            const userLogChannel = await findUserLogChannel(configCollection, guild.id);
            if (!userLogChannel) return;
            
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.MemberBanRemove,
                limit: 1,
            });
            
            const unbanLog = auditLogs.entries.first();
            const moderator = unbanLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const embed = new EmbedBuilder()
                .setTitle('Usuário Desbanido')
                .setColor(COLORS.POSITIVE)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Usuário', value: `<@${user.id}> (${user.tag})`, inline: true },
                    { name: 'Desbanido por', value: `<@${moderator.id}> (${moderator.tag})`, inline: true }
                )
                .setFooter({ text: `ID do usuário: ${user.id}` })
                .setTimestamp();
            
            await userLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar desbanimento:', error);
        }
    });
}

function setupMemberUpdateHandler(client, configCollection) {
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        if (newMember.user.bot) return;
        
        try {
            const wasTimedOut = oldMember.communicationDisabledUntil;
            const isTimedOut = newMember.communicationDisabledUntil;
            
            if (!wasTimedOut && isTimedOut) {
                await handleTimeout(newMember, isTimedOut, configCollection);
            } else if (wasTimedOut && !isTimedOut) {
                await handleUntimeout(newMember, configCollection);
            }
            
            if (oldMember.nickname !== newMember.nickname) {
                await handleNicknameChange(oldMember, newMember, configCollection);
            }
        } catch (error) {
            console.error('Erro ao registrar atualização de membro:', error);
        }
    });
}

function setupGuildMemberHandler(client, configCollection) {
    client.on('guildMemberAdd', async (member) => {
        if (member.user.bot) return;
        
        try {
            await handleMemberJoin(member, configCollection);
        } catch (error) {
            console.error('Erro ao registrar entrada de membro:', error);
        }
    });
    
    client.on('guildMemberRemove', async (member) => {
        if (member.user.bot) return;
        
        try {
            await handleMemberLeave(member, configCollection);
        } catch (error) {
            console.error('Erro ao registrar saída de membro:', error);
        }
    });
}

async function handleMemberJoin(member, configCollection) {
    try {
        if (await checkInvitesDisabled(member)) return;
        
        const userLogChannel = await findUserLogChannel(configCollection, member.guild.id);
        if (!userLogChannel) return;
        
        const createdAt = member.user.createdAt;
        const now = new Date();
        const accountAge = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        
        const embed = new EmbedBuilder()
            .setTitle('Novo Membro')
            .setColor(COLORS.POSITIVE)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setDescription(`<@${member.id}> (${member.user.tag}) entrou no servidor.`)
            .addFields(
                { name: 'Conta Criada em', value: `<t:${Math.floor(createdAt.getTime() / 1000)}:F> (${accountAge} dias atrás)`, inline: false }
            )
            .setFooter({ text: `ID do usuário: ${member.id}` })
            .setTimestamp();
        
        await userLogChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Erro ao processar entrada de membro:', error);
    }
}

async function checkInvitesDisabled(member) {
    try {
        const mongoClient = new MongoClient(process.env.MONGO_URI);
        await mongoClient.connect();
        const db = mongoClient.db('ignis');
        const configCollection = db.collection('serverConfigs');
        
        const serverConfig = await configCollection.findOne({ guildId: member.guild.id });
        
        if (serverConfig?.convitesAtivos === false) {
            console.log(`Membro ${member.user.tag} foi removido porque os convites estão desativados.`);
            
            await member.send({
                content: `Olá! Infelizmente, o servidor **${member.guild.name}** está temporariamente fechado para novos membros. Por favor, tente entrar novamente mais tarde.`
            }).catch(() => console.log(`Não foi possível enviar DM para ${member.user.tag}`));
            
            await member.kick('Convites estão temporariamente desativados');
            
            const userLogChannel = await findUserLogChannel(configCollection, member.guild.id);
            if (userLogChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('Entrada Bloqueada')
                    .setColor(COLORS.NEGATIVE)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .setDescription(`<@${member.id}> (${member.user.tag}) tentou entrar no servidor, mas foi removido pois os convites estão desativados.`)
                    .setFooter({ text: `ID do usuário: ${member.id}` })
                    .setTimestamp();
                
                await userLogChannel.send({ embeds: [embed] });
            }
            
            await mongoClient.close();
            return true;
        }
        
        await mongoClient.close();
        return false;
    } catch (error) {
        console.error('Erro ao verificar status dos convites:', error);
        return false;
    }
}

async function handleMemberLeave(member, configCollection) {
    const userLogChannel = await findUserLogChannel(configCollection, member.guild.id);
    if (!userLogChannel) return;
    
    const auditLogs = await member.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberKick,
        limit: 1,
    });
    
    const kickLog = auditLogs.entries.first();
    const isKicked = kickLog && 
        kickLog.target.id === member.id && 
        Date.now() - kickLog.createdTimestamp < 5000;
    
    if (isKicked) {
        await handleMemberKick(member, kickLog, userLogChannel);
    } else {
        await handleMemberLeaveVoluntarily(member, userLogChannel);
    }
}

async function handleMemberKick(member, kickLog, userLogChannel) {
    const moderator = kickLog.executor;
    const reason = kickLog.reason || 'Nenhum motivo fornecido';
    
    const embed = new EmbedBuilder()
        .setTitle('Membro Expulso')
        .setColor(COLORS.NEGATIVE)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Usuário', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: 'Expulso por', value: `<@${moderator.id}> (${moderator.tag})`, inline: true },
            { name: 'Motivo', value: reason, inline: false }
        )
        .setFooter({ text: `ID do usuário: ${member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

async function handleMemberLeaveVoluntarily(member, userLogChannel) {
    const embed = new EmbedBuilder()
        .setTitle('Membro Saiu')
        .setColor(COLORS.NEGATIVE)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setDescription(`<@${member.id}> (${member.user.tag}) saiu do servidor.`)
        .addFields(
            { name: 'Entrou em', value: `<t:${Math.floor(member.joinedAt?.getTime() / 1000) || 'Desconhecido'}:F>`, inline: true },
            { name: 'Cargos', value: member.roles.cache.size > 1 ? 
                member.roles.cache.filter(role => role.id !== member.guild.id).map(role => `<@&${role.id}>`).join(', ') : 
                'Nenhum cargo', inline: false }
        )
        .setFooter({ text: `ID do usuário: ${member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

function setupVoiceStateHandler(client, configCollection) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (newState.member.user.bot) return;
        
        try {
            const userLogChannel = await findUserLogChannel(configCollection, newState.guild.id);
            if (!userLogChannel) return;
            
            const oldChannel = oldState.channel;
            const newChannel = newState.channel;
            
            if (!oldChannel && newChannel) {
                await handleVoiceJoin(newState, userLogChannel);
            } else if (oldChannel && !newChannel) {
                await handleVoiceLeave(oldState, userLogChannel);
            } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
                await handleVoiceMove(oldState, newState, userLogChannel);
            } else if (oldState.mute !== newState.mute || oldState.deaf !== newState.deaf ||
                      oldState.selfMute !== newState.selfMute || oldState.selfDeaf !== newState.selfDeaf ||
                      oldState.selfVideo !== newState.selfVideo || oldState.streaming !== newState.streaming) {
                await handleVoiceStateChange(oldState, newState, userLogChannel);
            }
        } catch (error) {
            console.error('Erro ao registrar atividade de canal de voz:', error);
        }
    });
}

async function findUserLogChannel(configCollection, guildId) {
    try {
        // Buscar o documento de canais na coleção de configurações
        const channelConfig = await configCollection.findOne({ _id: 'canais' });
        if (!channelConfig || !channelConfig.categorias) {
            console.log('Documento de canais não encontrado ou sem categorias');
            return null;
        }
        
        let userLogChannelId = null;
        
        // Buscar a categoria "somente-adm" e o canal "registros-membros" (com 's' no final)
        for (const categoria of channelConfig.categorias) {
            if (categoria.nome === 'somente-adm') {
                const userlogsChannel = categoria.canais.find(canal => canal.nome === 'registros-membros');
                if (userlogsChannel) {
                    userLogChannelId = userlogsChannel.id;
                    break;
                }
            }
        }
        
        // Se não encontrou, procurar em qualquer categoria como fallback
        if (!userLogChannelId) {
            for (const categoria of channelConfig.categorias) {
                if (!categoria.canais || !Array.isArray(categoria.canais)) continue;
                
                const userlogsChannel = categoria.canais.find(canal => canal.nome === 'registros-membros');
                if (userlogsChannel) {
                    userLogChannelId = userlogsChannel.id;
                    break;
                }
            }
        }
        
        if (!userLogChannelId) {
            console.log('Canal de logs não encontrado em nenhuma categoria');
            return null;
        }
        
        // Buscar o canal no Discord
        const guild = await global.ignisContext.client.guilds.fetch(guildId);
        const logChannel = await guild.channels.fetch(userLogChannelId);
        
        if (!logChannel) {
            console.log(`Canal com ID ${userLogChannelId} não encontrado no Discord`);
            return null;
        }
        
        console.log(`Canal de logs encontrado: ${logChannel.name} (${userLogChannelId})`);
        return logChannel;
    } catch (error) {
        console.error('Erro ao buscar canal de log:', error);
        return null;
    }
}

async function handleTimeout(member, timeoutUntil, configCollection) {
    const userLogChannel = await findUserLogChannel(configCollection, member.guild.id);
    if (!userLogChannel) return;
    
    const auditLogs = await member.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberUpdate,
        limit: 5,
    });
    
    const timeoutLog = auditLogs.entries.find(log => 
        log.targetId === member.id && 
        log.changes.some(change => change.key === 'communication_disabled_until')
    );
    
    const moderator = timeoutLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
    const reason = timeoutLog?.reason || 'Nenhum motivo fornecido';
    
    const durationText = formatTimeoutDuration(timeoutUntil);
    
    const embed = new EmbedBuilder()
        .setTitle('Membro Silenciado (Timeout)')
        .setColor(COLORS.NEGATIVE)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Usuário', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: 'Moderador', value: `<@${moderator.id}> (${moderator.tag})`, inline: true },
            { name: 'Duração', value: durationText, inline: true },
            { name: 'Expira em', value: `<t:${Math.floor(timeoutUntil.getTime() / 1000)}:F>`, inline: true },
            { name: 'Motivo', value: reason, inline: false }
        )
        .setFooter({ text: `ID do usuário: ${member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

function formatTimeoutDuration(timeoutUntil) {
    const durationMs = new Date(timeoutUntil).getTime() - Date.now();
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    
    if (durationMinutes < 60) {
        return `${durationMinutes} minutos`;
    } else if (durationMinutes < 1440) {
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;
        return `${hours} horas${minutes > 0 ? ` e ${minutes} minutos` : ''}`;
    } else {
        const days = Math.floor(durationMinutes / 1440);
        const hours = Math.floor((durationMinutes % 1440) / 60);
        return `${days} dias${hours > 0 ? ` e ${hours} horas` : ''}`;
    }
}

async function handleUntimeout(member, configCollection) {
    const userLogChannel = await findUserLogChannel(configCollection, member.guild.id);
    if (!userLogChannel) return;
    
    const auditLogs = await member.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberUpdate,
        limit: 5,
    });
    
    const untimeoutLog = auditLogs.entries.find(log => 
        log.targetId === member.id && 
        log.changes.some(change => 
            change.key === 'communication_disabled_until' && 
            change.old !== null && 
            change.new === null
        )
    );
    
    const moderator = untimeoutLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
    
    const embed = new EmbedBuilder()
        .setTitle('Silenciamento Removido (Timeout)')
        .setColor(COLORS.POSITIVE)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Usuário', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: 'Removido por', value: `<@${moderator.id}> (${moderator.tag})`, inline: true }
        )
        .setFooter({ text: `ID do usuário: ${member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

async function handleNicknameChange(oldMember, newMember, configCollection) {
    const userLogChannel = await findUserLogChannel(configCollection, newMember.guild.id);
    if (!userLogChannel) return;
    
    const oldNickname = oldMember.nickname || 'Nenhum';
    const newNickname = newMember.nickname || 'Nenhum';
    
    const auditLogs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberUpdate,
        limit: 1,
    });
    
    const nicknameLog = auditLogs.entries.first();
    let moderator = { tag: 'Desconhecido', id: 'Desconhecido' };
    
    if (nicknameLog && 
        nicknameLog.targetId === newMember.id && 
        nicknameLog.changes.some(change => change.key === 'nick')) {
        moderator = nicknameLog.executor;
    }
    
    const selfChange = moderator.id === newMember.id;
    
    const embed = new EmbedBuilder()
        .setTitle('Apelido Alterado')
        .setColor(COLORS.NEUTRAL)
        .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Usuário', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: false },
            { name: 'Apelido Anterior', value: oldNickname, inline: true },
            { name: 'Novo Apelido', value: newNickname, inline: true }
        )
        .setFooter({ text: `ID do usuário: ${newMember.id}` })
        .setTimestamp();
    
    if (!selfChange) {
        embed.addFields({
            name: 'Alterado por',
            value: `<@${moderator.id}> (${moderator.tag})`,
            inline: false
        });
    }
    
    await userLogChannel.send({ embeds: [embed] });
}

async function handleVoiceJoin(newState, userLogChannel) {
    const embed = new EmbedBuilder()
        .setTitle('Entrada em Canal de Voz')
        .setColor(COLORS.POSITIVE)
        .setDescription(`<@${newState.member.id}> entrou no canal <#${newState.channel.id}>.`)
        .setThumbnail(newState.member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `ID do usuário: ${newState.member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

async function handleVoiceLeave(oldState, userLogChannel) {
    const embed = new EmbedBuilder()
        .setTitle('Saída de Canal de Voz')
        .setColor(COLORS.NEGATIVE)
        .setDescription(`<@${oldState.member.id}> saiu do canal <#${oldState.channel.id}>.`)
        .setThumbnail(oldState.member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `ID do usuário: ${oldState.member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

async function handleVoiceMove(oldState, newState, userLogChannel) {
    const embed = new EmbedBuilder()
        .setTitle('Mudança de Canal de Voz')
        .setColor(COLORS.NEUTRAL)
        .setDescription(`<@${newState.member.id}> moveu-se de <#${oldState.channel.id}> para <#${newState.channel.id}>.`)
        .setThumbnail(newState.member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `ID do usuário: ${newState.member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

async function handleVoiceStateChange(oldState, newState, userLogChannel) {
    if (oldState.serverMute !== newState.serverMute || oldState.serverDeaf !== newState.serverDeaf) {
        await handleServerVoiceStateChange(oldState, newState, userLogChannel);
    }
    
    if (oldState.selfMute !== newState.selfMute) {
        await logSelfMuteChange(newState, userLogChannel);
    }
    
    if (oldState.selfDeaf !== newState.selfDeaf) {
        await logSelfDeafChange(newState, userLogChannel);
    }
    
    if (oldState.selfVideo !== newState.selfVideo) {
        await logSelfVideoChange(newState, userLogChannel);
    }
    
    if (oldState.streaming !== newState.streaming) {
        await logStreamingChange(newState, userLogChannel);
    }
}

async function handleServerVoiceStateChange(oldState, newState, userLogChannel) {
    const auditLogs = await newState.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberUpdate,
        limit: 1,
    });
    
    const log = auditLogs.entries.first();
    let moderator = { tag: 'Sistema', id: 'Sistema' };
    
    if (log && 
        log.targetId === newState.member.id && 
        (log.changes.some(change => change.key === 'mute') || 
         log.changes.some(change => change.key === 'deaf'))) {
        moderator = log.executor;
    }
    
    if (oldState.serverMute !== newState.serverMute) {
        const embed = new EmbedBuilder()
            .setTitle(`Usuário ${newState.serverMute ? 'Mutado' : 'Desmutado'} no Servidor`)
            .setColor(newState.serverMute ? COLORS.NEGATIVE : COLORS.POSITIVE)
            .setDescription(`<@${newState.member.id}> foi ${newState.serverMute ? 'mutado' : 'desmutado'} no servidor.`)
            .addFields(
                { name: 'Canal', value: `<#${newState.channel.id}>`, inline: true },
                { name: 'Por', value: `<@${moderator.id}>`, inline: true }
            )
            .setThumbnail(newState.member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `ID do usuário: ${newState.member.id}` })
            .setTimestamp();
        
        await userLogChannel.send({ embeds: [embed] });
    }
    
    if (oldState.serverDeaf !== newState.serverDeaf) {
        const embed = new EmbedBuilder()
            .setTitle(`Usuário ${newState.serverDeaf ? 'Ensurdecido' : 'Desensurdecido'} no Servidor`)
            .setColor(newState.serverDeaf ? COLORS.NEGATIVE : COLORS.POSITIVE)
            .setDescription(`<@${newState.member.id}> foi ${newState.serverDeaf ? 'ensurdecido' : 'desensurdecido'} no servidor.`)
            .addFields(
                { name: 'Canal', value: `<#${newState.channel.id}>`, inline: true },
                { name: 'Por', value: `<@${moderator.id}>`, inline: true }
            )
            .setThumbnail(newState.member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `ID do usuário: ${newState.member.id}` })
            .setTimestamp();
        
        await userLogChannel.send({ embeds: [embed] });
    }
}

async function logSelfMuteChange(newState, userLogChannel) {
    const embed = new EmbedBuilder()
        .setTitle(`Usuário ${newState.selfMute ? 'Ativou' : 'Desativou'} o Próprio Mute`)
        .setColor(COLORS.NEUTRAL)
        .setDescription(`<@${newState.member.id}> ${newState.selfMute ? 'ativou' : 'desativou'} o próprio mute.`)
        .addFields(
            { name: 'Canal', value: `<#${newState.channel.id}>`, inline: true }
        )
        .setThumbnail(newState.member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `ID do usuário: ${newState.member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

async function logSelfDeafChange(newState, userLogChannel) {
    const embed = new EmbedBuilder()
        .setTitle(`Usuário ${newState.selfDeaf ? 'Ativou' : 'Desativou'} o Próprio Deaf`)
        .setColor(COLORS.NEUTRAL)
        .setDescription(`<@${newState.member.id}> ${newState.selfDeaf ? 'ativou' : 'desativou'} o próprio deaf.`)
        .addFields(
            { name: 'Canal', value: `<#${newState.channel.id}>`, inline: true }
        )
        .setThumbnail(newState.member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `ID do usuário: ${newState.member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

async function logSelfVideoChange(newState, userLogChannel) {
    const embed = new EmbedBuilder()
        .setTitle(`Usuário ${newState.selfVideo ? 'Ativou' : 'Desativou'} a Própria Câmera`)
        .setColor(COLORS.NEUTRAL)
        .setDescription(`<@${newState.member.id}> ${newState.selfVideo ? 'ativou' : 'desativou'} a própria câmera.`)
        .addFields(
            { name: 'Canal', value: `<#${newState.channel.id}>`, inline: true }
        )
        .setThumbnail(newState.member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `ID do usuário: ${newState.member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

async function logStreamingChange(newState, userLogChannel) {
    const embed = new EmbedBuilder()
        .setTitle(`Usuário ${newState.streaming ? 'Iniciou' : 'Encerrou'} uma Stream`)
        .setColor(COLORS.NEUTRAL)
        .setDescription(`<@${newState.member.id}> ${newState.streaming ? 'iniciou' : 'encerrou'} uma stream.`)
        .addFields(
            { name: 'Canal', value: `<#${newState.channel.id}>`, inline: true }
        )
        .setThumbnail(newState.member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `ID do usuário: ${newState.member.id}` })
        .setTimestamp();
    
    await userLogChannel.send({ embeds: [embed] });
}

module.exports = { initialize };