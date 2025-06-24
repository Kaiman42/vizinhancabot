const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: ChannelOverwriteDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('ChannelOverwriteDelete', auditLogEntry, client);
