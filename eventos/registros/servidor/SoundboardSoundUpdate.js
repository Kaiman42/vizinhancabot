const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: SoundboardSoundUpdate
module.exports = (auditLogEntry, client) => gerarRelatorio('SoundboardSoundUpdate', auditLogEntry, client);
