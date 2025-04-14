const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor');
const { getCollection } = require('../../configuracoes/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('custom-perfil')
        .setDescription('Exibe informações detalhadas do perfil de um usuário')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O usuário para ver o perfil (opcional)')
                .setRequired(false)),

    async execute(interaction, ignis) {
        await interaction.deferReply();
        
        // Get the target user (mentioned or command user)
        const targetUser = interaction.options.getUser('usuario') || interaction.user;
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        if (!member) {
            return interaction.editReply('Não foi possível encontrar este usuário no servidor.');
        }
        
        // Calculate join dates - formatando apenas a data, sem a hora
        const discordJoinDate = new Date(targetUser.createdAt).toLocaleDateString('pt-BR');
        const serverJoinDate = new Date(member.joinedAt).toLocaleDateString('pt-BR');
        
        // Check if user is a server booster
        const isBooster = member.premiumSince ? 'Sim' : 'Não';
        
        // Get user status - improved version
        let status = 'Offline';
        if (member.presence) {
            const presenceStatus = member.presence.status;
            switch (presenceStatus) {
                case 'online': status = '🟢 Online'; break;
                case 'idle': status = '🟠 Ausente'; break;
                case 'dnd': status = '🔴 Não perturbe'; break;
                default: status = '⚫ Offline'; break;
            }
        } else {
            status = '⚫ Offline';
        }
        
        // Important note: For status to work properly, the bot needs GUILD_PRESENCES intent enabled
        
        // Check for specific roles (you can customize this list later)
        const importantRoles = [
            // Add your important role IDs here - replace with actual role IDs
            '',  // Example: Admin
            '9876543210987654321'   // Example: Moderator
        ];
        
        // Display all roles instead of filtering if no important roles are defined
        let userRoles;
        if (importantRoles.length === 0 || importantRoles.every(id => id.includes('Example'))) {
            userRoles = member.roles.cache
                .filter(role => role.id !== interaction.guild.id) // Filter out @everyone
                .map(role => role.name)
                .join(', ') || 'Nenhum cargo';
        } else {
            userRoles = member.roles.cache
                .filter(role => importantRoles.includes(role.id))
                .map(role => role.name)
                .join(', ') || 'Nenhum cargo importante';
        }

        // Get level progression information
        let levelInfo = 'Dados de nível não disponíveis';
        let currentLevel = 0;
        let currentXP = 0;
        let xpForNextLevel = 0;
        let progressPercentage = 0;
        let cargoNivelInfo = '';
        
        try {
            if (ignis && ignis.database) {
                // Buscar o documento principal que contém todos os usuários
                const mainDoc = await ignis.database.rank.findOne({ _id: 'main' });
                
                // Também acessar as utilidades do módulo niveis para cálculo de XP
                const niveis = require('../../eventos/niveis');
                
                if (mainDoc && mainDoc.users && Array.isArray(mainDoc.users)) {
                    // Encontrar o usuário específico no array de usuários
                    const userData = mainDoc.users.find(user => user.userId === targetUser.id);
                    
                    if (userData) {
                        // Calcular progresso de nível
                        currentLevel = userData.level || 0;
                        currentXP = userData.xp || 0;
                        xpForNextLevel = niveis.utils.calculateRequiredXP(currentLevel);
                        const xpRemaining = xpForNextLevel - currentXP;
                        
                        // Criar barra de progresso
                        const progressBarLength = 15;
                        const progress = Math.min((currentXP / xpForNextLevel) * progressBarLength, progressBarLength);
                        const progressBar = '■'.repeat(Math.floor(progress)) + '□'.repeat(progressBarLength - Math.floor(progress));
                        progressPercentage = ((currentXP / xpForNextLevel) * 100).toFixed(1);
                        
                        // Formatar informações de nível
                        levelInfo = `**Nível atual:** ${currentLevel}\n` +
                                    `**Faltam:** ${xpRemaining} XP para o próximo nível\n` +
                                    `**Progresso:** \`${progressBar}\` (${progressPercentage}%)`;
                        
                        console.log(`Dados de nível encontrados para ${targetUser.username}: Nível ${currentLevel}, XP ${currentXP}/${xpForNextLevel}`);
                        
                        // Verificar cargo de nível do usuário
                        try {
                            const cargosNivelCollection = await getCollection('cargosNivel');
                            const cargosDoc = await cargosNivelCollection.findOne({ _id: { $exists: true } });
                            
                            if (cargosDoc && cargosDoc.cargos && Array.isArray(cargosDoc.cargos)) {
                                // Encontrar o cargo do nível atual ou o nível mais próximo abaixo
                                let cargoNivel = null;
                                let cargoNivelApropriado = null;
                                
                                // Classifica os cargos em ordem decrescente de nível
                                const cargosOrdenados = [...cargosDoc.cargos].sort((a, b) => b.nivel - a.nivel);
                                
                                // Encontrar o cargo de nível apropriado para o usuário
                                for (const cargo of cargosOrdenados) {
                                    if (currentLevel >= cargo.nivel) {
                                        cargoNivelApropriado = cargo;
                                        break;
                                    }
                                }
                                
                                // Verificar se o usuário tem o cargo
                                const temCargo = cargoNivelApropriado ? member.roles.cache.has(cargoNivelApropriado.id) : false;
                                
                                if (cargoNivelApropriado) {
                                    if (temCargo) {
                                        cargoNivelInfo = `\n\n**Cargo de Nível:** ${cargoNivelApropriado.nome} ✅`;
                                    } else {
                                        cargoNivelInfo = `\n\n**Cargo de Nível Recomendado:** ${cargoNivelApropriado.nome} ❌\n*Você não possui o cargo de nível apropriado. Use /custom-cor para solicitar.*`;
                                    }
                                    
                                    // Se tiver próximo nível, mostrar informação
                                    const proximoIndex = cargosOrdenados.findIndex(c => c.id === cargoNivelApropriado.id) - 1;
                                    if (proximoIndex >= 0) {
                                        const proximoNivel = cargosOrdenados[proximoIndex];
                                        cargoNivelInfo += `\n**Próximo cargo:** ${proximoNivel.nome} (Nível ${proximoNivel.nivel})`;
                                    }
                                } else {
                                    cargoNivelInfo = "\n\n**Cargo de Nível:** Você ainda não atingiu o nível mínimo para obter um cargo.";
                                }
                            } else {
                                console.log('Documento de cargos de nível não encontrado ou mal formatado');
                            }
                        } catch (error) {
                            console.error('Erro ao verificar cargos de nível:', error);
                        }
                        
                    } else {
                        console.log(`Usuário ${targetUser.username} não encontrado no array de usuários`);
                        levelInfo = 'Usuário ainda não ganhou XP';
                    }
                } else {
                    console.log(`Documento principal não encontrado ou não contém array de usuários`);
                    levelInfo = 'Usuário ainda não ganhou XP';
                }
            } else {
                console.error('Conexão com o banco de dados não disponível no contexto ignis');
                levelInfo = 'Erro de conexão com o banco de dados';
            }
        } catch (error) {
            console.error('Erro ao obter dados de nível:', error);
            levelInfo = 'Erro ao obter dados de nível: ' + error.message;
        }

        // Create the embed
        const embed = new EmbedBuilder()
            .setColor(gerarCorAleatoria())
            .setTitle(`Perfil de ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '📅 Entrou no Discord em', value: discordJoinDate, inline: true },
                { name: '🏠 Entrou no servidor em', value: serverJoinDate, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '📊 Status', value: status, inline: true },
                { name: '🚀 Impulsionador', value: isBooster, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '🏆 Cargos importantes', value: userRoles },
                { name: '📈 Progressão de Nível', value: levelInfo + cargoNivelInfo }
            )
            .setFooter({ text: `ID: ${targetUser.id}` })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    }
};
