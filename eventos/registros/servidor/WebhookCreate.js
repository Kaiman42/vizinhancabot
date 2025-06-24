const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: WebhookCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('WebhookCreate', auditLogEntry, client);
