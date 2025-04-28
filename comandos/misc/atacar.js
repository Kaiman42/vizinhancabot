const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCollection, findOne, updateOne, COLLECTIONS } = require('../../configuracoes/mongodb');

// Configurações do jogo
const CONFIG = {
    tempoDesafio: 30000, // 30 segundos para aceitar o desafio
    vidaInicial: 100,    // Vida inicial dos jogadores
    danoBase: {
        min: 15,
        max: 30
    },
    defesaBase: {
        min: 10,
        max: 20
    },
    itens: {
        pocaoVida: {
            nome: "Poção de Vida",
            efeito: "Cura entre 25-40 pontos de vida",
            min: 25,
            max: 40
        },
        bomba: {
            nome: "Bomba",
            efeito: "Causa entre 30-45 pontos de dano",
            min: 30,
            max: 45
        }
    },
    vidaMaxima: 100,
    tempoDuracaoMensagem: 5000 // 5 segundos para duração das mensagens de ação
};

// Função para gerar um número aleatório entre min e max
function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Função para verificar se o usuário tem grama suficiente
async function verificarGrama(userId, quantidade) {
    try {
        const economiaCollection = await getCollection(COLLECTIONS.DADOS_USUARIOS);
        const economiaDoc = await economiaCollection.findOne({ _id: 'economias' });
        
        if (!economiaDoc || !economiaDoc.usuarios) return false;
        
        const usuario = economiaDoc.usuarios.find(u => u.userId === userId);
        return usuario && usuario.grama >= quantidade;
    } catch (error) {
        console.error('Erro ao verificar grama do usuário:', error);
        return false;
    }
}

// Função para transferir grama entre usuários
async function transferirGrama(perdedorId, vencedorId, quantidade) {
    if (quantidade <= 0) return true;
    
    try {
        const economiaCollection = await getCollection(COLLECTIONS.DADOS_USUARIOS);
        
        // Remover grama do perdedor
        await economiaCollection.updateOne(
            { _id: 'economias', 'usuarios.userId': perdedorId },
            { $inc: { 'usuarios.$.grama': -quantidade } }
        );
        
        // Adicionar grama ao vencedor
        await economiaCollection.updateOne(
            { _id: 'economias', 'usuarios.userId': vencedorId },
            { $inc: { 'usuarios.$.grama': quantidade } }
        );
        
        return true;
    } catch (error) {
        console.error('Erro ao transferir grama:', error);
        return false;
    }
}

// Função para registrar batalha no histórico
async function registrarBatalha(desafiante, desafiado, vencedor, quantidade) {
    try {
        const miniGameCollection = await getCollection(COLLECTIONS.MINI_GAME);
        
        await miniGameCollection.updateOne(
            { _id: 'ranking' },
            { 
                $push: { 
                    'batalhas': {
                        desafianteId: desafiante.id,
                        desafianteNome: desafiante.username,
                        desafiadoId: desafiado.id,
                        desafiadoNome: desafiado.username,
                        vencedorId: vencedor.id,
                        quantidade: quantidade,
                        data: new Date()
                    }
                }
            },
            { upsert: true }
        );
        
        // Atualizar estatísticas do vencedor
        await miniGameCollection.updateOne(
            { _id: 'ranking', 'jogadores.id': vencedor.id },
            { 
                $inc: { 
                    'jogadores.$.vitorias': 1,
                    'jogadores.$.gramaGanha': quantidade
                }
            }
        );
        
        // Se o jogador não existir, cria um registro
        await miniGameCollection.updateOne(
            { _id: 'ranking', 'jogadores.id': { $ne: vencedor.id } },
            {
                $push: {
                    'jogadores': {
                        id: vencedor.id,
                        nome: vencedor.username,
                        vitorias: 1,
                        derrotas: 0,
                        gramaGanha: quantidade
                    }
                }
            }
        );
        
        // Perdedor
        const perdedor = vencedor.id === desafiante.id ? desafiado : desafiante;
        
        // Atualizar estatísticas do perdedor
        await miniGameCollection.updateOne(
            { _id: 'ranking', 'jogadores.id': perdedor.id },
            { 
                $inc: { 
                    'jogadores.$.derrotas': 1,
                    'jogadores.$.gramaPerdida': quantidade
                }
            }
        );
        
        // Se o jogador não existir, cria um registro
        await miniGameCollection.updateOne(
            { _id: 'ranking', 'jogadores.id': { $ne: perdedor.id } },
            {
                $push: {
                    'jogadores': {
                        id: perdedor.id,
                        nome: perdedor.username,
                        vitorias: 0,
                        derrotas: 1,
                        gramaPerdida: quantidade
                    }
                }
            }
        );
        
        return true;
    } catch (error) {
        console.error('Erro ao registrar batalha:', error);
        return false;
    }
}

