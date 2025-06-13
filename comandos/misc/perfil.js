const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { gerarCorAleatoria } = require('../../configuracoes/randomColor.js');
const path = require('path');
const mongodb = require(path.resolve(__dirname, '../../mongodb.js'));
const { criarBarraProgresso } = require('../../configuracoes/barraProgresso.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Exibe informações detalhadas do perfil de um usuário')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O usuário para ver o perfil (opcional)')
                .setRequired(false)),

    async execute(interaction, ignis) {
        const userId = interaction.user.id;
        const cooldownKey = `perfil_${userId}`;
        const cooldownAmount = 60000;

        global.cooldowns ??= new Map();

        const remainingTime = global.cooldowns.get(cooldownKey) - Date.now();
        if (remainingTime > 0) {
            return interaction.reply({ 
                content: `⏰ Por favor, aguarde ${(remainingTime / 1000).toFixed(1)} segundos antes de usar o comando novamente.`,
                flags: 'Ephemeral' 
            });
        }

        global.cooldowns.set(cooldownKey, Date.now() + cooldownAmount);
        setTimeout(() => global.cooldowns.delete(cooldownKey), cooldownAmount);

        try {
            await interaction.deferReply();
            
            const targetUser = interaction.options.getUser('usuario') || interaction.user;
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            
            if (!member) return interaction.editReply('Não foi possível encontrar este usuário no servidor.');

            const statusMap = {
                online: '🟢 Online',
                idle: '🟡 Ausente',
                dnd: '🔴 Não perturbe'
            };

            const status = member.presence ? statusMap[member.presence.status] || '⚫ Offline' : '⚫ Offline';
            const userRoles = await getUserRoles(member);
            const { rankDisplay, cargoNome } = await getNivelInfo(ignis, targetUser, member);
            const corUsuario = await getCorUsuario(member);
            const prestigios = await getPrestigios(targetUser.id);
            const prestigioDisplay = prestigios > 0 ? `${prestigios} 🌟` : 'Nenhum';
            
            const embed = new EmbedBuilder()
                .setColor(gerarCorAleatoria())
                .setTitle(`Perfil de ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: '📅 Criou desde', value: `> ${new Date(targetUser.createdAt).toLocaleDateString('pt-BR')}`, inline: true },
                    { name: '🏠 Membro desde', value: `> ${new Date(member.joinedAt).toLocaleDateString('pt-BR')}`, inline: true },
                    { name: '🚀 Impulsor', value: `> ${member.premiumSince ? 'Sim' : 'Não'}`, inline: true },
                    { name: '📈 Status', value: `> ${status}`, inline: true },
                    { name: '🔰 Cargo de Rank', value: `> ${cargoNome}`, inline: true },
                    { name: '🏆 Rank', value: `> ${rankDisplay}`, inline: true },
                    { name: '👑 Possui', value: userRoles, inline: true },
                    { name: '🎨 Cor', value: `> ${corUsuario}`, inline: true },
                    { name: '⭐ Prestígio', value: `> ${prestigioDisplay}`, inline: true }
                )
                .setFooter({ text: `ID: ${targetUser.id}` })
                .setTimestamp();
            
            const errosComando = await getErrosComando();

            const menuPrestigio = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('prestigiar')
                        .setPlaceholder("Ações disponíveis")
                        .setDisabled(false)
                        .addOptions([
                            {
                                label: 'Prestigiar Usuário',
                                description: 'Demonstre seu reconhecimento',
                                value: 'dar_prestigio',
                                emoji: '⭐'
                            }
                        ])
                );

            await interaction.editReply({ 
                embeds: [embed],
                components: [menuPrestigio]
            });

            const filter = i => i.customId === 'prestigiar';

            const collector = interaction.channel.createMessageComponentCollector({ 
                filter, 
                time: 60000 
            });

            collector.on('collect', async i => {
                if (i.values[0] === 'dar_prestigio') {
                    if (i.user.id === targetUser.id) {
                        return i.reply({
                            content: errosComando.erros.perfil.AUTO_PRESTIGIO.content,
                            flags: errosComando.erros.perfil.AUTO_PRESTIGIO.flags
                        });
                    }
                    if (await jaPrestigiou(targetUser.id, i.user.id)) {
                        return i.reply({
                            content: errosComando.erros.perfil.JA_PRESTIGIADO.content,
                            flags: errosComando.erros.perfil.JA_PRESTIGIADO.flags
                        });
                    }
                    await registrarPrestigio(targetUser.id, i.user.id);
                    await i.reply({ 
                        content: errosComando.erros.perfil.SUCESSO_PRESTIGIO.content,
                        flags: errosComando.erros.perfil.SUCESSO_PRESTIGIO.flags
                    });
                }
            });

        } catch (error) {
            console.error('Erro ao executar comando perfil:', error);
            return interaction.editReply('Ocorreu um erro ao executar o comando.');
        }
    }
};

async function getUserRoles(member) {
    const escoposDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'escopos' });
    if (!escoposDoc?.cargos) return 'Nenhum';

    const importantRoleIds = Object.values(escoposDoc.cargos)
        .filter(cargo => cargo?.id)
        .map(cargo => cargo.id);

    const userRoles = member.roles.cache
        .filter(role => importantRoleIds.includes(role.id))
        .map(role => role.name);

    return userRoles.length ? userRoles.join(', ') : 'Nenhum';
}

async function getNivelInfo(ignis, targetUser, member) {
    try {
        // Busca o documento do usuário diretamente na coleção NIVEIS
        const userData = await mongodb.findOne(
            mongodb.COLLECTIONS.NIVEIS,
            { _id: targetUser.id }
        );

        console.log('Documento de nível encontrado:', userData);

        if (!userData || (userData.level === undefined && userData.xp === undefined)) {
            console.log('Dados do usuário não encontrados ou inválidos');
            return { rankDisplay: 'Nenhum', cargoNome: 'Nenhum' };
        }

        const currentLevel = userData.level ?? 0;
        const currentXP = userData.xp ?? 0;
        console.log(`Nível atual: ${currentLevel}, XP atual: ${currentXP}`);

        // Usa a função de cálculo de XP do sistema de níveis
        const xpForNextLevel = require('../../eventos/niveis.js')?.calculateRequiredXP?.(currentLevel) || (currentLevel + 1) * 1000;
        console.log('XP necessário para o próximo nível:', xpForNextLevel);

        const { barra, progresso } = criarBarraProgresso(currentXP, xpForNextLevel);
        const rankDisplay = `Nível ${currentLevel} (${progresso}%)\n\`${barra}\``;
        console.log('Display do rank gerado:', rankDisplay);

        const patentesDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'patentes' });
        const cargoNivelApropriado = patentesDoc?.cargos
            ?.sort((a, b) => b.nivel - a.nivel)
            .find(cargo => currentLevel >= cargo.nivel);

        return {
            rankDisplay,
            cargoNome: cargoNivelApropriado ? `<@&${cargoNivelApropriado.id}>` : 'Nenhum'
        };
    } catch (error) {
        console.error('Erro ao buscar informações de nível:', error);
        return { rankDisplay: 'Sistema indisponível', cargoNome: 'Nenhum' };
    }
}

