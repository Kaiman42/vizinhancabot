const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: IntegrationUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('IntegrationUpdate', auditLogEntry, client);
