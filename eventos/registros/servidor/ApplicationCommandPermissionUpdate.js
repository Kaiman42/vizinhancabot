const { gerarRelatorio } = require('./relatorio');

module.exports = (auditLogEntry, client) => gerarRelatorio('ApplicationCommandPermissionUpdate', auditLogEntry, client);
