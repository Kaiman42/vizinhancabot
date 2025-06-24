const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: CreatorMonetizationTermsAccepted
module.exports = (auditLogEntry, client) => gerarRelatorio('CreatorMonetizationTermsAccepted', auditLogEntry, client);
