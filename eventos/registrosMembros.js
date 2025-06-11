const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { getRegistroMembrosChannelId, findOne } = require('../mongodb');

const EXECUTOR_DESCONHECIDO = 'Desconhecido';
const MOTIVO_NAO_INFORMADO = 'Não informado';

function criarEmbed({ cor, titulo, descricao, thumb, campos }) {
    const embed = new EmbedBuilder()
        .setColor(cor)
        .setTitle(titulo)
        .setTimestamp();
    if (descricao) embed.setDescription(descricao);
    if (thumb) embed.setThumbnail(thumb);
    if (campos) embed.addFields(campos);
    return embed;
}

// Reescrever getStatusConfig para usar findOne utilitário
async function getStatusConfig() {
    return await findOne('configuracoes', { _id: 'status' });
}

async function getExecutorFromAudit(guild, type, targetId, extraFilter) {
    try {
        const audit = await guild.fetchAuditLogs({ type, limit: 5 });
        let entry = audit.entries.find(e => e.target.id === targetId);
        if (extraFilter) entry = audit.entries.find(e => e.target.id === targetId && extraFilter(e));
        return entry && entry.executor ? entry.executor.tag : EXECUTOR_DESCONHECIDO;
    } catch {
        return EXECUTOR_DESCONHECIDO;
    }
}

