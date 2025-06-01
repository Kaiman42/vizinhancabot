class RadioError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'RadioError';
        this.code = code;
    }
}

const ERROS_RADIO = {
    NENHUM_CANAL: '❌ Você precisa estar em um canal de voz para usar este comando.',
    SEM_CARGO_DJ: '❌ Você precisa ter o cargo de DJ para usar este comando.',
    SEM_PERMISSAO: '❌ Você não tem permissão para usar este comando.',
    CANAL_ERRADO: (channelId) => `❌ Este comando só pode ser usado no canal <#${channelId}>.`,
    RADIO_TOCANDO: '❌ O bot já está executando uma rádio no momento.',
    CONTROLADOR_SOMENTE: (ownerId) => `❌ Apenas <@${ownerId}> pode controlar a rádio nesta sessão.`,
    NENHUMA_RADIO: (country) => `❌ Nenhuma rádio encontrada para ${country}.`,
    URL_INVALIDA: (name) => `❌ URL inválida para a rádio ${name}`,
    ERRO_GENERICO: (error) => `❌ Ocorreu um erro: ${error.message}`
};

async function handleRadioError(error, interaction) {
    console.error('Erro na rádio:', error);
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: error.message || ERROS_RADIO.ERRO_GENERICO(error),
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: error.message || ERROS_RADIO.ERRO_GENERICO(error),
                ephemeral: true
            });
        }
    } catch (err) {
        console.error("Failed to send error message:", err);
    }
}

module.exports = {
    RadioError,
    ERROS_RADIO,
    handleRadioError
};