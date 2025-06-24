const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MemberBanAdd
module.exports = (auditLogEntry, client) => gerarRelatorio('MemberBanAdd', auditLogEntry, client);
