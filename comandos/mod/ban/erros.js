
const MENSAGENS_ERRO = {
    CONFIGURACAO_NAO_ENCONTRADA: {
        content: 'Erro ao verificar permissões. Configuração de cargos não encontrada.'
    },
    SEM_PERMISSAO: {
        content: 'Você não tem permissão para banir usuários!'
    },
    LIMITE_DIARIO: (maxban) => ({
        content: `Você atingiu seu limite diário de ${maxban} banimentos!`
    }),
    AUTO_BAN: {
        content: 'Você não pode banir a si mesmo!'
    },
    CARGO_IGUAL: {
        content: 'Você não pode banir este usuário! Ele tem um cargo igual ao seu.'
    },
    CARGO_SUPERIOR: {
        content: 'Você não pode banir este usuário! Ele tem um cargo superior ao seu.'
    },
    COOLDOWN: (tempoRestante) => ({
        content: `Aguarde ${tempoRestante} segundos para banir novamente.`
    }),
    ERRO_GENERICO: (user, error) => ({
        content: `Ocorreu um erro ao tentar banir ${user.tag}: ${error.message}`
    })
};

module.exports = MENSAGENS_ERRO;