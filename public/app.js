// --- ESTADO GLOBAL ---
// Usamos 'let' para que possam ser definidos em qualquer página
let ATENDIMENTO_ID_ATUAL = null;
// Mockado para simular médico logado (ID 1)
const PROFISSIONAL_ID_ATUAL = 1; 

// --- ROTEADOR SIMPLES ---
// Verifica qual página está ativa e inicia o módulo JS correspondente
document.addEventListener('DOMContentLoaded', () => {
    // Totem
    if (document.querySelector('.totem-container')) {
        initTotem();
    }
    // Triagem
    if (document.getElementById('cardBuscaSenhaTriagem')) {
        initTriagem();
    }
    // Recepção
    if (document.getElementById('formBuscaSenha')) {
        initRecepcao();
    }
    // Médico (Hub + PEP)
    if (document.querySelector('.pepps-container')) {
        initMedico();
    }
    // Farmácia
    if (document.getElementById('fila-farmacia')) {
        initFarmacia();
    }
});


// --- MÓDULO TOTEM ---
let filaDestino = '';

function initTotem() {
    // Os botões no HTML já têm onclick, então só precisamos das funções
}

function selecionarFila(fila) {
    filaDestino = fila;
    document.getElementById('fila-section').classList.add('hidden');
    document.getElementById('prioridade-section').classList.remove('hidden');
}

async function gerarSenhaTotem() {
    const prioridade = document.getElementById('tipoPrioridade').value;
    const feedback = document.getElementById('feedbackTotem');
    feedback.textContent = 'Gerando senha...';
    try {
        const response = await fetch('/api/totem/gerar-senha', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fila_destino: filaDestino, prioridade: prioridade })
        });
        if (!response.ok) throw new Error('Falha na comunicação com o servidor.');
        const data = await response.json();
        feedback.innerHTML = `<h2>Senha gerada:</h2><p class="totem-senha-display">${data.senha}</p><p>Aguarde ser chamado.</p><br/><button onclick="window.location.reload()">Novo Atendimento</button>`;
        document.getElementById('prioridade-section').classList.add('hidden');
    } catch (error) {
        feedback.innerHTML = `<p class="text-danger">${error.message}</p>`;
    }
}


// --- MÓDULO TRIAGEM ---
function initTriagem() {
    // Adiciona os 'listeners' que o teu HTML espera
    document.querySelector('button[onclick="chamarProximaTriagem()"]').addEventListener('click', chamarProximaTriagem);
    document.querySelector('button[onclick="buscarParaTriagem()"]').addEventListener('click', buscarParaTriagem);
    document.getElementById('formTriagem').addEventListener('submit', salvarTriagem);
    
    // Listener para sugestão de classificação
    document.querySelectorAll('.vital-input').forEach(input => {
        input.addEventListener('input', sugerirClassificacao);
    });
}

function sugerirClassificacao() {
    const fc = parseInt(document.getElementById('frequencia_cardiaca').value) || 0;
    const fr = parseInt(document.getElementById('frequencia_respiratoria').value) || 0;
    const sat = parseInt(document.getElementById('saturacao_o2').value) || 100;
    const dor = parseInt(document.getElementById('escala_dor').value) || 0;
    const temp = parseFloat(document.getElementById('temperatura').value) || 36.5;

    const sugerida = document.getElementById('classificacaoSugerida');
    const selectManual = document.getElementById('classificacaoManual');
    
    if (fc > 140 || fr > 35 || sat < 90 || dor >= 8) {
        sugerida.textContent = 'VERMELHO';
        sugerida.className = 'risk-vermelho';
        selectManual.value = 'vermelho';
    } else if (fc > 120 || fr > 28 || sat < 95 || dor >= 6 || temp > 38.5) {
        sugerida.textContent = 'AMARELO';
        sugerida.className = 'risk-amarelo';
        selectManual.value = 'amarelo';
    } else if (dor > 0 || temp > 37.5) {
        sugerida.textContent = 'VERDE';
        sugerida.className = 'risk-verde';
        selectManual.value = 'verde';
    } else {
        sugerida.textContent = 'AZUL';
        sugerida.className = 'risk-azul';
        selectManual.value = 'azul';
    }
}

