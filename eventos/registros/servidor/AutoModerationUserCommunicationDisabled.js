const { gerarRelatorio } = require('./relatorio');

module.exports = (auditLogEntry, client) => gerarRelatorio('AutoModerationUserCommunicationDisabled', auditLogEntry, client);
