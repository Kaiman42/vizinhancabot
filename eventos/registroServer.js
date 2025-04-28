const { EmbedBuilder, AuditLogEvent } = require('discord.js');

const COLORS = {
    POSITIVE: '#32CD32',
    NEGATIVE: '#FF0000',
    NEUTRAL: '#FFA500'
};

async function initialize(client, ignisContext) {
    const { database } = ignisContext;
    
    try {
        const configuracoesCollection = database.collection('configuracoes');
        
        setupChannelHandlers(client, configuracoesCollection);
        setupRoleHandlers(client, configuracoesCollection);
        setupEmojiStickersHandlers(client, configuracoesCollection);
        setupServerSettingsHandlers(client, configuracoesCollection);
        
        console.log('Módulo de registro de eventos do servidor inicializado com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar módulo de registro de servidor:', error);
    }
}

function setupChannelHandlers(client, configCollection) {
    client.on('channelCreate', async (channel) => {
        try {
            if (!channel.guild) return;
            
            const serverLogChannel = await findServerLogChannel(configCollection, channel.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await channel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelCreate,
                limit: 1,
            });
            
            const createLog = auditLogs.entries.first();
            const creator = createLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const channelType = formatChannelType(channel.type);
            
            const embed = new EmbedBuilder()
                .setTitle('Canal Criado')
                .setColor(COLORS.POSITIVE)
                .addFields(
                    { name: 'Nome', value: channel.name, inline: true },
                    { name: 'Tipo', value: channelType, inline: true },
                    { name: 'Criado por', value: `<@${creator.id}> (${creator.tag})`, inline: true },
                    { name: 'ID do Canal', value: channel.id, inline: false }
                )
                .setFooter({ text: `ID do servidor: ${channel.guild.id}` })
                .setTimestamp();
            
            if (channel.parent) {
                embed.addFields({ name: 'Categoria', value: channel.parent.name, inline: true });
            }
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar criação de canal:', error);
        }
    });
    
    client.on('channelDelete', async (channel) => {
        try {
            if (!channel.guild) return;
            
            const serverLogChannel = await findServerLogChannel(configCollection, channel.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await channel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelDelete,
                limit: 1,
            });
            
            const deleteLog = auditLogs.entries.first();
            const deleter = deleteLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const channelType = formatChannelType(channel.type);
            
            const embed = new EmbedBuilder()
                .setTitle('Canal Excluído')
                .setColor(COLORS.NEGATIVE)
                .addFields(
                    { name: 'Nome', value: channel.name, inline: true },
                    { name: 'Tipo', value: channelType, inline: true },
                    { name: 'Excluído por', value: `<@${deleter.id}> (${deleter.tag})`, inline: true },
                    { name: 'ID do Canal', value: channel.id, inline: false }
                )
                .setFooter({ text: `ID do servidor: ${channel.guild.id}` })
                .setTimestamp();
            
            if (channel.parent) {
                embed.addFields({ name: 'Categoria', value: channel.parent.name, inline: true });
            }
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar exclusão de canal:', error);
        }
    });
    
    client.on('channelUpdate', async (oldChannel, newChannel) => {
        try {
            if (!newChannel.guild) return;
            
            const serverLogChannel = await findServerLogChannel(configCollection, newChannel.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await newChannel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelUpdate,
                limit: 1,
            });
            
            const updateLog = auditLogs.entries.first();
            const updater = updateLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const changes = [];
            
            if (oldChannel.name !== newChannel.name) {
                changes.push({
                    name: 'Nome',
                    value: `**Antigo:** ${oldChannel.name}\n**Novo:** ${newChannel.name}`,
                    inline: false
                });
            }
            
            if ('topic' in oldChannel && 'topic' in newChannel && oldChannel.topic !== newChannel.topic) {
                changes.push({
                    name: 'Tópico',
                    value: `**Antigo:** ${oldChannel.topic || 'Nenhum'}\n**Novo:** ${newChannel.topic || 'Nenhum'}`,
                    inline: false
                });
            }
            
            if (oldChannel.parent?.id !== newChannel.parent?.id) {
                changes.push({
                    name: 'Categoria',
                    value: `**Antiga:** ${oldChannel.parent?.name || 'Nenhuma'}\n**Nova:** ${newChannel.parent?.name || 'Nenhuma'}`,
                    inline: false
                });
            }
            
            if ('rateLimitPerUser' in oldChannel && 'rateLimitPerUser' in newChannel && 
                oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
                changes.push({
                    name: 'Modo Lento',
                    value: `**Antigo:** ${formatSlowmode(oldChannel.rateLimitPerUser)}\n**Novo:** ${formatSlowmode(newChannel.rateLimitPerUser)}`,
                    inline: false
                });
            }
            
            if ('nsfw' in oldChannel && 'nsfw' in newChannel && oldChannel.nsfw !== newChannel.nsfw) {
                changes.push({
                    name: 'NSFW',
                    value: `**Antigo:** ${oldChannel.nsfw ? 'Sim' : 'Não'}\n**Novo:** ${newChannel.nsfw ? 'Sim' : 'Não'}`,
                    inline: false
                });
            }
            
            if ('bitrate' in oldChannel && 'bitrate' in newChannel && oldChannel.bitrate !== newChannel.bitrate) {
                changes.push({
                    name: 'Bitrate',
                    value: `**Antigo:** ${(oldChannel.bitrate / 1000).toFixed(0)} kbps\n**Novo:** ${(newChannel.bitrate / 1000).toFixed(0)} kbps`,
                    inline: false
                });
            }
            
            if ('userLimit' in oldChannel && 'userLimit' in newChannel && oldChannel.userLimit !== newChannel.userLimit) {
                changes.push({
                    name: 'Limite de Usuários',
                    value: `**Antigo:** ${oldChannel.userLimit || 'Sem limite'}\n**Novo:** ${newChannel.userLimit || 'Sem limite'}`,
                    inline: false
                });
            }
            
            if (changes.length === 0) return;
            
            const embed = new EmbedBuilder()
                .setTitle('Canal Atualizado')
                .setColor(COLORS.NEUTRAL)
                .setDescription(`O canal <#${newChannel.id}> foi atualizado por <@${updater.id}> (${updater.tag})`)
                .addFields(changes)
                .setFooter({ text: `ID do canal: ${newChannel.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar atualização de canal:', error);
        }
    });
}

function setupRoleHandlers(client, configCollection) {
    client.on('roleCreate', async (role) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, role.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await role.guild.fetchAuditLogs({
                type: AuditLogEvent.RoleCreate,
                limit: 1,
            });
            
            const createLog = auditLogs.entries.first();
            const creator = createLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const embed = new EmbedBuilder()
                .setTitle('Cargo Criado')
                .setColor(role.hexColor !== '#000000' ? role.hexColor : COLORS.POSITIVE)
                .addFields(
                    { name: 'Nome', value: role.name, inline: true },
                    { name: 'Cor', value: role.hexColor, inline: true },
                    { name: 'Mencionável', value: role.mentionable ? 'Sim' : 'Não', inline: true },
                    { name: 'Posição', value: role.position.toString(), inline: true },
                    { name: 'Criado por', value: `<@${creator.id}> (${creator.tag})`, inline: true },
                    { name: 'ID do Cargo', value: role.id, inline: false }
                )
                .setFooter({ text: `ID do servidor: ${role.guild.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar criação de cargo:', error);
        }
    });
    
    client.on('roleDelete', async (role) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, role.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await role.guild.fetchAuditLogs({
                type: AuditLogEvent.RoleDelete,
                limit: 1,
            });
            
            const deleteLog = auditLogs.entries.first();
            const deleter = deleteLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const embed = new EmbedBuilder()
                .setTitle('Cargo Excluído')
                .setColor(role.hexColor !== '#000000' ? role.hexColor : COLORS.NEGATIVE)
                .addFields(
                    { name: 'Nome', value: role.name, inline: true },
                    { name: 'Cor', value: role.hexColor, inline: true },
                    { name: 'Posição', value: role.position.toString(), inline: true },
                    { name: 'Excluído por', value: `<@${deleter.id}> (${deleter.tag})`, inline: true },
                    { name: 'ID do Cargo', value: role.id, inline: false }
                )
                .setFooter({ text: `ID do servidor: ${role.guild.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar exclusão de cargo:', error);
        }
    });
    
    client.on('roleUpdate', async (oldRole, newRole) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, newRole.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await newRole.guild.fetchAuditLogs({
                type: AuditLogEvent.RoleUpdate,
                limit: 1,
            });
            
            const updateLog = auditLogs.entries.first();
            const updater = updateLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const changes = [];
            
            if (oldRole.name !== newRole.name) {
                changes.push({
                    name: 'Nome',
                    value: `**Antigo:** ${oldRole.name}\n**Novo:** ${newRole.name}`,
                    inline: false
                });
            }
            
            if (oldRole.hexColor !== newRole.hexColor) {
                changes.push({
                    name: 'Cor',
                    value: `**Antiga:** ${oldRole.hexColor}\n**Nova:** ${newRole.hexColor}`,
                    inline: false
                });
            }
            
            if (oldRole.position !== newRole.position) {
                changes.push({
                    name: 'Posição',
                    value: `**Antiga:** ${oldRole.position}\n**Nova:** ${newRole.position}`,
                    inline: false
                });
            }
            
            if (oldRole.mentionable !== newRole.mentionable) {
                changes.push({
                    name: 'Mencionável',
                    value: `**Antigo:** ${oldRole.mentionable ? 'Sim' : 'Não'}\n**Novo:** ${newRole.mentionable ? 'Sim' : 'Não'}`,
                    inline: false
                });
            }
            
            if (oldRole.hoist !== newRole.hoist) {
                changes.push({
                    name: 'Exibido Separadamente',
                    value: `**Antigo:** ${oldRole.hoist ? 'Sim' : 'Não'}\n**Novo:** ${newRole.hoist ? 'Sim' : 'Não'}`,
                    inline: false
                });
            }
            
            if (!oldRole.permissions.equals(newRole.permissions)) {
                const addedPerms = [];
                const removedPerms = [];
                
                newRole.permissions.toArray().forEach(perm => {
                    if (!oldRole.permissions.has(perm)) {
                        addedPerms.push(formatPermission(perm));
                    }
                });
                
                oldRole.permissions.toArray().forEach(perm => {
                    if (!newRole.permissions.has(perm)) {
                        removedPerms.push(formatPermission(perm));
                    }
                });
                
                if (addedPerms.length > 0) {
                    changes.push({
                        name: '✅ Permissões Adicionadas',
                        value: addedPerms.join(', ') || 'Nenhuma',
                        inline: false
                    });
                }
                
                if (removedPerms.length > 0) {
                    changes.push({
                        name: '❌ Permissões Removidas',
                        value: removedPerms.join(', ') || 'Nenhuma',
                        inline: false
                    });
                }
            }
            
            if (changes.length === 0) return;
            
            const embed = new EmbedBuilder()
                .setTitle('Cargo Atualizado')
                .setColor(newRole.hexColor !== '#000000' ? newRole.hexColor : COLORS.NEUTRAL)
                .setDescription(`O cargo <@&${newRole.id}> foi atualizado por <@${updater.id}> (${updater.tag})`)
                .addFields(changes)
                .setFooter({ text: `ID do cargo: ${newRole.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar atualização de cargo:', error);
        }
    });
}

function setupEmojiStickersHandlers(client, configCollection) {
    client.on('emojiCreate', async (emoji) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, emoji.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await emoji.guild.fetchAuditLogs({
                type: AuditLogEvent.EmojiCreate,
                limit: 1,
            });
            
            const createLog = auditLogs.entries.first();
            const creator = createLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const embed = new EmbedBuilder()
                .setTitle('Emoji Criado')
                .setColor(COLORS.POSITIVE)
                .setThumbnail(emoji.url)
                .addFields(
                    { name: 'Nome', value: emoji.name, inline: true },
                    { name: 'Animado', value: emoji.animated ? 'Sim' : 'Não', inline: true },
                    { name: 'Criado por', value: `<@${creator.id}> (${creator.tag})`, inline: true },
                    { name: 'Código para Uso', value: `\`<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>\``, inline: false },
                    { name: 'ID do Emoji', value: emoji.id, inline: false }
                )
                .setFooter({ text: `ID do servidor: ${emoji.guild.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar criação de emoji:', error);
        }
    });
    
    client.on('emojiDelete', async (emoji) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, emoji.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await emoji.guild.fetchAuditLogs({
                type: AuditLogEvent.EmojiDelete,
                limit: 1,
            });
            
            const deleteLog = auditLogs.entries.first();
            const deleter = deleteLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const embed = new EmbedBuilder()
                .setTitle('Emoji Excluído')
                .setColor(COLORS.NEGATIVE)
                .setThumbnail(emoji.url)
                .addFields(
                    { name: 'Nome', value: emoji.name, inline: true },
                    { name: 'Animado', value: emoji.animated ? 'Sim' : 'Não', inline: true },
                    { name: 'Excluído por', value: `<@${deleter.id}> (${deleter.tag})`, inline: true },
                    { name: 'ID do Emoji', value: emoji.id, inline: false }
                )
                .setFooter({ text: `ID do servidor: ${emoji.guild.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar exclusão de emoji:', error);
        }
    });
    
    client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, newEmoji.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await newEmoji.guild.fetchAuditLogs({
                type: AuditLogEvent.EmojiUpdate,
                limit: 1,
            });
            
            const updateLog = auditLogs.entries.first();
            const updater = updateLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            if (oldEmoji.name === newEmoji.name) return;
            
            const embed = new EmbedBuilder()
                .setTitle('Emoji Atualizado')
                .setColor(COLORS.NEUTRAL)
                .setThumbnail(newEmoji.url)
                .addFields(
                    { name: 'Nome Antigo', value: oldEmoji.name, inline: true },
                    { name: 'Nome Novo', value: newEmoji.name, inline: true },
                    { name: 'Atualizado por', value: `<@${updater.id}> (${updater.tag})`, inline: false },
                    { name: 'Código para Uso', value: `\`<${newEmoji.animated ? 'a' : ''}:${newEmoji.name}:${newEmoji.id}>\``, inline: false },
                    { name: 'ID do Emoji', value: newEmoji.id, inline: false }
                )
                .setFooter({ text: `ID do servidor: ${newEmoji.guild.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar atualização de emoji:', error);
        }
    });
    
    client.on('stickerCreate', async (sticker) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, sticker.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await sticker.guild.fetchAuditLogs({
                type: AuditLogEvent.StickerCreate,
                limit: 1,
            });
            
            const createLog = auditLogs.entries.first();
            const creator = createLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const embed = new EmbedBuilder()
                .setTitle('Figurinha Criada')
                .setColor(COLORS.POSITIVE)
                .setImage(sticker.url)
                .addFields(
                    { name: 'Nome', value: sticker.name, inline: true },
                    { name: 'Descrição', value: sticker.description || 'Nenhuma descrição', inline: true },
                    { name: 'Formato', value: sticker.format, inline: true },
                    { name: 'Tags', value: sticker.tags || 'Nenhuma tag', inline: true },
                    { name: 'Criado por', value: `<@${creator.id}> (${creator.tag})`, inline: true },
                    { name: 'ID da Figurinha', value: sticker.id, inline: false }
                )
                .setFooter({ text: `ID do servidor: ${sticker.guild.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar criação de figurinha:', error);
        }
    });
    
    client.on('stickerDelete', async (sticker) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, sticker.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await sticker.guild.fetchAuditLogs({
                type: AuditLogEvent.StickerDelete,
                limit: 1,
            });
            
            const deleteLog = auditLogs.entries.first();
            const deleter = deleteLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const embed = new EmbedBuilder()
                .setTitle('Figurinha Excluída')
                .setColor(COLORS.NEGATIVE)
                .setImage(sticker.url)
                .addFields(
                    { name: 'Nome', value: sticker.name, inline: true },
                    { name: 'Descrição', value: sticker.description || 'Nenhuma descrição', inline: true },
                    { name: 'Formato', value: sticker.format, inline: true },
                    { name: 'Tags', value: sticker.tags || 'Nenhuma tag', inline: true },
                    { name: 'Excluído por', value: `<@${deleter.id}> (${deleter.tag})`, inline: true },
                    { name: 'ID da Figurinha', value: sticker.id, inline: false }
                )
                .setFooter({ text: `ID do servidor: ${sticker.guild.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar exclusão de figurinha:', error);
        }
    });
    
    client.on('stickerUpdate', async (oldSticker, newSticker) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, newSticker.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await newSticker.guild.fetchAuditLogs({
                type: AuditLogEvent.StickerUpdate,
                limit: 1,
            });
            
            const updateLog = auditLogs.entries.first();
            const updater = updateLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const changes = [];
            
            if (oldSticker.name !== newSticker.name) {
                changes.push({
                    name: 'Nome',
                    value: `**Antigo:** ${oldSticker.name}\n**Novo:** ${newSticker.name}`,
                    inline: false
                });
            }
            
            if (oldSticker.description !== newSticker.description) {
                changes.push({
                    name: 'Descrição',
                    value: `**Antiga:** ${oldSticker.description || 'Nenhuma descrição'}\n**Nova:** ${newSticker.description || 'Nenhuma descrição'}`,
                    inline: false
                });
            }
            
            if (oldSticker.tags !== newSticker.tags) {
                changes.push({
                    name: 'Tags',
                    value: `**Antigas:** ${oldSticker.tags || 'Nenhuma tag'}\n**Novas:** ${newSticker.tags || 'Nenhuma tag'}`,
                    inline: false
                });
            }
            
            if (changes.length === 0) return;
            
            const embed = new EmbedBuilder()
                .setTitle('Figurinha Atualizada')
                .setColor(COLORS.NEUTRAL)
                .setImage(newSticker.url)
                .setDescription(`A figurinha foi atualizada por <@${updater.id}> (${updater.tag})`)
                .addFields(changes)
                .addFields({ name: 'ID da Figurinha', value: newSticker.id, inline: false })
                .setFooter({ text: `ID do servidor: ${newSticker.guild.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar atualização de figurinha:', error);
        }
    });
}

function setupServerSettingsHandlers(client, configCollection) {
    client.on('guildUpdate', async (oldGuild, newGuild) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, newGuild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await newGuild.fetchAuditLogs({
                type: AuditLogEvent.GuildUpdate,
                limit: 1,
            });
            
            const updateLog = auditLogs.entries.first();
            const updater = updateLog?.executor || { tag: 'Desconhecido', id: 'Desconhecido' };
            
            const changes = [];
            let thumbnailUrl = null;
            let imageUrl = null;
            
            if (oldGuild.name !== newGuild.name) {
                changes.push({
                    name: 'Nome do Servidor',
                    value: `**Antigo:** ${oldGuild.name}\n**Novo:** ${newGuild.name}`,
                    inline: false
                });
            }
            
            if (oldGuild.icon !== newGuild.icon) {
                changes.push({
                    name: 'Ícone do Servidor',
                    value: 'O ícone do servidor foi alterado.',
                    inline: false
                });
                
                if (oldGuild.icon) {
                    thumbnailUrl = oldGuild.iconURL({ dynamic: true, size: 256 });
                }
                
                if (newGuild.icon) {
                    imageUrl = newGuild.iconURL({ dynamic: true, size: 256 });
                }
            }
            
            if (oldGuild.banner !== newGuild.banner) {
                changes.push({
                    name: 'Banner do Servidor',
                    value: 'O banner do servidor foi alterado.',
                    inline: false
                });
                
                if (thumbnailUrl === null && imageUrl === null) {
                    if (oldGuild.banner) {
                        thumbnailUrl = oldGuild.bannerURL({ dynamic: true, size: 256 });
                    }
                    
                    if (newGuild.banner) {
                        imageUrl = newGuild.bannerURL({ dynamic: true, size: 256 });
                    }
                }
            }
            
            if (oldGuild.splash !== newGuild.splash) {
                changes.push({
                    name: 'Splash do Servidor',
                    value: 'O background de convite do servidor foi alterado.',
                    inline: false
                });
            }
            
            if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
                changes.push({
                    name: 'Canal AFK',
                    value: `**Antigo:** ${oldGuild.afkChannelId ? `<#${oldGuild.afkChannelId}>` : 'Nenhum'}\n**Novo:** ${newGuild.afkChannelId ? `<#${newGuild.afkChannelId}>` : 'Nenhum'}`,
                    inline: false
                });
            }
            
            if (oldGuild.afkTimeout !== newGuild.afkTimeout) {
                changes.push({
                    name: 'Tempo de AFK',
                    value: `**Antigo:** ${formatAFKTimeout(oldGuild.afkTimeout)}\n**Novo:** ${formatAFKTimeout(newGuild.afkTimeout)}`,
                    inline: false
                });
            }
            
            if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) {
                changes.push({
                    name: 'Notificações Padrão',
                    value: `**Antigo:** ${formatNotificationLevel(oldGuild.defaultMessageNotifications)}\n**Novo:** ${formatNotificationLevel(newGuild.defaultMessageNotifications)}`,
                    inline: false
                });
            }
            
            if (oldGuild.systemChannelId !== newGuild.systemChannelId) {
                changes.push({
                    name: 'Canal de Sistema',
                    value: `**Antigo:** ${oldGuild.systemChannelId ? `<#${oldGuild.systemChannelId}>` : 'Nenhum'}\n**Novo:** ${newGuild.systemChannelId ? `<#${newGuild.systemChannelId}>` : 'Nenhum'}`,
                    inline: false
                });
            }
            
            if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
                changes.push({
                    name: 'Nível de Verificação',
                    value: `**Antigo:** ${formatVerificationLevel(oldGuild.verificationLevel)}\n**Novo:** ${formatVerificationLevel(newGuild.verificationLevel)}`,
                    inline: false
                });
            }
            
            if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
                changes.push({
                    name: 'Filtro de Conteúdo Explícito',
                    value: `**Antigo:** ${formatExplicitContentFilter(oldGuild.explicitContentFilter)}\n**Novo:** ${formatExplicitContentFilter(newGuild.explicitContentFilter)}`,
                    inline: false
                });
            }
            
            if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
                changes.push({
                    name: 'URL Personalizado',
                    value: `**Antigo:** ${oldGuild.vanityURLCode || 'Nenhum'}\n**Novo:** ${newGuild.vanityURLCode || 'Nenhum'}`,
                    inline: false
                });
            }
            
            if (changes.length === 0) return;
            
            const embed = new EmbedBuilder()
                .setTitle('Configurações do Servidor Atualizadas')
                .setColor(COLORS.NEUTRAL)
                .setDescription(`As configurações do servidor foram atualizadas por <@${updater.id}> (${updater.tag})`)
                .addFields(changes)
                .setFooter({ text: `ID do servidor: ${newGuild.id}` })
                .setTimestamp();
            
            if (thumbnailUrl) {
                embed.setThumbnail(thumbnailUrl);
            }
            
            if (imageUrl) {
                embed.setImage(imageUrl);
            }
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar atualização do servidor:', error);
        }
    });
    
    client.on('webhooksUpdate', async (channel) => {
        try {
            const serverLogChannel = await findServerLogChannel(configCollection, channel.guild.id);
            if (!serverLogChannel) return;
            
            const auditLogs = await channel.guild.fetchAuditLogs({
                limit: 1
            });
            
            const webhookLog = auditLogs.entries.first();
            if (!webhookLog) return;
            
            const executor = webhookLog.executor;
            let action, title, color;
            
            if (webhookLog.action === AuditLogEvent.WebhookCreate) {
                action = 'criou';
                title = 'Webhook Criado';
                color = COLORS.POSITIVE;
            } else if (webhookLog.action === AuditLogEvent.WebhookUpdate) {
                action = 'atualizou';
                title = 'Webhook Atualizado';
                color = COLORS.NEUTRAL;
            } else if (webhookLog.action === AuditLogEvent.WebhookDelete) {
                action = 'excluiu';
                title = 'Webhook Excluído';
                color = COLORS.NEGATIVE;
            } else {
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor(color)
                .setDescription(`<@${executor.id}> (${executor.tag}) ${action} um webhook no canal <#${channel.id}>.`)
                .addFields(
                    { name: 'Canal', value: `<#${channel.id}>`, inline: true },
                    { name: 'Nome do Webhook', value: webhookLog.target ? webhookLog.target.name : 'Desconhecido', inline: true },
                )
                .setFooter({ text: `ID do canal: ${channel.id}` })
                .setTimestamp();
            
            await serverLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao registrar evento de webhook:', error);
        }
    });
}

