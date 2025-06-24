const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MessagePin
module.exports = (auditLogEntry, client) => gerarRelatorio('MessagePin', auditLogEntry, client);
