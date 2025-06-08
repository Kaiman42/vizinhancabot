const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { getCollection } = require('../mongodb');
const setupRoleHandlers = require('../handlers/roleHandlers');
const setupEmojiStickersHandlers = require('../handlers/emojiStickersHandlers');
const setupServerSettingsHandlers = require('../handlers/serverSettingsHandlers');

const DISCORD_PERMISSOES = {
    CREATE_INSTANT_INVITE: 'Criar Convite Instantâneo',
    ADMINISTRATOR: 'Administrador',
    MANAGE_CHANNELS: 'Gerenciar Canais',
    MANAGE_GUILD: 'Gerenciar Servidor',
    ADD_REACTIONS: 'Adicionar Reações',
    VIEW_AUDIT_LOG: 'Ver Registro de Auditoria',
    PRIORITY_SPEAKER: 'Voz Prioritária',
    STREAM: 'Transmitir',
    VIEW_CHANNEL: 'Ver Canal',
    SEND_MESSAGES: 'Enviar Mensagens',
    SEND_TTS_MESSAGES: 'Enviar Mensagens TTS',
    MANAGE_MESSAGES: 'Gerenciar Mensagens',
    EMBED_LINKS: 'Incorporar Links',
    ATTACH_FILES: 'Anexar Arquivos',
    READ_MESSAGE_HISTORY: 'Ler Histórico de Mensagens',
    MENTION_EVERYONE: 'Mencionar @everyone',
    USE_EXTERNAL_EMOJIS: 'Usar Emojis Externos',
    VIEW_GUILD_INSIGHTS: 'Ver Insights do Servidor',
    CONNECT: 'Conectar',
    SPEAK: 'Falar',
    USE_VAD: 'Usar Detecção de Voz',
    CHANGE_NICKNAME: 'Alterar Apelido',
    MANAGE_NICKNAMES: 'Gerenciar Apelidos',
    MANAGE_ROLES: 'Gerenciar Cargos',
    MANAGE_WEBHOOKS: 'Gerenciar Webhooks',
    MANAGE_EMOJIS_AND_STICKERS: 'Gerenciar Emojis e Figurinhas',
    USE_APPLICATION_COMMANDS: 'Usar Comandos de Aplicativos',
    REQUEST_TO_SPEAK: 'Pedir para Falar',
    MANAGE_EVENTS: 'Gerenciar Eventos',
    MANAGE_THREADS: 'Gerenciar Threads',
    CREATE_PUBLIC_THREADS: 'Criar Threads Públicas',
    CREATE_PRIVATE_THREADS: 'Criar Threads Privadas',
    USE_EXTERNAL_STICKERS: 'Usar Figurinhas Externas',
    SEND_MESSAGES_IN_THREADS: 'Enviar Mensagens em Threads',
    START_EMBEDDED_ACTIVITIES: 'Iniciar Atividades Incorporadas',
    USE_SOUNDBOARD: 'Usar Soundboard',
    CREATE_GUILD_EXPRESSIONS: 'Criar Expressões do Servidor',
    CREATE_EVENTS: 'Criar Eventos',
    USE_EXTERNAL_SOUNDS: 'Usar Sons Externos'
};

async function registrarAcaoServidor(acao, executor, detalhes = {}, guildId, client, configCollection) {
    const logChannel = await findServerLogChannel(client, configCollection, guildId);
    if (!logChannel) return;
    
    const embed = new EmbedBuilder()
        .setTitle(`${acao}`)
        .addFields([
            { name: 'Executor', value: `<@${executor.id}>`, inline: true },
            ...Object.entries(detalhes).map(([name, value]) => ({
                name,
                value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
                inline: true
            }))
        ])
        .setFooter({ text: `ID: ${guildId}` })
        .setTimestamp();

    if (detalhes.thumbnail) embed.setThumbnail(detalhes.thumbnail);
    if (detalhes.image) embed.setImage(detalhes.image);
    
    await logChannel.send({ embeds: [embed] });
}

async function findServerLogChannel(client, configCollection, guildId) {
    const config = await configCollection.findOne({ 
        _id: 'canais',
        'categorias.canais.nome': 'registro-servidor'
    });
    if (!config) return null;
    
    const canal = config.categorias
        .flatMap(cat => cat.canais)
        .find(c => c.nome === 'registro-servidor');
        
    if (!canal) return null;
    try {
        const channel = await client.channels.fetch(canal.id);
        return channel && channel.isTextBased() ? channel : null;
    } catch {
        return null;
    }
}

