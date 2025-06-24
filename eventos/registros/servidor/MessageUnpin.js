const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MessageUnpin
module.exports = (auditLogEntry, client) => gerarRelatorio('MessageUnpin', auditLogEntry, client);
