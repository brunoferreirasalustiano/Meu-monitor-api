// ==========================================
// server.js - MOTOR UNIVERSAL (SUPABASE READY)
// ==========================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // Driver do Postgres
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const SECRET_KEY = "bruno_dev_portugal_2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Rota inicial para abrir o login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// --- CONFIGURAÇÃO DO BANCO DE DADOS (SUPABASE) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => console.log("🚀 Conectado ao PostgreSQL (Supabase)"));

// --- MIDDLEWARE DE PROTEÇÃO ---
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
//   ROTAS DE AUTENTICAÇÃO (LOGIN/CADASTRO)
// ==========================================
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

        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '2h' });
        res.json({ sucesso: true, token });
    } catch (e) {
        res.status(500).json({ sucesso: false, mensagem: "Erro no servidor" });
    }
});

// ==========================================
//   ROTAS DO MONITOR (PROTEGIDAS)
// ==========================================

// --- ROTA 1: CONFIGURAR SLOT ---
app.post('/configurar-slot', verificarToken, async (req, res) => {
    const { slot, nome, provedor, key, modelo, limite } = req.body;
    try {
        if (key && key.trim() !== "") {
            const query = `UPDATE slots SET nome = $1, provedor = $2, key = $3, modelo = $4, limite = $5, ativa = 1, acumulado = 0 WHERE id = $6`;
            await pool.query(query, [nome, provedor, key.trim(), modelo.trim(), limite, slot]);
        } else {
            const query = `UPDATE slots SET nome = $1, provedor = $2, modelo = $3, limite = $4, ativa = 1 WHERE id = $5`;
            await pool.query(query, [nome, provedor, modelo.trim(), limite, slot]);
        }
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// --- ROTA 2: TESTAR API ---
app.get('/testar-api', verificarToken, async (req, res) => {
    const numSlot = req.query.slot || 1;
    const inicio = Date.now();

    try {
        // 1. Busca configuração no banco
        const result = await pool.query('SELECT * FROM slots WHERE id = $1', [numSlot]);
        const config = result.rows[0];

        if (!config || config.ativa === 0) {
            return res.json({ sucesso: false, mensagem: "Não configurado" });
        }

        // 2. Define o Endpoint
        let urlEndpoint = "";
        if (config.provedor === "OpenAI") urlEndpoint = "https://api.openai.com/v1/chat/completions";
        else if (config.provedor === "Groq") urlEndpoint = "https://api.groq.com/openai/v1/chat/completions";
        else if (config.provedor === "DeepSeek") urlEndpoint = "https://api.deepseek.com/chat/completions";
        else if (config.provedor === "OpenRouter") urlEndpoint = "https://openrouter.ai/api/v1/chat/completions";
        else if (config.provedor === "Gemini") urlEndpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
        else if (config.provedor === "HuggingFace") urlEndpoint = "https://router.huggingface.co/v1/chat/completions";
        else return res.status(400).json({ sucesso: false, mensagem: "Provedor desconhecido." });

        // 3. Chamada para a API (Fetch Único)
        const responseAPI = await fetch(urlEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key.trim()}`,
                'HTTP-Referer': 'https://monitorapi.onrender.com', 
                'X-Title': 'API Monitor Bruno'
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: "." }],
                model: config.modelo.trim(), // <--- O .trim() é obrigatório para produto real
                max_tokens: 1,
                temperature: 0,
            })
        });

        const dataAPI = await responseAPI.json();
        const latencia = Date.now() - inicio;

        if (dataAPI.error) {
    // Se for uma string (comum na HF), usa ela. Se for objeto, tenta o .message
    const msgReal = typeof dataAPI.error === 'string' ? dataAPI.error : (dataAPI.error.message || JSON.stringify(dataAPI.error));
    return res.status(400).json({ sucesso: false, mensagem: msgReal });
}

        // 4. Atualiza consumo de tokens
        let novosTokens = dataAPI.usage?.total_tokens || dataAPI.usageMetadata?.totalTokenCount || 2;
        const novoAcumulado = (Number(config.acumulado) || 0) + novosTokens;
        
        await pool.query('UPDATE slots SET acumulado = $1 WHERE id = $2', [novoAcumulado, numSlot]);

        await pool.query(
            'INSERT INTO historico_testes (slot_id, latencia, sucesso, tokens, modelo_real) VALUES ($1, $2, $3, $4, $5)',
            [numSlot, latencia, true, novosTokens, dataAPI.model || config.modelo]
        );

        // 5. Retorno Sucesso
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
        // Esse CATCH pega QUALQUER erro da rota (banco ou fetch)
        console.error("Erro na rota testar-api:", error.message);
        res.status(500).json({ sucesso: false, mensagem: "Falha: " + error.message });
    }
});

// --- NOVA ROTA: RECUPERAR O HISTÓRICO DO GRÁFICO---
app.get('/obter-historico', verificarToken, async (req, res) => {
    const numSlot = req.query.slot || 1;
    try {
        const result = await pool.query(
            'SELECT latencia, criado_em FROM historico_testes WHERE slot_id = $1 ORDER BY criado_em DESC LIMIT 20',
            [numSlot]
        );
        // Inverter para mostrar do mais antigo para o mais novo
        res.json({ sucesso: true, dados: result.rows.reverse() });
    } catch (err) {
        console.error("Erro ao buscar histórico:", err.message);
        res.status(500).json({ sucesso: false, mensagem: "Erro ao buscar histórico" });
    }
});

// --- ROTA PARA RELATÓRIO COMPLETO (TODOS OS LOGS) ---
app.get('/relatorio-exportar', verificarToken, async (req, res) => {
    try {
        // Busca todos os testes, juntando com o nome do slot
        const query = `
            SELECT h.criado_em, s.nome as slot_nome, h.latencia, h.tokens, h.modelo_real
            FROM historico_testes h
            JOIN slots s ON h.slot_id = s.id
            ORDER BY h.criado_em DESC
        `;
        const result = await pool.query(query);
        res.json({ sucesso: true, dados: result.rows });
    } catch (err) {
        console.error("Erro ao exportar:", err);
        res.status(500).json({ sucesso: false });
    }
});

// --- ROTA 3: OBTER DADOS DO SLOT ---
app.get('/obter-slot', verificarToken, async (req, res) => {
    const numSlot = req.query.slot;
    try {
        const result = await pool.query('SELECT nome, provedor, modelo, limite, ativa FROM slots WHERE id = $1', [numSlot]);
        res.json({ sucesso: true, dados: result.rows[0] });
    } catch (err) {
        res.status(500).json({ sucesso: false });
    }
});

// --- ROTA 4: VISÃO GLOBAL (MINI-CARDS) ---
app.get('/status-geral', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nome, provedor, modelo, limite, acumulado, ativa FROM slots ORDER BY id ASC');
        res.json({ sucesso: true, slots: result.rows });
    } catch (err) {
        res.status(500).json({ sucesso: false });
    }
});

// ==========================================
// SISTEMA DE RECUPERAÇÃO DE SENHA
// ==========================================
const codigosRecuperacao = {}; 

app.post('/solicitar-recuperacao', (req, res) => {
    const { usuario } = req.body; 
    const codigo = Math.floor(100000 + Math.random() * 900000).toString(); 
    codigosRecuperacao[usuario] = codigo; 
    console.log(`🔐 CÓDIGO PARA ${usuario}: ${codigo}`);
    res.json({ sucesso: true, mensagem: "Código gerado! Olhe o terminal do Render." });
});

app.post('/redefinir-senha', async (req, res) => {
    const { usuario, codigo, novaSenha } = req.body;
    if (codigosRecuperacao[usuario] && codigosRecuperacao[usuario] === codigo) {
        try {
            const senhaCripto = await bcrypt.hash(novaSenha, 10);
            await pool.query('UPDATE usuarios SET senha = $1 WHERE email = $2', [senhaCripto, usuario]);
            delete codigosRecuperacao[usuario]; 
            res.json({ sucesso: true, mensagem: "Senha alterada com sucesso!" });
        } catch (e) {
            res.status(500).json({ sucesso: false, mensagem: "Erro ao salvar senha." });
        }
    } else {
        res.status(400).json({ sucesso: false, mensagem: "Código inválido." });
    }
});

// --- FUNÇÃO DE MANUTENÇÃO: POLÍTICA DE 60 DIAS ---
async function realizarFaxinaNoBanco() {
    try {
        const query = `DELETE FROM historico_testes WHERE criado_em < NOW() - INTERVAL '60 days'`;
        const result = await pool.query(query);
        
        if (result.rowCount > 0) {
            console.log(`🧹 Faxina concluída: ${result.rowCount} registros antigos removidos.`);
        }
    } catch (err) {
        console.error("❌ Erro na manutenção do banco:", err.message);
    }
}

// Executa assim que o servidor liga (importante para o Render)
realizarFaxinaNoBanco();

// Agenda para rodar uma vez a cada 24 horas enquanto estiver ligado
setInterval(realizarFaxinaNoBanco, 24 * 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));