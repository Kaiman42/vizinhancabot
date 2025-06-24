const { gerarRelatorio } = require('./relatorio');

module.exports = (auditLogEntry, client) => gerarRelatorio('AutoModerationFlagToChannel', auditLogEntry, client);
