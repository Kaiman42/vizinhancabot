const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const { transferirSaldo, obterSaldo } = require('../../configuracoes/economia/saldo.js');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transferir')
        .setDescription('Transfere Gramas para outro usuário')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O usuário que receberá as Gramas')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('quantia')
                .setDescription('Quantidade de Gramas a transferir')
                .setRequired(true)
                .setMinValue(1)),
                
    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            const remetente = interaction.user;
            const destinatario = interaction.options.getUser('usuario');
            const quantia = interaction.options.getInteger('quantia');
            
            if (remetente.id === destinatario.id) {
                return interaction.editReply('Você não pode transferir Gramas para si mesmo!');
            }
            
            const saldoRemetente = await obterSaldo(remetente.id);
            
            if (saldoRemetente < quantia) {
                return interaction.editReply(`Você não tem Gramas suficientes! Seu saldo atual é de ${saldoRemetente.toLocaleString('pt-BR')} Gramas.`);
            }
            
            const resultado = await transferirSaldo(remetente.id, destinatario.id, quantia);
            
            if (!resultado.success) {
                return interaction.editReply(`Erro na transferência: ${resultado.message}`);
            }
            
            const embed = criarEmbedTransferencia(
                remetente.username,
                destinatario.username,
                quantia,
                resultado.novoSaldoRemetente,
                resultado.novoSaldoDestinatario
            );
                
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Erro ao transferir Gramas:', error);
            await interaction.editReply('Ocorreu um erro ao processar a transferência. Tente novamente mais tarde.');
        }
    }
};

function criarEmbedTransferencia(nomeRemetente, nomeDestinatario, quantia, saldoRemetente, saldoDestinatario) {
    return new EmbedBuilder()
        .setColor(gerarCorAleatoria())
        .setTitle('💸 Transferência de Gramas')
        .setDescription(`**${nomeRemetente}** transferiu **${quantia.toLocaleString('pt-BR')} Gramas** para **${nomeDestinatario}**!`)
        .addFields(
            { name: '💰 Novo saldo do remetente', value: `${saldoRemetente.toLocaleString('pt-BR')} Gramas`, inline: true },
            { name: '💰 Novo saldo do destinatário', value: `${saldoDestinatario.toLocaleString('pt-BR')} Gramas`, inline: true }
        )
        .setTimestamp();
}