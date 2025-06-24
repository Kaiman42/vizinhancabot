const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: ChannelOverwriteCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('ChannelOverwriteCreate', auditLogEntry, client);
