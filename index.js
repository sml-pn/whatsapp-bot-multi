// ========== QR CODE PARA CONEXÃO (NOVO) ==========

// Rota para exibir a página do QR code
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
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔗 Conectar WhatsApp</h1>
                <p><strong>${empresa.nome}</strong></p>
                <p>📱 Número: ${empresa.whatsapp_number}</p>
                
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
                const API_URL = 'https://whatsapp-bot-multi.onrender.com';
                const EMPRESA_ID = '${empresaId}';
                
                async function carregarQR() {
                    const qrBox = document.getElementById('qrBox');
                    const statusDiv = document.getElementById('status');
                    
                    qrBox.innerHTML = '<p>⏳ Carregando...</p>';
                    
                    try {
                        // Tenta obter o QR code da Evolution API (se estiver configurada)
                        const response = await fetch(\`\${API_URL}/api/qr/\${EMPRESA_ID}\`);
                        const data = await response.json();
                        