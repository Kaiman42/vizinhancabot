const { SlashCommandBuilder, PermissionFlagsBits, Collection, EmbedBuilder } = require('discord.js');
const path = require('path');
const { find, getCollection } = require(path.resolve(__dirname, '../../mongodb.js'));

// Função auxiliar para encontrar o ID do canal de logs
async function getLogChannelId() {
    try {
        const canaisConfig = await find('configuracoes', { _id: 'canais' }, { findOne: true });
        
        if (!canaisConfig) return null;
        
        const admCategory = canaisConfig.categorias.find(cat => cat.nome === 'somente-adm');
        if (!admCategory) return null;
        
        const logChannel = admCategory.canais.find(c => c.nome === 'registros-membros');
        return logChannel ? logChannel.id : null;
    } catch (error) {
        console.error('Erro ao buscar canal de logs:', error);
        return null;
    }
}

// Função para criar mensagem detalhada de log
async function createDetailedLog(interaction, mensagensApagadas, params) {
    const deletedByUser = new Map();
    mensagensApagadas.forEach(msg => {
        const count = deletedByUser.get(msg.author.tag) || 0;
        deletedByUser.set(msg.author.tag, count + 1);
    });

    // Buscar configurações de status
    const statusConfig = await find('configuracoes', { _id: 'status' }, { findOne: true });
    const deleteEmoji = statusConfig?.emojis?.delete;
    const configEmoji = statusConfig?.emojis?.config;
    const color = statusConfig?.colors?.neutral;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${deleteEmoji} Limpeza de Mensagens`)
        .setDescription(`${interaction.user} apagou mensagens em ${interaction.channel}`)
        .setTimestamp();

    // Adiciona parâmetros usados
    let paramText = `- Quantidade solicitada: \`${params.quantidade} ${params.quantidade === 1 ? 'mensagem' : 'mensagens'}\``;
    
    if (params.usuario) paramText += `\n- Foco: <@${params.usuario.id}>`;
    
    // Coleta todos os usuários ignorados em um array
    const ignorados = [
        params.ignorarUsuario,
        params.ignorarUsuario2,
        params.ignorarUsuario3,
        params.ignorarUsuario4,
        params.ignorarUsuario5
    ].filter(u => u !== null);
    
    // Adiciona a linha de ignorados apenas se houver algum
    if (ignorados.length > 0) {
        paramText += `\n- ${ignorados.length === 1 ? 'Ignorado' : 'Ignorados'}: ${ignorados.map(u => `<@${u.id}>`).join(', ')}`;
    }

    embed.addFields({ 
        name: `${configEmoji} Parâmetros`, 
        value: paramText, 
        inline: false 
    });

    // Adiciona contagem por usuário
    let userCountText = '';
    deletedByUser.forEach((count, userTag) => {
        const userId = mensagensApagadas.find(msg => msg.author.tag === userTag)?.author.id;
        userCountText += `<@${userId}>: \`${count} ${count === 1 ? 'mensagem' : 'mensagens'}\`\n`;
    });

    if (userCountText) {
        embed.addFields({ 
            name: '📝 Mensagens deletadas por usuário', 
            value: userCountText.trim(), 
            inline: false 
        });
    }

    return { embeds: [embed] };
}

