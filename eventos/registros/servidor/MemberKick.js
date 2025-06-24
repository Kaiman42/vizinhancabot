const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MemberKick
module.exports = (auditLogEntry, client) => gerarRelatorio('MemberKick', auditLogEntry, client);
