// ==========================================
// server.js - MOTOR UNIVERSAL (Groq, OpenAI, Gemini, etc)
// ==========================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const SECRET_KEY = "bruno_dev_portugal_2026";

app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const db = new sqlite3.Database('./monitor.db', (err) => {
    if (err) console.error("Erro ao abrir banco:", err.message);
    else console.log("📦 Conectado ao banco de dados SQLite (Universal).");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS slots (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        provedor TEXT,
        key TEXT,
        modelo TEXT,
        limite INTEGER, 
        acumulado INTEGER DEFAULT 0,
        ativa INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        senha TEXT
    )`);

    for(let i=1; i<=4; i++) {
        db.run(`INSERT OR IGNORE INTO slots (id, nome, ativa) VALUES (?, ?, 0)`, [i, `Slot ${i}`]);
    }
});

// ==========================================
//  ROTAS DE AUTENTICAÇÃO (LOGIN/CADASTRO)
// ==========================================
app.post('/cadastro', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const senhaCripto = await bcrypt.hash(senha, 10);
        db.run(`INSERT INTO usuarios (email, senha) VALUES (?, ?)`, [email, senhaCripto], (err) => {
            if (err) return res.status(400).json({ sucesso: false, mensagem: "Email já cadastrado!" });
            res.json({ sucesso: true, mensagem: "Usuário criado com sucesso!" });
        });
    } catch (e) { res.status(500).json({ sucesso: false, mensagem: "Erro no servidor" }); }
});

app.post('/login', (req, res) => {
    const { email, senha } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ sucesso: false, mensagem: "Usuário não encontrado" });

        const senhaBatendo = await bcrypt.compare(senha, user.senha);
        if (!senhaBatendo) return res.status(401).json({ sucesso: false, mensagem: "Senha incorreta" });

        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '2h' });
        res.json({ sucesso: true, token });
    });
});

function verificarToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ sucesso: false, mensagem: "Token não fornecido" });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ sucesso: false, mensagem: "Token inválido" });
        req.user = decoded;
        next();
    });
}

// ==========================================
//  ROTAS DO MONITOR (PROTEGIDAS)
// ==========================================

// --- ROTA 1: CONFIGURAR SLOT 
app.post('/configurar-slot', verificarToken, (req, res) => {
    const { slot, nome, provedor, key, modelo, limite } = req.body;
    
    if (key && key.trim() !== "") {
       
        const query = `UPDATE slots SET nome = ?, provedor = ?, key = ?, modelo = ?, limite = ?, ativa = 1, acumulado = 0 WHERE id = ?`;
        db.run(query, [nome, provedor, key.trim(), modelo.trim(), limite, slot], function(err) {
            if (err) return res.status(500).json({ sucesso: false, erro: err.message });
            res.json({ sucesso: true });
        });
    } else {
        
        const query = `UPDATE slots SET nome = ?, provedor = ?, modelo = ?, limite = ?, ativa = 1 WHERE id = ?`;
        db.run(query, [nome, provedor, modelo.trim(), limite, slot], function(err) {
            if (err) return res.status(500).json({ sucesso: false, erro: err.message });
            res.json({ sucesso: true });
        });
    }
});

// --- ROTA 2: TESTAR API (UNIVERSAL COM FETCH NATIVO) ---
app.get('/testar-api', verificarToken, (req, res) => {
    const numSlot = req.query.slot || 1;
    db.get(`SELECT * FROM slots WHERE id = ?`, [numSlot], async (err, config) => {
       
        if (err || !config || config.ativa === 0) return res.json({ sucesso: false, mensagem: "Não configurado" });

        const inicio = Date.now();
        
        // ---  ROTEAMENTO UNIVERSAL  ---
        let urlEndpoint = "";
        
        if (config.provedor === "OpenAI") {
            urlEndpoint = "https://api.openai.com/v1/chat/completions";
        } else if (config.provedor === "Groq") {
            urlEndpoint = "https://api.groq.com/openai/v1/chat/completions";
        } else if (config.provedor === "DeepSeek") {
            urlEndpoint = "https://api.deepseek.com/chat/completions";
        } else if (config.provedor === "OpenRouter") {
            urlEndpoint = "https://openrouter.ai/api/v1/chat/completions";
        } else if (config.provedor === "Gemini") {
            urlEndpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
        } else if (config.provedor === "HuggingFace") {
           
            urlEndpoint = "https://router.huggingface.co/v1/chat/completions";
        } else {
            return res.status(400).json({ sucesso: false, mensagem: "Provedor desconhecido." });
        }
        

        try {
            const responseAPI = await fetch(urlEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.key}`
                },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "." }],
                    model: config.modelo,
                    max_tokens: 1,
                    temperature: 0,
                })
            });

            const dataAPI = await responseAPI.json();
            const latencia = Date.now() - inicio;

            //  HUGGING FACE 
            if (dataAPI.error) {
                
                let erroReal = typeof dataAPI.error === 'string' ? dataAPI.error : (dataAPI.error.message || JSON.stringify(dataAPI.error));
                console.log(`[ERRO HUGGING FACE] Slot ${numSlot}:`, erroReal); 
                return res.status(400).json({ sucesso: false, mensagem: erroReal }); 
            }

            //  EXTRAÇÃO UNIVERSAL DE TOKENS (COM VÁRIAS POSSIBILIDADES DE NOME)
            let novosTokens = 0;
            if (dataAPI.usage && dataAPI.usage.total_tokens) {
                novosTokens = dataAPI.usage.total_tokens; 
            } else if (dataAPI.usageMetadata && dataAPI.usageMetadata.totalTokenCount) {
                novosTokens = dataAPI.usageMetadata.totalTokenCount; 
            } else {
                novosTokens = 2; 
            }
            const novoAcumulado = config.acumulado + novosTokens;
            
            db.run(`UPDATE slots SET acumulado = ? WHERE id = ?`, [novoAcumulado, numSlot]);

            res.json({
                sucesso: true,
                provedor: config.provedor,
                modelo: dataAPI.model || config.modelo,
                latencia: latencia,
                consumo: config.limite > 0 ? ((novoAcumulado / config.limite) * 100).toFixed(2) : 0,
                tokens: novosTokens,
                totalGeral: novoAcumulado
            });
            
        } catch (error) { 
            console.error("[ERRO FATAL NO FETCH]:", error.message);
            res.status(500).json({ sucesso: false, mensagem: "Falha na requisição: " + error.message }); 
        }
    });
});

