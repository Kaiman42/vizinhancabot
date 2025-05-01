const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor.js');
const mongodb = require('../../configuracoes/mongodb.js');
const economia = require('../../configuracoes/economia.js');
const { criarBarraProgressoXP } = require('../../configuracoes/barraProgresso.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Exibe informações detalhadas do perfil de um usuário')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O usuário para ver o perfil (opcional)')
                .setRequired(false)),

    async execute(interaction, ignis) {
        // Verificar cooldown
        const userId = interaction.user.id;
        const cooldownKey = `perfil_${userId}`;
        const cooldownAmount = 60000; // 1 minuto em milissegundos

        if (!global.cooldowns) {
            global.cooldowns = new Map();
        }

        if (global.cooldowns.has(cooldownKey)) {
            const expirationTime = global.cooldowns.get(cooldownKey);
            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return interaction.reply({ 
                    content: `⏰ Por favor, aguarde ${timeLeft.toFixed(1)} segundos antes de usar o comando novamente.`,
                    flags: 'Ephemeral' 
                });
            }
        }

        // Definir o cooldown
        global.cooldowns.set(cooldownKey, Date.now() + cooldownAmount);
        setTimeout(() => global.cooldowns.delete(cooldownKey), cooldownAmount);

        await interaction.deferReply();
        
        const targetUser = interaction.options.getUser('usuario') || interaction.user;
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        if (!member) {
            return interaction.editReply('Não foi possível encontrar este usuário no servidor.');
        }
        
        const discordJoinDate = new Date(targetUser.createdAt).toLocaleDateString('pt-BR');
        const serverJoinDate = new Date(member.joinedAt).toLocaleDateString('pt-BR');
        
        const isBooster = member.premiumSince ? 'Sim' : 'Não';
        
        let status = '⚫ Offline';
        if (member.presence) {
            const presenceStatus = member.presence.status;
            switch (presenceStatus) {
                case 'online': status = '🟢 Online'; break;
                case 'idle': status = '🟠 Ausente'; break;
                case 'dnd': status = '🔴 Não perturbe'; break;
            }
        }
        
        let userRoles = 'Nenhum';
        const escoposDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'escopos' });
        
        if (escoposDoc) {
            const importantRoleIds = [];
            
            if (escoposDoc.cargos) {
                for (const tipo in escoposDoc.cargos) {
                    if (escoposDoc.cargos[tipo] && escoposDoc.cargos[tipo].id) {
                        importantRoleIds.push(escoposDoc.cargos[tipo].id);
                    }
                }
            }
            
            const userImportantRoles = member.roles.cache
                .filter(role => importantRoleIds.includes(role.id))
                .map(role => role.name);
            
            if (userImportantRoles.length > 0) {
                userRoles = userImportantRoles.join(', ');
            }
        }

        let currentLevel = 0;
        let currentXP = 0;
        let xpForNextLevel = 0;
        let progressPercentage = 0;
        let progressBar = '';
        let cargoNome = 'Nenhum';
        let rankDisplay = 'Nenhum';
        
        // Sistema de níveis
        if (ignis && ignis.database) {
            const mainDoc = await ignis.database.collection('dadosUsuarios').findOne({ _id: 'niveis' });
            const niveis = require('../../eventos/niveis');
            
            if (mainDoc && mainDoc.users && Array.isArray(mainDoc.users)) {
                const userData = mainDoc.users.find(user => user.userId === targetUser.id);
                
                if (userData && (userData.level > 0 || userData.xp > 0)) {
                    currentLevel = userData.level || 0;
                    currentXP = userData.xp || 0;
                    xpForNextLevel = niveis.utils.calculateRequiredXP(currentLevel);
                    
                    const barraProgresso = criarBarraProgressoXP(currentXP, xpForNextLevel);
                    progressBar = barraProgresso.barra;
                    progressPercentage = barraProgresso.progresso;
                    rankDisplay = `Nível ${currentLevel} (${progressPercentage}%)\n\`${progressBar}\``;
                    
                    const patentesDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'patentes' });
                    
                    if (patentesDoc && patentesDoc.cargos && Array.isArray(patentesDoc.cargos)) {
                        const cargosOrdenados = [...patentesDoc.cargos].sort((a, b) => b.nivel - a.nivel);
                        
                        let cargoNivelApropriado = null;
                        for (const cargo of cargosOrdenados) {
                            if (currentLevel >= cargo.nivel) {
                                cargoNivelApropriado = cargo;
                                break;
                            }
                        }
                        
                        if (cargoNivelApropriado) {
                            cargoNome = `<@&${cargoNivelApropriado.id}>`;
                        }
                    }
                }
            }
        }

        // Sistema de cores - separado do sistema de níveis
        let corUsuario = 'Nenhuma cor selecionada\n       *Use /cor*';
        try {
            const coresDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'cores' });
            if (coresDoc?.roles) {
                for (const categoria in coresDoc.roles) {
                    const cores = coresDoc.roles[categoria];
                    for (const corNome in cores) {
                        if (cores[corNome].id && member.roles.cache.has(cores[corNome].id)) {
                            corUsuario = `<@&${cores[corNome].id}>`;
                            break;
                        }
                    }
                    if (corUsuario !== 'Nenhuma cor selecionada\n       *Use /cor*') break;
                }
            }
        } catch (error) {
            console.error('Erro ao buscar cores:', error);
        }
        
        const saldoGrama = await economia.obterSaldo(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(gerarCorAleatoria())
            .setTitle(`Perfil de ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '📅 Criou desde', value: `> ${discordJoinDate}`, inline: true },
                { name: '🏠 Membro desde', value: `> ${serverJoinDate}`, inline: true },
                { name: '🚀 Impulsor', value: `> ${isBooster}`, inline: true },
                { name: '📊 Status', value: `> ${status}`, inline: true },
                { name: '💲 Grama', value: `> ${saldoGrama.toLocaleString('pt-BR')}`, inline: true },
                { name: '🔰 Cargo de Rank', value: `> ${cargoNome}`, inline: true },
                { name: '🏆 Rank', value: `> ${rankDisplay}`, inline: true },
                { name: '👑 Possui', value: `${userRoles}`, inline: true },
                { name: '🎨 Cor', value: `> ${corUsuario}`, inline: true }
            )
            .setFooter({ text: `ID: ${targetUser.id}` })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    }
};
