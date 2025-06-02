const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getCollection } = require('../../configuracoes/mongodb.js');

// Controle de instâncias ativas por usuário
const activeInstances = new Map();

async function getCoresDoc() {
    const collection = await getCollection('configuracoes');
    return collection.findOne({ _id: 'cores' });
}

async function getPatentesDoc() {
    const collection = await getCollection('configuracoes');
    return collection.findOne({ _id: 'patentes' });
}

async function getNivelMaximo(member) {
    const patentesDoc = await getPatentesDoc();
    if (!patentesDoc?.cargos) return 0;

    const userRoles = member.roles.cache;
    let nivelMaximo = 0;

    for (const patente of patentesDoc.cargos) {
        if (userRoles.has(patente.id) && patente.nivel > nivelMaximo) {
            nivelMaximo = patente.nivel;
        }
    }

    return nivelMaximo;
}

function filterPaletas(paletasOriginal, nivelMaximo) {
    return paletasOriginal.filter(paleta => {
        if (!paleta.startsWith('nivel')) return true;
        const nivelRequerido = parseInt(paleta.replace('nivel', '')) || 0;
        return nivelMaximo >= nivelRequerido;
    });
}

function formatarNome(nome) {
    return nome
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
}

function getAllColorRoleIds(coresDoc) {
    return Object.values(coresDoc.roles)
        .flatMap(paleta => Object.values(paleta))
        .map(cor => cor.id);
}

class ColorManager {
    constructor(coresDoc, paletas, member, interaction) {
        this.coresDoc = coresDoc;
        this.paletas = paletas;
        this.member = member;
        this.interaction = interaction;
        this.state = { paletaAtual: 0, corAtual: 0 };
        this.collector = null;
        this.autoSelectTimeout = null;
        this.lastInteractionTime = Date.now();
    }

    scheduleAutoSelect(message) {
        this.clearAutoSelect();
        this.lastInteractionTime = Date.now();
        
        this.autoSelectTimeout = setTimeout(async () => {
            try {
                if (Date.now() - this.lastInteractionTime < 30000) return;
                
                const paleta = this.getPaletaAtual();
                const cores = Object.entries(paleta.cores);
                if (cores.length > 0) {
                    await this.handleColorChange(message, this.interaction, "0");
                    this.destroy(); // Limpar instância após auto-seleção
                }
            } catch (error) {
                console.error('Erro ao auto-selecionar cor:', error);
                this.destroy(); // Limpar instância mesmo em caso de erro
            }
        }, 30000);
    }

    clearAutoSelect() {
        if (this.autoSelectTimeout) {
            clearTimeout(this.autoSelectTimeout);
            this.autoSelectTimeout = null;
        }
    }

    getPaletaAtual() {
        const paletaNome = this.paletas[this.state.paletaAtual];
        return {
            nome: paletaNome,
            cores: this.coresDoc.roles[paletaNome]
        };
    }

    createEmbed() {
        const paleta = this.getPaletaAtual();
        const cores = Object.entries(paleta.cores);
        const [corNome, cor] = cores[this.state.corAtual] || cores[0];
        
        if (!cor?.hex) {
            return new EmbedBuilder()
                .setTitle('❌ Erro')
                .setDescription('Cor não encontrada')
                .setColor('#FF0000');
        }
        
        const colorHex = cor.hex.replace('#', '');
        const titulo = paleta.nome.startsWith('nivel') 
            ? `Nível ${paleta.nome.replace('nivel', '')}` 
            : formatarNome(paleta.nome);
        
        return new EmbedBuilder()
            .setTitle(`Cor: ${formatarNome(corNome)}`)
            .setDescription(`Paleta: **${titulo}**`)
            .setColor(cor.hex)
            .setThumbnail(`https://singlecolorimage.com/get/${colorHex}/200x200`)
            .setFooter({ text: `Paleta ${this.state.paletaAtual + 1}/${this.paletas.length}` });
    }

    createMenus() {
        const paletaMenu = new StringSelectMenuBuilder()
            .setCustomId('paleta_menu')
            .setPlaceholder('Escolha uma paleta')
            .addOptions(
                this.paletas.map((paleta, index) => ({
                    label: paleta.startsWith('nivel') ? `Nível ${paleta.replace('nivel', '')}` : formatarNome(paleta),
                    value: index.toString(),
                    default: index === this.state.paletaAtual
                }))
            );

        const paleta = this.getPaletaAtual();
        const corMenu = new StringSelectMenuBuilder()
            .setCustomId('cor_menu')
            .setPlaceholder('Escolha uma cor')
            .addOptions(
                Object.entries(paleta.cores).map(([nome, dados], index) => ({
                    label: formatarNome(nome),
                    description: dados.hex,
                    value: index.toString(),
                    default: index === this.state.corAtual
                }))
            );

        return [
            new ActionRowBuilder().addComponents(paletaMenu),
            new ActionRowBuilder().addComponents(corMenu)
        ];
    }

