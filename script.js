// 1. ENDEREÇO DO SERVIDOR NA NUVEM
const API_URL = "https://monitorapi.onrender.com";

// ==========================================
// 1. VERIFICAÇÃO DE ACESSO E USUÁRIO LOGADO
// ==========================================
(function() {
    const token = localStorage.getItem('token_monitor');
    
    if (!token) {
        window.location.href = 'login.html';
        return; 
    }

    try {
        const payloadCodificado = token.split('.')[1];
        const payloadDecodificado = atob(payloadCodificado);
        const dadosUsuario = JSON.parse(payloadDecodificado);

        const spanUsuario = document.getElementById('usuario-logado');
        if (spanUsuario && dadosUsuario.email) {
            spanUsuario.innerHTML = `<i class="fas fa-user-shield"></i> Seguro: <strong>${dadosUsuario.email}</strong>`;
        }
    } catch (erro) {
        console.error("Erro ao ler dados do usuário", erro);
    }
})();

function fazerLogout() {
    localStorage.removeItem('token_monitor');
    window.location.href = 'login.html';
}

// ==========================================
// 2. CONFIGURAÇÃO DO GRÁFICO INDIVIDUAL
// ==========================================
let graficoSlot;

let historicoLatencia = {
    1: { labels: [], data: [] },
    2: { labels: [], data: [] },
    3: { labels: [], data: [] },
    4: { labels: [], data: [] }
};

function iniciarGrafico() {
    const ctx = document.getElementById('graficoSlot');
    if (!ctx) return;
    
    graficoSlot = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: [], 
            datasets: [{ 
                label: 'Latência (ms)', 
                data: [], 
                borderColor: '#00ff88', 
                backgroundColor: 'rgba(0, 255, 136, 0.1)', 
                borderWidth: 2,
                tension: 0.4, 
                fill: true, 
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            color: '#fff',
            scales: {
                x: { display: true, ticks: { color: '#888', font: {size: 9} }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: '#888', font: {size: 9}, maxTicksLimit: 4 }, grid: { color: '#333' } }
            },
            plugins: { legend: { display: false } } 
        }
    });
}

function atualizarGraficoNaTela() {
    if (!graficoSlot) return;
    
    graficoSlot.data.labels = historicoLatencia[slotAtivo].labels;
    graficoSlot.data.datasets[0].data = historicoLatencia[slotAtivo].data;
    
    const cores = ['#00ff88', '#8a2be2', '#ff4d4d', '#f39c12'];
    graficoSlot.data.datasets[0].borderColor = cores[slotAtivo - 1];
    graficoSlot.data.datasets[0].backgroundColor = cores[slotAtivo - 1] + '22'; 
    
    graficoSlot.update();
}

// --- NOVA FUNÇÃO: BUSCA DADOS NO SUPABASE ---
async function carregarHistoricoGrafico(numSlot) {
    const token = localStorage.getItem('token_monitor');
    
    try {
        const response = await fetch(`${API_URL}/obter-historico?slot=${numSlot}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.sucesso && data.dados.length > 0) {
            // Limpa o histórico atual para não duplicar
            historicoLatencia[numSlot].labels = [];
            historicoLatencia[numSlot].data = [];

            // Mapeia o que veio do banco para o formato do gráfico
            data.dados.forEach(item => {
                const dataHora = new Date(item.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                historicoLatencia[numSlot].labels.push(dataHora);
                historicoLatencia[numSlot].data.push(item.latencia);
            });

            // Atualiza o desenho do gráfico na tela
            atualizarGraficoNaTela();
        }
    } catch (error) {
        console.error("Erro ao carregar histórico do banco:", error);
    }
}

// ==========================================
// 3. VARIÁVEIS E TROCA DE SLOT
// ==========================================
if (typeof slotAtivo === 'undefined') {
    var slotAtivo = 1;
}

async function trocarSlot(numero) {
    slotAtivo = numero;
    
    document.querySelectorAll('.mini-card').forEach(card => {
        card.style.borderColor = 'var(--gray)';
        card.style.transform = 'translateY(0)';
    });

    atualizarGraficoNaTela();
    carregarHistoricoGrafico(numero);
    
    const cards = document.querySelectorAll('.mini-card');
    if(cards[numero - 1]) {
        cards[numero - 1].style.borderColor = 'var(--primary-purple)';
        cards[numero - 1].style.transform = 'translateY(-3px)';
    }

    const spanSlot = document.getElementById('slot-numero');
    if (spanSlot) spanSlot.innerText = numero;

    atualizarGraficoNaTela();

    try {
        const token = localStorage.getItem('token_monitor');
        // Atualizar para usar API_URL
        const response = await fetch(`${API_URL}/obter-slot?slot=${slotAtivo}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.sucesso && result.dados && result.dados.ativa === 1) {
            document.getElementById('api-nickname').value = result.dados.nome || "";
            if(result.dados.provedor) document.getElementById('api-provider').value = result.dados.provedor;
            document.getElementById('api-model').value = result.dados.modelo || "";
            document.getElementById('api-limit').value = result.dados.limite || 100000;
        } else {
            document.getElementById('form-config-api').reset();
        }
    } catch (e) { }
    
    verificarStatusAPI();
}