async function findServerLogChannel(configCollection, guildId) {
    try {
        const channelConfig = await configCollection.findOne({ _id: 'canais' });
        if (!channelConfig || !channelConfig.categorias) {
            console.log('Documento de canais não encontrado ou sem categorias');
            return null;
        }
        
        let serverLogChannelId = null;
        
        for (const categoria of channelConfig.categorias) {
            if (categoria.nome === 'somente-adm') {
                const serverlogsChannel = categoria.canais.find(canal => canal.nome === 'registro-servidor');
                if (serverlogsChannel) {
                    serverLogChannelId = serverlogsChannel.id;
                    break;
                }
            }
        }
        
        if (!serverLogChannelId) {
            for (const categoria of channelConfig.categorias) {
                if (!categoria.canais || !Array.isArray(categoria.canais)) continue;
                
                const serverlogsChannel = categoria.canais.find(canal => canal.nome === 'registro-servidor');
                if (serverlogsChannel) {
                    serverLogChannelId = serverlogsChannel.id;
                    break;
                }
            }
        }
        
        if (!serverLogChannelId) {
            console.log('Canal de logs de servidor não encontrado em nenhuma categoria');
            return null;
        }
        
        const guild = await global.ignisContext.client.guilds.fetch(guildId);
        const logChannel = await guild.channels.fetch(serverLogChannelId);
        
        if (!logChannel) {
            console.log(`Canal com ID ${serverLogChannelId} não encontrado no Discord`);
            return null;
        }
        
        console.log(`Canal de logs de servidor encontrado: ${logChannel.name} (${serverLogChannelId})`);
        return logChannel;
    } catch (error) {
        console.error('Erro ao buscar canal de log de servidor:', error);
        return null;
    }
}