async function getCorUsuario(member) {
    try {
        const coresDoc = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'cores' });
        if (!coresDoc?.roles) return 'Nenhuma cor selecionada\n       *Use /cor*';

        for (const categoria of Object.values(coresDoc.roles)) {
            for (const cor of Object.values(categoria)) {
                if (cor.id && member.roles.cache.has(cor.id)) {
                    return `<@&${cor.id}>`;
                }
            }
        }
        return 'Nenhuma cor selecionada\n       *Use /cor*';
    } catch {
        return 'Nenhuma cor selecionada\n       *Use /cor*';
    }
}

async function getPrestigios(userId) {
    try {
        const doc = await mongodb.findOne('prestigios', { _id: userId });
        return doc?.prestigiadores?.length || 0;
    } catch {
        return 0;
    }
}

async function jaPrestigiou(alvoId, prestigiadorId) {
    try {
        const doc = await mongodb.findOne('prestigios', { _id: alvoId });
        return doc?.prestigiadores?.includes(prestigiadorId) || false;
    } catch {
        return false;
    }
}

async function registrarPrestigio(alvoId, prestigiadorId) {
    try {
        await mongodb.updateOne(
            'prestigios',
            { _id: alvoId },
            { $addToSet: { prestigiadores: prestigiadorId } },
            { upsert: true }
        );
    } catch (error) {
        console.error('Erro ao registrar prestígio:', error);
    }
}

async function getErrosComando() {
    return await mongodb.findOne('configuracoes', { _id: 'erros-comando' });
}
