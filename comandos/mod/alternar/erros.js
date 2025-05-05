// Funções utilitárias para tratamento de erros
const ERROS = {
  CANAL_NAO_ENCONTRADO: {
    content: '❌ Este canal não foi encontrado na configuração.',
    flags: 'Ephemeral'
  },
  PERMISSAO_NEGADA: {
    content: '❌ Você não tem permissão para alterar este canal.',
    flags: 'Ephemeral'
  },
  ERRO_GENERICO: (erro) => ({
    content: `❌ Ocorreu um erro ao alternar permissões: ${erro?.message || erro}`,
    flags: 'Ephemeral'
  })
};

function responderErro(interaction, erro) {
  const resposta = typeof erro === 'string' ? { content: erro, flags: 'Ephemeral' } : erro;
  return interaction.editReply(resposta);
}

module.exports = {
  responderErro,
  ERROS
};
