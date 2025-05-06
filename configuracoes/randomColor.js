
function gerarCorAleatoria() {
    const cor = Math.floor(Math.random() * 16777215).toString(16);
    const corHex = cor.padStart(6, '0');
    return parseInt(corHex, 16);
}
module.exports = {
    gerarCorAleatoria,
};