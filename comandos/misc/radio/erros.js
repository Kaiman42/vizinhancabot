class RadioError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'RadioError';
        this.code = code;
    }
}

const ErrorMessages = {
    NO_VOICE_CHANNEL: '❌ Você precisa estar em um canal de voz para usar este comando.',
    NO_DJ_ROLE: '❌ Você precisa ter o cargo de DJ para usar este comando.',
    NO_PERMISSION: '❌ Você não tem permissão para usar este comando.',
    WRONG_CHANNEL: (channelId) => `❌ Este comando só pode ser usado no canal <#${channelId}>.`,
    NO_RADIO_PLAYING: '❌ Não há rádio em execução no momento.',
    OWNER_ONLY: (ownerId) => `❌ Apenas <@${ownerId}> pode controlar a rádio nesta sessão.`,
    INVALID_RADIO: '❌ Rádio inválida ou não encontrada.',
    NO_RADIOS_FOUND: (country) => `❌ Nenhuma rádio encontrada para ${country}.`,
    INVALID_URL: (name) => `❌ URL inválida para a rádio ${name}`,
    GENERAL_ERROR: (error) => `❌ Ocorreu um erro: ${error.message}`
};

async function handleRadioError(error, interaction) {
    console.error('Erro na rádio:', error);

    if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
            content: error.message || ErrorMessages.GENERAL_ERROR(error),
            ephemeral: true
        });
    } else {
        await interaction.followUp({
            content: error.message || ErrorMessages.GENERAL_ERROR(error),
            ephemeral: true
        });
    }
}

module.exports = {
    RadioError,
    ErrorMessages,
    handleRadioError
};