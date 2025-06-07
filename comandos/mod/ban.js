const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Funções movidas de utils.js
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
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bane um usuário do servidor')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('O usuário que será banido')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('O motivo do banimento')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('limpar_mensagens')
                .setDescription('Limpar mensagens dos últimos 7 dias')
                .setRequired(false)),

    async execute(interaction) {
        // Adiar a resposta imediatamente
        await interaction.deferReply({ flags: 'Ephemeral' });

        // Verificar permissões do executor
        const permResult = await verificarPermissoes(interaction);
        if (!permResult.success) {
            return interaction.editReply(permResult.response);
        }

        // Obter dados do comando
        const user = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('motivo') || 'Nenhum motivo fornecido';
        const deleteMsgs = interaction.options.getBoolean('limpar_mensagens') || false;

        // Verificar auto-ban
        if (user.id === interaction.user.id) {
            // Assuming ERROS.AUTO_BAN is defined elsewhere or a placeholder
            return interaction.editReply(ERROS.AUTO_BAN);
        }

        // Verificar permissões sobre o alvo
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const targetPermResult = await verificarPermissoesMembro(interaction, member);
        if (!targetPermResult.success) {
            return interaction.editReply(targetPermResult.response);
        }

        // Note: verificarLimiteDiario is not called in the original ban.js, but is included here as it was in utils.js

        try {
            // Executar ban
            const deleteDays = deleteMsgs ? 7 : 0;
            await interaction.guild.members.ban(user, {
                reason: reason,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });

            // Registrar banimento
            await registrarBan(interaction, user);

            // Criar e enviar embed
            const banEmbed = criarBanEmbed(
                user,
                reason,
                deleteMsgs,
                interaction,
                permResult.cargo
            );

            // Enviar log
            await enviarLog(interaction, banEmbed);

            // Responder ao comando
            return interaction.editReply({
                content: `✅ O usuário ${user.tag} foi banido com sucesso.`
            });

        } catch (error) {
            console.error(error);
            return interaction.editReply({ content: `❌ Ocorreu um erro ao tentar banir ${user.tag}. Erro: ${error.message}` });
        }
    },
};
