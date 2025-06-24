const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: StickerUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('StickerUpdate', auditLogEntry, client);
