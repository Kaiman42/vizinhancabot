const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: CreatorMonetizationRequestCreated
module.exports = (auditLogEntry, client) => gerarRelatorio('CreatorMonetizationRequestCreated', auditLogEntry, client);
