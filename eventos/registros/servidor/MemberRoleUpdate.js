const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MemberRoleUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('MemberRoleUpdate', auditLogEntry, client);
