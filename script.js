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
    
    const cards = document.querySelectorAll('.mini-card');
    if(cards[numero - 1]) {
        cards[numero - 1].style.borderColor = 'var(--primary-purple)';
        cards[numero - 1].style.transform = 'translateY(-3px)';
    }

    const spanSlot = document.getElementById('slot-numero');
    if (spanSlot) spanSlot.innerText = numero;

    atualizarGraficoNaTela();

    try {
        // 👇 AGORA ENVIAMOS O TOKEN DE AUTORIZAÇÃO 👇
        const token = localStorage.getItem('token_monitor');
        const response = await fetch(`http://localhost:3000/obter-slot?slot=${slotAtivo}`, {
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
let requisicaoEmAndamento = false; // 🔒 Nossa trava de segurança

async function verificarStatusAPI() {
    // Se já estiver esperando uma resposta, ignora o novo clique
    if (requisicaoEmAndamento) return; 
    
    const statusEl = document.querySelector('.status');
    const tituloModelo = document.querySelector('.nome-do-modelo');
    const gaugeFill = document.querySelector('.gauge-fill');
    const gaugeCover = document.querySelector('.gauge-cover');

    if(!statusEl || !tituloModelo) return;

    requisicaoEmAndamento = true; // Tranca a porta para novos pedidos

    try {
        const token = localStorage.getItem('token_monitor');
        const response = await fetch(`http://localhost:3000/testar-api?slot=${slotAtivo}`, {
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
        statusEl.innerText = "Servidor Node Offline";
    } finally {
        // Independentemente de dar certo ou erro, destranca a porta no final
        requisicaoEmAndamento = false; 
    }
}

// ==========================================
// 5. VISÃO GLOBAL (MINI-CARDS)
// ==========================================
async function carregarVisaoGlobal() {
    try {
        const response = await fetch('http://localhost:3000/status-geral');
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
                // 👇 AGORA ENVIAMOS O TOKEN DE AUTORIZAÇÃO NA HORA DE SALVAR 👇
                const token = localStorage.getItem('token_monitor');
                const response = await fetch('http://localhost:3000/configurar-slot', {
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
                    document.getElementById('api-key').value = ""; // Limpa a senha da tela por segurança
                    
                    carregarVisaoGlobal();
                    verificarStatusAPI();
                } else {
                    // 👇 ADICIONEI ESTE ALERTA PARA NÃO FALHAR EM SILÊNCIO 👇
                    alert(`❌ Falha ao salvar: ${result.mensagem || "Erro desconhecido."}`);
                }
            } catch (error) {
                alert("❌ Erro ao conectar com o servidor Node.");
            }
        });
    }

    verificarStatusAPI(); 
};

// ==========================================
// 7. EXPORTAR RELATÓRIO PARA CSV
// ==========================================
function baixarRelatorio(event) {
    if (event) event.preventDefault();

    const tabela = document.getElementById('tabela-logs');
    const linhas = tabela.querySelectorAll('tr');
    
    if (linhas.length <= 1) { 
        alert("⚠️ Não há logs registrados para exportar!");
        return;
    }

    let csv = [];
    
    for (let i = 0; i < linhas.length; i++) {
        let linhaArray = [];
        let colunas = linhas[i].querySelectorAll('td, th');
        
        for (let j = 0; j < colunas.length; j++) {
            let texto = colunas[j].innerText.replace(/(\r\n|\n|\r)/gm, "").trim();
            linhaArray.push(`"${texto}"`); 
        }
        csv.push(linhaArray.join(','));
    }

    const csvString = csv.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_api_monitor_${dataHoje}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// 8. CONTROLE DE ATUALIZAÇÃO AUTOMÁTICA
// ==========================================
let intervaloVerificacao;
const TEMPO_ATUALIZACAO = 120000; // 2 minutos para não gastar muitos tokens!

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


// Função para pedir o código
async function solicitarCodigo() {
    const usuario = document.getElementById('rec-usuario').value;
    if (!usuario) return alert("Digite o seu usuário primeiro!");

    const response = await fetch('http://localhost:3000/solicitar-recuperacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario })
    });

    const data = await response.json();
    alert(data.mensagem); // Avisa que mandou pro terminal

    if (data.sucesso) {
        // Esconde o pedido de código e mostra os campos da nova senha
        document.getElementById('passo-pedir-codigo').style.display = 'none';
        document.getElementById('passo-nova-senha').style.display = 'block';
    }
}

// Função para enviar a nova senha com o código
async function salvarNovaSenha() {
    const usuario = document.getElementById('rec-usuario').value;
    const codigo = document.getElementById('rec-codigo').value;
    const novaSenha = document.getElementById('rec-nova-senha').value;

    if (!codigo || !novaSenha) return alert("Preencha o código e a nova senha!");

    const response = await fetch('http://localhost:3000/redefinir-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, codigo, novaSenha })
    });

    const data = await response.json();
    alert(data.mensagem);

    if (data.sucesso) {
        window.location.reload(); // Recarrega a página para ele fazer login com a senha nova
    }
}

iniciarMonitoramentoAutomatico();