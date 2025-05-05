// Função para registrar logs de ações e erros
function logAcao(mensagem) {
    console.log(`[LEMBRETE] ${mensagem}`);
}

function logErro(erro) {
    console.error('[LEMBRETE][ERRO]', erro);
}

module.exports = {
    logAcao,
    logErro
};
