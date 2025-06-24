const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: ChannelUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('ChannelUpdate', auditLogEntry, client);
