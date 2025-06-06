const mongodb = require('../configuracoes/mongodb');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        const originalError = console.error;

        console.error = async function() {
            originalError.apply(console, arguments);

            try {
                const config = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
                if (!config?.categorias) return;

                const registrosChannel = config.categorias
                    .flatMap(cat => cat.canais || [])
                    .find(c => c.nome === 'registros-bot');

                const channel = registrosChannel && client.channels.cache.get(registrosChannel.id);
                if (!channel) return;

                const errorMessage = Array.from(arguments)
                    .map(arg => arg instanceof Error 
                        ? `${arg.message}\n${arg.stack}`
                        : typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg)
                    .join(' ');

                await channel.send({
                    embeds: [{
                        color: 0xFF0000,
                        title: '❌ Erro no Console',
                        description: `\`\`\`\n${errorMessage.slice(0, 4000)}\n\`\`\``,
                        timestamp: new Date(),
                        footer: { text: 'Erro registrado em' }
                    }]
                }).catch(() => {});

            } catch (err) {
                originalError.call(console, 'Erro ao enviar mensagem para o Discord:', err);
            }
        };

        console.log('Sistema de log de erros inicializado');
    }
};