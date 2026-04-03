const express = require('express');
const { Client } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ========== CONEXÃO COM POSTGRESQL (AIVEN) ==========
// ⚠️ ATENÇÃO: A senha NÃO está no código! Use a variável DATABASE_URL no Render.
if (!process.env.DATABASE_URL) {
    console.error('❌ ERRO CRÍTICO: DATABASE_URL não configurada nas variáveis de ambiente!');
    console.error('   Configure a variável DATABASE_URL no Render com a string de conexão do Aiven.');
    process.exit(1);
}

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
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

// Página de configuração de respostas
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
                label { font-weight: bold; display: block; margin-bottom: 5px; color: #333; }
                small { color: #666; font-size: 12px; display: block; margin-bottom: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h1>⚙️ Configurar ${empresa.nome}</h1>
                    <a href="/" class="btn-voltar" style="display: inline-block; padding: 8px 15px; background: #6c757d; color: white; border-radius: 8px; text-decoration: none; margin-bottom: 20px;">← Voltar</a>
                    
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
            'INSERT INTO conversas (entreprise_id, cliente, mensagens, status) VALUES ($1, $2, $3, $4)',
            [empresaId, from, JSON.stringify([{ role: 'user', content: texto }, { role: 'bot', content: resposta }]), 'active']
        );
        
        res.json({ resposta });
    } catch (err) {
        console.error('Erro no webhook:', err);
        res.json({ resposta: 'Erro no processamento. Tente novamente.' });
    }
});

// Dashboard de conversas
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
