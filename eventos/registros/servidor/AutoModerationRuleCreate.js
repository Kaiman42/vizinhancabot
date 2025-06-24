const { gerarRelatorio } = require('./relatorio');

module.exports = (auditLogEntry, client) => gerarRelatorio('AutoModerationRuleCreate', auditLogEntry, client);