async function chamarProximaTriagem() {
    const feedback = document.getElementById('feedbackBuscaTriagem');
    feedback.textContent = 'Buscando próxima senha...';
    try {
        const response = await fetch('/api/triagem/chamar-proxima');
        if (!response.ok) { const err = await response.json(); throw new Error(err.message); }
        const ficha = await response.json();
        document.getElementById('senhaParaTriar').value = ficha.senha;
        buscarParaTriagem(); 
    } catch (error) { feedback.textContent = error.message; }
}

async function buscarParaTriagem() {
    const senha = document.getElementById('senhaParaTriar').value;
    const feedback = document.getElementById('feedbackBuscaTriagem');
    if (!senha) return;
    try {
        const response = await fetch(`/api/triagem/fichas/${senha}`);
        if (!response.ok) throw new Error('Senha não encontrada ou já triada.');
        const ficha = await response.json();
        
        feedback.textContent = '';
        document.getElementById('senhaTriagemDisplay').textContent = ficha.senha;
        document.getElementById('fichaIdTriagem').value = ficha.id;
        document.getElementById('cardBuscaSenhaTriagem').classList.add('hidden');
        document.getElementById('areaTriagem').classList.remove('hidden');
    } catch (error) {
        feedback.textContent = error.message;
    }
}

