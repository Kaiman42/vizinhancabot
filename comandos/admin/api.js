const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor.js');
const https = require('https');
const mongodb = require('../../configuracoes/mongodb.js');

// Configurações do Jamendo
const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;
const JAMENDO_API_VERSION = 'v3.0';
const JAMENDO_API_BASE = 'https://api.jamendo.com';

// Valores padrão para o Jamendo (a API não fornece limites via cabeçalhos)
const JAMENDO_MONTHLY_LIMIT = 35000; // Limite mensal da API do Jamendo
const API_STATS_COLLECTION = mongodb.COLLECTIONS.CONFIGURACOES;
const API_STATS_DOC_ID = 'api_usage';

/**
 * Incrementa o contador de uso da API Jamendo
 * @param {number} count - Número de chamadas a incrementar (padrão: 1)
 * @returns {Promise<Object>} - Estatísticas atualizadas da API
 */
async function incrementJamendoApiUsage(count = 1) {
    // Buscar estatísticas armazenadas
    const storedStats = await getStoredApiStats('jamendo');
    
    // Verificar se já existe contagem armazenada para este mês
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const lastCheckMonth = storedStats?.lastCheck ? 
        new Date(storedStats.lastCheck).toISOString().slice(0, 7) : null;
    
    // Se já temos estatísticas para este mês, atualizar o contador de uso
    if (storedStats && lastCheckMonth === currentMonth) {
        // Incrementar contador de uso
        const used = storedStats.requestsThisMonth || 0;
        const newUsed = used + count;
        const remaining = JAMENDO_MONTHLY_LIMIT - newUsed;
        
        const stats = {
            limit: JAMENDO_MONTHLY_LIMIT,
            remaining: Math.max(0, remaining),
            requestsThisMonth: newUsed,
            lastCheck: new Date().toISOString(),
            resetTime: getFirstDayOfNextMonth()
        };
        
        // Salvar estatísticas atualizadas
        await saveApiStats('jamendo', stats);
        return stats;
    }
    
    // Caso contrário, esta é uma nova contagem para este mês
    const stats = {
        limit: JAMENDO_MONTHLY_LIMIT,
        remaining: JAMENDO_MONTHLY_LIMIT - count,
        requestsThisMonth: count,
        lastCheck: new Date().toISOString(),
        resetTime: getFirstDayOfNextMonth()
    };
    
    // Salvar estatísticas atualizadas
    await saveApiStats('jamendo', stats);
    return stats;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uso-api')
        .setDescription('Mostra estatísticas de uso das APIs')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            // Não incrementar o contador para consultas de status
            const jamendoStats = await getJamendoApiUsage(false);
            
            const embed = new EmbedBuilder()
                .setColor(gerarCorAleatoria())
                .setTitle('📊 Estatísticas de Uso de API')
                .setDescription('Informações sobre o uso atual das APIs integradas')
                .addFields(
                    { 
                        name: '🎵 Jamendo API', 
                        value: formatApiUsageInfo(jamendoStats)
                    }
                )
                .setFooter({ 
                    text: `Última atualização: ${new Date().toLocaleString('pt-BR')}`
                })
                .setTimestamp();
            
            // Adicionar indicador visual de uso
            const usageBar = createUsageBar(jamendoStats.limit, jamendoStats.remaining);
            if (usageBar) {
                embed.addFields({ name: 'Uso da API Jamendo', value: usageBar });
            }
            
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao executar comando uso-api:', error);
            return interaction.editReply('❌ Ocorreu um erro ao verificar o uso das APIs.');
        }
    },
    
    // Exportar funções utilitárias para uso em outros arquivos
    incrementJamendoApiUsage
};

function formatApiUsageInfo(stats) {
    return `**Limite Mensal:** ${stats.limit}\n` +
           `**Requisições Restantes:** ${stats.remaining}\n` +
           `**Uso:** ${calculateUsagePercentage(stats.limit, stats.remaining)}%\n` +
           `**Reiniciado em:** ${stats.resetTime || 'Primeiro dia do próximo mês'}`;
}

async function getJamendoApiUsage(increment = true) {
    if (increment) {
        // Incrementar o contador e retornar as estatísticas atualizadas
        return await incrementJamendoApiUsage();
    } else {
        // Apenas buscar as estatísticas sem incrementar
        const storedStats = await getStoredApiStats('jamendo');
        
        // Verificar se já existe contagem armazenada para este mês
        const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
        const lastCheckMonth = storedStats?.lastCheck ? 
            new Date(storedStats.lastCheck).toISOString().slice(0, 7) : null;
        
        if (storedStats && lastCheckMonth === currentMonth) {
            return storedStats;
        }
        
        // Caso contrário, iniciar nova contagem
        return {
            limit: JAMENDO_MONTHLY_LIMIT,
            remaining: JAMENDO_MONTHLY_LIMIT,
            requestsThisMonth: 0,
            lastCheck: new Date().toISOString(),
            resetTime: getFirstDayOfNextMonth()
        };
    }
}

// Retorna a data do primeiro dia do próximo mês
function getFirstDayOfNextMonth() {
    const now = new Date();
    // Cria uma data para o primeiro dia do próximo mês
    const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return firstDayNextMonth.toLocaleString('pt-BR');
}

// Função para obter estatísticas armazenadas
async function getStoredApiStats(apiName) {
    try {
        const apiStatsDoc = await mongodb.findOne(API_STATS_COLLECTION, { _id: API_STATS_DOC_ID });
        if (apiStatsDoc && apiStatsDoc.apis && apiStatsDoc.apis[apiName]) {
            return apiStatsDoc.apis[apiName];
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar estatísticas de API:', error);
        return null;
    }
}

function createUsageBar(total, remaining) {
    if (!total || remaining === undefined || remaining === null) return null;
    
    const used = total - remaining;
    const percentage = Math.floor((used / total) * 100);
    
    const barLength = 20;
    const filledLength = Math.floor((percentage / 100) * barLength);
    const emptyLength = barLength - filledLength;
    
    const filledChar = '█';
    const emptyChar = '░';
    
    const filledBar = filledChar.repeat(filledLength);
    const emptyBar = emptyChar.repeat(emptyLength);
    
    return `\`${filledBar}${emptyBar}\` ${percentage}%`;
}

function calculateUsagePercentage(total, remaining) {
    if (!total || remaining === undefined || remaining === null) return 'N/A';
    
    const used = total - remaining;
    return Math.floor((used / total) * 100);
}

async function saveApiStats(apiName, stats) {
    try {
        let apiStatsDoc = await mongodb.findOne(API_STATS_COLLECTION, { _id: API_STATS_DOC_ID });
        
        if (!apiStatsDoc) {
            await mongodb.insertOne(API_STATS_COLLECTION, { 
                _id: API_STATS_DOC_ID,
                apis: {}
            });
            apiStatsDoc = { apis: {} };
        }
        
        if (!apiStatsDoc.apis) {
            apiStatsDoc.apis = {};
        }
        
        const updateData = {
            [`apis.${apiName}`]: stats
        };
        
        await mongodb.updateOne(
            API_STATS_COLLECTION,
            { _id: API_STATS_DOC_ID },
            { $set: updateData }
        );
        
        return true;
    } catch (error) {
        console.error('Erro ao salvar estatísticas de API:', error);
        return false;
    }
}