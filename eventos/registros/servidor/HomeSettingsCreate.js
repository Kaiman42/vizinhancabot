const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: HomeSettingsCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('HomeSettingsCreate', auditLogEntry, client);
