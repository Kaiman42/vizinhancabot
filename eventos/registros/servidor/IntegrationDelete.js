const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: IntegrationDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('IntegrationDelete', auditLogEntry, client);
