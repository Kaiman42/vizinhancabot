const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: StickerDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('StickerDelete', auditLogEntry, client);
