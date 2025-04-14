const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getCollection } = require('../../configuracoes/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('custom-cor')
        .setDescription('Exibe as cores disponíveis para personalização.'),
    
    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            // Busca as cores do banco de dados
            const coresCollection = await getCollection('coresNivel');
            const coresDoc = await coresCollection.findOne({ _id: 'cores' });
            
            if (!coresDoc || !coresDoc.roles) {
                return interaction.editReply('Nenhuma cor disponível no momento.');
            }
            
            // Verificar os cargos atuais do usuário
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const cargosUsuario = member.roles.cache.map(role => role.id);
            
            // Buscar os cargos de nível do banco de dados
            const cargosNivelCollection = await getCollection('cargosNivel');
            // Buscar o documento correto 
            const cargosNivelDoc = await cargosNivelCollection.findOne();
            
            // Mapear relação entre níveis e cargos
            const cargosNivelMap = new Map();
            
            if (cargosNivelDoc && cargosNivelDoc.cargos && Array.isArray(cargosNivelDoc.cargos)) {
                cargosNivelDoc.cargos.forEach(cargo => {
                    if (cargo.nivel && cargo.id) {
                        cargosNivelMap.set(cargo.nivel, cargo.id);
                    }
                });
            }
            
            // Busca informações de nível do usuário
            const rankCollection = await getCollection('rank');
            const rankDoc = await rankCollection.findOne({ _id: 'main' });
            
            let userLevel = 0;
            if (rankDoc && rankDoc.users) {
                const userData = rankDoc.users.find(user => user.userId === interaction.user.id);
                if (userData) {
                    userLevel = userData.level || 0;
                }
            }
            
            // Verificar qual é o cargo de nível mais alto que o usuário possui
            let nivelMaximoUsuario = 0;
            
            if (cargosNivelDoc && cargosNivelDoc.cargos) {
                // Ordenar cargos por nível (do maior para o menor)
                const cargosOrdenados = [...cargosNivelDoc.cargos].sort((a, b) => b.nivel - a.nivel);
                
                // Encontrar o cargo de nível mais alto que o usuário possui
                for (const cargo of cargosOrdenados) {
                    if (cargosUsuario.includes(cargo.id)) {
                        nivelMaximoUsuario = cargo.nivel;
                        break;
                    }
                }
            }
            
            // Filtrar paletas - concedendo acesso a paletas de níveis inferiores
            const paletasOriginal = Object.keys(coresDoc.roles);
            const paletas = paletasOriginal.filter(paleta => {
                // Cores básicas (sem nível) estão sempre disponíveis
                if (!paleta.startsWith('nivel')) {
                    return true;
                }
                
                // Para paletas de nível, verificar se é de nível inferior ou igual ao máximo
                const nivelRequerido = parseInt(paleta.replace('nivel', '')) || 0;
                
                // Acesso hierárquico - libera cores de nível inferior ou igual ao nível máximo do usuário
                return nivelMaximoUsuario >= nivelRequerido;
            });
            
            if (paletas.length === 0) {
                return interaction.editReply('Você não tem acesso a nenhuma cor personalizada. Obtenha os cargos necessários para desbloquear cores exclusivas. Use /custom-perfil para ver qual cargo você deveria ter.');
            }
            
            // Inicialização de estados
            let paletaAtual = 0; // Índice da paleta atual
            let corAtual = 0;    // Índice da cor atual dentro da paleta
            
            // Função para obter a paleta atual
            const getPaletaAtual = () => {
                const paletaNome = paletas[paletaAtual];
                return {
                    nome: paletaNome,
                    cores: coresDoc.roles[paletaNome]
                };
            };
            
            // Função para obter a cor atual
            const getCorAtual = () => {
                const paleta = getPaletaAtual();
                const corNomes = Object.keys(paleta.cores);
                const corNome = corNomes[corAtual];
                return {
                    nome: corNome,
                    ...paleta.cores[corNome]
                };
            };
            
            // Função para criar o embed
            const criarEmbed = () => {
                const paleta = getPaletaAtual();
                const cor = getCorAtual();
                const corNomes = Object.keys(paleta.cores);
                
                // Formata o nome para exibição (transforma camelCase em palavras)
                const formatarNome = (nome) => {
                    return nome
                        .replace(/([A-Z])/g, ' $1') // Insere espaço antes de cada letra maiúscula
                        .replace(/^./, str => str.toUpperCase()); // Primeira letra maiúscula
                };
                
                // Verifica se a paleta é um nível
                const eNivel = paleta.nome.startsWith('nivel');
                const titulo = eNivel ? `Nível ${paleta.nome.replace('nivel', '')}` : 
                    formatarNome(paleta.nome);
                
                return new EmbedBuilder()
                    .setTitle(`Cor: ${formatarNome(cor.nome)}`)
                    .setDescription(`Paleta: **${titulo}**`)
                    .setColor(cor.hex)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ 
                        text: `Paleta ${paletaAtual + 1}/${paletas.length} • Cor ${corAtual + 1}/${corNomes.length}` 
                    });
            };
            
            // Função para verificar se o usuário já tem algum cargo de cor
            const verificarCargoCor = async () => {
                // Obtem todos os IDs de cargo de cor
                const todosCargosCor = [];
                for (const paleta in coresDoc.roles) {
                    for (const corNome in coresDoc.roles[paleta]) {
                        todosCargosCor.push(coresDoc.roles[paleta][corNome].id);
                    }
                }
                
                // Verifica se o membro tem algum desses cargos
                return member.roles.cache.find(role => todosCargosCor.includes(role.id));
            };
            
            // Função para definir a cor escolhida
            const definirCor = async (btnInteraction) => {
                try {
                    await btnInteraction.deferUpdate();
                    
                    const cor = getCorAtual();
                    const cargoId = cor.id;
                    
                    // Obtém o cargo pelo ID
                    const cargo = interaction.guild.roles.cache.get(cargoId);
                    if (!cargo) {
                        return btnInteraction.followUp({
                            content: `❌ O cargo com ID ${cargoId} não foi encontrado.`,
                            ephemeral: true
                        });
                    }
                    
                    // Verifica se o membro já tem um cargo de cor e remove, se tiver
                    const cargoCorAtual = await verificarCargoCor();
                    if (cargoCorAtual) {
                        await member.roles.remove(cargoCorAtual);
                    }
                    
                    // Adiciona o novo cargo de cor
                    await member.roles.add(cargo);
                    
                    // Confirma a atribuição
                    await btnInteraction.followUp({
                        content: `✅ Cor **${cor.nome.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}** definida com sucesso!`,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Erro ao definir cor:', error);
                    await btnInteraction.followUp({
                        content: '❌ Ocorreu um erro ao definir a cor. Tente novamente mais tarde.',
                        ephemeral: true
                    });
                }
            };
            
            // Função para criar botões de navegação
            const criarBotoes = () => {
                const paleta = getPaletaAtual();
                const corNomes = Object.keys(paleta.cores);
                
                const botoesPaleta = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('paleta_anterior')
                        .setLabel('◀️ Paleta Anterior')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(paletaAtual === 0),
                    
                    new ButtonBuilder()
                        .setCustomId('paleta_proxima')
                        .setLabel('Próxima Paleta ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(paletaAtual === paletas.length - 1)
                );
                
                const botoesCor = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('cor_anterior')
                        .setLabel('⬅️ Cor Anterior')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(corAtual === 0),
                    
                    new ButtonBuilder()
                        .setCustomId('definir_cor')
                        .setLabel('✨ Escolher Esta Cor')
                        .setStyle(ButtonStyle.Success),
                    
                    new ButtonBuilder()
                        .setCustomId('cor_proxima')
                        .setLabel('Próxima Cor ➡️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(corAtual === corNomes.length - 1)
                );
                
                return [botoesPaleta, botoesCor];
            };
            
            // Envia a primeira visualização
            const mensagem = await interaction.editReply({
                embeds: [criarEmbed()],
                components: criarBotoes(),
                fetchReply: true
            });
            
            // Cria um coletor para os botões
            const coletor = mensagem.createMessageComponentCollector({
                time: 120000 // 2 minutos
            });
            
            // Gerencia as interações com os botões
            coletor.on('collect', async (btnInteraction) => {
                if (btnInteraction.user.id !== interaction.user.id) {
                    return btnInteraction.reply({
                        content: 'Apenas quem usou o comando pode interagir com estes botões.',
                        ephemeral: true
                    });
                }
                
                // Lógica de definição de cor
                if (btnInteraction.customId === 'definir_cor') {
                    await definirCor(btnInteraction);
                    return;
                }
                
                const paleta = getPaletaAtual();
                const corNomes = Object.keys(paleta.cores);
                
                // Lógica de navegação
                if (btnInteraction.customId === 'paleta_anterior') {
                    paletaAtual--;
                    corAtual = 0; // Reset para a primeira cor ao mudar de paleta
                } else if (btnInteraction.customId === 'paleta_proxima') {
                    paletaAtual++;
                    corAtual = 0; // Reset para a primeira cor ao mudar de paleta
                } else if (btnInteraction.customId === 'cor_anterior') {
                    corAtual--;
                } else if (btnInteraction.customId === 'cor_proxima') {
                    corAtual++;
                }
                
                // Atualiza a mensagem
                await btnInteraction.update({
                    embeds: [criarEmbed()],
                    components: criarBotoes()
                });
            });
            
            // Quando o tempo expira, remove os botões
            coletor.on('end', () => {
                interaction.editReply({
                    components: []
                }).catch(() => {}); // Ignora erros se a mensagem foi deletada
            });
            
        } catch (error) {
            console.error('Erro ao executar o comando /custom-cor:', error);
            const mensagem = interaction.replied || interaction.deferred ? 
                interaction.editReply : interaction.reply;
            
            await mensagem.call(interaction, {
                content: 'Ocorreu um erro ao buscar as cores. Tente novamente mais tarde.',
                ephemeral: true
            }).catch(() => {});
        }
    }
};