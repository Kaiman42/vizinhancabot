const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MessageBulkDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('MessageBulkDelete', auditLogEntry, client);
