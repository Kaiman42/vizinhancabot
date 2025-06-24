const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MemberPrune
module.exports = (auditLogEntry, client) => gerarRelatorio('MemberPrune', auditLogEntry, client);
