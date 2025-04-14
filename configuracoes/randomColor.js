
function gerarCorAleatoria() {
    // Gera um número hexadecimal aleatório de 6 dígitos
    const cor = Math.floor(Math.random() * 16777215).toString(16);
    
    // Adiciona zeros à esquerda se necessário para garantir 6 dígitos
    const corHex = cor.padStart(6, '0');
    
    // Converte a string hexadecimal para um número no formato 0xRRGGBB
    return parseInt(corHex, 16);
}

module.exports = {
    gerarCorAleatoria,
};