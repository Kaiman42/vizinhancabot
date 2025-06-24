const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: GuildScheduledEventUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('GuildScheduledEventUpdate', auditLogEntry, client);