// --- FUNÇÃO MODIFICADA (Gatilho Impressão Triagem) ---
async function salvarTriagem(event) {
    event.preventDefault();
    const ficha_id = document.getElementById('fichaIdTriagem').value;
    const feedback = document.getElementById('feedbackTriagem');
    
    const dados = {
        classificacao_risco: document.getElementById('classificacaoManual').value,
        queixa_principal: document.getElementById('queixa_principal').value,
        historico_breve: document.getElementById('historico_breve').value,
        alergias: document.getElementById('alergias').value,
        sinais_vitais: {
            pressao_arterial: document.getElementById('pressao_arterial').value || null,
            frequencia_cardiaca: parseInt(document.getElementById('frequencia_cardiaca').value) || null,
            frequencia_respiratoria: parseInt(document.getElementById('frequencia_respiratoria').value) || null,
            temperatura: parseFloat(document.getElementById('temperatura').value) || null,
            saturacao_o2: parseInt(document.getElementById('saturacao_o2').value) || null,
            glicemia_capilar: parseInt(document.getElementById('glicemia_capilar').value) || null,
            escala_dor: parseInt(document.getElementById('escala_dor').value) || null,
        }
    };

    try {
        const response = await fetch(`/api/triagem/salvar/${ficha_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        if (!response.ok) throw new Error('Falha ao salvar triagem.');
        const result = await response.json();
        
        // --- MUDANÇA AQUI: GATILHO DA IMPRESSÃO ---
        window.open(`/impresso_triagem.html?id=${ficha_id}`, '_blank', 'width=800,height=600');
        // --- FIM DA MUDANÇA ---
        
        feedback.innerHTML = `<p style="color:green">Triagem salva! Próximo passo: ${result.proximo_passo.replace(/_/g, ' ')}.</p><br/><button onclick="window.location.reload()">Nova Triagem</button>`;
        document.getElementById('formTriagem').classList.add('hidden');
    } catch(error) {
        feedback.textContent = error.message;
    }
}


// --- MÓDULO RECEPÇÃO ---
function initRecepcao() {
    document.querySelector('button[onclick="chamarProximaRecepcao()"]').addEventListener('click', chamarProximaRecepcao);
    document.getElementById('formBuscaSenha').addEventListener('submit', buscarParaRecepcao);
    document.getElementById('formBuscaPaciente').addEventListener('submit', buscarPacienteRecepcao);
    document.getElementById('formAbertura').addEventListener('submit', formalizarAtendimento);
    document.querySelector('button[onclick="iniciarAtendimentoSemSenha()"]').addEventListener('click', iniciarAtendimentoSemSenha);
    
    carregarDropdownsRecepcao();
}

async function chamarProximaRecepcao() {
    const feedback = document.getElementById('feedbackBuscaSenha');
    feedback.textContent = 'Buscando próxima senha...';
    try {
        const response = await fetch('/api/recepcao/chamar-proxima');
        if (!response.ok) { const err = await response.json(); throw new Error(err.message); }
        const ficha = await response.json();
        feedback.textContent = '';
        exibirFichaParaFormalizar(ficha);
    } catch(error) { feedback.textContent = error.message; }
}

async function buscarParaRecepcao(event) {
    event.preventDefault();
    const senha = document.getElementById('buscaSenha').value;
    const feedback = document.getElementById('feedbackBuscaSenha');
    try {
        const response = await fetch(`/api/recepcao/fichas/${senha}`);
        if (!response.ok) throw new Error('Senha não encontrada ou não aguarda na recepção.');
        const ficha = await response.json();
        feedback.textContent = '';
        exibirFichaParaFormalizar(ficha);
    } catch(error) { feedback.textContent = error.message; }
}

function exibirFichaParaFormalizar(ficha) {
    document.getElementById('fichaId').value = ficha.id;
    document.getElementById('senhaDoPaciente').textContent = ficha.senha;
    document.getElementById('riscoDoPaciente').textContent = ficha.classificacao_risco;
    document.getElementById('areaFormalizacao').classList.remove('hidden');
    document.getElementById('cardBuscaSenha').classList.add('hidden');
    document.getElementById('tipoAtendimento').value = 'Pronto Atendimento';
}

function iniciarAtendimentoSemSenha() {
    document.getElementById('fichaId').value = '';
    document.getElementById('senhaDoPaciente').textContent = 'N/A (Atendimento Eletivo)';
    document.getElementById('riscoDoPaciente').textContent = 'N/A';
    document.getElementById('areaFormalizacao').classList.remove('hidden');
    document.getElementById('cardBuscaSenha').classList.add('hidden');
    document.getElementById('tipoAtendimento').value = 'Ambulatório';
}

async function buscarPacienteRecepcao(event) {
    event.preventDefault();
    const feedback = document.getElementById('resultadoBuscaPaciente');
    const dadosBusca = {
        nome: document.getElementById('buscaNome').value,
        cpf: document.getElementById('buscaCpf').value,
        dataNasc: document.getElementById('buscaDataNasc').value
    };
    try {
        const response = await fetch('/api/recepcao/buscar-paciente', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosBusca)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.message); }
        const pacientes = await response.json();
        
        const tbody = document.querySelector('#tabelaResultadosRecepcao tbody');
        tbody.innerHTML = '';
        if (pacientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">Nenhum paciente encontrado.</td></tr>';
        } else {
            pacientes.forEach(p => {
                tbody.innerHTML += `<tr>
                    <td>${p.prontu}</td>
                    <td>${p.nomereg}</td>
                    <td><button class="btn-small" onclick="selecionarPacienteRecepcao('${p.prontu}', '${p.nomereg.replace(/'/g, "\\'")}')">Selecionar</button></td>
                </tr>`;
            });
        }
        document.getElementById('tabelaResultadosRecepcao').classList.remove('hidden');
    } catch(error) { feedback.textContent = error.message; }
}

function selecionarPacienteRecepcao(prontu, nome) {
    document.getElementById('pacienteProntu').value = prontu;
    document.getElementById('nomePacienteAdmissao').textContent = `Paciente Selecionado: ${nome}`;
    document.getElementById('cardAbertura').classList.remove('hidden');
}

async function carregarDropdownsRecepcao() {
    const setores = await fetch('/api/recepcao/setores').then(res => res.json());
    const setorSelect = document.getElementById('setorDestino');
    
    if (!document.querySelector('#tipoAtendimento option[value="Ambulatório"]')) {
        document.getElementById('tipoAtendimento').innerHTML += '<option value="Ambulatório">Ambulatório (Eletivo)</option>';
    }
    setores.forEach(s => setorSelect.innerHTML += `<option value="${s}">${s}</option>`);
    setorSelect.value = 'Pronto Socorro Adulto';
}

// --- FUNÇÃO MODIFICADA (Gatilho Impressão FAA) ---
async function formalizarAtendimento(event) {
    event.preventDefault();
    const feedback = document.getElementById('feedbackAbertura');
    const dados = {
        ficha_id: document.getElementById('fichaId').value, 
        paciente_prontu: document.getElementById('pacienteProntu').value,
        tipo_atendimento: document.getElementById('tipoAtendimento').value,
        setor_destino: document.getElementById('setorDestino').value
    };
    try {
        const response = await fetch('/api/recepcao/formalizar-atendimento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        if (!response.ok) throw new Error('Erro ao formalizar.');
        
        const result = await response.json(); // Pega o resultado com o ID

        // --- MUDANÇA AQUI: GATILHO DA IMPRESSÃO ---
        window.open(`/impresso_faa.html?id=${result.atendimento_id}`, '_blank', 'width=800,height=600');
        // --- FIM DA MUDANÇA ---

        feedback.innerHTML = `<p style="color:green">Atendimento formalizado! Paciente na fila médica.</p><br/><button onclick="window.location.reload()">Nova Recepção</button>`;
        document.getElementById('areaFormalizacao').classList.add('hidden');
    } catch(error) {
        feedback.textContent = error.message;
    }
}


// --- MÓDULO MÉDICO (HUB + PEP) ---
function initMedico() {
    // Elementos do Ecrã
    window.pepHeader = document.getElementById('pepHeader');
    window.pepContent = document.getElementById('pep-content');
    window.placeholder = document.getElementById('atendimento-placeholder');
    
    // Funções da Fila (Hub)
    document.getElementById('btnChamarProximoMedico').addEventListener('click', chamarProximoMedico);
    
    // Funções do Prontuário (PEP)
    document.getElementById('formSOAP').addEventListener('submit', salvarEvolucao);
    document.getElementById('formPrescricao').addEventListener('submit', adicionarPrescricao);
    
    // Carregamento inicial
    atualizarFilaDeEspera();
    setInterval(atualizarFilaDeEspera, 20000); // Atualiza fila
    
    // Verifica se a URL tem um ID
    const urlParams = new URLSearchParams(window.location.search);
    const atendimentoIdUrl = urlParams.get('atendimento_id');
    if (atendimentoIdUrl) {
        carregarAtendimento(atendimentoIdUrl);
    }
}

async function atualizarFilaDeEspera() {
    const response = await fetch('/api/medico/fila-espera');
    const fila = await response.json();
    const tbody = document.querySelector('#tabelaFilaEspera tbody');
    tbody.innerHTML = '';
    fila.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = `risk-${p.classificacao_risco}`;
        tr.innerHTML = `
            <td><strong>${p.senha}</strong></td>
            <td>${p.classificacao_risco}</td>
            <td>${p.nome_paciente || (p.classificacao_risco === 'vermelho' ? 'EMERGÊNCIA' : '...')}</td>
            <td>${p.hora_chegada}</td>
        `;
        if (p.atendimento_id) {
            tr.onclick = () => carregarAtendimento(p.atendimento_id, p.senha);
        }
        tbody.appendChild(tr);
    });
}

async function chamarProximoMedico() {
    try {
        const response = await fetch('/api/medico/chamar-proximo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profissional_id: PROFISSIONAL_ID_ATUAL })
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.message); }
        const result = await response.json();
        
        document.getElementById('senhaEmAtendimento').textContent = result.senha_chamada;
        atualizarFilaDeEspera(); 
        carregarAtendimento(result.atendimento_id, result.senha_chamada);
        
    } catch(error) { alert(error.message); }
}

async function carregarAtendimento(atendimentoId, senha = '--') {
    ATENDIMENTO_ID_ATUAL = atendimentoId;
    
    // 1. Mostra o PEP
    window.pepHeader.classList.remove('hidden');
    window.pepContent.classList.remove('hidden');
    window.placeholder.classList.add('hidden');
    document.getElementById('senhaEmAtendimento').textContent = senha;

    // 2. Carrega o Cabeçalho
    const response = await fetch(`/api/medico/atendimento/${atendimentoId}/dados-completos`);
    const dados = await response.json();
    
    document.getElementById('headerNome').textContent = dados.nomereg;
    document.getElementById('headerProntuario').textContent = dados.prontu;
    document.getElementById('headerIdade').textContent = dados.idade;
    document.getElementById('headerAlergias').textContent = dados.alergias || 'Nenhuma';
    if(dados.alergias) document.getElementById('headerAlergias').style.color = '#d9534f';
    
    document.getElementById('headerSinaisVitais').textContent = `PA: ${dados.pressao_arterial}, FC: ${dados.frequencia_cardiaca}, T: ${dados.temperatura}°C, Dor: ${dados.escala_dor}`;
    
    const headerAlertas = document.getElementById('headerAlertas');
    if (dados.alerta_sepse) {
        headerAlertas.textContent = "ALERTA DE SEPSE";
        headerAlertas.style.backgroundColor = '#6f42c1';
        headerAlertas.classList.remove('hidden');
    } else if (dados.prioridade === 'Dor Toracica') {
        headerAlertas.textContent = "PROTOCOLO DOR TORÁCICA";
        headerAlertas.style.backgroundColor = '#f0ad4e';
        headerAlertas.classList.remove('hidden');
    } else {
        headerAlertas.classList.add('hidden');
    }
    window.pepHeader.className = `pep-header-flutuante risk-${dados.classificacao_risco}`;

    // 3. Carrega Evoluções, Prescrições e Itens
    carregarEvolucoes(atendimentoId);
    carregarPrescricoes(atendimentoId);
    carregarItensPrescricao();
    
    // 4. Limpa formulários
    document.getElementById('formSOAP').reset();
    document.getElementById('formPrescricao').reset();
    document.getElementById('feedbackEncaminhamento').textContent = '';
    document.querySelectorAll('.encaminhamento-buttons button').forEach(btn => btn.disabled = false);
}

async function carregarEvolucoes(atendimentoId) {
    const response = await fetch(`/api/medico/atendimento/${atendimentoId}/evolucoes`);
    const evolucoes = await response.json();
    const container = document.getElementById('linhaDoTempo');
    container.innerHTML = evolucoes.length ? '' : '<p>Nenhuma evolução registrada.</p>';
    evolucoes.forEach(ev => {
        container.innerHTML += `<div class="card"><strong>${ev.data_formatada} (Prof: ${ev.profissional_id})</strong>
            <p><strong>S:</strong> ${ev.subjetivo||''}</p><p><strong>O:</strong> ${ev.objetivo||''}</p>
            <p><strong>A:</strong> ${ev.avaliacao}</p><p><strong>P:</strong> ${ev.plano}</p></div>`;
    });
}

async function salvarEvolucao(event) {
    event.preventDefault();
    if (!ATENDIMENTO_ID_ATUAL) return;
    
    const dados = {
        subjetivo: document.getElementById('subjetivo').value,
        objetivo: document.getElementById('objetivo').value,
        avaliacao: document.getElementById('avaliacao').value,
        plano: document.getElementById('plano').value,
        profissional_id: PROFISSIONAL_ID_ATUAL,
    };
    
    await fetch(`/api/medico/atendimento/${ATENDIMENTO_ID_ATUAL}/evolucoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });
    
    document.getElementById('formSOAP').reset();
    carregarEvolucoes(ATENDIMENTO_ID_ATUAL); // Recarrega
}

