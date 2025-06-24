const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: GuildUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('GuildUpdate', auditLogEntry, client);
