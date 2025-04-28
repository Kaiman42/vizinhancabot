const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongodb = require('../../configuracoes/mongodb');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mod')
        .setDescription('Comandos de moderação')
        .addSubcommand(subcommand =>
            subcommand
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
                        .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'ban') {
            // Check if the user has permission to ban
            if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
                return interaction.reply({ 
                    content: 'Você não tem permissão para banir usuários!', 
                    ephemeral: true 
                });
            }

            const user = interaction.options.getUser('usuario');
            const reason = interaction.options.getString('motivo') || 'Nenhum motivo fornecido';
            const deleteMsgs = interaction.options.getBoolean('limpar_mensagens') || false;
            
            // Can't ban yourself
            if (user.id === interaction.user.id) {
                return interaction.reply({ 
                    content: 'Você não pode banir a si mesmo!', 
                    ephemeral: true 
                });
            }
            
            // Get the member to check if they can be banned
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            
            // Check if the bot can ban the member
            if (member) {
                if (!member.bannable) {
                    return interaction.reply({ 
                        content: 'Não posso banir este usuário! Ele pode ter permissões mais altas que eu.', 
                        ephemeral: true 
                    });
                }
                
                // Check if the member trying to ban has a higher role than the target
                if (interaction.member.roles.highest.position <= member.roles.highest.position) {
                    return interaction.reply({ 
                        content: 'Você não pode banir este usuário! Ele tem um cargo igual ou superior ao seu.', 
                        ephemeral: true 
                    });
                }
            }
            
            // Delete days options for ban (0 or 7 based on option)
            const deleteDays = deleteMsgs ? 7 : 0;
            
            try {
                await interaction.guild.members.ban(user, { 
                    reason: reason, 
                    deleteMessageSeconds: deleteDays * 24 * 60 * 60 // Convert days to seconds
                });
                
                // Create an embed for the ban
                const banEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⛔ Usuário Banido')
                    .addFields(
                        { name: 'Usuário', value: `${user.tag} (<@${user.id}>)` },
                        { name: 'ID do Usuário', value: user.id },
                        { name: 'Motivo', value: reason },
                        { name: 'Mensagens deletadas', value: deleteMsgs ? 'Sim (últimos 7 dias)' : 'Não' },
                        { name: 'Sentenciador', value: `${interaction.user.tag} (<@${interaction.user.id}>)` }
                    )
                    .setThumbnail(user.displayAvatarURL())
                    .setTimestamp();
                
                // Buscar config de canais do MongoDB
                const canalConfig = await mongodb.findOne(mongodb.COLLECTIONS.CONFIGURACOES, { _id: 'canais' });
                
                // Find the userlogs channel ID
                let userlogsChannelId = null;
                if (canalConfig && canalConfig.categorias) {
                    for (const categoria of canalConfig.categorias) {
                        const userlogsChannel = categoria.canais ? categoria.canais.find(canal => canal.nome === 'userlogs') : null;
                        if (userlogsChannel) {
                            userlogsChannelId = userlogsChannel.id;
                            break;
                        }
                    }
                }
                
                // Send to userlogs channel if found
                if (userlogsChannelId) {
                    const userlogsChannel = await interaction.guild.channels.fetch(userlogsChannelId);
                    if (userlogsChannel) {
                        await userlogsChannel.send({ embeds: [banEmbed] });
                    }
                }
                    
                await interaction.reply({ 
                    content: `✅ O usuário ${user.tag} foi banido com sucesso.`,
                    ephemeral: true 
                });
                
            } catch (error) {
                console.error(error);
                return interaction.reply({ 
                    content: `Ocorreu um erro ao tentar banir ${user.tag}: ${error.message}`, 
                    ephemeral: true 
                });
            }
        }
    },
};