// Função para buscar erros do MongoDB
async function getErrosComando() {
  const collection = getCollection('configuracoes');
  return await collection.findOne({ _id: 'erros-comando' });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mod-limpar')
        .setDescription('Limpa mensagens do canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(option =>
            option.setName('quantidade')
                .setDescription('Quantidade de mensagens para limpar (1-100)')
                .setMaxValue(100)
                .setRequired(true))
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Limpar mensagens apenas deste usuário')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('ignorar_usuario')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('ignorar_usuario2')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('ignorar_usuario3')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('ignorar_usuario4')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('ignorar_usuario5')
                .setDescription('Ignora as mensagens de um usuário')
                .setRequired(false)),

    async execute(interaction) {
        // Verificação de permissões
        if (!interaction.member.permissions.has('ManageMessages')) {
            return await interaction.reply(erros.gerais.PERMISSAO_NEGADA);
        }

        if (!interaction.guild.members.me.permissions.has('ManageMessages')) {
            return await interaction.reply(erros.gerais.PERMISSOES_BOT);
        }

        // Obter todas as opções do comando
        const quantidade = interaction.options.getInteger('quantidade');
        const usuario = interaction.options.getUser('usuario');
        const ignorarUsuario = interaction.options.getUser('ignorar_usuario');
        const ignorarUsuario2 = interaction.options.getUser('ignorar_usuario2');
        const ignorarUsuario3 = interaction.options.getUser('ignorar_usuario3');
        const ignorarUsuario4 = interaction.options.getUser('ignorar_usuario4');
        const ignorarUsuario5 = interaction.options.getUser('ignorar_usuario5');

        // Verificação de limites
        if (quantidade <= 0 || quantidade > 100) {
            return await interaction.reply(erros.limpar.QUANTIDADE_INVALIDA);
        }

        // Verificação de parâmetros conflitantes
        if (usuario && ignorarUsuario && usuario.id === ignorarUsuario.id) {
            return await interaction.reply(erros.gerais.PARAMETROS_INVALIDOS);
        }

        try {
            await interaction.deferReply({ flags: 'Ephemeral' });
            
            // Busca um número maior de mensagens para garantir que tenhamos suficientes após a filtragem
            let mensagens = await interaction.channel.messages.fetch({ limit: 100 });

            // Se um usuário específico foi selecionado
            if (usuario) {
                mensagens = mensagens.filter(msg => msg.author.id === usuario.id);
            }

            // Aplica os filtros de usuários ignorados
            if (ignorarUsuario) {
                mensagens = mensagens.filter(msg => msg.author.id !== ignorarUsuario.id);
            }
            if (ignorarUsuario2) {
                mensagens = mensagens.filter(msg => msg.author.id !== ignorarUsuario2.id);
            }
            if (ignorarUsuario3) {
                mensagens = mensagens.filter(msg => msg.author.id !== ignorarUsuario3.id);
            }
            if (ignorarUsuario4) {
                mensagens = mensagens.filter(msg => msg.author.id !== ignorarUsuario4.id);
            }
            if (ignorarUsuario5) {
                mensagens = mensagens.filter(msg => msg.author.id !== ignorarUsuario5.id);
            }

            // Verifica se há mensagens após os filtros
            if (mensagens.size === 0) {
                return await interaction.editReply(erros.limpar.NENHUMA_MENSAGEM);
            }

            // Limita ao número solicitado
            const mensagensLimitadas = new Collection([...mensagens.entries()].slice(0, quantidade));

            const mensagensApagadas = await interaction.channel.bulkDelete(mensagensLimitadas, true);

            // Buscar configurações de status para o emoji de sucesso
            const statusConfig = await find('configuracoes', { _id: 'status' }, { findOne: true });
            const successEmoji = statusConfig?.emojis?.delete || '✅';

            // Log do sucesso para o usuário
            await interaction.editReply({
                content: `${successEmoji} ${mensagensApagadas.size} mensagens foram apagadas com sucesso!`,
                flags: 'Ephemeral'
            });

            // Log detalhado para o canal de registros
            const logChannelId = await getLogChannelId();
            if (logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(logChannelId);
                if (logChannel) {
                    const detailedLog = await createDetailedLog(interaction, mensagensApagadas, {
                        quantidade,
                        usuario,
                        ignorarUsuario,
                        ignorarUsuario2,
                        ignorarUsuario3,
                        ignorarUsuario4,
                        ignorarUsuario5
                    });
                    
                    await logChannel.send(detailedLog);
                }
            }

        } catch (error) {
            console.error('Erro ao limpar mensagens:', error);
            
            let errorResponse = erros.limpar.ERRO_LIMPEZA;
            
            if (error.code === 50034) {
                errorResponse = erros.limpar.MENSAGENS_ANTIGAS;
            } else if (error.code === 50021) {
                errorResponse = erros.limpar.CANAL_NOTICIAS;
            } else if (error.code === 50069) {
                errorResponse = erros.limpar.MENSAGENS_FIXADAS;
            }

            await interaction.editReply(errorResponse);
        }
    }
};
