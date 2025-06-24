const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: OnboardingPromptUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('OnboardingPromptUpdate', auditLogEntry, client);
