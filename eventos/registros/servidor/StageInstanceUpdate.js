const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: StageInstanceUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('StageInstanceUpdate', auditLogEntry, client);
