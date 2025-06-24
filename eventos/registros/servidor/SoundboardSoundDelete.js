const { gerarRelatorio } = require('./relatorio');

// Handler para AuditLogEvent: SoundboardSoundDelete
module.exports = (auditLogEntry, client) => gerarRelatorio('SoundboardSoundDelete', auditLogEntry, client);
