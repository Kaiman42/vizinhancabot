const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: OnboardingCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('OnboardingCreate', auditLogEntry, client);
