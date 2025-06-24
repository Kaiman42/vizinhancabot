const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: ThreadDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('ThreadDelete', auditLogEntry, client);