async function getMotivoFromAudit(guild, type, targetId, extraFilter) {
    try {
        const audit = await guild.fetchAuditLogs({ type, limit: 5 });
        let entry = audit.entries.find(e => e.target.id === targetId);
        if (extraFilter) entry = audit.entries.find(e => e.target.id === targetId && extraFilter(e));
        return entry && entry.reason ? entry.reason : MOTIVO_NAO_INFORMADO;
    } catch {
        return MOTIVO_NAO_INFORMADO;
    }
}

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        const mongoUri = process.env.MONGO_URI;
        const statusConfig = await getStatusConfig(mongoUri);
        async function getLogChannel(guild) {
            const canalId = await getRegistroMembrosChannelId(mongoUri);
            if (!canalId) return null;
            const channel = guild.channels.cache.get(canalId);
            if (!channel || !channel.isTextBased?.() || !channel.viewable || !channel.permissionsFor(guild.members.me).has('SendMessages')) {
                return null;
            }
            return channel;
        }

        client.on(Events.GuildMemberAdd, async member => {
            const logChannel = await getLogChannel(member.guild);
            if (!logChannel) return;
            const embed = criarEmbed({
                cor: member.user.bot ? 0x5865F2 : 0x57F287,
                titulo: member.user.bot ? '🤖 Bot entrou no servidor' : '👤 Membro entrou',
                thumb: member.user.displayAvatarURL({ dynamic: true })
            });
            embed.addFields(
                { name: 'Usuário', value: `<@${member.id}>`, inline: false },
                { name: 'Conta criada', value: `<t:${Math.floor(member.user.createdTimestamp/1000)}:R>`, inline: false }
            );
            embed.setFooter({ text: `${member.id}` });
            logChannel.send({ embeds: [embed] });
        });

        client.on(Events.GuildMemberRemove, async member => {
            const logChannel = await getLogChannel(member.guild);
            if (!logChannel) return;
            let titulo = member.user.bot ? '🤖 Bot saiu' : '👤 Membro saiu';
            let cor = member.user.bot ? 0x5865F2 : 0xED4245;
            let executor = null;
            let motivo = null;
            let expulsao = false;
            let kick = null; // Corrigido: definir kick fora do try
            try {
                const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
                kick = audit.entries.first();
                if (kick && kick.target.id === member.id && Date.now() - kick.createdTimestamp < 10000) {
                    titulo = member.user.bot ? '🤖 Bot expulso' : '👤 Membro expulso';
                    executor = kick.executor ? kick.executor.tag : EXECUTOR_DESCONHECIDO;
                    motivo = kick.reason || MOTIVO_NAO_INFORMADO;
                    expulsao = true;
                }
            } catch {}
            const embed = criarEmbed({
                cor,
                titulo,
                thumb: member.user.displayAvatarURL({ dynamic: true })
            });
            embed.addFields(
                { name: 'Usuário', value: `<@${member.id}>`, inline: false },
                { name: 'Conta criada', value: `<t:${Math.floor(member.user.createdTimestamp/1000)}:R>`, inline: false }
            );
            if (expulsao) {
                embed.addFields(
                    { name: 'Executor', value: `<@${kick.executor?.id || ''}>`, inline: false },
                    { name: 'Motivo', value: `\`${motivo}\``, inline: false }
                );
            }
            embed.setFooter({ text: `${member.id}` });
            logChannel.send({ embeds: [embed] });
        });

        client.on(Events.GuildBanAdd, async ban => {
            const logChannel = await getLogChannel(ban.guild);
            if (!logChannel) return;
            const executor = await getExecutorFromAudit(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
            const motivo = await getMotivoFromAudit(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
            const embed = criarEmbed({
                cor: 0xED4245,
                titulo: '🚫 Usuário Banido',
                descricao: `<@${ban.user.id}> foi banido do servidor.`,
                thumb: ban.user.displayAvatarURL({ dynamic: true })
            });
            embed.addFields(
                { name: 'Conta criada', value: `<t:${Math.floor(ban.user.createdTimestamp/1000)}:R>`, inline: false },
                { name: 'Executor', value: executor, inline: false },
                { name: 'Motivo', value: motivo, inline: false }
            );
            embed.setFooter({ text: `${ban.user.id}` });
            logChannel.send({ embeds: [embed] });
        });

        client.on(Events.GuildBanRemove, async ban => {
            const logChannel = await getLogChannel(ban.guild);
            if (!logChannel) return;
            const executor = await getExecutorFromAudit(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
            const embed = criarEmbed({
                cor: 0x57F287,
                titulo: '♻️ Usuário Desbanido',
                descricao: `<@${ban.user.id}> foi desbanido do servidor.`,
                thumb: ban.user.displayAvatarURL({ dynamic: true })
            });
            embed.addFields(
                { name: 'Executor', value: executor, inline: false }
            );
            embed.setFooter({ text: `${ban.user.id}` });
            logChannel.send({ embeds: [embed] });
        });

        client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
            if (newMember.user.bot) return;
            const logChannel = await getLogChannel(newMember.guild);
            if (!logChannel) return;
            // Log de boost iniciado
            if (!oldMember.premiumSince && newMember.premiumSince) {
                const executor = await getExecutorFromAudit(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id, e => e.changes.some(c => c.key === 'premium_since'));
                const totalBoosts = newMember.guild.premiumSubscriptionCount || 0;
                const embed = criarEmbed({
                    cor: 0xF47FFF,
                    titulo: '🚀 Impulsionamento iniciado',
                    descricao: `<@${newMember.id}> começou a impulsionar o servidor.`,
                    thumb: newMember.user.displayAvatarURL({ dynamic: true })
                });
                embed.addFields(
                    { name: 'Executor', value: executor, inline: false },
                    { name: 'Total de boosts', value: String(totalBoosts), inline: false }
                );
                embed.setFooter({ text: `${newMember.id}` });
                logChannel.send({ embeds: [embed] });
            }
            // Log de boost encerrado
            if (oldMember.premiumSince && !newMember.premiumSince) {
                const executor = await getExecutorFromAudit(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id, e => e.changes.some(c => c.key === 'premium_since'));
                const totalBoosts = newMember.guild.premiumSubscriptionCount || 0;
                const embed = criarEmbed({
                    cor: 0x808080,
                    titulo: '💔 Impulsionamento encerrado',
                    descricao: `<@${newMember.id}> parou de impulsionar o servidor.`,
                    thumb: newMember.user.displayAvatarURL({ dynamic: true })
                });
                embed.addFields(
                    { name: 'Executor', value: executor, inline: false },
                    { name: 'Total de boosts', value: String(totalBoosts), inline: false }
                );
                embed.setFooter({ text: `${newMember.id}` });
                logChannel.send({ embeds: [embed] });
            }
            // Log de boost renovado
            if (oldMember.premiumSince && newMember.premiumSince && oldMember.premiumSince.getTime() !== newMember.premiumSince.getTime()) {
                const executor = await getExecutorFromAudit(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id, e => e.changes.some(c => c.key === 'premium_since'));
                const totalBoosts = newMember.guild.premiumSubscriptionCount || 0;
                const embed = criarEmbed({
                    cor: 0xF47FFF,
                    titulo: '🔄 Impulsionamento renovado',
                    descricao: `<@${newMember.id}> renovou o impulsionamento do servidor.`,
                    thumb: newMember.user.displayAvatarURL({ dynamic: true })
                });
                embed.addFields(
                    { name: 'Executor', value: executor, inline: false },
                    { name: 'Total de boosts', value: String(totalBoosts), inline: false }
                );
                embed.setFooter({ text: `${newMember.id}` });
                logChannel.send({ embeds: [embed] });
            }
            // Atualização de cargos
            const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
            const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
            if (added.size || removed.size) {
                // Buscar o executor como objeto para pegar o ID mencionável
                let executorObj = null;
                try {
                    const audit = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 5 });
                    executorObj = audit.entries.find(e => e.target.id === newMember.id)?.executor;
                } catch {}
                const executorMention = executorObj ? `<@${executorObj.id}>` : EXECUTOR_DESCONHECIDO;
                const campos = [];
                campos.push({ name: '**Usuário**', value: `<@${newMember.id}>`, inline: false });
                campos.push({ name: 'Alterado por', value: executorMention, inline: false });
                if (added.size) campos.push({ name: 'Cargos Adicionados', value: added.map(r => `<@&${r.id}>`).join(', '), inline: false });
                if (removed.size) campos.push({ name: 'Cargos Removidos', value: removed.map(r => `<@&${r.id}>`).join(', '), inline: false });
                const embed = criarEmbed({
                    cor: 0xFFA500,
                    titulo: '🔄 Atualização de Cargos',
                    campos,
                    thumb: newMember.user.displayAvatarURL({ dynamic: true })
                });
                embed.setFooter({ text: `${newMember.id}` });
                logChannel.send({ embeds: [embed] });
            }
            // Timeout aplicado
            if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
                const executor = await getExecutorFromAudit(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id, e => e.changes.some(c => c.key === 'communication_disabled_until'));
                const motivo = await getMotivoFromAudit(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id, e => e.changes.some(c => c.key === 'communication_disabled_until'));
                const embed = criarEmbed({
                    cor: 0xED4245,
                    titulo: '⏳ Timeout aplicado',
                    descricao: `<@${newMember.id}> recebeu timeout.`,
                    thumb: newMember.user.displayAvatarURL({ dynamic: true })
                });
                embed.addFields(
                    { name: 'Executor', value: executor, inline: false },
                    { name: 'Motivo', value: motivo, inline: false },
                    { name: 'Até', value: `<t:${Math.floor(new Date(newMember.communicationDisabledUntil).getTime()/1000)}:F>`, inline: false }
                );
                embed.setFooter({ text: `${newMember.id}` });
                logChannel.send({ embeds: [embed] });
            }
            // Timeout removido
            if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil) {
                const executor = await getExecutorFromAudit(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id, e => e.changes.some(c => c.key === 'communication_disabled_until' && c.old !== null && c.new === null));
                const embed = criarEmbed({
                    cor: 0x57F287,
                    titulo: '⏳ Timeout removido',
                    descricao: `<@${newMember.id}> teve o timeout removido.`,
                    thumb: newMember.user.displayAvatarURL({ dynamic: true })
                });
                embed.addFields(
                    { name: 'Executor', value: executor, inline: false }
                );
                embed.setFooter({ text: `${newMember.id}` });
                logChannel.send({ embeds: [embed] });
            }
            // Apelido alterado
            if (oldMember.nickname !== newMember.nickname) {
                const executor = await getExecutorFromAudit(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id, e => e.changes.some(c => c.key === 'nick'));
                let descricao = '';
                if (!oldMember.nickname && newMember.nickname) {
                    descricao = `<@${newMember.id}> definiu apelido para: ${newMember.nickname}`;
                } else if (oldMember.nickname && !newMember.nickname) {
                    descricao = `<@${newMember.id}> removeu o apelido (resetado para padrão).\nAnterior: ${oldMember.nickname}`;
                } else {
                    descricao = `<@${newMember.id}> alterou o apelido.\nDe: ${oldMember.nickname || 'Nenhum'}\nPara: ${newMember.nickname || 'Nenhum'}`;
                }
                descricao += `\nPor: ${executor}`;
                const embed = criarEmbed({
                    cor: 0xFFA500,
                    titulo: '✏️ Apelido alterado',
                    descricao,
                    thumb: newMember.user.displayAvatarURL({ dynamic: true })
                });
                embed.setFooter({ text: `${newMember.id}` });
                logChannel.send({ embeds: [embed] });
            }
        });

        client.on(Events.UserUpdate, async (oldUser, newUser) => {
            if (newUser.bot) return;
            const changedUsername = oldUser.username !== newUser.username;
            const changedDiscriminator = oldUser.discriminator !== newUser.discriminator;
            const changedAvatar = oldUser.avatar !== newUser.avatar;
            if (!changedUsername && !changedDiscriminator && !changedAvatar) return;
            for (const guild of client.guilds.cache.values()) {
                const member = guild.members.cache.get(newUser.id);
                if (!member) continue;
                const logChannel = await getLogChannel(guild);
                if (!logChannel) continue;
                let descricao = `<@${newUser.id}>`;
                if (changedUsername && changedDiscriminator) {
                    descricao += ` alterou o nome de usuário e discriminador.`;
                } else if (changedUsername) {
                    descricao += ` alterou o nome de usuário.`;
                } else if (changedDiscriminator) {
                    descricao += ` alterou o discriminador.`;
                } else if (changedAvatar) {
                    descricao += ` alterou o avatar.`;
                }
                if (changedUsername) {
                    descricao += `\nDe: ${oldUser.username}\nPara: ${newUser.username}`;
                }
                if (changedDiscriminator) {
                    descricao += `\nDe: #${oldUser.discriminator}\nPara: #${newUser.discriminator}`;
                }
                const embed = criarEmbed({
                    cor: 0xFFA500,
                    titulo: '📝 Perfil atualizado',
                    descricao,
                    thumb: newUser.displayAvatarURL({ dynamic: true })
                });
                embed.setFooter({ text: `ID: ${newUser.id}` });
                embed.setTimestamp();
                logChannel.send({ embeds: [embed] });
            }
        });

        client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
            const member = newState.member || oldState.member;
            if (!member || member.user.bot) return;
            const logChannel = await getLogChannel(newState.guild);
            if (!logChannel) return;
            if (!oldState.channel && newState.channel) {
                const embed = criarEmbed({
                    cor: parseInt(statusConfig.colors.positive.replace('#', ''), 16),
                    titulo: `${statusConfig.emojis.create} Entrou em canal de voz`,
                    descricao: `**Usuário:** <@${member.id}>\n**Canal:** ${newState.channel.toString()}`
                });
                logChannel.send({ embeds: [embed] });
            } else if (oldState.channel && !newState.channel) {
                const embed = criarEmbed({
                    cor: parseInt(statusConfig.colors.negative.replace('#', ''), 16),
                    titulo: `${statusConfig.emojis.delete} Saiu do canal de voz`,
                    descricao: `**Usuário:** <@${member.id}>\n**Canal:** ${oldState.channel.toString()}`
                });
                logChannel.send({ embeds: [embed] });
            } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
                await new Promise(res => setTimeout(res, 700));
                let executor = null;
                try {
                    const audit = await newState.guild.fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: 10 });
                    const entry = audit.entries
                        .filter(e => e && e.target && e.executor && e.target.id === member.id && Date.now() - e.createdTimestamp < 5000)
                        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];
                    if (entry && entry.executor && entry.executor.id !== member.id) executor = entry.executor;
                } catch (err) {
                    console.error('[LOG] Erro ao buscar audit log de MemberMove:', err);
                }
                const titulo = `${statusConfig.emojis.move} Moveu-se de canal de voz`;
                const descricao = `**Usuário:** <@${member.id}>\n**Canal anterior:** ${oldState.channel.toString()}\n**Canal próximo:** ${newState.channel.toString()}`;
                const embed = criarEmbed({
                    cor: parseInt(statusConfig.colors.change.replace('#', ''), 16),
                    titulo,
                    descricao
                });
                logChannel.send({ embeds: [embed] });
            }
        });
    }
};