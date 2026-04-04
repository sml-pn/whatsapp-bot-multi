const express = require('express');
const { Client } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ========== CONEXÃO COM POSTGRESQL (AIVEN) ==========
if (!process.env.DATABASE_URL) {
    console.error('❌ ERRO CRÍTICO: DATABASE_URL não configurada nas variáveis de ambiente!');
    console.error('   Configure a variável DATABASE_URL no Render com a string de conexão do Aiven.');
    process.exit(1);
}

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

async function initDB() {
    try {
        await client.connect();
        console.log('✅ Conectado ao PostgreSQL (Aiven)');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS empresas (
                id TEXT PRIMARY KEY,
                nome TEXT,
                whatsapp_number TEXT,
                config TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS conversas (
                id SERIAL PRIMARY KEY,
                empresa_id TEXT,
                cliente TEXT,
                mensagens TEXT,
                status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Tabelas criadas/verificadas');
    } catch (err) {
        console.error('❌ Erro ao conectar ao banco:', err.message);
        process.exit(1);
    }
}

// ========== PAINEL ADMIN ==========
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Bot Multi-Empresa</title>
            <style>
                * { box-sizing: border-box; }
                body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                .container { max-width: 800px; margin: auto; }
                h1 { color: #075E54; text-align: center; }
                .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                .empresa { border-left: 4px solid #25D366; margin-bottom: 15px; padding: 10px; }
                .empresa h3 { margin: 0 0 10px 0; color: #075E54; }
                button { background: #25D366; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; margin-top: 10px; }
                button:hover { background: #128C7E; }
                input, textarea { width: 100%; padding: 10px; margin: 5px 0 15px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
                a { color: #075E54; text-decoration: none; display: inline-block; margin-right: 15px; font-size: 14px; }
                a:hover { text-decoration: underline; }
                hr { margin: 15px 0; }
                .btn-qr { background: #25D366; color: white; padding: 5px 10px; border-radius: 5px; text-decoration: none; font-size: 12px; margin-left: 10px; }
                .btn-qr:hover { background: #128C7E; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Bot Multi-Empresa</h1>
                
                <div class="card">
                    <h2>📋 Empresas Cadastradas</h2>
                    <div id="empresas"></div>
                </div>
                
                <div class="card">
                    <h2>➕ Nova Empresa</h2>
                    <input type="text" id="empresaNome" placeholder="Nome da empresa (ex: Pizzaria Emboaca)">
                    <input type="text" id="empresaNumero" placeholder="WhatsApp (ex: 558596364974)">
                    <button onclick="criarEmpresa()">Criar Empresa</button>
                </div>
            </div>
            
            <script>
                async function carregarEmpresas() {
                    const res = await fetch('/api/empresas');
                    const empresas = await res.json();
                    const div = document.getElementById('empresas');
                    if (empresas.length === 0) {
                        div.innerHTML = '<p>Nenhuma empresa cadastrada ainda.</p>';
                        return;
                    }
                    div.innerHTML = empresas.map(emp => \`
                        <div class="empresa">
                            <h3>\${emp.nome}</h3>
                            <p>📱 WhatsApp: \${emp.whatsapp_number}</p>
                            <p>🆔 ID: \${emp.id}</p>
                            <hr>
                            <a href="/admin/\${emp.id}">⚙️ Configurar Respostas</a>
                            <a href="/conversas/\${emp.id}">💬 Ver Conversas</a>
                            <a href="/qr/\${emp.id}" class="btn-qr">📱 Conectar WhatsApp</a>
                        </div>
                    \`).join('');
                }
                
                async function criarEmpresa() {
                    const nome = document.getElementById('empresaNome').value;
                    const whatsapp_number = document.getElementById('empresaNumero').value;
                    if (!nome || !whatsapp_number) {
                        alert('Preencha todos os campos!');
                        return;
                    }
                    await fetch('/api/empresas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nome, whatsapp_number })
                    });
                    document.getElementById('empresaNome').value = '';
                    document.getElementById('empresaNumero').value = '';
                    carregarEmpresas();
                }
                
                carregarEmpresas();
            </script>
        </body>
        </html>
    `);
});

// ========== API REST ==========
app.get('/api/empresas', async (req, res) => {
    try {
        const result = await client.query('SELECT id, nome, whatsapp_number, created_at FROM empresas ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar empresas:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

app.post('/api/empresas', async (req, res) => {
    try {
        const { nome, whatsapp_number } = req.body;
        const id = Date.now().toString();
        const config = JSON.stringify({ respostas: {} });
        
        await client.query(
            'INSERT INTO empresas (id, nome, whatsapp_number, config) VALUES ($1, $2, $3, $4)',
            [id, nome, whatsapp_number, config]
        );
        
        res.json({ success: true, id });
    } catch (err) {
        console.error('Erro ao criar empresa:', err);
        res.status(500).json({ error: 'Erro ao criar empresa' });
    }
});

// ========== QR CODE PARA CONEXÃO ==========

// Página do QR code
app.get('/qr/:empresaId', async (req, res) => {
    const { empresaId } = req.params;
    
    const result = await client.query('SELECT * FROM empresas WHERE id = $1', [empresaId]);
    if (result.rows.length === 0) {
        return res.status(404).send('Empresa não encontrada');
    }
    
    const empresa = result.rows[0];
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Conectar WhatsApp - ${empresa.nome}</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f5f5f5; }
                .container { max-width: 400px; margin: auto; background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #075E54; }
                .qr-box { background: white; padding: 20px; border-radius: 10px; margin: 20px 0; }
                button { background: #25D366; color: white; border: none; padding: 12px 20px; border-radius: 8px; font-size: 16px; cursor: pointer; margin: 5px; }
                button:hover { background: #128C7E; }
                .status { padding: 10px; border-radius: 8px; margin-top: 15px; }
                .connected { background: #d4edda; color: #155724; }
                .disconnected { background: #f8d7da; color: #721c24; }
                .waiting { background: #fff3cd; color: #856404; }
                a { color: #075E54; text-decoration: none; display: inline-block; margin-top: 15px; }
                .info { background: #e8f5e9; padding: 10px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔗 Conectar WhatsApp</h1>
                <p><strong>${empresa.nome}</strong></p>
                <p>📱 Número: ${empresa.whatsapp_number}</p>
                
                <div class="info">
                    📌 <strong>Como conectar:</strong><br>
                    1. Abra o WhatsApp no celular<br>
                    2. Vá em <strong>Configurações → Aparelhos conectados</strong><br>
                    3. Toque em <strong>Conectar um aparelho</strong><br>
                    4. Escaneie o QR code abaixo
                </div>
                
                <div class="qr-box" id="qrBox">
                    <p>⏳ Aguardando QR code...</p>
                </div>
                
                <div id="status" class="status waiting">
                    ⏳ Aguardando conexão...
                </div>
                
                <button onclick="carregarQR()">🔄 Atualizar QR</button>
                <br>
                <a href="/admin/${empresaId}">← Voltar para configurações</a>
            </div>
            
            <script>
                const API_URL = window.location.origin;
                const EMPRESA_ID = '${empresaId}';
                let intervalId = null;
                
                async function carregarQR() {
                    const qrBox = document.getElementById('qrBox');
                    const statusDiv = document.getElementById('status');
                    
                    qrBox.innerHTML = '<p>⏳ Carregando QR code...</p>';
                    
                    try {
                        const response = await fetch(\`\${API_URL}/api/qr/\${EMPRESA_ID}\`);
                        const data = await response.json();
                        
                        if (data.qr) {
                            qrBox.innerHTML = \`
                                <img src="\${data.qr}" style="width: 100%; border: 1px solid #ccc; border-radius: 10px;">
                                <p>📱 Escaneie o QR code com o WhatsApp</p>
                            \`;
                            statusDiv.innerHTML = '⏳ QR code gerado! Escaneie no WhatsApp.';
                            statusDiv.className = 'status waiting';
                        } else if (data.connected) {
                            qrBox.innerHTML = '<p>✅ WhatsApp já está conectado!</p>';
                            statusDiv.innerHTML = '✅ Conectado! Bot está ativo.';
                            statusDiv.className = 'status connected';
                            if (intervalId) clearInterval(intervalId);
                        } else if (data.message) {
                            qrBox.innerHTML = \`<p>⚠️ \${data.message}</p>\`;
                            statusDiv.innerHTML = '⚠️ Configure o conector para gerar QR.';
                            statusDiv.className = 'status disconnected';
                        } else {
                            qrBox.innerHTML = '<p>❌ Erro ao gerar QR. Tente novamente.</p>';
                            statusDiv.innerHTML = '❌ Falha ao conectar. Verifique o conector.';
                            statusDiv.className = 'status disconnected';
                        }
                    } catch (err) {
                        console.error('Erro:', err);
                        qrBox.innerHTML = '<p>❌ Erro ao conectar com o servidor</p>';
                        statusDiv.innerHTML = '❌ Erro de conexão. Tente novamente.';
                        statusDiv.className = 'status disconnected';
                    }
                }
                
                // Atualizar a cada 10 segundos
                carregarQR();
                intervalId = setInterval(carregarQR, 10000);
            </script>
        </body>
        </html>
    `);
});

// API para obter QR code (integração com o conector)
app.get('/api/qr/:empresaId', async (req, res) => {
    const { empresaId } = req.params;
    
    // Verificar se a empresa existe
    const result = await client.query('SELECT * FROM empresas WHERE id = $1', [empresaId]);
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    
    // Aqui você pode integrar com Evolution API ou Baileys
    // Por enquanto, retorna uma mensagem indicando que precisa configurar o conector
    
    // Verificar se há um conector ativo para esta empresa
    // Você pode armazenar o status da conexão em uma tabela ou variável global
    
    res.json({ 
        qr: null,
        connected: false,
        message: 'Conector não está ativo. Execute o conector no Termux ou configure a Evolution API.',
        instanceName: `empresa_${empresaId}`
    });
});

// ========== PÁGINA DE CONFIGURAÇÃO DE RESPOSTAS ==========
app.get('/admin/:empresaId', async (req, res) => {
    const { empresaId } = req.params;
    const result = await client.query('SELECT * FROM empresas WHERE id = $1', [empresaId]);
    
    if (result.rows.length === 0) return res.status(404).send('Empresa não encontrada');
    
    const empresa = result.rows[0];
    const config = JSON.parse(empresa.config);
    const respostas = config.respostas || {};
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Configurar ${empresa.nome}</title>
            <style>
                * { box-sizing: border-box; }
                body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                .container { max-width: 700px; margin: auto; }
                .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                h1 { color: #075E54; }
                input, textarea { width: 100%; padding: 10px; margin: 5px 0 15px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
                button { background: #25D366; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; margin-top: 5px; }
                button:hover { background: #128C7E; }
                .resposta { border: 1px solid #e0e0e0; background: #fafafa; padding: 15px; margin: 15px 0; border-radius: 8px; }
                .btn-remover { background: #dc3545; margin-left: 10px; }
                .btn-remover:hover { background: #c82333; }
                .btn-adicionar { background: #075E54; }
                .btn-voltar { background: #6c757d; text-decoration: none; display: inline-block; }
                .btn-voltar:hover { background: #5a6268; text-decoration: none; }
                .btn-qr { background: #25D366; display: inline-block; padding: 8px 15px; margin-top: 10px; text-decoration: none; }
                .btn-qr:hover { background: #128C7E; }
                label { font-weight: bold; display: block; margin-bottom: 5px; color: #333; }
                small { color: #666; font-size: 12px; display: block; margin-bottom: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h1>⚙️ Configurar ${empresa.nome}</h1>
                    <a href="/" class="btn-voltar" style="display: inline-block; padding: 8px 15px; background: #6c757d; color: white; border-radius: 8px; text-decoration: none; margin-bottom: 20px;">← Voltar</a>
                    <a href="/qr/${empresaId}" class="btn-qr" style="background: #25D366; color: white; padding: 8px 15px; border-radius: 8px; text-decoration: none; margin-left: 10px;">📱 Conectar WhatsApp</a>
                    
                    <h3>📝 Respostas Automáticas</h3>
                    <small>Quando o cliente digitar a palavra-chave, o bot responderá automaticamente.</small>
                    
                    <div id="respostas"></div>
                    
                    <button onclick="adicionar()" class="btn-adicionar" style="margin-top: 10px;">➕ Adicionar resposta</button>
                    <button onclick="salvar()" style="margin-top: 20px;">💾 Salvar todas</button>
                </div>
            </div>
            
            <script>
                const respostas = ${JSON.stringify(respostas)};
                
                function renderizar() {
                    const div = document.getElementById('respostas');
                    div.innerHTML = '';
                    if (Object.keys(respostas).length === 0) {
                        div.innerHTML = '<p style="color: #666;">Nenhuma resposta configurada. Clique em "Adicionar".</p>';
                        return;
                    }
                    for (const [palavra, resposta] of Object.entries(respostas)) {
                        div.innerHTML += \`
                            <div class="resposta">
                                <label>🔑 Palavra-chave:</label>
                                <input type="text" class="palavra" value="\${palavra}">
                                <label>💬 Resposta:</label>
                                <textarea class="resposta_texto" rows="3">\${resposta}</textarea>
                                <button onclick="remover(this)" class="btn-remover">❌ Remover</button>
                            </div>
                        \`;
                    }
                }
                
                function adicionar() {
                    const div = document.getElementById('respostas');
                    div.innerHTML += \`
                        <div class="resposta">
                            <label>🔑 Palavra-chave:</label>
                            <input type="text" class="palavra" placeholder="ex: oi, preço, horário">
                            <label>💬 Resposta:</label>
                            <textarea class="resposta_texto" rows="3" placeholder="Digite a resposta do bot..."></textarea>
                            <button onclick="remover(this)" class="btn-remover">❌ Remover</button>
                        </div>
                    \`;
                }
                
                function remover(btn) {
                    btn.parentElement.remove();
                }
                
                async function salvar() {
                    const novasRespostas = {};
                    document.querySelectorAll('.resposta').forEach(div => {
                        const palavra = div.querySelector('.palavra').value.trim().toLowerCase();
                        const resposta = div.querySelector('.resposta_texto').value.trim();
                        if (palavra && resposta) novasRespostas[palavra] = resposta;
                    });
                    
                    const resposta = await fetch('/api/empresa/${empresaId}/respostas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ respostas: novasRespostas })
                    });
                    
                    if (resposta.ok) {
                        alert('✅ Salvo com sucesso!');
                        location.reload();
                    } else {
                        alert('❌ Erro ao salvar');
                    }
                }
                
                renderizar();
            </script>
        </body>
        </html>
    `);
});

// API para salvar respostas
app.post('/api/empresa/:id/respostas', async (req, res) => {
    try {
        const { id } = req.params;
        const { respostas } = req.body;
        
        const result = await client.query('SELECT * FROM empresas WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa não encontrada' });
        
        const empresa = result.rows[0];
        const config = JSON.parse(empresa.config);
        config.respostas = respostas;
        
        await client.query('UPDATE empresas SET config = $1 WHERE id = $2', [JSON.stringify(config), id]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao salvar respostas:', err);
        res.status(500).json({ error: 'Erro ao salvar' });
    }
});

// ========== WEBHOOK PRINCIPAL ==========
app.post('/webhook/:empresaId', async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { from, texto } = req.body;
        
        const result = await client.query('SELECT * FROM empresas WHERE id = $1', [empresaId]);
        if (result.rows.length === 0) {
            return res.json({ resposta: 'Empresa não encontrada' });
        }
        
        const empresa = result.rows[0];
        const config = JSON.parse(empresa.config);
        const respostas = config.respostas || {};
        
        let resposta = null;
        for (const [palavra, respostaPronta] of Object.entries(respostas)) {
            if (texto.toLowerCase().includes(palavra.toLowerCase())) {
                resposta = respostaPronta;
                break;
            }
        }
        
        if (!resposta) {
            resposta = '❓ Não entendi. Digite "ATENDENTE" para falar com um humano.';
            if (texto.toLowerCase().includes('atendente')) {
                resposta = '👨‍💼 Transferindo para um atendente... Em breve você será atendido!';
            }
        }
        
        await client.query(
            'INSERT INTO conversas (empresa_id, cliente, mensagens, status) VALUES ($1, $2, $3, $4)',
            [empresaId, from, JSON.stringify([{ role: 'user', content: texto }, { role: 'bot', content: resposta }]), 'active']
        );
        
        res.json({ resposta });
    } catch (err) {
        console.error('Erro no webhook:', err);
        res.json({ resposta: 'Erro no processamento. Tente novamente.' });
    }
});

// ========== DASHBOARD DE CONVERSAS ==========
app.get('/conversas/:empresaId', async (req, res) => {
    const { empresaId } = req.params;
    const result = await client.query(
        'SELECT * FROM conversas WHERE empresa_id = $1 ORDER BY created_at DESC',
        [empresaId]
    );
    const conversas = result.rows;
    
    const empresaResult = await client.query('SELECT nome FROM empresas WHERE id = $1', [empresaId]);
    const nomeEmpresa = empresaResult.rows[0]?.nome || 'Empresa';
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Conversas - ${nomeEmpresa}</title>
            <style>
                * { box-sizing: border-box; }
                body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                .container { max-width: 800px; margin: auto; }
                .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                .conversa { border: 1px solid #e0e0e0; margin-bottom: 20px; border-radius: 8px; overflow: hidden; }
                .header { background: #075E54; color: white; padding: 10px 15px; }
                .cliente { background: #e3f2fd; padding: 10px 15px; margin: 5px; border-radius: 8px; max-width: 80%; }
                .bot { background: #e8f5e9; padding: 10px 15px; margin: 5px; border-radius: 8px; max-width: 80%; margin-left: auto; }
                .data { font-size: 11px; color: #666; margin-top: 5px; }
                a { color: #075E54; text-decoration: none; display: inline-block; margin-top: 10px; }
                a:hover { text-decoration: underline; }
                hr { margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h1>💬 Conversas - ${nomeEmpresa}</h1>
                    <a href="/">← Voltar ao painel</a>
                    <hr>
                    <div id="conversas"></div>
                </div>
            </div>
            <script>
                const conversas = ${JSON.stringify(conversas)};
                const div = document.getElementById('conversas');
                if (conversas.length === 0) {
                    div.innerHTML = '<p>Nenhuma conversa registrada ainda.</p>';
                } else {
                    conversas.forEach(conv => {
                        const msgs = JSON.parse(conv.mensagens);
                        div.innerHTML += \`
                            <div class="conversa">
                                <div class="header">
                                    <strong>👤 Cliente:</strong> \${conv.cliente}<br>
                                    <strong>📅 Data:</strong> \${new Date(conv.created_at).toLocaleString('pt-BR')}
                                </div>
                                <div style="padding: 15px;">
                                    \${msgs.map(m => \`
                                        <div class="\${m.role === 'user' ? 'cliente' : 'bot'}">
                                            <strong>\${m.role === 'user' ? 'Cliente' : 'Bot'}:</strong><br>
                                            \${m.content}
                                            <div class="data">\${new Date(conv.created_at).toLocaleTimeString('pt-BR')}</div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        \`;
                    });
                }
            </script>
        </body>
        </html>
    `);
});

// ========== INICIAR ==========
async function start() {
    try {
        await initDB();
        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🚀 WhatsApp Bot Multi-Empresa rodando!                 ║
║                                                          ║
║   📊 Painel: https://whatsapp-bot-multi.onrender.com     ║
║   🗄️ Banco: PostgreSQL (Aiven)                           ║
║                                                          ║
║   🔗 Webhook: POST /webhook/:empresaId                   ║
║   📱 QR Code: GET /qr/:empresaId                         ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        console.error('❌ Erro ao iniciar:', err.message);
        process.exit(1);
    }
}

start();