// Classe para gerenciar a batalha
class Batalha {
    constructor(desafiante, desafiado, quantidade, interaction) {
        this.desafiante = {
            user: desafiante,
            vida: CONFIG.vidaInicial,
            itens: {
                pocaoVida: 1,
                bomba: 1
            }
        };
        
        this.desafiado = {
            user: desafiado,
            vida: CONFIG.vidaInicial,
            itens: {
                pocaoVida: 1,
                bomba: 1
            }
        };
        
        this.quantidade = quantidade;
        this.interaction = interaction;
        this.turnoAtual = this.desafiante; // Desafiante começa
        this.oponente = this.desafiado;
        this.mensagemBatalha = null;
        this.mensagemAcao = null;
        this.terminada = false;
    }
    
    // Criar embed de batalha
    criarEmbedBatalha() {
        const embed = new EmbedBuilder()
            .setTitle('⚔️ Arena de Batalha ⚔️')
            .setDescription(`**${this.turnoAtual.user.username}** vs **${this.oponente.user.username}**`)
            .addFields(
                { name: `${this.desafiante.user.username}`, value: `❤️ Vida: ${this.desafiante.vida}/${CONFIG.vidaMaxima}`, inline: true },
                { name: `${this.desafiado.user.username}`, value: `❤️ Vida: ${this.desafiado.vida}/${CONFIG.vidaMaxima}`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: 'Itens:', value: `🧪 Poção: ${this.turnoAtual.itens.pocaoVida} | 💣 Bomba: ${this.turnoAtual.itens.bomba}`, inline: false },
                { name: 'Turno Atual:', value: `É a vez de **${this.turnoAtual.user.username}** fazer sua jogada!`, inline: false }
            )
            .setColor('#FF5733')
            .setFooter({ text: this.quantidade > 0 ? `Aposta: ${this.quantidade} gramas` : 'Batalha amistosa (sem aposta)' });
            
        return embed;
    }
    
    // Criar botões de ação
    criarBotoesAcao() {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('atacar')
                    .setLabel('⚔️ Atacar')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('defender')
                    .setLabel('🛡️ Defender')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('pocao')
                    .setLabel('🧪 Poção')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(this.turnoAtual.itens.pocaoVida <= 0),
                new ButtonBuilder()
                    .setCustomId('bomba')
                    .setLabel('💣 Bomba')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(this.turnoAtual.itens.bomba <= 0)
            );
        
