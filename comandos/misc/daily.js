const { criarBarraProgresso } = require('../../configuracoes/barraProgresso.js');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor.js');
const economia = require('../../configuracoes/economia.js');
const path = require('path');
const mongodb = require(path.resolve(__dirname, '../../mongodb.js'));

const min = 42;
const maximo = 2042;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Receba sua recompensa diária de Gramas!'),
        
    async execute(interaction, ignis) {
        await interaction.deferReply();
        
        try {
            const userId = interaction.user.id;
            const valorRecompensa = Math.floor(Math.random() * (maximo - min + 1)) + min;
            
            const resultado = await receberRecompensaDiaria(userId, valorRecompensa);
            
            if (!resultado.success) {
                const tempoRestante = resultado.tempoRestante;
                const horas = Math.floor(tempoRestante / (1000 * 60 * 60));
                const minutos = Math.floor((tempoRestante % (1000 * 60 * 60)) / (1000 * 60));
                
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('⏰ Daily em Cooldown')
                        .setDescription(`Você já recebeu sua recompensa diária!\nVolte em **${horas}h ${minutos}m**`)
                        .setFooter({ text: 'A paciência é uma virtude' })]
                });
            }

            const barraProgresso = criarBarraProgresso(valorRecompensa, maximo, {
                comprimento: 15,
                caracterPreenchido: '■',
                caracterVazio: '□',
                incluirPorcentagem: true
            });
            
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(gerarCorAleatoria())
                    .setTitle('💰 Recompensa Diária!')
                    .setDescription(`Você recebeu **${valorRecompensa.toLocaleString('pt-BR')} Gramas** hoje!\n\n\`${barraProgresso.barra}\`\n*${valorRecompensa} de ${maximo} Gramas possíveis*`)
                    .setFooter({ text: 'Volte amanhã para mais recompensas!' })
                    .setTimestamp()]
            });
            
        } catch (error) {
            console.error('Erro ao processar o comando daily:', error);
            await interaction.editReply('Ocorreu um erro ao processar sua recompensa diária. Por favor, tente novamente mais tarde.');
        }
    }
};

async function receberRecompensaDiaria(userId, valorRecompensa) {
    // Usa a nova função do sistema de economia
    return await economia.receberDiario(userId, valorRecompensa);
}