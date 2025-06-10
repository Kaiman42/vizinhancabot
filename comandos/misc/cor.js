const path = require('path');
const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getCollection, getErrosComando } = require(path.resolve(__dirname, '../../mongodb.js'));

const activeInstances = new Map();

async function getCoresDoc() {
    return (await getCollection('configuracoes')).findOne({ _id: 'cores' });
}

async function getNivelMaximo(member) {
    const patentesDoc = await (await getCollection('configuracoes')).findOne({ _id: 'patentes' });
    if (!patentesDoc?.cargos) return 0;
    
    return Math.max(...patentesDoc.cargos
        .filter(patente => member.roles.cache.has(patente.id))
        .map(patente => patente.nivel), 0);
}

function formatarNome(nome) {
    return nome.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

class ColorManager {
    constructor(coresDoc, paletas, member, interaction) {
        this.coresDoc = coresDoc;
        this.paletas = paletas;
        this.member = member;
        this.interaction = interaction;
        this.state = { paletaAtual: 0, corAtual: 0 };
        this.autoSelectTimeout = null;
        this.lastInteractionTime = Date.now();
    }

    scheduleAutoSelect(message) {
        this.clearAutoSelect();
        this.lastInteractionTime = Date.now();
        
        this.autoSelectTimeout = setTimeout(async () => {
            if (Date.now() - this.lastInteractionTime < 30000) return;
            await this.handleColorChange(message, "0");
            this.destroy();
        }, 30000);
    }

    clearAutoSelect() {
        if (this.autoSelectTimeout) {
            clearTimeout(this.autoSelectTimeout);
            this.autoSelectTimeout = null;
        }
    }

    getPaletaAtual() {
        const nome = this.paletas[this.state.paletaAtual];
        return { nome, cores: this.coresDoc.roles[nome] };
    }

    createEmbed() {
        const paleta = this.getPaletaAtual();
        const cores = Object.entries(paleta.cores);
        const [corNome, cor] = cores[this.state.corAtual] || cores[0];
        
        if (!cor?.hex) return new EmbedBuilder().setTitle('❌ Erro').setColor('#FF0000');
        
        const colorHex = cor.hex.replace('#', '');
        const titulo = paleta.nome.startsWith('nivel') ? 
            `Nível ${paleta.nome.replace('nivel', '')}` : 
            formatarNome(paleta.nome);
        
        return new EmbedBuilder()
            .setTitle(`Cor: ${formatarNome(corNome)}`)
            .setDescription(`Paleta: **${titulo}**`)
            .setColor(cor.hex)
            .setThumbnail(`https://singlecolorimage.com/get/${colorHex}/200x200`);
    }

    createMenus() {
        const paletaMenu = new StringSelectMenuBuilder()
            .setCustomId('paleta_menu')
            .setPlaceholder('Escolha uma paleta')
            .addOptions(this.paletas.map((paleta, index) => ({
                label: paleta.startsWith('nivel') ? 
                    `Nível ${paleta.replace('nivel', '')}` : 
                    formatarNome(paleta),
                value: index.toString(),
                default: index === this.state.paletaAtual
            })));

        const corMenu = new StringSelectMenuBuilder()
            .setCustomId('cor_menu')
            .setPlaceholder('Escolha uma cor')
            .addOptions(Object.entries(this.getPaletaAtual().cores)
                .map(([nome, dados], index) => ({
                    label: formatarNome(nome),
                    description: dados.hex,
                    value: index.toString(),
                    default: index === this.state.corAtual
                })));

        return [
            new ActionRowBuilder().addComponents(paletaMenu),
            new ActionRowBuilder().addComponents(corMenu)
        ];
    }

    async handleColorChange(message, corValue) {
        const paleta = this.getPaletaAtual();
        const [corNome, corDados] = Object.entries(paleta.cores)[parseInt(corValue)];
        const cargo = this.interaction.guild.roles.cache.get(corDados.id);
        
        if (!cargo) {
            await message.edit({ content: '❌ Cargo não encontrado', components: [] });
            return this.destroy();
        }

        const currentColorRole = this.member.roles.cache.find(role => 
            Object.values(this.coresDoc.roles)
                .flatMap(p => Object.values(p))
                .some(c => c.id === role.id)
        );

        if (currentColorRole?.id !== cargo.id) {
            await this.member.roles.remove(currentColorRole).catch(() => {});
            await this.member.roles.add(cargo);
        }

        await message.edit({
            embeds: [new EmbedBuilder()
                .setTitle('✅ Cor alterada!')
                .setColor(corDados.hex)
                .setDescription(`Nova cor: **${formatarNome(corNome)}**`)],
            components: []
        });
        
        this.destroy();
    }

    setupCollector(message) {
        const collector = message.createMessageComponentCollector({ time: 300000 });
        
        collector.on('collect', async (i) => {
            if (i.user.id !== this.interaction.user.id) {
                await i.reply({ content: 'Menu não é seu', ephemeral: true });
                return;
            }

            await i.deferUpdate().catch(() => {});

            if (i.customId === 'paleta_menu') {
                this.state.paletaAtual = parseInt(i.values[0]);
                this.state.corAtual = 0;
                await message.edit({
                    embeds: [this.createEmbed()],
                    components: this.createMenus()
                });
                this.scheduleAutoSelect(message);
            } else if (i.customId === 'cor_menu') {
                this.clearAutoSelect();
                await this.handleColorChange(message, i.values[0]);
            }
        });

        collector.on('end', () => {
            this.clearAutoSelect();
            message.editable && message.edit({ components: [] }).catch(() => {});
        });
    }

    destroy() {
        this.clearAutoSelect();
        const userInstances = activeInstances.get(this.interaction.user.id) || [];
        const index = userInstances.indexOf(this);
        if (index > -1) userInstances.splice(index, 1);
        if (userInstances.length === 0) {
            activeInstances.delete(this.interaction.user.id);
        }
    }

    async start() {
        const message = await this.interaction.editReply({
            embeds: [this.createEmbed()],
            components: this.createMenus(),
            fetchReply: true
        });
        this.setupCollector(message);
        this.scheduleAutoSelect(message);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cor')
        .setDescription('Exibe as cores disponíveis para personalização.'),
    
    async execute(interaction) {
        if (activeInstances.get(interaction.user.id)?.length > 0) {
            const erros = await getErrosComando();
            return interaction.reply({
                content: erros.cores.COR_JA_APLICADA.content,
                ephemeral: true
            });
        }

        await interaction.deferReply();
        try {
            const coresDoc = await getCoresDoc();
            if (!coresDoc?.roles) {
                const erros = await getErrosComando();
                return interaction.editReply(erros.cores.SEM_COR.content);
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const nivelMaximo = await getNivelMaximo(member);
            const paletas = Object.keys(coresDoc.roles)
                .filter(p => !p.startsWith('nivel') || 
                    nivelMaximo >= parseInt(p.replace('nivel', '') || 0));

            if (!paletas.length) {
                const erros = await getErrosComando();
                return interaction.editReply(erros.cores.PALETA_BLOQUEADA.content);
            }

            const colorManager = new ColorManager(coresDoc, paletas, member, interaction);
            activeInstances.set(interaction.user.id, [colorManager]);
            await colorManager.start();
        } catch {
            const erros = await getErrosComando();
            return interaction.editReply(erros.cores.ERRO_CARGO.content);
        }
    }
};