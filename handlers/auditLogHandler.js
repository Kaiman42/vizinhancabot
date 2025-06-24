const path = require('path');
const fs = require('fs');

const eventosDir = path.join(__dirname, '../eventos/registros/servidor');

// Mapeamento dos códigos numéricos para nomes de eventos
const auditLogEventMap = {
    1: 'GuildUpdate',
    10: 'ChannelCreate',
    11: 'ChannelUpdate',
    12: 'ChannelDelete',
    13: 'ChannelOverwriteCreate',
    15: 'ChannelOverwriteDelete',
    22: 'MemberBanAdd',
    23: 'MemberBanRemove',
    24: 'MemberUpdate',
    25: 'MemberRoleUpdate',
    26: 'MemberMove',
    27: 'MemberDisconnect',
    28: 'BotAdd',
    30: 'RoleCreate',
    31: 'RoleUpdate',
    32: 'RoleDelete',
    40: 'InviteCreate',
    41: 'InviteUpdate',
    42: 'InviteDelete',
    50: 'WebhookCreate',
    51: 'WebhookUpdate',
    52: 'WebhookDelete',
    60: 'EmojiCreate',
    61: 'EmojiUpdate',
    62: 'EmojiDelete',
    72: 'MessageDelete',
    73: 'MessageBulkDelete',
    74: 'MessagePin',
    75: 'MessageUnpin',
    83: 'StageInstanceCreate',
    84: 'StageInstanceUpdate',
    85: 'StageInstanceDelete',
    90: 'StickerCreate',
    91: 'StickerUpdate',
    92: 'StickerDelete',
    100: 'GuildScheduledEventCreate',
    101: 'GuildScheduledEventUpdate',
    102: 'GuildScheduledEventDelete',
    110: 'ThreadCreate',
    111: 'ThreadUpdate',
    112: 'ThreadDelete',
    121: 'ApplicationCommandPermissionUpdate',
    130: 'SoundboardSoundCreate',
    131: 'SoundboardSoundUpdate',
    132: 'SoundboardSoundDelete',
    140: 'AutoModerationRuleCreate',
    141: 'AutoModerationRuleUpdate',
    142: 'AutoModerationRuleDelete',
    143: 'AutoModerationBlockMessage',
    144: 'AutoModerationFlagToChannel',
    145: 'AutoModerationUserCommunicationDisabled',
    150: 'CreatorMonetizationRequestCreated',
    151: 'CreatorMonetizationTermsAccepted',
    163: 'OnboardingPromptCreate',
    164: 'OnboardingPromptUpdate',
    165: 'OnboardingPromptDelete',
    166: 'OnboardingCreate',
    167: 'OnboardingUpdate',
    190: 'HomeSettingsCreate',
    191: 'HomeSettingsUpdate',
};

// Mapeia todos os handlers de eventos de audit log
const handlers = {};
fs.readdirSync(eventosDir).forEach(file => {
    if (file !== 'relatorio.js' && file.endsWith('.js')) {
        const nomeEvento = path.basename(file, '.js');
        handlers[nomeEvento] = require(path.join(eventosDir, file));
    }
});

// Função para ser chamada no evento guildAuditLogEntryCreate
async function handleAuditLogEntry(entry, client) {
    let eventName = entry.actionType || entry.action || entry.event || entry.constructor.name || entry.targetType;
    // Tenta encontrar o handler pelo nome exato
    if (handlers[eventName]) {
        await handlers[eventName](entry, client);
        return;
    }
    // Tenta pelo código numérico
    if (typeof entry.action === 'number' && auditLogEventMap[entry.action]) {
        const mappedName = auditLogEventMap[entry.action];
        if (handlers[mappedName]) {
            await handlers[mappedName](entry, client);
            return;
        }
    }
    console.log('[AuditLogHandler] Nenhum handler encontrado para', eventName, entry.action);
}

module.exports = { handleAuditLogEntry };
