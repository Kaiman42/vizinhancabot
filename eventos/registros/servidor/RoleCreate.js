const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: RoleCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('RoleCreate', auditLogEntry, client);
