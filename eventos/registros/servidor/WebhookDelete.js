const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: WebhookDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('WebhookDelete', auditLogEntry, client);
