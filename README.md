# 🤖 WhatsApp Bot Multi-Empresa

Plataforma para gerenciar múltiplas empresas no WhatsApp.

## Funcionalidades
- ✅ Multi-empresa (cada empresa com seu ID)
- ✅ Configuração de respostas prontas por empresa
- ✅ Dashboard de conversas
- ✅ Webhook para WhatsApp
- ✅ Banco PostgreSQL (Aiven)

## Deploy no Render
1. Fork este repositório
2. Crie um Web Service no Render
3. Adicione a variável `DATABASE_URL`
4. Deploy

## fluxo completo
Cliente acessa sua página
    ↓

Cadastra empresa (nome, telefone, e-mail)
   
 ↓

Sistema cria empresa no seu banco (ID gerado)
   
 ↓

Cliente clica em "Conectar WhatsApp"
  
  ↓

Sistema chama Evolution API para criar instância e gerar QR
   
 ↓

Cliente escaneia QR com o WhatsApp dele
    
↓

Bot conectado! Pronto para usar.