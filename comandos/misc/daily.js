const { criarBarraProgresso } = require('../../configuracoes/barraProgresso.js');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economia = require('../../configuracoes/economia/index.js');
const mongodb = require('../../configuracoes/mongodb.js');

const min = 42;
const maximo = 2042;
const intervalo = Math.floor((maximo - min) / 3);

const baixoMin = min;
const baixoMax = min + intervalo;
const medioMin = baixoMax + 1;
const medioMax = medioMin + intervalo;
const altoMin = medioMax + 1;
const altoMax = maximo;

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
            const barraProgresso = criarBarraProgresso(valorRecompensa, maximo, {
                comprimento: 15,
                caracterPreenchido: '■',
                caracterVazio: '□',
                incluirPorcentagem: true
            });
            
            const embed = new EmbedBuilder()
                .setColor(gerarCorAleatoria())
                .setTitle('💰 Recompensa Diária!')
                .setDescription(`Você recebeu **${valorRecompensa.toLocaleString('pt-BR')} Gramas** hoje!\n\n\`${barraProgresso.barra}\`\n*${valorRecompensa} de ${maximo} Gramas possíveis*`)
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
    const valorInicial = Math.floor(Math.random() * (maximo - min + 1)) + min;
    
    if (valorInicial >= baixoMin && valorInicial <= baixoMax) {
        return valorInicial;
    } else if (valorInicial >= medioMin && valorInicial <= medioMax) {
        return Math.floor(Math.random() * (maximo - min + 1)) + min;
    } else {
        return Math.floor(Math.random() * (altoMax - altoMin + 1)) + altoMin;
    }
}