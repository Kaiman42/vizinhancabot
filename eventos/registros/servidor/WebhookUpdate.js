const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: WebhookUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('WebhookUpdate', auditLogEntry, client);
