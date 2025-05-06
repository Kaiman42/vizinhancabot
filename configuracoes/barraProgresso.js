function criarBarraProgresso(atual, maximo, opcoes = {}) {
  const valorAtual = Number(atual) || 0;
  const valorMaximo = Number(maximo) || 100;
  
  if (valorMaximo <= 0) throw new Error('O valor máximo deve ser maior que zero');
  
  const {
    comprimento = 20,
    caracterPreenchido = '█',
    caracterVazio = '░',
    incluirPorcentagem = false
  } = opcoes;
  
  const progresso = Math.min(100, Math.round((valorAtual / valorMaximo) * 100));
  const caracteresPreenchidos = Math.floor((progresso / 100) * comprimento);
  
  const barra = '`' + Array(comprimento)
    .fill()
    .map((_, i) => i < caracteresPreenchidos ? caracterPreenchido : caracterVazio)
    .join('') + (incluirPorcentagem ? ` ${progresso}%` : '') + '`';
  
  return { barra, progresso, preenchido: caracteresPreenchidos, total: comprimento, atual: valorAtual, maximo: valorMaximo };
}

function criarBarraProgressoXP(xpAtual, xpNecessario) {
  return criarBarraProgresso(xpAtual, xpNecessario, {
    comprimento: 15,
    caracterPreenchido: '■',
    caracterVazio: '□'
  });
}

module.exports = { criarBarraProgresso, criarBarraProgressoXP };