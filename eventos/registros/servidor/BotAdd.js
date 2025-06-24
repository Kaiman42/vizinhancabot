const { gerarRelatorio } = require('./relatorio');

module.exports = (auditLogEntry, client) => gerarRelatorio('BotAdd', auditLogEntry, client);