async function carregarItensPrescricao() {
    const itens = await fetch('/api/medico/farmacia/itens').then(res => res.json());
    const select = document.getElementById('prescricaoItem');
    select.innerHTML = '<option value="">Selecione um item...</option>';
    itens.forEach(item => select.innerHTML += `<option value="${item.sal_codigo}">${item.nome_produto}</option>`);
}

async function adicionarPrescricao(event) {
    event.preventDefault();
    if (!ATENDIMENTO_ID_ATUAL) return;
    
    const dados = {
        profissional_id: PROFISSIONAL_ID_ATUAL,
        item_sal_codigo: document.getElementById('prescricaoItem').value,
        quantidade: document.getElementById('prescricaoQtd').value,
        dosagem: document.getElementById('prescricaoDosagem').value,
        via: document.getElementById('prescricaoVia').value,
        frequencia: document.getElementById('prescricaoFrequencia').value,
        observacoes: document.getElementById('prescricaoObs').value,
    };
    
    try {
        const response = await fetch(`/api/medico/atendimento/${ATENDIMENTO_ID_ATUAL}/prescrever`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!response.ok) {
            const erro = await response.json(); 
            throw new Error(erro.message); 
        }

        document.getElementById('formPrescricao').reset();
        carregarPrescricoes(ATENDIMENTO_ID_ATUAL);
        
    } catch (error) {
        alert(`Erro ao prescrever: ${error.message}`);
    }
}

