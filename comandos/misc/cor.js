const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getCollection } = require('../../configuracoes/mongodb.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cor')
        .setDescription('Exibe as cores disponíveis para personalização.'),
    
    async execute(interaction) {
        try {
            if (interaction.deferred || interaction.replied || interaction.responded) {
                return;
            }
            
            await interaction.deferReply();
            
            const coresCollection = await getCollection('configuracoes');
            const coresDoc = await coresCollection.findOne({ _id: 'cores' });
            
            if (!coresDoc || !coresDoc.roles) {
                return interaction.editReply('Nenhuma cor disponível no momento.');
            }
            
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const cargosUsuario = member.roles.cache.map(role => role.id);
            
            const cargosNivelCollection = await getCollection('cargosNivel');
            const cargosNivelDoc = await cargosNivelCollection.findOne();
            
            const cargosNivelMap = new Map();
            
            if (cargosNivelDoc?.cargos?.length) {
                cargosNivelDoc.cargos.forEach(cargo => {
                    if (cargo.nivel && cargo.id) {
                        cargosNivelMap.set(cargo.nivel, cargo.id);
                    }
                });
            }
            
            const rankCollection = await getCollection('dadosUsuarios');
            const rankDoc = await rankCollection.findOne({ _id: 'niveis' });
            
            let userLevel = 0;
            if (rankDoc?.users) {
                const userData = rankDoc.users.find(user => user.userId === interaction.user.id);
                if (userData) {
                    userLevel = userData.level || 0;
                }
            }
            
            let nivelMaximoUsuario = 0;
            
            if (cargosNivelDoc?.cargos) {
                const cargosOrdenados = [...cargosNivelDoc.cargos].sort((a, b) => b.nivel - a.nivel);
                
                for (const cargo of cargosOrdenados) {
                    if (cargosUsuario.includes(cargo.id)) {
                        nivelMaximoUsuario = cargo.nivel;
                        break;
                    }
                }
            }
            
            const paletasOriginal = Object.keys(coresDoc.roles);
            const paletas = paletasOriginal.filter(paleta => {
                if (!paleta.startsWith('nivel')) {
                    return true;
                }
                
                const nivelRequerido = parseInt(paleta.replace('nivel', '')) || 0;
                return nivelMaximoUsuario >= nivelRequerido;
            });
            
            if (paletas.length === 0) {
                return interaction.editReply('Você não tem acesso a nenhuma cor personalizada. Obtenha os cargos necessários para desbloquear cores exclusivas. Use /custom-perfil para ver qual cargo você deveria ter.');
            }
            
            const state = {
                paletaAtual: 0,
                corAtual: 0
            };
            
            const getPaletaAtual = () => {
                const paletaNome = paletas[state.paletaAtual];
                return {
                    nome: paletaNome,
                    cores: coresDoc.roles[paletaNome]
                };
            };
            
            const getCorAtual = () => {
                const paleta = getPaletaAtual();
                const corNomes = Object.keys(paleta.cores);
                const corNome = corNomes[state.corAtual];
                return {
                    nome: corNome,
                    ...paleta.cores[corNome]
                };
            };
            
            const formatarNome = (nome) => {
                return nome
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase());
            };
            
            const criarEmbed = () => {
                const paleta = getPaletaAtual();
                const cor = getCorAtual();
                const corNomes = Object.keys(paleta.cores);
                
                const eNivel = paleta.nome.startsWith('nivel');
                const titulo = eNivel ? `Nível ${paleta.nome.replace('nivel', '')}` : 
                    formatarNome(paleta.nome);
                
                const colorHex = cor.hex.replace('#', '');
                const colorImageUrl = `https://singlecolorimage.com/get/${colorHex}/200x200`;
                
                return new EmbedBuilder()
                    .setTitle(`Cor: ${formatarNome(cor.nome)}`)
                    .setDescription(`Paleta: **${titulo}**`)
                    .setColor(cor.hex)
                    .setThumbnail(colorImageUrl)
                    .setFooter({ 
                        text: `Paleta ${state.paletaAtual + 1}/${paletas.length} • Cor ${state.corAtual + 1}/${corNomes.length}` 
                    });
            };
            
            const getAllColorRoleIds = () => {
                const ids = [];
                for (const paleta in coresDoc.roles) {
                    for (const corNome in coresDoc.roles[paleta]) {
                        ids.push(coresDoc.roles[paleta][corNome].id);
                    }
                }
                return ids;
            };
            
            const verificarCargoCor = () => {
                const todosCargosCorIds = getAllColorRoleIds();
                return member.roles.cache.find(role => todosCargosCorIds.includes(role.id));
            };
            
            const definirCor = async (btnInteraction) => {
                try {
                    await btnInteraction.deferUpdate();
                    
                    const cor = getCorAtual();
                    const cargoId = cor.id;
                    
                    const cargo = interaction.guild.roles.cache.get(cargoId);
                    if (!cargo) {
                        return interaction.editReply({
                            content: `❌ O cargo com ID ${cargoId} não foi encontrado.`,
                            embeds: [],
                            components: []
                        });
                    }
                    
                    const cargoCorAtual = verificarCargoCor();
                    if (cargoCorAtual) {
                        await member.roles.remove(cargoCorAtual);
                    }
                    
                    await member.roles.add(cargo);
                    
                    // Edita a mensagem principal para mostrar sucesso e a cor escolhida
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(`✅ Cor alterada com sucesso!`)
                                .setDescription(`Sua cor agora é **${formatarNome(cor.nome)}**.`)
                                .setColor(cor.hex)
                                .setThumbnail(`https://singlecolorimage.com/get/${cor.hex.replace('#', '')}/200x200`)
                        ],
                        components: []
                    });
                } catch (error) {
                    console.error('Erro ao definir cor:', error);
                    await interaction.editReply({
                        content: '❌ Ocorreu um erro ao definir a cor. Tente novamente mais tarde.',
                        embeds: [],
                        components: []
                    });
                }
            };
            
            const criarBotoes = () => {
                const paleta = getPaletaAtual();
                const corNomes = Object.keys(paleta.cores);
                
                const botoesPaleta = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('paleta_anterior')
                        .setLabel('◀️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(state.paletaAtual === 0),
                    
                    new ButtonBuilder()
                        .setCustomId('paleta_proxima')
                        .setLabel('▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(state.paletaAtual === paletas.length - 1)
                );
                
                const botoesCor = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('cor_anterior')
                        .setLabel('⬅️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(state.corAtual === 0),
                    
                        new ButtonBuilder()
                        .setCustomId('cor_proxima')
                        .setLabel('➡️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(state.corAtual === corNomes.length - 1),

                        new ButtonBuilder()
                        .setCustomId('definir_cor')
                        .setLabel('✨')
                        .setStyle(ButtonStyle.Success)
                    );
                
                return [botoesPaleta, botoesCor];
            };
            
            const mensagem = await interaction.editReply({
                embeds: [criarEmbed()],
                components: criarBotoes(),
                fetchReply: true
            });
            
            const coletor = mensagem.createMessageComponentCollector({
                time: 120000
            });
            
            coletor.on('collect', async (btnInteraction) => {
                if (btnInteraction.user.id !== interaction.user.id) {
                    return btnInteraction.reply({
                        content: 'Apenas quem usou o comando pode interagir com estes botões.',
                        ephemeral: true
                    });
                }
                
                if (btnInteraction.customId === 'definir_cor') {
                    await definirCor(btnInteraction);
                    return;
                }
                
                const paleta = getPaletaAtual();
                const corNomes = Object.keys(paleta.cores);
                
                switch(btnInteraction.customId) {
                    case 'paleta_anterior':
                        state.paletaAtual--;
                        state.corAtual = 0;
                        break;
                    case 'paleta_proxima':
                        state.paletaAtual++;
                        state.corAtual = 0;
                        break;
                    case 'cor_anterior':
                        state.corAtual--;
                        break;
                    case 'cor_proxima':
                        state.corAtual++;
                        break;
                }
                
                await btnInteraction.update({
                    embeds: [criarEmbed()],
                    components: criarBotoes()
                });
            });
            
            coletor.on('end', () => {
                interaction.editReply({
                    components: []
                }).catch(() => {});
            });
            
        } catch (error) {
            console.error('Erro ao executar o comando /cor:', error);
            const mensagem = interaction.replied || interaction.deferred ? 
                interaction.editReply : interaction.reply;
            
            await mensagem.call(interaction, {
                content: 'Ocorreu um erro ao buscar as cores. Tente novamente mais tarde.',
                ephemeral: true
            }).catch(() => {});
        }
    }
};