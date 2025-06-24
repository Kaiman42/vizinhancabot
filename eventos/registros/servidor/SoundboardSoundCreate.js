const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: SoundboardSoundCreate
module.exports = (auditLogEntry, client) => gerarRelatorio('SoundboardSoundCreate', auditLogEntry, client);
