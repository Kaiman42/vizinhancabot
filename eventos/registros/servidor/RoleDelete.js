const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: RoleDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('RoleDelete', auditLogEntry, client);
