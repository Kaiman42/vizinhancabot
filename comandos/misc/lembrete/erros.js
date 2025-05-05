// Mensagens de erro padronizadas
const erros = {
    formatoHora: 'Formato de hora inválido. Use HH:MM (exemplo: 14:30).',
    conteudoLongo: 'O conteúdo do lembrete deve ter no máximo 512 caracteres.',
    limite: (limite) => `Você já possui ${limite} lembretes ativos. Aguarde algum ser concluído antes de criar outro.`,
    passado: 'O horário do lembrete deve ser no futuro.',
    duplicado: 'Você já possui um lembrete agendado para este horário exato.',
    salvar: 'Erro ao salvar o lembrete. Por favor, tente novamente mais tarde.'
};

function responderErro(interaction, mensagem) {
    return interaction.reply({ content: mensagem, flags: 'Ephemeral' });
}

module.exports = {
    erros,
    responderErro
};