        return row;
    }
    
    // Iniciar turno
    async iniciarTurno() {
        try {
            if (this.terminada) return;
            
            // Apagar mensagem de ação anterior se existir
            if (this.mensagemAcao) {
                try {
                    await this.mensagemAcao.delete().catch(() => {});
                    this.mensagemAcao = null;
                } catch (error) {
                    console.error('Erro ao deletar mensagem anterior:', error);
                }
            }
            
            const embed = this.criarEmbedBatalha();
            const botoes = this.criarBotoesAcao();
            
            if (!this.mensagemBatalha) {
                this.mensagemBatalha = await this.interaction.channel.send({
                    embeds: [embed],
                    components: [botoes]
                });
            } else {
                await this.mensagemBatalha.edit({
                    embeds: [embed],
                    components: [botoes]
                });
            }
            
            const filtro = i => i.user.id === this.turnoAtual.user.id && i.message.id === this.mensagemBatalha.id;
            
            const coletor = this.mensagemBatalha.createMessageComponentCollector({
                filter: filtro,
                time: 60000, // 60 segundos para fazer ação
                max: 1
            });
            
            coletor.on('collect', async (interacao) => {
                await this.processarAcao(interacao);
            });
            
            coletor.on('end', async (coletado) => {
                if (coletado.size === 0 && !this.terminada) {
                    // Tempo esgotado, o jogador perde o turno
                    this.mensagemAcao = await this.mensagemBatalha.reply({
                        content: `**${this.turnoAtual.user.username}** demorou demais e perdeu o turno!`,
                        ephemeral: false
                    });
                    
                    // Deletar a mensagem após 5 segundos
                    setTimeout(async () => {
                        if (this.mensagemAcao) {
                            await this.mensagemAcao.delete().catch(() => {});
                            this.mensagemAcao = null;
                        }
                    }, CONFIG.tempoDuracaoMensagem);
                    
                    this.proximoTurno();
                }
            });
        } catch (error) {
            console.error('Erro ao iniciar turno:', error);
        }
    }
    
    // Processar ação do jogador
    async processarAcao(interacao) {
        try {
            await interacao.deferUpdate();
            
            const acao = interacao.customId;
            let mensagem = '';
            
            switch (acao) {
                case 'atacar':
                    const dano = random(CONFIG.danoBase.min, CONFIG.danoBase.max);
                    this.oponente.vida -= dano;
                    mensagem = `**${this.turnoAtual.user.username}** atacou e causou **${dano}** de dano em **${this.oponente.user.username}**!`;
                    break;
                
                case 'defender':
                    const defesa = random(CONFIG.defesaBase.min, CONFIG.defesaBase.max);
                    this.turnoAtual.vida = Math.min(CONFIG.vidaMaxima, this.turnoAtual.vida + defesa);
                    mensagem = `**${this.turnoAtual.user.username}** se defendeu e recuperou **${defesa}** pontos de vida!`;
                    break;
                
                case 'pocao':
                    const cura = random(CONFIG.itens.pocaoVida.min, CONFIG.itens.pocaoVida.max);
                    this.turnoAtual.vida = Math.min(CONFIG.vidaMaxima, this.turnoAtual.vida + cura);
                    this.turnoAtual.itens.pocaoVida -= 1;
                    mensagem = `**${this.turnoAtual.user.username}** usou uma **Poção de Vida** e recuperou **${cura}** pontos de vida!`;
                    break;
                
                case 'bomba':
                    const danoBomba = random(CONFIG.itens.bomba.min, CONFIG.itens.bomba.max);
                    this.oponente.vida -= danoBomba;
                    this.turnoAtual.itens.bomba -= 1;
                    mensagem = `**${this.turnoAtual.user.username}** lançou uma **Bomba** em **${this.oponente.user.username}** causando **${danoBomba}** de dano!`;
                    break;
            }
            
            // Verificar se a batalha terminou
            if (this.oponente.vida <= 0 || this.turnoAtual.vida <= 0) {
                const vencedor = this.oponente.vida <= 0 ? this.turnoAtual : this.oponente;
                const perdedor = vencedor === this.turnoAtual ? this.oponente : this.turnoAtual;
                
                perdedor.vida = 0;
                this.terminada = true;
                
                // Se houver uma mensagem de ação anterior, apague-a
                if (this.mensagemAcao) {
                    await this.mensagemAcao.delete().catch(() => {});
                }
                
                // Enviar mensagem de vitória
                this.mensagemAcao = await this.mensagemBatalha.reply({
                    content: `${mensagem}\n\n**${vencedor.user.username}** venceu a batalha contra **${perdedor.user.username}**!${this.quantidade > 0 ? ` E ganhou ${this.quantidade} gramas!` : ''}`,
                    ephemeral: false
                });
                
                // Transferir grama se houver aposta
                if (this.quantidade > 0) {
                    await transferirGrama(perdedor.user.id, vencedor.user.id, this.quantidade);
                }
                
                // Registrar a batalha
                await registrarBatalha(this.desafiante.user, this.desafiado.user, vencedor.user, this.quantidade);
                
                // Atualizar embed final
                const embedFinal = new EmbedBuilder()
                    .setTitle('⚔️ Batalha Concluída ⚔️')
                    .setDescription(`**${vencedor.user.username}** venceu a batalha!`)
                    .addFields(
                        { name: `${this.desafiante.user.username}`, value: `❤️ Vida: ${this.desafiante.vida}/${CONFIG.vidaMaxima}`, inline: true },
                        { name: `${this.desafiado.user.username}`, value: `❤️ Vida: ${this.desafiado.vida}/${CONFIG.vidaMaxima}`, inline: true }
                    )
                    .setColor('#32CD32')
                    .setFooter({ text: this.quantidade > 0 ? `${vencedor.user.username} ganhou ${this.quantidade} gramas!` : 'Batalha amistosa concluída!' });
                
                await this.mensagemBatalha.edit({ 
                    embeds: [embedFinal],
                    components: []
                });
                
                return;
            }
            
            // Se houver uma mensagem de ação anterior, apague-a
            if (this.mensagemAcao) {
                await this.mensagemAcao.delete().catch(() => {});
            }
            
            // Enviar nova mensagem de ação
            this.mensagemAcao = await this.mensagemBatalha.reply({
                content: mensagem,
                ephemeral: false
            });
            
            // Configurar um temporizador para excluir a mensagem após 5 segundos
            setTimeout(async () => {
                if (this.mensagemAcao && !this.terminada) {
                    await this.mensagemAcao.delete().catch(() => {});
                    this.mensagemAcao = null;
                }
            }, CONFIG.tempoDuracaoMensagem);
            
            this.proximoTurno();
            
        } catch (error) {
            console.error('Erro ao processar ação:', error);
        }
    }
    
    // Próximo turno
    proximoTurno() {
        // Trocar turno
        const temp = this.turnoAtual;
        this.turnoAtual = this.oponente;
        this.oponente = temp;
        
        // Iniciar próximo turno
        this.iniciarTurno();
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('atacar')
        .setDescription('Desafie outro usuário para uma batalha!')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O usuário que você deseja desafiar')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('quantidade')
                .setDescription('Quantidade de gramas para apostar (opcional)')
                .setRequired(false)
                .setMinValue(0)),
                
    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            const desafiante = interaction.user;
            const desafiado = interaction.options.getUser('usuario');
            const quantidade = interaction.options.getInteger('quantidade') || 0;
            
            // Verificações básicas
            if (desafiado.bot) {
                return interaction.editReply('Você não pode desafiar um bot para uma batalha!');
            }
            
            if (desafiado.id === desafiante.id) {
                return interaction.editReply('Você não pode se desafiar para uma batalha!');
            }
            
            // Verificar se tem grama suficiente
            if (quantidade > 0) {
                const temGrama = await verificarGrama(desafiante.id, quantidade);
                if (!temGrama) {
                    return interaction.editReply(`Você não tem ${quantidade} gramas para apostar nesta batalha!`);
                }
                
                const desafiadoTemGrama = await verificarGrama(desafiado.id, quantidade);
                if (!desafiadoTemGrama) {
                    return interaction.editReply(`${desafiado.username} não tem ${quantidade} gramas para aceitar esta aposta!`);
                }
            }
            
            // Criar embed de desafio
            const desafioEmbed = new EmbedBuilder()
                .setTitle('⚔️ Desafio para Batalha! ⚔️')
                .setDescription(`**${desafiante.username}** desafiou **${desafiado.username}** para uma batalha${quantidade > 0 ? ` apostando ${quantidade} gramas!` : '!'}`)
                .setColor('#FF9900')
                .addFields(
                    { name: 'Como funciona?', value: 'Os jogadores se alternam em turnos, escolhendo entre atacar, defender ou usar itens.', inline: false },
                    { name: 'Tempo para aceitar:', value: '30 segundos', inline: true },
                )
                .setFooter({ text: 'Clique no botão abaixo para aceitar ou recusar o desafio.' });
                
            // Criar botões
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('aceitar')
                        .setLabel('⚔️ Aceitar Desafio')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('recusar')
                        .setLabel('❌ Recusar')
                        .setStyle(ButtonStyle.Danger)
                );
                
            const mensagem = await interaction.editReply({
                content: `<@${desafiado.id}>, você foi desafiado para uma batalha!`,
                embeds: [desafioEmbed],
                components: [row]
            });
            
            // Coletor para resposta
            const filtro = i => i.user.id === desafiado.id;
            
            const coletor = mensagem.createMessageComponentCollector({
                filter: filtro,
                time: CONFIG.tempoDesafio,
                max: 1
            });
            
            coletor.on('collect', async (interacao) => {
                if (interacao.customId === 'aceitar') {
                    await interacao.update({
                        content: '⚔️ Desafio aceito! Preparando a arena...',
                        embeds: [],
                        components: []
                    });
                    
                    // Iniciar batalha
                    const batalha = new Batalha(desafiante, desafiado, quantidade, interaction);
                    await batalha.iniciarTurno();
                } else {
                    await interacao.update({
                        content: `${desafiado.username} recusou o desafio de ${desafiante.username}.`,
                        embeds: [],
                        components: []
                    });
                }
            });
            
            coletor.on('end', async (coletado) => {
                if (coletado.size === 0) {
                    await interaction.editReply({
                        content: `${desafiado.username} não respondeu ao desafio de ${desafiante.username} a tempo.`,
                        embeds: [],
                        components: []
                    });
                }
            });
            
        } catch (error) {
            console.error('Erro ao executar o comando atacar:', error);
            return interaction.editReply('Ocorreu um erro ao executar este comando. Tente novamente mais tarde.');
        }
    }
};