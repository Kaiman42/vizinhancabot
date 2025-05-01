const mongodb = require('./mongodb');

// Sistema de economias virtual do servidor
const DEFAULT_BALANCE = 0;
const DAILY_AMOUNT = 100;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 horas em milissegundos

async function inicializarEconomia() {
  try {
    // Garantir que a coleção de dados de usuários exista
    await mongodb.ensureCollection(mongodb.COLLECTIONS.DADOS_USUARIOS);

    // Criar ou atualizar o documento de economias se não existir
    await mongodb.upsert(
      mongodb.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'economias' },
      { $setOnInsert: { usuarios: [] } }
    );

    return true;
  } catch (error) {
    console.error('Erro ao inicializar o sistema de economias:', error);
    return false;
  }
}

async function obterSaldo(userId) {
  try {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    
    if (!doc || !doc.usuarios) {
      return DEFAULT_BALANCE;
    }
    
    // Procurando o usuário no array usuarios
    const usuario = doc.usuarios.find(u => u.userId === userId);
    return usuario ? usuario.saldo || DEFAULT_BALANCE : DEFAULT_BALANCE;
  } catch (error) {
    console.error(`Erro ao obter saldo do usuário ${userId}:`, error);
    return DEFAULT_BALANCE;
  }
}

async function adicionarSaldo(userId, amount) {
  if (!userId || typeof amount !== 'number' || isNaN(amount)) {
    console.error('Parâmetros inválidos para adicionarSaldo:', { userId, amount });
    return false;
  }

  try {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    
    if (!doc) {
      // Se o documento não existir, crie-o
      await mongodb.upsert(
        mongodb.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'economias' },
        { $set: { usuarios: [{ userId, saldo: amount }] } }
      );
      return amount;
    }
    
    if (!doc.usuarios) {
      // Se o array de usuários não existir, inicie-o
      await mongodb.updateOne(
        mongodb.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'economias' },
        { $set: { usuarios: [{ userId, saldo: amount }] } }
      );
      return amount;
    }
    
    // Procurar se o usuário já existe no array
    const usuarioExistente = doc.usuarios.find(u => u.userId === userId);
    
    if (usuarioExistente) {
      // Atualizar usuário existente
      const novoSaldo = (usuarioExistente.saldo || 0) + amount;
      await mongodb.updateOne(
        mongodb.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'economias', 'usuarios.userId': userId },
        { $set: { 'usuarios.$.saldo': novoSaldo } }
      );
      return novoSaldo;
    } else {
      // Adicionar novo usuário ao array
      await mongodb.updateOne(
        mongodb.COLLECTIONS.DADOS_USUARIOS,
        { _id: 'economias' },
        { $push: { usuarios: { userId, saldo: amount } } }
      );
      return amount;
    }
  } catch (error) {
    console.error(`Erro ao adicionar saldo para o usuário ${userId}:`, error);
    return false;
  }
}

async function removerSaldo(userId, amount) {
  if (!userId || typeof amount !== 'number' || isNaN(amount)) {
    console.error('Parâmetros inválidos para removerSaldo:', { userId, amount });
    return false;
  }
  
  try {
    const saldoAtual = await obterSaldo(userId);
    
    if (saldoAtual < amount) {
      return false; // Saldo insuficiente
    }
    
    const novoSaldo = saldoAtual - amount;
    
    await mongodb.updateOne(
      mongodb.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'economias', 'usuarios.userId': userId },
      { $set: { 'usuarios.$.saldo': novoSaldo } }
    );
    
    return novoSaldo;
  } catch (error) {
    console.error(`Erro ao remover saldo do usuário ${userId}:`, error);
    return false;
  }
}