// --- ROTA 3: OBTER DADOS DO SLOT ---
app.get('/obter-slot', verificarToken, (req, res) => {
    const numSlot = req.query.slot;
    db.get(`SELECT nome, provedor, modelo, limite, ativa FROM slots WHERE id = ?`, [numSlot], (err, row) => {
        if (err) return res.status(500).json({ sucesso: false });
        res.json({ sucesso: true, dados: row });
    });
});

// --- ROTA 4: VISÃO GLOBAL (MINI-CARDS) ---
app.get('/status-geral', (req, res) => {
    db.all(`SELECT id, nome, provedor, modelo, limite, acumulado, ativa FROM slots`, [], (err, rows) => {
        if (err) return res.status(500).json({ sucesso: false });
        res.json({ sucesso: true, slots: rows });
    });
});
// ==========================================
// SISTEMA DE RECUPERAÇÃO DE SENHA (REAL)
// ==========================================
const codigosRecuperacao = {}; 

// Rota 1: Gerar o código e exibir no terminal
app.post('/solicitar-recuperacao', (req, res) => {
    const { usuario } = req.body; 
    
    const codigo = Math.floor(100000 + Math.random() * 900000).toString(); 
    codigosRecuperacao[usuario] = codigo; 

    console.log(`\n=========================================`);
    console.log(`🔐 CÓDIGO DE RECUPERAÇÃO PARA: ${usuario}`);
    console.log(`CÓDIGO: ${codigo}`);
    console.log(`=========================================\n`);

    res.json({ sucesso: true, mensagem: "Código gerado! Olhe o terminal do seu Node.js." });
});

// Rota 2: Validar código, criptografar e SALVAR no banco
app.post('/redefinir-senha', async (req, res) => {
    const { usuario, codigo, novaSenha } = req.body;

    if (codigosRecuperacao[usuario] && codigosRecuperacao[usuario] === codigo) {
        try {
            //  Criptografa a nova senha 
            const senhaCripto = await bcrypt.hash(novaSenha, 10);
            
            // Atualiza o banco de dados real
            db.run(`UPDATE usuarios SET senha = ? WHERE email = ?`, [senhaCripto, usuario], (err) => {
                if (err) return res.status(500).json({ sucesso: false, mensagem: "Erro ao acessar o banco." });
                
                delete codigosRecuperacao[usuario]; 
                res.json({ sucesso: true, mensagem: "Senha alterada com sucesso! Tente logar agora." });
            });
        } catch (e) {
            res.status(500).json({ sucesso: false, mensagem: "Erro no processamento da senha." });
        }
    } else {
        res.status(400).json({ sucesso: false, mensagem: "Código inválido ou expirado." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));