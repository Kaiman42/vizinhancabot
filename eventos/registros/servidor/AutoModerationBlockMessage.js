const { gerarRelatorio } = require('./relatorio');

module.exports = (auditLogEntry, client) => gerarRelatorio('AutoModerationBlockMessage', auditLogEntry, client);
