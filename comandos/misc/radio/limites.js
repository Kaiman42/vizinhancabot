const { RadioError, ErrorMessages } = require('./erros');

const LIMITS = {
    MAX_RADIOS_PER_PAGE: 5,
    INACTIVITY_TIMEOUT: 15000, // 15 segundos
    MAX_VOLUME: 1.0,
    DEFAULT_VOLUME: 0.5
};

function validateRadioSelection(radios, country, radioIndex) {
    if (!radios[country] || !Array.isArray(radios[country])) {
        throw new RadioError(ErrorMessages.NO_RADIOS_FOUND(country));
    }

    if (radioIndex < 0 || radioIndex >= radios[country].length) {
        throw new RadioError(ErrorMessages.INVALID_RADIO);
    }

    const radio = radios[country][radioIndex];
    if (!radio.url) {
        throw new RadioError(ErrorMessages.INVALID_URL(radio.name));
    }

    return radio;
}

function getPageLimits(totalRadios, currentPage = 0) {
    const totalPages = Math.ceil(totalRadios / LIMITS.MAX_RADIOS_PER_PAGE);
    const start = currentPage * LIMITS.MAX_RADIOS_PER_PAGE;
    const end = Math.min(start + LIMITS.MAX_RADIOS_PER_PAGE, totalRadios);

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
    validateRadioSelection,
    getPageLimits
};