function formatChannelType(type) {
    const typeMap = {
        0: 'Texto',
        1: 'DM',
        2: 'Voz',
        3: 'Grupo',
        4: 'Categoria',
        5: 'Anúncio',
        10: 'Thread de Anúncio',
        11: 'Thread Pública',
        12: 'Thread Privada',
        13: 'Palco',
        14: 'Diretório',
        15: 'Fórum',
        16: 'Mídia'
    };
    
    return typeMap[type] || `Desconhecido (${type})`;
}

function formatPermission(permission) {
    const permissionMap = {
        'CREATE_INSTANT_INVITE': 'Criar Convite Instantâneo',
        'KICK_MEMBERS': 'Expulsar Membros',
        'BAN_MEMBERS': 'Banir Membros',
        'ADMINISTRATOR': 'Administrador',
        'MANAGE_CHANNELS': 'Gerenciar Canais',
        'MANAGE_GUILD': 'Gerenciar Servidor',
        'ADD_REACTIONS': 'Adicionar Reações',
        'VIEW_AUDIT_LOG': 'Ver Registro de Auditoria',
        'PRIORITY_SPEAKER': 'Voz Prioritária',
        'STREAM': 'Transmitir',
        'VIEW_CHANNEL': 'Ver Canal',
        'SEND_MESSAGES': 'Enviar Mensagens',
        'SEND_TTS_MESSAGES': 'Enviar Mensagens TTS',
        'MANAGE_MESSAGES': 'Gerenciar Mensagens',
        'EMBED_LINKS': 'Incorporar Links',
        'ATTACH_FILES': 'Anexar Arquivos',
        'READ_MESSAGE_HISTORY': 'Ler Histórico de Mensagens',
        'MENTION_EVERYONE': 'Mencionar @everyone',
        'USE_EXTERNAL_EMOJIS': 'Usar Emojis Externos',
        'VIEW_GUILD_INSIGHTS': 'Ver Insights do Servidor',
        'CONNECT': 'Conectar',
        'SPEAK': 'Falar',
        'MUTE_MEMBERS': 'Silenciar Membros',
        'DEAFEN_MEMBERS': 'Ensurdecer Membros',
        'MOVE_MEMBERS': 'Mover Membros',
        'USE_VAD': 'Usar Detecção de Voz',
        'CHANGE_NICKNAME': 'Alterar Apelido',
        'MANAGE_NICKNAMES': 'Gerenciar Apelidos',
        'MANAGE_ROLES': 'Gerenciar Cargos',
        'MANAGE_WEBHOOKS': 'Gerenciar Webhooks',
        'MANAGE_EMOJIS_AND_STICKERS': 'Gerenciar Emojis e Figurinhas',
        'USE_APPLICATION_COMMANDS': 'Usar Comandos de Aplicativos',
        'REQUEST_TO_SPEAK': 'Pedir para Falar',
        'MANAGE_EVENTS': 'Gerenciar Eventos',
        'MANAGE_THREADS': 'Gerenciar Threads',
        'CREATE_PUBLIC_THREADS': 'Criar Threads Públicas',
        'CREATE_PRIVATE_THREADS': 'Criar Threads Privadas',
        'USE_EXTERNAL_STICKERS': 'Usar Figurinhas Externas',
        'SEND_MESSAGES_IN_THREADS': 'Enviar Mensagens em Threads',
        'START_EMBEDDED_ACTIVITIES': 'Iniciar Atividades Incorporadas',
        'MODERATE_MEMBERS': 'Moderar Membros',
        'USE_SOUNDBOARD': 'Usar Soundboard',
        'CREATE_GUILD_EXPRESSIONS': 'Criar Expressões do Servidor',
        'CREATE_EVENTS': 'Criar Eventos',
        'USE_EXTERNAL_SOUNDS': 'Usar Sons Externos'
    };
    
    return permissionMap[permission] || permission;
}

