const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: OnboardingPromptCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('OnboardingPromptCreate', auditLogEntry, client);
