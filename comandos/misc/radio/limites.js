const { RadioError, ERROS_RADIO } = require('./erros');

const LIMITS = {
    REQUISICOES: {
        max: 3,
        window: 10000
    },
    TIMER_INATIVIDADE: 15000,
    DEFAULT_VOLUME: 0.5,
    VOLUME_MAX: 1.0
};

function validateRadioSelection(radios, country, radioIndex) {
    if (!radios[country] || !Array.isArray(radios[country])) {
        throw new RadioError(ERROS_RADIO.NENHUMA_RADIO(country));
    }

    if (radioIndex < 0 || radioIndex >= radios[country].length) {
        throw new RadioError(ERROS_RADIO.CANAL_ERRADO(radioIndex));
    }

    const radio = radios[country][radioIndex];
    if (!radio.url) {
        throw new RadioError(ERROS_RADIO.URL_INVALIDA(radio.name));
    }

    return radio;

    return {
        start,
        end,
        totalPages,
        hasNext: currentPage < totalPages - 1,
        hasPrevious: currentPage > 0
    };
}

module.exports = {
    LIMITS,
    validateRadioSelection
};