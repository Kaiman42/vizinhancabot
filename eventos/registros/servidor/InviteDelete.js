const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: InviteDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('InviteDelete', auditLogEntry, client);
