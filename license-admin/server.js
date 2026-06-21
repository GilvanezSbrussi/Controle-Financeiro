const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENTS_FILE = path.join(__dirname, 'clients.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Utilitários
function readClients() {
  try {
    const data = fs.readFileSync(CLIENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao ler clients.json:', error);
    return [];
  }
}

function writeClients(clients) {
  try {
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao escrever clients.json:', error);
    return false;
  }
}

function generateId() {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

// GET /clients - Lista todos os clientes
app.get('/clients', (req, res) => {
  try {
    const clients = readClients();
    res.json({ clients });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar clientes' });
  }
});

// POST /clients - Cria ou atualiza cliente
app.post('/clients', (req, res) => {
  try {
    const { name, document, email, profile } = req.body;
    
    if (!name || !document) {
      return res.status(400).json({ error: 'Nome e documento são obrigatórios' });
    }
    
    const clients = readClients();
    const existingIndex = clients.findIndex(c => c.document === document);
    
    const clientData = {
      name: name.trim(),
      document: document.trim(),
      email: email ? email.trim() : '',
      profile: profile || 'Usuário',
      updatedAt: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      clients[existingIndex] = { ...clients[existingIndex], ...clientData };
    } else {
      clients.push({
        id: generateId(),
        ...clientData
      });
    }
    
    writeClients(clients);
    res.json({ success: true, clients, message: existingIndex >= 0 ? 'Cliente atualizado' : 'Cliente criado' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar cliente' });
  }
});

// DELETE /clients/:id - Remove cliente
app.delete('/clients/:id', (req, res) => {
  try {
    const { id } = req.params;
    let clients = readClients();
    const initialLength = clients.length;
    clients = clients.filter(c => c.id !== id);
    
    if (clients.length === initialLength) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    writeClients(clients);
    res.json({ success: true, clients });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover cliente' });
  }
});

// POST /generate - Gera licença
app.post('/generate', (req, res) => {
  try {
    const { holder, document, days } = req.body;
    
    if (!holder || !document || !days) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    
    const licenseKey = crypto.randomBytes(16).toString('hex').toUpperCase();
    const formattedLicense = licenseKey.match(/.{1,4}/g).join('-');
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(days));
    
    res.json({
      license: formattedLicense,
      holder,
      document,
      days: parseInt(days),
      expiresAt: expiresAt.toLocaleDateString('pt-BR'),
      generatedAt: new Date().toLocaleString('pt-BR')
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar licença' });
  }
});

// POST /admin/verify - Verifica se CPF é administrador
app.post('/admin/verify', (req, res) => {
  try {
    const { document } = req.body;
    
    if (!document) {
      return res.status(400).json({ valid: false, error: 'CPF/CNPJ é obrigatório' });
    }
    
    const cleanDocument = document.replace(/\D/g, '');
    const clients = readClients();
    const client = clients.find(c => c.document.replace(/\D/g, '') === cleanDocument);
    
    if (!client) {
      return res.status(404).json({ valid: false, error: 'CPF/CNPJ não encontrado' });
    }
    
    const isAdmin = (client.profile || '').toUpperCase() === 'ADMINISTRADOR';
    
    if (!isAdmin) {
      return res.status(403).json({ valid: false, error: 'Perfil não autorizado. Apenas administradores podem acessar.' });
    }
    
    const token = crypto.randomBytes(32).toString('hex');
    client.adminToken = token;
    client.tokenExpires = Date.now() + (30 * 60 * 1000);
    
    writeClients(clients);
    
    res.json({ 
      valid: true, 
      token: token,
      name: client.name,
      expiresIn: 1800
    });
  } catch (error) {
    console.error('Erro ao verificar admin:', error);
    res.status(500).json({ error: 'Erro ao verificar administrador' });
  }
});

// GET /admin/gerador - Serve o Gerador.html protegido
app.get('/admin/gerador', (req, res) => {
  const token = req.query.token;
  
  if (!token) {
    return res.status(401).send('Acesso negado. Token não fornecido.');
  }
  
  const clients = readClients();
  const client = clients.find(c => c.adminToken === token && c.tokenExpires > Date.now());
  
  if (!client) {
    return res.status(401).send('Token inválido ou expirado.');
  }
  
  res.sendFile(path.join(__dirname, 'Gerador.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📁 Pasta: ${__dirname}`);
});