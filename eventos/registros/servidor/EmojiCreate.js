const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: EmojiCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('EmojiCreate', auditLogEntry, client);