// ==========================================
// 4. MONITORAMENTO PRINCIPAL
// ==========================================
let requisicaoEmAndamento = false; 

async function verificarStatusAPI() {
    if (requisicaoEmAndamento) return; 
    
    const statusEl = document.querySelector('.status');
    const tituloModelo = document.querySelector('.nome-do-modelo');
    const gaugeFill = document.querySelector('.gauge-fill');
    const gaugeCover = document.querySelector('.gauge-cover');

    if(!statusEl || !tituloModelo) return;

    requisicaoEmAndamento = true; 

    try {
        const token = localStorage.getItem('token_monitor');
        // 🔄 Atualizado para usar API_URL
        const response = await fetch(`${API_URL}/testar-api?slot=${slotAtivo}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.sucesso) {
            const corpoLogs = document.getElementById('corpo-logs');
            const agora = new Date().toLocaleTimeString();
            const novaLinha = `
                <tr>
                    <td>${agora}</td>
                    <td>API ${slotAtivo}</td>
                    <td class="status-ok">✅ ${data.latencia}ms</td>
                    <td><span class="token-badge">+${data.tokens}</span></td>
                </tr>`;
            corpoLogs.insertAdjacentHTML('afterbegin', novaLinha);
            if (corpoLogs.children.length > 5) corpoLogs.lastElementChild.remove();

            tituloModelo.innerText = data.modelo || "Modelo Ativo";
            const ms = data.latencia;
            statusEl.innerText = `Online - ${ms}ms`;
            gaugeCover.innerText = `${ms}ms`;

            const rotation = Math.min(ms / 2000, 0.5);
            gaugeFill.style.transform = `rotate(${rotation}turn)`;
            gaugeFill.style.background = ms < 250 ? "#00ff88" : (ms < 500 ? "#8a2be2" : "#ff4d4d");

            const valorConsumo = document.getElementById('valor-consumo');
            const barra = document.getElementById('barra-progresso');
            if (valorConsumo && barra) {
                valorConsumo.innerText = data.consumo;
                barra.style.width = data.consumo + "%";
            }

            const horarioAtual = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
            
            if (historicoLatencia[slotAtivo].labels.length > 10) {
                historicoLatencia[slotAtivo].labels.shift();
                historicoLatencia[slotAtivo].data.shift();
            }
            
            historicoLatencia[slotAtivo].labels.push(horarioAtual);
            historicoLatencia[slotAtivo].data.push(data.latencia);

            atualizarGraficoNaTela();

        } else {
            statusEl.innerText = data.mensagem || "Erro na API";
            tituloModelo.innerText = "Aguardando ou Falha...";
            gaugeCover.innerText = "0ms";
            gaugeFill.style.transform = `rotate(0turn)`;
        }
    } catch (error) {
        statusEl.innerText = "Servidor Offline";
    } finally {
        requisicaoEmAndamento = false; 
    }
}

// ==========================================
// 5. VISÃO GLOBAL (MINI-CARDS)
// ==========================================
async function carregarVisaoGlobal() {
    try {
        // 🔄 Atualizado para usar API_URL
        const response = await fetch(`${API_URL}/status-geral`);
        const data = await response.json();

        if (data.sucesso) {
            const painel = document.getElementById('painel-geral');
            if (!painel) return;
            painel.innerHTML = ''; 

            data.slots.forEach(slot => {
                let consumoPct = 0;
                if (slot.ativa === 1 && slot.limite > 0) {
                    consumoPct = ((slot.acumulado / slot.limite) * 100).toFixed(1);
                }

                const statusClass = slot.ativa === 1 ? 'dot-on' : 'dot-off';
                const modeloTexto = slot.ativa === 1 ? slot.modelo : 'Não configurada';
                const consumoTexto = slot.ativa === 1 ? `${consumoPct}% (${slot.acumulado} tks)` : '---';

                const cardHTML = `
                    <div class="mini-card" onclick="trocarSlot(${slot.id})">
                        <div class="mini-card-header">
                            <span><strong style="color: var(--primary-purple);">API ${slot.id}</strong> | ${slot.nome}</span>
                            <span class="status-dot ${statusClass}"></span>
                        </div>
                        <div class="mini-card-modelo">${modeloTexto}</div>
                        <div class="mini-card-consumo">Uso: ${consumoTexto}</div>
                        <div class="mini-barra-fundo">
                            <div class="mini-barra-fill" style="width: ${consumoPct > 100 ? 100 : consumoPct}%; 
                                 background: ${consumoPct > 80 ? 'var(--error-red)' : 'var(--primary-purple)'};">
                            </div>
                        </div>
                    </div>
                `;
                painel.insertAdjacentHTML('beforeend', cardHTML);
            });
        }
    } catch (error) {
        console.error("Erro ao carregar visão global:", error);
    }
}

function limparLogs() {
    if (confirm("Deseja realmente limpar o histórico da tela?")) {
        document.getElementById('corpo-logs').innerHTML = '';
    }
}

// ==========================================
// 6. INICIALIZAÇÃO E ENVIO DO FORMULÁRIO
// ==========================================
window.onload = () => {
    carregarVisaoGlobal(); 
    iniciarGrafico(); 
    carregarHistoricoGrafico(slotAtivo);

    const formulario = document.getElementById('form-config-api');
    
    if (formulario) {
        formulario.addEventListener('submit', async (e) => {
            e.preventDefault();

            const config = {
                slot: slotAtivo,
                nome: document.getElementById('api-nickname').value,
                provedor: document.getElementById('api-provider').value,
                modelo: document.getElementById('api-model').value,
                limite: parseInt(document.getElementById('api-limit').value),
                key: document.getElementById('api-key').value
            };

            try {
                const token = localStorage.getItem('token_monitor');
                // Atualizar para usar API_URL
                const response = await fetch(`${API_URL}/configurar-slot`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify(config)
                });

                const result = await response.json(); 

                if (result.sucesso) {
                    alert(`✅ Slot ${slotAtivo} configurado com sucesso!`);
                    document.getElementById('api-key').value = ""; 
                    carregarVisaoGlobal();
                    verificarStatusAPI();
                } else {
                    alert(`❌ Falha ao salvar: ${result.mensagem || "Erro desconhecido."}`);
                }
            } catch (error) {
                alert("❌ Erro ao conectar com o servidor.");
            }
        });
    }

    verificarStatusAPI(); 
};

// ==========================================
// 7. EXPORTAR RELATÓRIO PARA CSV
// ==========================================
async function baixarRelatorio(event) {
    if (event) event.preventDefault();
    const token = localStorage.getItem('token_monitor');

    try {
        // 1. Busca TODOS os dados do banco
        const response = await fetch(`${API_URL}/relatorio-exportar`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (!result.sucesso || result.dados.length === 0) {
            return alert("⚠️ Não há dados no banco para exportar!");
        }

        // 2. Monta o cabeçalho do CSV
        let csv = ["Data/Hora,Slot,Modelo,Latencia(ms),Tokens"];

        // 3. Adiciona as linhas do banco
        result.dados.forEach(row => {
            const dataFormatada = new Date(row.criado_em).toLocaleString('pt-BR');
            csv.push(`"${dataFormatada}","${row.slot_nome}","${row.modelo_real}","${row.latencia}","${row.tokens}"`);
        });

        // 4. Gera o download
        const csvString = csv.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `relatorio_completo_api_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
        link.click();

    } catch (error) {
        alert("❌ Erro ao gerar relatório do banco.");
    }
}

async function gerarRelatorioPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const token = localStorage.getItem('token_monitor');

    try {
        // 1. Busca os dados reais do Supabase
        const response = await fetch(`${API_URL}/relatorio-exportar`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (!result.sucesso || result.dados.length === 0) {
            return alert("⚠️ Sem dados para gerar o PDF.");
        }

        // 2. Cabeçalho Personalizado (O "Toque de Classe")
        doc.setFontSize(18);
        doc.setTextColor(138, 43, 226); // Aquele roxo (BlueViolet) que você usa
        doc.text("Relatório de Performance - API Monitor", 14, 22);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        const dataGeracao = new Date().toLocaleString('pt-BR');
        doc.text(`Gerado em: ${dataGeracao} | Desenvolvedor: Bruno`, 14, 30);

        // 3. Montando a Tabela com autoTable
        const colunas = ["Data/Hora", "Slot", "Modelo", "Latência", "Tokens"];
        const linhas = result.dados.map(row => [
            new Date(row.criado_em).toLocaleString('pt-BR'),
            row.slot_nome,
            row.modelo_real,
            `${row.latencia}ms`,
            `+${row.tokens}`
        ]);

        doc.autoTable({
            startY: 40,
            head: [colunas],
            body: linhas,
            theme: 'grid',
            headStyles: { fillColor: [138, 43, 226], textColor: [255, 255, 255] }, // Cabeçalho Roxo
            alternateRowStyles: { fillColor: [245, 245, 255] }, // Linhas zebradas
            styles: { fontSize: 9 }
        });

        // 4. Download do Arquivo
        const dataNome = new Date().toLocaleDateString().replace(/\//g, '-');
        doc.save(`Relatorio_API_Bruno_${dataNome}.pdf`);

    } catch (error) {
        console.error("Erro no PDF:", error);
        alert("❌ Falha ao gerar PDF profissional.");
    }
}
// ==========================================
// 8. CONTROLE DE ATUALIZAÇÃO AUTOMÁTICA
// ==========================================
let intervaloVerificacao;
const TEMPO_ATUALIZACAO = 120000; 

function iniciarMonitoramentoAutomatico() {
    clearInterval(intervaloVerificacao); 
    
    intervaloVerificacao = setInterval(() => {
        verificarStatusAPI();
    }, TEMPO_ATUALIZACAO);
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        verificarStatusAPI(); 
        iniciarMonitoramentoAutomatico(); 
    } else {
        clearInterval(intervaloVerificacao); 
    }
});

