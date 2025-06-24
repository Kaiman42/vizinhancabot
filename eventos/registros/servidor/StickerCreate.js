const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: StickerCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('StickerCreate', auditLogEntry, client);
