const MENSAGENS_ERRO = {
    CONFIGURACAO_NAO_ENCONTRADA: {
        content: 'Erro ao verificar permissões. Configuração de cargos não encontrada.',
        flags: 'Ephemeral'
    },
    SEM_PERMISSAO: {
        content: 'Você não tem permissão para banir usuários!',
        flags: 'Ephemeral'
    },
    LIMITE_DIARIO: (maxban) => ({
        content: `Você atingiu seu limite diário de ${maxban} banimentos!`,
        flags: 'Ephemeral'
    }),
    AUTO_BAN: {
        content: 'Você não pode banir a si mesmo!',
        flags: 'Ephemeral'
    },
    NAO_BANIVEL: {
        content: 'Não posso banir este usuário! Ele pode ter permissões mais altas que eu.',
        flags: 'Ephemeral'
    },
    CARGO_SUPERIOR: {
        content: 'Você não pode banir este usuário! Ele tem um cargo igual ou superior ao seu.',
        flags: 'Ephemeral'
    },
    ERRO_GENERICO: (user, error) => ({
        content: `Ocorreu um erro ao tentar banir ${user.tag}: ${error.message}`,
        flags: 'Ephemeral'
    })
};

module.exports = MENSAGENS_ERRO;