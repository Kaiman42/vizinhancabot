const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');

// Utilitário para criar embeds de log
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

module.exports = (client, logChannelId) => {
    function getLogChannel(guild) {
        return guild.channels.cache.get(logChannelId);
    }

    // Entrada de membro/bot
    client.on(Events.GuildMemberAdd, member => {
        const logChannel = getLogChannel(member.guild);
        if (!logChannel) return;
        const embed = criarEmbed({
            cor: member.user.bot ? 0x5865F2 : 0x57F287,
            titulo: member.user.bot ? '🤖 Bot entrou' : '👤 Membro entrou',
            descricao: `${member.user.tag} (${member.id}) entrou no servidor.`,
            thumb: member.user.displayAvatarURL({ dynamic: true })
        });
        logChannel.send({ embeds: [embed] });
    });

    // Saída de membro/bot
    client.on(Events.GuildMemberRemove, async member => {
        const logChannel = getLogChannel(member.guild);
        if (!logChannel) return;
        let titulo = member.user.bot ? '🤖 Bot saiu' : '👤 Membro saiu';
        let descricao = `${member.user.tag} (${member.id}) saiu do servidor.`;
        // Tenta identificar se foi kick
        try {
            const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
            const kick = audit.entries.first();
            if (kick && kick.target.id === member.id && Date.now() - kick.createdTimestamp < 5000) {
                titulo = member.user.bot ? '🤖 Bot expulso' : '👤 Membro expulso';
                descricao = `${member.user.tag} (${member.id}) foi expulso do servidor por ${kick.executor.tag}.\nMotivo: ${kick.reason || 'Não informado'}`;
            }
        } catch {}
        const embed = criarEmbed({
            cor: member.user.bot ? 0x5865F2 : 0xED4245,
            titulo,
            descricao,
            thumb: member.user.displayAvatarURL({ dynamic: true })
        });
        logChannel.send({ embeds: [embed] });
    });

    // Banimento
    client.on(Events.GuildBanAdd, async ban => {
        const logChannel = getLogChannel(ban.guild);
        if (!logChannel) return;
        let executor = 'Desconhecido';
        let motivo = 'Não informado';
        try {
            const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
            const entry = audit.entries.first();
            if (entry && entry.target.id === ban.user.id) {
                executor = entry.executor.tag;
                motivo = entry.reason || motivo;
            }
        } catch {}
        const embed = criarEmbed({
            cor: 0xED4245,
            titulo: '🚫 Usuário Banido',
            descricao: `${ban.user.tag} (${ban.user.id}) foi banido.\nPor: ${executor}\nMotivo: ${motivo}`,
            thumb: ban.user.displayAvatarURL({ dynamic: true })
        });
        logChannel.send({ embeds: [embed] });
    });

    // Desbanimento
    client.on(Events.GuildBanRemove, async ban => {
        const logChannel = getLogChannel(ban.guild);
        if (!logChannel) return;
        let executor = 'Desconhecido';
        try {
            const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
            const entry = audit.entries.first();
            if (entry && entry.target.id === ban.user.id) {
                executor = entry.executor.tag;
            }
        } catch {}
        const embed = criarEmbed({
            cor: 0x57F287,
            titulo: '♻️ Usuário Desbanido',
            descricao: `${ban.user.tag} (${ban.user.id}) foi desbanido.\nPor: ${executor}`,
            thumb: ban.user.displayAvatarURL({ dynamic: true })
        });
        logChannel.send({ embeds: [embed] });
    });

    // Atualização de cargos
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        if (newMember.user.bot) return;
        const logChannel = getLogChannel(newMember.guild);
        if (!logChannel) return;
        // Cargos adicionados/removidos
        const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
        const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
        if (added.size || removed.size) {
            let executor = 'Desconhecido';
            try {
                const audit = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 1 });
                const entry = audit.entries.first();
                if (entry && entry.target.id === newMember.id) executor = entry.executor.tag;
            } catch {}
            const campos = [];
            if (added.size) campos.push({ name: 'Cargos Adicionados', value: added.map(r => `<@&${r.id}>`).join(', '), inline: false });
            if (removed.size) campos.push({ name: 'Cargos Removidos', value: removed.map(r => `<@&${r.id}>`).join(', '), inline: false });
            campos.push({ name: 'Alterado por', value: executor, inline: false });
            const embed = criarEmbed({
                cor: 0xFFA500,
                titulo: '🔄 Atualização de Cargos',
                thumb: newMember.user.displayAvatarURL({ dynamic: true }),
                campos
            });
            logChannel.send({ embeds: [embed] });
        }
        // Timeout
        if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
            let executor = 'Desconhecido';
            let motivo = 'Não informado';
            try {
                const audit = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 5 });
                const entry = audit.entries.find(e =>
                    e.target.id === newMember.id &&
                    e.changes.some(c => c.key === 'communication_disabled_until')
                );
                if (entry) {
                    executor = entry.executor.tag;
                    motivo = entry.reason || motivo;
                }
            } catch {}
            const embed = criarEmbed({
                cor: 0xED4245,
                titulo: '⏳ Timeout aplicado',
                descricao: `${newMember.user.tag} (${newMember.id}) recebeu timeout até <t:${Math.floor(new Date(newMember.communicationDisabledUntil).getTime()/1000)}:F>.\nPor: ${executor}\nMotivo: ${motivo}`,
                thumb: newMember.user.displayAvatarURL({ dynamic: true })
            });
            logChannel.send({ embeds: [embed] });
        }
        // Remoção de timeout
        if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil) {
            let executor = 'Desconhecido';
            try {
                const audit = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 5 });
                const entry = audit.entries.find(e =>
                    e.target.id === newMember.id &&
                    e.changes.some(c => c.key === 'communication_disabled_until' && c.old !== null && c.new === null)
                );
                if (entry) executor = entry.executor.tag;
            } catch {}
            const embed = criarEmbed({
                cor: 0x57F287,
                titulo: '⏳ Timeout removido',
                descricao: `${newMember.user.tag} (${newMember.id}) teve o timeout removido.\nPor: ${executor}`,
                thumb: newMember.user.displayAvatarURL({ dynamic: true })
            });
            logChannel.send({ embeds: [embed] });
        }
        // Alteração de apelido
        if (oldMember.nickname !== newMember.nickname) {
            let executor = 'Desconhecido';
            try {
                const audit = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
                const entry = audit.entries.first();
                if (entry && entry.target.id === newMember.id && entry.changes.some(c => c.key === 'nick')) {
                    executor = entry.executor.tag;
                }
            } catch {}
            const embed = criarEmbed({
                cor: 0xFFA500,
                titulo: '✏️ Apelido alterado',
                descricao: `De: ${oldMember.nickname || 'Nenhum'}\nPara: ${newMember.nickname || 'Nenhum'}\nPor: ${executor}`,
                thumb: newMember.user.displayAvatarURL({ dynamic: true })
            });
            logChannel.send({ embeds: [embed] });
        }
    });

    // Atualização de perfil do usuário (nome/avatar)
    client.on(Events.UserUpdate, async (oldUser, newUser) => {
        if (newUser.bot) return;
        const changedUsername = oldUser.username !== newUser.username || oldUser.discriminator !== newUser.discriminator;
        const changedAvatar = oldUser.avatar !== newUser.avatar;
        if (!changedUsername && !changedAvatar) return;
        for (const guild of client.guilds.cache.values()) {
            const member = guild.members.cache.get(newUser.id);
            if (!member) continue;
            const logChannel = getLogChannel(guild);
            if (!logChannel) continue;
            const campos = [];
            if (changedUsername) campos.push({ name: 'Nome de usuário alterado', value: `De: ${oldUser.tag}\nPara: ${newUser.tag}` });
            if (changedAvatar) campos.push({ name: 'Avatar alterado', value: `[Ver novo avatar](${newUser.displayAvatarURL({ dynamic: true })})` });
            const embed = criarEmbed({
                cor: 0xFFA500,
                titulo: '📝 Perfil atualizado',
                descricao: `Usuário: ${newUser.tag} (${newUser.id})`,
                thumb: newUser.displayAvatarURL({ dynamic: true }),
                campos
            });
            logChannel.send({ embeds: [embed] });
        }
    });

    // Atualização de estado de voz
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;
        const logChannel = getLogChannel(newState.guild);
        if (!logChannel) return;
        if (!oldState.channel && newState.channel) {
            const embed = criarEmbed({
                cor: 0x57F287,
                titulo: 'MEMBER_MOVE',
                descricao: `<@${member.id}> entrou em <#${newState.channel.id}>`
            });
            logChannel.send({ embeds: [embed] });
        } else if (oldState.channel && !newState.channel) {
            const embed = criarEmbed({
                cor: 0xED4245,
                titulo: 'MEMBER_DISCONNECT',
                descricao: `<@${member.id}> saiu de <#${oldState.channel.id}>`
            });
            logChannel.send({ embeds: [embed] });
        } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
            const embed = criarEmbed({
                cor: 0xFFA500,
                titulo: 'MEMBER_MOVE',
                descricao: `<@${member.id}> moveu-se de <#${oldState.channel.id}> para <#${newState.channel.id}>`
            });
            logChannel.send({ embeds: [embed] });
        }
    });
};