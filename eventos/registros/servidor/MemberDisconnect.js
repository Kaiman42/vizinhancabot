const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: MemberDisconnect
module.exports = (auditLogEntry, client) => gerarRelatorio('MemberDisconnect', auditLogEntry, client);
