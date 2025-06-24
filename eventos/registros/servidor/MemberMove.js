const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MemberMove
module.exports = (auditLogEntry, client) => gerarRelatorio('MemberMove', auditLogEntry, client);
