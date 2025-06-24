const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MemberBanRemove
module.exports = (auditLogEntry, client) => gerarRelatorio('MemberBanRemove', auditLogEntry, client);