    async handleColorChange(message, interaction, corValue) {
        try {
            const paleta = this.getPaletaAtual();
            const cores = Object.entries(paleta.cores);
            const [corNome, corDados] = cores[parseInt(corValue)];
            const cargo = this.interaction.guild.roles.cache.get(corDados.id);
            
            if (!cargo) {
                await message.edit({ content: '❌ Cargo de cor não encontrado. Por favor, contate um administrador.', components: [] });
                this.destroy(); // Limpar instância em caso de erro
                return;
            }

            const currentColorRole = this.member.roles.cache.find(role => 
                getAllColorRoleIds(this.coresDoc).includes(role.id)
            );

            if (currentColorRole?.id !== cargo.id) {
                await this.member.roles.remove(currentColorRole).catch(() => {});
                await this.member.roles.add(cargo);
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Cor alterada com sucesso!')
                .setDescription(`Sua cor agora é **${formatarNome(corNome)}**`)
                .setColor(corDados.hex)
                .setThumbnail(`https://singlecolorimage.com/get/${corDados.hex.replace('#', '')}/200x200`);
            
            await message.edit({ embeds: [embed], components: [] });
            this.collector?.stop();
            this.destroy(); // Limpar instância após sucesso
        } catch (error) {
            console.error('Erro ao alterar cor:', error);
            await message.edit({ 
                content: '❌ Ocorreu um erro ao alterar sua cor. Tente novamente mais tarde.',
                components: [] 
            }).catch(() => {});
            this.collector?.stop();
            this.destroy(); // Limpar instância após erro
        }
    }

    setupCollector(message) {
        this.collector = message.createMessageComponentCollector({ time: 300000 });
        
        this.collector.on('collect', async (interaction) => {
            try {
                if (interaction.user.id !== this.interaction.user.id) {
                    await interaction.reply({ 
                        content: 'Apenas quem usou o comando pode interagir com este menu.', 
                        ephemeral: true 
                    }).catch(() => {});
                    return;
                }

                const handleUpdate = async () => {
                    try {
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.deferUpdate().catch(() => {});
                        }
                    } catch (error) {
                        console.error('Erro ao deferir interação:', error);
                    }
                };

                if (interaction.customId === 'paleta_menu') {
                    await handleUpdate();
                    this.state.paletaAtual = parseInt(interaction.values[0]);
                    this.state.corAtual = 0;
                    await message.edit({ 
                        embeds: [this.createEmbed()], 
                        components: this.createMenus() 
                    }).catch(() => {});
                    this.scheduleAutoSelect(message);
                } else if (interaction.customId === 'cor_menu') {
                    await handleUpdate();
                    this.clearAutoSelect();
                    await this.handleColorChange(message, interaction, interaction.values[0]);
                }
            } catch (error) {
                console.error('Erro ao processar interação:', error);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ 
                            content: '❌ Ocorreu um erro ao processar sua escolha.',
                            ephemeral: true 
                        }).catch(() => {});
                    }
                } catch (e) {
                    console.error('Erro ao enviar mensagem de erro:', e);
                }
            }
        });

        this.collector.on('end', () => {
            this.clearAutoSelect();
            if (message.editable) {
                message.edit({ components: [] }).catch(() => {});
            }
        });
    }

    destroy() {
        this.clearAutoSelect();
        this.collector?.stop();
        this.collector = null;
        
        // Remover instância do controle
        const userInstances = activeInstances.get(this.interaction.user.id) || [];
        const index = userInstances.indexOf(this);
        if (index > -1) {
            userInstances.splice(index, 1);
        }
        if (userInstances.length === 0) {
            activeInstances.delete(this.interaction.user.id);
        } else {
            activeInstances.set(this.interaction.user.id, userInstances);
        }
    }

    async start() {
        try {
            const message = await this.interaction.editReply({
                embeds: [this.createEmbed()],
                components: this.createMenus(),
                fetchReply: true
            });
            this.setupCollector(message);
            this.scheduleAutoSelect(message);
        } catch (error) {
            console.error('Erro ao iniciar ColorManager:', error);
            await this.interaction.editReply('❌ Erro ao inicializar o seletor de cores.');
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cor')
        .setDescription('Exibe as cores disponíveis para personalização.'),
    
    async execute(interaction) {
        let colorManager = null;
        
        try {
            // Verificar limite de instâncias
            const userInstances = activeInstances.get(interaction.user.id) || [];
            if (userInstances.length > 0) {
                return await interaction.reply({ 
                    content: '❌ Você já tem um menu de seleção de cores ativo. Use-o ou aguarde 30 segundos para que a cor padrão da paleta seja selecionada automaticamente.',
                    ephemeral: true 
                });
            }

            await interaction.deferReply();
            
            const coresDoc = await getCoresDoc();
            if (!coresDoc?.roles) {
                return await interaction.editReply('❌ Nenhuma cor disponível no momento.');
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const nivelMaximo = await getNivelMaximo(member);
            const paletas = filterPaletas(Object.keys(coresDoc.roles), nivelMaximo);

            if (!paletas.length) {
                return await interaction.editReply('Você não tem acesso a nenhuma cor personalizada. Obtenha os cargos necessários para desbloquear cores exclusivas.');
            }
            
            colorManager = new ColorManager(coresDoc, paletas, member, interaction);
            
            // Adicionar à lista de instâncias ativas
            userInstances.push(colorManager);
            activeInstances.set(interaction.user.id, userInstances);
            
            await colorManager.start();
            
        } catch (error) {
            console.error('Erro ao executar o comando /cor:', error);
            colorManager?.destroy();
            await interaction.editReply('❌ Ocorreu um erro ao buscar as cores. Tente novamente mais tarde.');
        }
    }
};