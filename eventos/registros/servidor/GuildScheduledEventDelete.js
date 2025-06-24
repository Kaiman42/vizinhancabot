const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: GuildScheduledEventDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('GuildScheduledEventDelete', auditLogEntry, client);
