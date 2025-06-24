const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: ThreadUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('ThreadUpdate', auditLogEntry, client);
