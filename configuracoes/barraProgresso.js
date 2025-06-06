const criarBarraProgresso = (atual = 0, maximo = 100, {
  comprimento = 15,
  caracterPreenchido = '■',
  caracterVazio = '□',
  incluirPorcentagem = false
} = {}) => {
  if (maximo <= 0) throw new Error('O valor máximo deve ser maior que zero');
  
  const progresso = Math.min(100, Math.round((Number(atual) / Number(maximo)) * 100));
  const caracteresPreenchidos = Math.floor((progresso / 100) * comprimento);
  
  const barra = '`' + Array(comprimento).fill()
    .map((_, i) => i < caracteresPreenchidos ? caracterPreenchido : caracterVazio)
    .join('') + (incluirPorcentagem ? ` ${progresso}%` : '') + '`';
  
  return { barra, progresso, preenchido: caracteresPreenchidos, total: comprimento, atual, maximo };
};

module.exports = { criarBarraProgresso };