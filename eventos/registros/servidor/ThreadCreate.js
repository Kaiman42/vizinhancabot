const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: ThreadCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('ThreadCreate', auditLogEntry, client);
