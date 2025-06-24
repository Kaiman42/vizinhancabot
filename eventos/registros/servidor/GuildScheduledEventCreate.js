const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: GuildScheduledEventCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('GuildScheduledEventCreate', auditLogEntry, client);