async function setupServerResourceAuditLogHandlers(client, configCollection) {
    client.on('ready', () => {
        client.guilds.cache.forEach(guild => {
            guild.fetchAuditLogs({ limit: 1 }).catch(() => {}); // força cache de audit logs
        });
        console.log('[DEBUG] Evento ready disparado, audit log inicializado.');
    });
    client.on('guildAuditLogEntryCreate', async (entry, guild) => {
        console.log('[DEBUG] Evento guildAuditLogEntryCreate disparado:', entry.action, 'Guild:', guild.id);
        const { action, executor, target } = entry;
        let acao = null;
        let detalhes = {};
        if (action === AuditLogEvent.ChannelCreate) {
            acao = 'Canal criado';
            detalhes = { Nome: target.name, Tipo: target.type };
        } else if (action === AuditLogEvent.ChannelDelete) {
            acao = 'Canal excluído';
            detalhes = { Nome: target.name, Tipo: target.type };
        } else if (action === AuditLogEvent.RoleCreate) {
            acao = 'Cargo criado';
            detalhes = { Nome: target.name, Permissões: target.permissions?.toArray?.().join(', ') };
        } else if (action === AuditLogEvent.RoleDelete) {
            acao = 'Cargo excluído';
            detalhes = { Nome: target.name };
        } else if (action === AuditLogEvent.EmojiCreate) {
            acao = 'Emoji criado';
            detalhes = { Nome: target.name };
        } else if (action === AuditLogEvent.EmojiDelete) {
            acao = 'Emoji excluído';
            detalhes = { Nome: target.name };
        } else if (action === AuditLogEvent.StickerCreate) {
            acao = 'Sticker criado';
            detalhes = { Nome: target.name };
        } else if (action === AuditLogEvent.StickerDelete) {
            acao = 'Sticker excluído';
            detalhes = { Nome: target.name };
        } else if (action === AuditLogEvent.WebhookCreate) {
            acao = 'Webhook criado';
            detalhes = { Nome: target.name };
        } else if (action === AuditLogEvent.WebhookDelete) {
            acao = 'Webhook excluído';
            detalhes = { Nome: target.name };
        } else if (action === AuditLogEvent.ThreadCreate) {
            acao = 'Thread criada';
            detalhes = { Nome: target.name };
        } else if (action === AuditLogEvent.ThreadDelete) {
            acao = 'Thread excluída';
            detalhes = { Nome: target.name };
        }
        if (acao && executor) {
            console.log('[DEBUG] Registrando ação:', acao, detalhes);
            await registrarAcaoServidor(acao, executor, detalhes, guild.id, client, configCollection);
        }
    });
    // Listener manual para criação de canal
    client.on('channelCreate', async channel => {
        const guild = channel.guild;
        if (!guild) return;
        let executor = { tag: 'Desconhecido', id: 'N/A' };
        try {
            const audit = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 5 });
            const entry = audit.entries.find(e => e.target.id === channel.id);
            if (entry && entry.executor) executor = entry.executor;
        } catch {}
        const logChannel = await findServerLogChannel(client, configCollection, guild.id);
        if (!logChannel) return;
        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Canal criado')
            .setDescription(`Nome: ${channel.name}\nID: ${channel.id}\nExecutor: <@${executor.id}> (${executor.tag})`)
            .setTimestamp();
        logChannel.send({ embeds: [embed] });
    });
    // Listener manual para exclusão de canal
    client.on('channelDelete', async channel => {
        const guild = channel.guild;
        if (!guild) return;
        let executor = { tag: 'Desconhecido', id: 'N/A' };
        try {
            const audit = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 5 });
            const entry = audit.entries.find(e => e.target.id === channel.id);
            if (entry && entry.executor) executor = entry.executor;
        } catch {}
        const logChannel = await findServerLogChannel(client, configCollection, guild.id);
        if (!logChannel) return;
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Canal excluído')
            .setDescription(`Nome: ${channel.name}\nID: ${channel.id}\nExecutor: <@${executor.id}> (${executor.tag})`)
            .setTimestamp();
        logChannel.send({ embeds: [embed] });
    });
}

async function initialize(client) {
    const configCollection = getCollection('configuracoes');
    setupRoleHandlers(client, configCollection);
    setupEmojiStickersHandlers(client, configCollection);
    setupServerSettingsHandlers(client, configCollection);
    await setupServerResourceAuditLogHandlers(client, configCollection);
}

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        await initialize(client);
    }
};