async function carregarPrescricoes(atendimentoId) {
    const response = await fetch(`/api/medico/atendimento/${atendimentoId}/prescricoes`);
    const prescricoes = await response.json();
    const container = document.getElementById('listaPrescricao');
    container.innerHTML = '';
    prescricoes.forEach(p => {
        container.innerHTML += `<li>
            <strong>${p.nome_produto}</strong> (${p.status})
            <small> - ${p.dosagem || ''} ${p.via_administracao || ''} ${p.frequencia || ''}</small>
        </li>`;
    });
}

// --- FUNÇÃO NOVA (Gatilho Impressão PEP) ---
async function imprimirPEP() {
    if (!ATENDIMENTO_ID_ATUAL) {
        alert("Nenhum atendimento ativo selecionado.");
        return;
    }
    // Usa a rota existente de dados completos e evoluções
    window.open(`/impresso_pep.html?id=${ATENDIMENTO_ID_ATUAL}`, '_blank', 'width=800,height=600');
}
// --- FIM DA FUNÇÃO NOVA ---

async function encaminhar(proximo_fluxo) {
    if (!ATENDIMENTO_ID_ATUAL) return;
    const feedback = document.getElementById('feedbackEncaminhamento');
    
    try {
        const response = await fetch(`/api/medico/atendimento/${ATENDIMENTO_ID_ATUAL}/encaminhar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proximo_fluxo: proximo_fluxo })
        });
        if (!response.ok) throw new Error('Falha ao encaminhar paciente.');
        const result = await response.json();
        
        feedback.innerHTML = `<p style="color:green">${result.message}</p>`;
        document.querySelectorAll('.encaminhamento-buttons button').forEach(btn => btn.disabled = true);
        
        if(proximo_fluxo === 'alta') {
            setTimeout(() => {
                ATENDIMENTO_ID_ATUAL = null;
                window.pepHeader.classList.add('hidden');
                window.pepContent.classList.add('hidden');
                window.placeholder.classList.remove('hidden');
                document.getElementById('senhaEmAtendimento').textContent = '--';
                atualizarFilaDeEspera();
            }, 2000);
        }
    } catch(error) { feedback.textContent = error.message; }
}


// --- MÓDULO FARMÁCIA (SUPPLY) ---
function initFarmacia() {
    carregarFilaFarmacia();
    setInterval(carregarFilaFarmacia, 15000);
}

async function carregarFilaFarmacia() {
    const response = await fetch('/api/farmacia/pendentes');
    const prescricoes = await response.json();
    const container = document.getElementById('fila-farmacia');
    container.innerHTML = ''; 

    if (prescricoes.length === 0) {
        container.innerHTML = '<p>Nenhuma prescrição pendente.</p>';
        return;
    }

    prescricoes.forEach(pr => {
        const item = document.createElement('div');
        item.className = 'card'; 

        let materiaisHtml = '<ul>';
        pr.materiais_para_baixa.forEach(mat => {
            materiaisHtml += `<li>${mat.item_sal} (Qtd: ${mat.qtd_total})</li>`;
        });
        materiaisHtml += '</ul>';

        item.innerHTML = `
            <h3>${pr.paciente_nome} (Prescrição ID: ${pr.id})</h3>
            <p><strong>Item: ${pr.nome_produto} (${pr.quantidade_prescrita}x)</strong></p>
            <p><small>${pr.dosagem || ''} ${pr.via_administracao || ''} ${pr.frequencia || ''}</small></p>
            <p><strong>Materiais para baixa (Kit Automático):</strong></p>
            ${materiaisHtml}
            <button class="btn-small" onclick="dispensar(${pr.id})">Dispensar e Dar Baixa</button>
        `;
        container.appendChild(item);
    });
}

async function dispensar(id) {
    try {
        const response = await fetch(`/api/farmacia/dispensar/${id}`, { method: 'POST' });
        const resultado = await response.json();
        
        if (resultado.success) {
            alert('Item dispensado com sucesso!');
            carregarFilaFarmacia(); // Recarrega a lista
        } else {
            throw new Error(resultado.message);
        }
    } catch (err) {
        alert('Erro ao dispensar: ' + err.message);
    }
}
