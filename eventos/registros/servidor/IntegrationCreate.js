const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: IntegrationCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('IntegrationCreate', auditLogEntry, client);
