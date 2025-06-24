const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: OnboardingPromptDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('OnboardingPromptDelete', auditLogEntry, client);