async function transferirSaldo(fromUserId, toUserId, amount) {
  if (!fromUserId || !toUserId || typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    console.error('Parâmetros inválidos para transferirSaldo:', { fromUserId, toUserId, amount });
    return { success: false, message: 'Parâmetros inválidos para transferência' };
  }
  
  try {
    const saldoRemetente = await obterSaldo(fromUserId);
    
    if (saldoRemetente < amount) {
      return { success: false, message: 'Saldo insuficiente para transferência' };
    }
    
    const novoSaldoRemetente = await removerSaldo(fromUserId, amount);
    const novoSaldoDestinatario = await adicionarSaldo(toUserId, amount);
    
    if (novoSaldoRemetente === false || novoSaldoDestinatario === false) {
      // Algo deu errado, tente reverter a operação
      if (novoSaldoRemetente === false && novoSaldoDestinatario !== false) {
        await removerSaldo(toUserId, amount);
      } else if (novoSaldoRemetente !== false && novoSaldoDestinatario === false) {
        await adicionarSaldo(fromUserId, amount);
      }
      
      return { success: false, message: 'Erro durante a transferência' };
    }
    
    return {
      success: true,
      message: 'Transferência realizada com sucesso',
      novoSaldoRemetente,
      novoSaldoDestinatario
    };
  } catch (error) {
    console.error('Erro ao transferir saldo:', error);
    return { success: false, message: 'Erro durante a transferência' };
  }
}

async function verificarDiario(userId) {
  try {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    
    if (!doc || !doc.usuarios) {
      return true; // Nunca recebeu daily, então está disponível
    }
    
    const usuario = doc.usuarios.find(u => u.userId === userId);
    
    if (!usuario || !usuario.ultimoDaily) {
      return true; // Nunca recebeu daily, então está disponível
    }
    
    const agora = new Date().getTime();
    const tempoPassado = agora - usuario.ultimoDaily;
    
    return tempoPassado >= DAILY_COOLDOWN;
  } catch (error) {
    console.error(`Erro ao verificar daily para o usuário ${userId}:`, error);
    return false;
  }
}

async function receberDiario(userId) {
  try {
    const podeReceber = await verificarDiario(userId);
    
    if (!podeReceber) {
      const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
      const usuario = doc.usuarios.find(u => u.userId === userId);
      const ultimoDaily = usuario?.ultimoDaily || 0;
      const tempoRestante = DAILY_COOLDOWN - (new Date().getTime() - ultimoDaily);
      
      return {
        success: false,
        message: 'Você já recebeu sua recompensa diária',
        tempoRestante
      };
    }
    
    const novoSaldo = await adicionarSaldo(userId, DAILY_AMOUNT);
    
    // Atualiza a última vez que o daily foi recebido
    await mongodb.updateOne(
      mongodb.COLLECTIONS.DADOS_USUARIOS,
      { _id: 'economias', 'usuarios.userId': userId },
      { $set: { 'usuarios.$.ultimoDaily': new Date().getTime() } }
    );
    
    return {
      success: true,
      message: `Você recebeu ${DAILY_AMOUNT} moedas!`,
      novoSaldo
    };
  } catch (error) {
    console.error(`Erro ao processar daily para o usuário ${userId}:`, error);
    return { success: false, message: 'Ocorreu um erro ao processar sua recompensa diária' };
  }
}

async function obterRanking(limite = 10) {
  try {
    const doc = await mongodb.findOne(mongodb.COLLECTIONS.DADOS_USUARIOS, { _id: 'economias' });
    
    if (!doc || !doc.usuarios || !Array.isArray(doc.usuarios)) {
      return [];
    }
    
    // Copiar array para não modificar o original
    const usuarios = [...doc.usuarios]
      .filter(u => u && u.saldo !== undefined)
      .map(u => ({
        id: u.userId,
        saldo: u.saldo || 0
      }));
    
    // Ordenar por saldo em ordem decrescente
    usuarios.sort((a, b) => b.saldo - a.saldo);
    
    return usuarios.slice(0, limite);
  } catch (error) {
    console.error('Erro ao obter ranking de economias:', error);
    return [];
  }
}

module.exports = {
  inicializarEconomia,
  obterSaldo,
  adicionarSaldo,
  removerSaldo,
  transferirSaldo,
  verificarDiario,
  receberDiario,
  obterRanking,
  getSaldo: obterSaldo, // Compatibilidade com código antigo
  DAILY_AMOUNT,
  DAILY_COOLDOWN
};