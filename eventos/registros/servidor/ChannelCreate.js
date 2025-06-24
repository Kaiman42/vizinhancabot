const { gerarRelatorio } = require('./relatorio');

module.exports = (auditLogEntry, client) => gerarRelatorio('ChannelCreate', auditLogEntry, client);
