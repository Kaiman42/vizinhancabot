const { EmbedBuilder } = require('discord.js');

async function verificarPermissoes(interaction) {
    if (!interaction.member.permissions.has('BanMembers')) {
        return {
            success: false,
            response: '❌ Você não tem permissão para banir membros.'
        };
    }
    
    const cargo = interaction.member.roles.highest;
    return { success: true, cargo };
}

async function verificarPermissoesMembro(interaction, member) {
    if (!member) return { success: true };
    
    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
        return {
            success: false,
            response: '❌ Você não pode banir alguém com cargo igual ou superior ao seu.'
        };
    }
    
    return { success: true };
}

function criarBanEmbed(user, reason, deleteMsgs, interaction, cargo) {
    return new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔨 Usuário Banido')
        .setDescription(`**Usuário:** ${user.tag} (${user.id})
            **Motivo:** ${reason}
            **Moderador:** ${interaction.user.tag}
            **Cargo do Moderador:** ${cargo.name}
            **Mensagens Deletadas:** ${deleteMsgs ? 'Sim (7 dias)' : 'Não'}`)
        .setTimestamp();
}

async function enviarLog(interaction, embed) {
    const logChannel = interaction.guild.channels.cache.find(c => c.name === 'mod-logs');
    if (logChannel) {
        await logChannel.send({ embeds: [embed] });
    }
}

async function verificarLimiteDiario(interaction, cargo) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const registro = await global.ignisContext.database.collection('temporario').findOne({
        modId: interaction.user.id,
        tipo: 'ban',
        data: { $gte: hoje }
    });

    const bansHoje = registro?.userIds?.length || 0;

    const configuracoesCargos = await global.ignisContext.database.collection('configuracoes')
        .findOne({ _id: 'escopos' });

    const limiteMaximo = configuracoesCargos?.cargos?.[cargo.id]?.maxban || 2;

    if (bansHoje >= limiteMaximo) {
        return {
            success: false,
            response: `❌ Você atingiu o limite diário de ${limiteMaximo} banimentos para seu cargo.`
        };
    }

    return { success: true, bansHoje };
}

async function registrarBan(interaction, targetUser) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    await global.ignisContext.database.collection('temporario').updateOne(
        {
            modId: interaction.user.id,
            guildId: interaction.guild.id,
            tipo: 'ban',
            data: hoje
        },
        {
            $addToSet: { userIds: targetUser.id }
        },
        { upsert: true }
    );
}

module.exports = {
    verificarPermissoes,
    verificarLimiteDiario,
    verificarPermissoesMembro,
    criarBanEmbed,
    registrarBan,
    enviarLog
};
