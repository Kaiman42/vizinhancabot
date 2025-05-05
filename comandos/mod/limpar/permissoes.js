// Função principal para limpar mensagens
async function limparMensagens(interaction, amount, ignorarAntigas, usuario) {
    // Primeiro, obtemos as mensagens
    const messages = await interaction.channel.messages.fetch({ 
        limit: amount 
    });
    // Filtra as mensagens com base nos parâmetros
    let messagesToDelete = messages;
    if (usuario) {
        messagesToDelete = messages.filter(msg => msg.author.id === usuario.id);
    }
    if (ignorarAntigas) {
        // Filtra mensagens mais antigas que 14 dias
        const dateLimitTimestamp = Date.now() - (14 * 24 * 60 * 60 * 1000);
        messagesToDelete = messagesToDelete.filter(msg => msg.createdTimestamp > dateLimitTimestamp);
    }
    // Se não houver mensagens para deletar
    if (messagesToDelete.size === 0) {
        return { deletedCount: 0, notFound: true };
    }
    // Delete as mensagens
    const deletedCount = await interaction.channel.bulkDelete(messagesToDelete, true)
        .then(deleted => deleted.size);
    return { deletedCount, notFound: false };
}

module.exports = {
    limparMensagens
};
