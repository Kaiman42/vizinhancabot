const mongodb = require('../configuracoes/mongodb');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        const originalError = console.error;

        console.error = async function() {
            originalError.apply(console, arguments);

            try {
                // Busca o canal nas categorias usando o driver nativo
                const config = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
                if (!config?.categorias) return;

                let registrosChannelId;
                // Procura o canal registros-bot em todas as categorias
                for (const categoria of config.categorias) {
                    if (!categoria.canais) continue;
                    const canal = categoria.canais.find(c => c.nome === 'registros-bot');
                    if (canal) {
                        registrosChannelId = canal.id;
                        break;
                    }
                }

                if (!registrosChannelId) return;

                const channel = client.channels.cache.get(registrosChannelId);
                if (!channel) return;

                const errorMessage = Array.from(arguments)
                    .map(arg => {
                        if (arg instanceof Error) {
                            return `${arg.message}\n${arg.stack}`;
                        }
                        return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg;
                    })
                    .join(' ');

                const errorEmbed = {
                    color: 0xFF0000,
                    title: '❌ Erro no Console',
                    description: `\`\`\`\n${errorMessage.slice(0, 4000)}\n\`\`\``,
                    timestamp: new Date(),
                    footer: {
                        text: 'Erro registrado em'
                    }
                };

                await channel.send({ embeds: [errorEmbed] }).catch(() => {});
            } catch (err) {
                originalError.call(console, 'Erro ao enviar mensagem para o Discord:', err);
            }
        };

        console.log('Sistema de log de erros inicializado');
    }
};