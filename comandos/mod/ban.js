const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { findOne } = require('../../mongodb');

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

function criarBanEmbed(user, reason, deleteMsgs, interaction, options = {}) {
    // Nickname do banido (se houver)
    const member = interaction.guild.members.cache.get(user.id);
    // Se for para mostrar só o nome, não menciona
    const userDisplay = options.somenteUsuario ? `${user.tag}` : `<@${user.id}> (${user.tag})`;

    // Moderador
    const modMention = `<@${interaction.user.id}>`;
    const modDisplay = `${modMention} (${interaction.user.tag})`;

    // Motivo: capitalizar primeira letra se existir
    let motivoFinal = reason && reason.trim() ? reason.trim() : '';
    if (motivoFinal) {
        motivoFinal = motivoFinal.charAt(0).toUpperCase() + motivoFinal.slice(1);
    }
    // Motivo entre crases se existir
    const motivoFormatado = motivoFinal ? `\`${motivoFinal}\`` : '';

    // Mensagens deletadas formatado
    let deletadas = 'Não';
    if (deleteMsgs === true) deletadas = 'Sim (7 dias)';
    else if (typeof deleteMsgs === 'number' && deleteMsgs > 0) deletadas = `Sim (${deleteMsgs} dias)`;
    deletadas = `\`${deletadas}\``;

    let desc = `**Usuário:** ${userDisplay}`;
    // Exibe motivo apenas se existir OU se não for ocorrencias
    if (options.somenteUsuario) {
        if (motivoFinal) {
            desc += `\n**Motivo:** ${motivoFormatado}`;
        }
        // Se não houver motivo, não exibe nada
    } else {
        desc += `\n**Motivo:** ${motivoFinal ? motivoFormatado : 'Não especificado'}`;
    }
    if (!options.ocultarModerador) desc += `\n**Moderador:** ${modDisplay}`;
    if (!options.ocultarDeletadas) desc += `\n**Mensagens Deletadas:** ${deletadas}`;

    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔨 Usuário Banido')
        .setDescription(desc)
        .setTimestamp();
    if (!options.somenteUsuario) {
        embed.setFooter({ text: `ID: ${user.id}` });
    }
    if (user.displayAvatarURL) {
        embed.setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }));
    }
    if (options.origem) {
        embed.addFields({ name: 'Origem', value: options.origem.charAt(0).toUpperCase() + options.origem.slice(1), inline: false });
    }
    return embed;
}

async function enviarLog(interaction, embed) {
    // Busca o documento de canais do banco
    const canaisDoc = await findOne('configuracoes', { _id: 'canais' });
    let canalMembrosId = null;
    let canalOcorrenciasId = null;
    if (canaisDoc && Array.isArray(canaisDoc.categorias)) {
        for (const categoria of canaisDoc.categorias) {
            if (!Array.isArray(categoria.canais)) continue;
            for (const canal of categoria.canais) {
                if (canal.nome === 'registros-membros') canalMembrosId = canal.id;
                if (canal.nome === 'ocorrencias') canalOcorrenciasId = canal.id;
            }
        }
    }
    // Envia para registros-membros (completo)
    if (canalMembrosId) {
        const canal = interaction.guild.channels.cache.get(canalMembrosId) || await interaction.guild.channels.fetch(canalMembrosId).catch(() => null);
        if (canal && canal.isTextBased?.() && canal.viewable && canal.permissionsFor(interaction.guild.members.me).has('SendMessages')) {
            await canal.send({ embeds: [embed] });
        }
    }
    // Envia para ocorrencias (oculta moderador e deletadas, só mostra usuário e motivo, só usuário clicável)
    if (canalOcorrenciasId) {
        const canal = interaction.guild.channels.cache.get(canalOcorrenciasId) || await interaction.guild.channels.fetch(canalOcorrenciasId).catch(() => null);
        if (canal && canal.isTextBased?.() && canal.viewable && canal.permissionsFor(interaction.guild.members.me).has('SendMessages')) {
            // Corrige: passa o objeto user corretamente para embedOcorrencia
            const userObj = interaction.options.getUser('usuario');
            const embedOcorrencia = criarBanEmbed(
                userObj,
                interaction.options.getString('motivo') || 'Nenhum motivo fornecido',
                interaction.options.getBoolean('limpar_mensagens') || false,
                interaction,
                { ocultarModerador: true, ocultarDeletadas: true, somenteUsuario: true }
            );
            await canal.send({ embeds: [embedOcorrencia] });
        }
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
                interaction
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
