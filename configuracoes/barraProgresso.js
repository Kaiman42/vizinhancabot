/**
 * Módulo para criação de barras de progresso reutilizáveis
 * Este módulo fornece funções para criar barras de progresso visuais
 * que podem ser utilizadas em diferentes partes do bot
 */

/**
 * Cria uma barra de progresso genérica
 * @param {number} atual - Valor atual
 * @param {number} maximo - Valor máximo
 * @param {Object} opcoes - Opções de personalização da barra
 * @param {number} opcoes.comprimento - Comprimento da barra (padrão: 20)
 * @param {string} opcoes.caracterPreenchido - Caractere para partes preenchidas (padrão: '█')
 * @param {string} opcoes.caracterVazio - Caractere para partes vazias (padrão: '░')
 * @param {boolean} opcoes.incluirPorcentagem - Se deve incluir a porcentagem no resultado (padrão: false)
 * @returns {Object} Objeto com a barra formatada e informações de progresso
 */
function criarBarraProgresso(atual, maximo, opcoes = {}) {
  // Garantir que os valores sejam números válidos
  const valorAtual = Number(atual) || 0;
  const valorMaximo = Number(maximo) || 100;
  
  // Evitar divisão por zero
  if (valorMaximo <= 0) {
    throw new Error('O valor máximo deve ser maior que zero');
  }
  
  // Definir opções padrão
  const comprimento = opcoes.comprimento || 20;
  const caracterPreenchido = opcoes.caracterPreenchido || '█';
  const caracterVazio = opcoes.caracterVazio || '░';
  const incluirPorcentagem = opcoes.incluirPorcentagem || false;
  
  // Calcular porcentagem
  const progresso = Math.min(100, Math.round((valorAtual / valorMaximo) * 100));
  
  // Calcular quantos caracteres preenchidos devem ser mostrados
  const caracteresPreenchidos = Math.floor((progresso / 100) * comprimento);
  
  // Construir a barra
  let barra = '';
  for (let i = 0; i < comprimento; i++) {
    barra += i < caracteresPreenchidos ? caracterPreenchido : caracterVazio;
  }
  
  // Adicionar porcentagem se solicitado
  if (incluirPorcentagem) {
    barra += ` ${progresso}%`;
  }
  
  // Retornar objeto com barra formatada e informações de progresso
  return {
    barra,
    progresso,
    preenchido: caracteresPreenchidos,
    total: comprimento,
    atual: valorAtual,
    maximo: valorMaximo
  };
}

/**
 * Cria uma barra de progresso específica para XP/níveis
 * Esta função utiliza configurações específicas para representação de XP
 * 
 * @param {number} xpAtual - XP atual do usuário
 * @param {number} xpNecessario - XP necessário para o próximo nível
 * @returns {Object} Objeto com a barra formatada e informações de progresso
 */
function criarBarraProgressoXP(xpAtual, xpNecessario) {
  return criarBarraProgresso(xpAtual, xpNecessario, {
    comprimento: 15,
    caracterPreenchido: '■',
    caracterVazio: '□',
    incluirPorcentagem: false
  });
}

module.exports = {
  criarBarraProgresso,
  criarBarraProgressoXP
};