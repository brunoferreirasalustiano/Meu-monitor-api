// ==========================================
// server.js - MOTOR UNIVERSAL 
// ==========================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const SECRET_KEY = process.env.JWT_SECRET;

// 1. CONFIGURAÇÃO DE CORS (CORRIGIDA)
app.use(cors());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// 2. CONFIGURAÇÃO DO BANCO DE DADOS
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { require: true, rejectUnauthorized: false }
});

pool.on('connect', () => console.log("🚀 Conectado ao PostgreSQL (Supabase)"));

// 3. MIDDLEWARE DE PROTEÇÃO
function verificarToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ sucesso: false, mensagem: "Token não fornecido" });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ sucesso: false, mensagem: "Token inválido" });
        req.user = decoded;
        next();
    });
}

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/cadastro', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const senhaCripto = await bcrypt.hash(senha, 10);
        await pool.query('INSERT INTO usuarios (email, senha) VALUES ($1, $2)', [email, senhaCripto]);
        res.json({ sucesso: true, mensagem: "Usuário criado com sucesso!" });
    } catch (e) {
        res.status(400).json({ sucesso: false, mensagem: "Email já cadastrado ou erro no servidor" });
    }
});

app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ sucesso: false, mensagem: "Usuário não encontrado" });
        const senhaBatendo = await bcrypt.compare(senha, user.senha);
        if (!senhaBatendo) return res.status(401).json({ sucesso: false, mensagem: "Senha incorreta" });
        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '30d' });
        res.json({ sucesso: true, token });
    } catch (e) {
        res.status(500).json({ sucesso: false, mensagem: "Erro no servidor" });
    }
});

// --- ROTAS DO MONITOR ---
app.post('/configurar-slot', verificarToken, async (req, res) => {
    const { slot, nome, provedor, key, modelo, limite } = req.body;
    try {
        const query = key && key.trim() !== "" 
            ? `UPDATE slots SET nome = $1, provedor = $2, key = $3, modelo = $4, limite = $5, ativa = 1, acumulado = 0 WHERE id = $6`
            : `UPDATE slots SET nome = $1, provedor = $2, modelo = $3, limite = $4, ativa = 1 WHERE id = $5`;
        const params = key && key.trim() !== "" 
            ? [nome, provedor, key.trim(), modelo.trim(), limite, slot]
            : [nome, provedor, modelo.trim(), limite, slot];
        await pool.query(query, params);
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.get('/testar-api', verificarToken, async (req, res) => {
    const numSlot = req.query.slot || 1;
    const inicio = Date.now();
    try {
        const result = await pool.query('SELECT * FROM slots WHERE id = $1', [numSlot]);
        const config = result.rows[0];
        if (!config || config.ativa === 0) return res.json({ sucesso: false, mensagem: "Não configurado" });

        let urlEndpoint = "";
        const provedores = {
            "OpenAI": "https://api.openai.com/v1/chat/completions",
            "Groq": "https://api.groq.com/openai/v1/chat/completions",
            "DeepSeek": "https://api.deepseek.com/chat/completions",
            "OpenRouter": "https://openrouter.ai/api/v1/chat/completions",
            "Gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            "HuggingFace": "https://router.huggingface.co/v1/chat/completions"
        };
        urlEndpoint = provedores[config.provedor];
        if (!urlEndpoint ) return res.status(400).json({ sucesso: false, mensagem: "Provedor desconhecido." });

        const responseAPI = await fetch(urlEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key.trim()}`,
                'X-Title': 'API Monitor Bruno'
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: "." }],
                model: config.modelo.trim(),
                max_tokens: 1,
                temperature: 0,
            })
        });

        const dataAPI = await responseAPI.json();
        const latencia = Date.now() - inicio;

        if (dataAPI.error) {
            const msgReal = typeof dataAPI.error === 'string' ? dataAPI.error : (dataAPI.error.message || JSON.stringify(dataAPI.error));
            return res.status(400).json({ sucesso: false, mensagem: msgReal });
        }

        let novosTokens = dataAPI.usage?.total_tokens || dataAPI.usageMetadata?.totalTokenCount || 2;
        const novoAcumulado = (Number(config.acumulado) || 0) + novosTokens;
        await pool.query('UPDATE slots SET acumulado = $1 WHERE id = $2', [novoAcumulado, numSlot]);
        await pool.query('INSERT INTO historico_testes (slot_id, latencia, sucesso, tokens, modelo_real) VALUES ($1, $2, $3, $4, $5)', [numSlot, latencia, true, novosTokens, dataAPI.model || config.modelo]);

        res.json({
            sucesso: true,
            modelo: dataAPI.model || config.modelo,
            latencia: latencia,
            consumo: config.limite > 0 ? ((novoAcumulado / config.limite) * 100).toFixed(2) : 0,
            tokens: novosTokens
        });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: "Falha: " + error.message });
    }
});

app.get('/obter-historico', verificarToken, async (req, res) => {
    const numSlot = req.query.slot || 1;
    try {
        const result = await pool.query('SELECT latencia, criado_em FROM historico_testes WHERE slot_id = $1 ORDER BY criado_em DESC LIMIT 20', [numSlot]);
        res.json({ sucesso: true, dados: result.rows.reverse() });
    } catch (err) {
        res.status(500).json({ sucesso: false });
    }
});

app.get('/status-geral', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nome, provedor, modelo, limite, acumulado, ativa FROM slots ORDER BY id ASC');
        res.json({ sucesso: true, slots: result.rows });
    } catch (err) {
        res.status(500).json({ sucesso: false });
    }
});

// --- RECUPERAÇÃO DE SENHA ---
const codigosRecuperacao = {}; 
app.post('/solicitar-recuperacao', (req, res) => {
    const { usuario } = req.body; 
    const codigo = Math.floor(100000 + Math.random() * 900000).toString(); 
    codigosRecuperacao[usuario] = codigo; 
    console.log(`🔐 CÓDIGO PARA ${usuario}: ${codigo}`);
    res.json({ sucesso: true, mensagem: "Código gerado! Verifique os logs do servidor." });
});

app.post('/redefinir-senha', async (req, res) => {
    const { usuario, codigo, novaSenha } = req.body;
    if (codigosRecuperacao[usuario] === codigo) {
        const senhaCripto = await bcrypt.hash(novaSenha, 10);
        await pool.query('UPDATE usuarios SET senha = $1 WHERE email = $2', [senhaCripto, usuario]);
        delete codigosRecuperacao[usuario];
        res.json({ sucesso: true, mensagem: "Senha alterada!" });
    } else {
        res.status(400).json({ sucesso: false, mensagem: "Código inválido." });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});


