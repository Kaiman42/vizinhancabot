const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: RoleUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('RoleUpdate', auditLogEntry, client);
