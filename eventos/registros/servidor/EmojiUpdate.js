const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: EmojiUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('EmojiUpdate', auditLogEntry, client);
