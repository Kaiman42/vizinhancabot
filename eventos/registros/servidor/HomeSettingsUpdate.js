const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: HomeSettingsUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('HomeSettingsUpdate', auditLogEntry, client);
