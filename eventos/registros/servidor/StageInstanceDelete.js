const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: StageInstanceDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('StageInstanceDelete', auditLogEntry, client);