function formatSlowmode(seconds) {
    if (seconds === 0) return 'Desativado';
    if (seconds < 60) return `${seconds} segundos`;
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    }
    if (seconds < 21600) {
        const hours = Math.floor(seconds / 3600);
        return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    }
    return `${seconds} segundos`;
}

function formatAFKTimeout(seconds) {
    if (seconds === 60) return '1 minuto';
    if (seconds === 300) return '5 minutos';
    if (seconds === 900) return '15 minutos';
    if (seconds === 1800) return '30 minutos';
    if (seconds === 3600) return '1 hora';
    return `${seconds} segundos`;
}

function formatNotificationLevel(level) {
    switch (level) {
        case 0: return 'Todas as mensagens';
        case 1: return 'Apenas menções';
        default: return `Desconhecido (${level})`;
    }
}

function formatVerificationLevel(level) {
    switch (level) {
        case 0: return 'Nenhuma';
        case 1: return 'Baixa';
        case 2: return 'Média';
        case 3: return 'Alta';
        case 4: return 'Muito Alta';
        default: return `Desconhecido (${level})`;
    }
}

function formatExplicitContentFilter(level) {
    switch (level) {
        case 0: return 'Desativado';
        case 1: return 'Membros sem cargos';
        case 2: return 'Todos os membros';
        default: return `Desconhecido (${level})`;
    }
}

module.exports = { initialize };