// ==========================================
// 9. FUNÇÕES DE RECUPERAÇÃO DE SENHA
// ==========================================

async function solicitarCodigo() {
    const usuario = document.getElementById('rec-usuario').value;
    if (!usuario) return alert("Digite o seu usuário primeiro!");

    try {
        // Atualizar para usar API_URL
        const response = await fetch(`${API_URL}/solicitar-recuperacao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario })
        });

        const data = await response.json();
        alert(data.mensagem);

        if (data.sucesso) {
            document.getElementById('passo-pedir-codigo').style.display = 'none';
            document.getElementById('passo-nova-senha').style.display = 'block';
        }
    } catch (e) {
        alert("Erro no servidor.");
    }
}

async function salvarNovaSenha() {
    const usuario = document.getElementById('rec-usuario').value;
    const codigo = document.getElementById('rec-codigo').value;
    const novaSenha = document.getElementById('rec-nova-senha').value;

    if (!codigo || !novaSenha) return alert("Preencha o código e a nova senha!");

    try {
        // Atualizar para usar API_URL
        const response = await fetch(`${API_URL}/redefinir-senha`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, codigo, novaSenha })
        });

        const data = await response.json();
        alert(data.mensagem);

        if (data.sucesso) {
            window.location.reload();
        }
    } catch (e) {
        alert("Erro ao salvar senha.");
    }
}

iniciarMonitoramentoAutomatico();