const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: InviteUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('InviteUpdate', auditLogEntry, client);
