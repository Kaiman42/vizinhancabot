const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: StageInstanceCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('StageInstanceCreate', auditLogEntry, client);
