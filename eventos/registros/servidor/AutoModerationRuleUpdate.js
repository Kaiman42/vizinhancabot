const { gerarRelatorio } = require('./relatorio');

module.exports = (auditLogEntry, client) => gerarRelatorio('AutoModerationRuleUpdate', auditLogEntry, client);
