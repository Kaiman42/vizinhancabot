const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: EmojiDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('EmojiDelete', auditLogEntry, client);
