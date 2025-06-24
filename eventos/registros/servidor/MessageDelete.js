const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MessageDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('MessageDelete', auditLogEntry, client);
