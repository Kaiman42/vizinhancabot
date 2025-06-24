const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: InviteCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('InviteCreate', auditLogEntry, client);
