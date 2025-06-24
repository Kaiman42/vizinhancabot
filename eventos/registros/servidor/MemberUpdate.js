const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MemberUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('MemberUpdate', auditLogEntry, client);
