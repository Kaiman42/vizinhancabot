const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const economia = require('../../configuracoes/economia/index.js');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor.js');
const mongodb = require('../../configuracoes/mongodb.js');
const { criarBarraProgresso } = require('../../configuracoes/barraProgresso.js');

const MIN_VALOR = 42;
const MAX_VALOR = 2042;
const FAIXA_INTERVALO = Math.floor((MAX_VALOR - MIN_VALOR) / 3);

const FAIXA_BAIXA_MIN = MIN_VALOR;
const FAIXA_BAIXA_MAX = MIN_VALOR + FAIXA_INTERVALO;
const FAIXA_MEDIA_MIN = FAIXA_BAIXA_MAX + 1;
const FAIXA_MEDIA_MAX = FAIXA_MEDIA_MIN + FAIXA_INTERVALO;
const FAIXA_ALTA_MIN = FAIXA_MEDIA_MAX + 1;
const FAIXA_ALTA_MAX = MAX_VALOR;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Receba sua recompensa diária de Grama'),
        
    async execute(interaction, ignis) {
        await interaction.deferReply();
        
        try {
            const userId = interaction.user.id;
            const valorRecompensa = calcularRecompensa();
            
            const resultado = await receberRecompensaDiaria(userId, valorRecompensa);
            
            if (!resultado.success) {
                const tempoRestante = resultado.tempoRestante;
                const horas = Math.floor(tempoRestante / (1000 * 60 * 60));
                const minutos = Math.floor((tempoRestante % (1000 * 60 * 60)) / (1000 * 60));
                
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⏰ Daily em Cooldown')
                    .setDescription(`Você já recebeu sua recompensa diária!\nVolte em **${horas}h ${minutos}m**`)
                    .setFooter({ text: 'A paciência é uma virtude' });
                    
                return interaction.editReply({ embeds: [embed] });
            }

            // Criar barra de progresso
            const barraProgresso = criarBarraProgresso(valorRecompensa, MAX_VALOR, {
                comprimento: 15,
                caracterPreenchido: '■',
                caracterVazio: '□',
                incluirPorcentagem: true
            });
            
            const embed = new EmbedBuilder()
                .setColor(gerarCorAleatoria())
                .setTitle('💰 Recompensa Diária!')
                .setDescription(`Você recebeu **${valorRecompensa.toLocaleString('pt-BR')} Gramas** hoje!\n\n\`${barraProgresso.barra}\`\n*${valorRecompensa} de ${MAX_VALOR} Gramas possíveis*`)
                .setFooter({ text: 'Volte amanhã para mais recompensas!' })
                .setTimestamp();
                
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Erro ao processar o comando daily:', error);
            await interaction.editReply('Ocorreu um erro ao processar sua recompensa diária. Por favor, tente novamente mais tarde.');
        }
    }
};

async function receberRecompensaDiaria(userId, valorRecompensa) {
    const podeReceber = await economia.verificarDiario(userId);
    
    if (!podeReceber) {
        const doc = await economia.obterSaldo(userId);
        const usuario = await findUsuarioById(userId);
        const ultimoDaily = usuario?.ultimoDaily || 0;
        const tempoRestante = economia.DAILY_COOLDOWN - (Date.now() - ultimoDaily);
        
        return {
            success: false,
            message: 'Você já recebeu sua recompensa diária',
            tempoRestante
        };
    }
    
    const novoSaldo = await economia.adicionarSaldo(userId, valorRecompensa);
    
    await atualizarUltimoDailyUsuario(userId);
    
    return {
        success: true,
        message: `Você recebeu ${valorRecompensa} moedas!`,
        novoSaldo
    };
}

async function findUsuarioById(userId) {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    
    if (!doc || !doc.usuarios) {
        return null;
    }
    
    return doc.usuarios.find(u => u.userId === userId);
}

async function atualizarUltimoDailyUsuario(userId) {
    await mongodb.updateOne(
        mongodb.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'economias', 'usuarios.userId': userId },
        { $set: { 'usuarios.$.ultimoDaily': Date.now() } }
    );
}

function calcularRecompensa() {
    const valorInicial = Math.floor(Math.random() * (MAX_VALOR - MIN_VALOR + 1)) + MIN_VALOR;
    
    if (valorInicial >= FAIXA_BAIXA_MIN && valorInicial <= FAIXA_BAIXA_MAX) {
        return valorInicial;
    } else if (valorInicial >= FAIXA_MEDIA_MIN && valorInicial <= FAIXA_MEDIA_MAX) {
        return Math.floor(Math.random() * (MAX_VALOR - MIN_VALOR + 1)) + MIN_VALOR;
    } else {
        return Math.floor(Math.random() * (FAIXA_ALTA_MAX - FAIXA_ALTA_MIN + 1)) + FAIXA_ALTA_MIN;
    }
}