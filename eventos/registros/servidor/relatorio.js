const { find, connect } = require('../../../mongodb');
const { EmbedBuilder } = require('discord.js');

async function gerarRelatorio(evento, dados, client) {
    console.log('[Relatorio] Iniciando geração de relatório', { evento, dados: JSON.stringify(dados) });
    await connect(process.env.MONGO_URI);
    const config = await find('configuracoes', { _id: 'canais' }, { findOne: true });
    if (!config || !Array.isArray(config.categorias)) {
        console.log('[Relatorio] Configuração de canais não encontrada ou inválida:', config);
        return;
    }
    let canalInfo = null;
    for (const categoria of config.categorias) {
        if (categoria && Array.isArray(categoria.canais)) {
            const canal = categoria.canais.find(c => c.nome === 'registros-servidor');
            if (canal) {
                canalInfo = canal;
                break;
            }
        }
    }
    if (!canalInfo) {
        console.log('[Relatorio] Canal "registros-servidor" não encontrado nas configurações:', JSON.stringify(config.categorias));
        return;
    }
    const canal = client.channels.cache.get(canalInfo.id);
    if (!canal) {
        console.log('[Relatorio] Canal não encontrado no cache do client:', canalInfo.id);
        return;
    }

    // Montagem do Embed amigável
    const executor = dados.executorId ? `<@${dados.executorId}>` : (dados.executor || 'Desconhecido');
    // Alvo field is removed as per user request

    const embed = new EmbedBuilder()
        .setTitle('🔌Registro de Auditoria')
        .setColor(0x0099ff)
        .setTimestamp();

    const fields = [
        { name: 'Usuário', value: executor.toString(), inline: true },
        { name: 'Ação', value: `\`${evento}\``, inline: true }, // Add backticks
    ];

    // Check if the event is an update to include changes and reason
    const isUpdateEvent = evento.toLowerCase().includes('atualização') || evento.toLowerCase().includes('update');

    if (isUpdateEvent) {
        fields.push({ name: 'Mudanças', value: mudancas, inline: false });
    }

    embed.addFields(...fields); // Use spread operator to add fields from the array
    try {
        await canal.send({ embeds: [embed] });
        console.log('[Relatorio] Relatório enviado com sucesso para o canal', canalInfo.id);
    } catch (e) {
        console.log('[Relatorio] Erro ao enviar relatório:', e);
    }
}

module.exports = { gerarRelatorio };
