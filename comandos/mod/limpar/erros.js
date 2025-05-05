function responderErro(interaction, mensagem) {
    return interaction.reply({
        content: mensagem,
        flags: 'Ephemeral'
    });
}

module.exports = {
    responderErro
};
