const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: OnboardingUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('OnboardingUpdate', auditLogEntry, client);
