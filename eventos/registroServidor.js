const { EmbedBuilder, AuditLogEvent } = require('discord.js');

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

async function registrarAcaoServidor(acao, executor, detalhes = {}, guildId) {
    const logChannel = await findServerLogChannel(configCollection, guildId);
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

async function initialize(client, ignisContext) {
    const { database } = ignisContext;
    const configCollection = database.collection('configuracoes');
    
    setupRoleHandlers(client, configCollection);
    setupEmojiStickersHandlers(client, configCollection);
    setupServerSettingsHandlers(client, configCollection);
}

async function findServerLogChannel(configCollection, guildId) {
    const config = await configCollection.findOne({ 
        _id: 'canais',
        'categorias.canais.nome': 'registro-servidor'
    });
    if (!config) return null;
    
    const canal = config.categorias
        .flatMap(cat => cat.canais)
        .find(c => c.nome === 'registro-servidor');
        
    return canal ? client.channels.fetch(canal.id) : null;
}

module.exports = { 
    registrarAcaoServidor,
    initialize 
};
