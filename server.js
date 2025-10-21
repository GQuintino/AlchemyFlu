const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// --- Configuração do Servidor ---
// Middleware para "entender" dados de formulários (HTML)
app.use(express.urlencoded({ extended: true }));
// Middleware para "entender" dados JSON (usado pelas nossas APIs)
app.use(express.json());
// Middleware para servir ficheiros estáticos (HTML, CSS) da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));


// --- SIMULAÇÃO DE BANCO DE DADOS (em memória) ---

// (Passo 2) Simulação da tabela qhos.paciente
const pacientesDB = [
    { prontu: 1001, cadsus: '898001000001234', nomereg: 'Maria Silva', sexo: 'F', datanasc: '1980-05-15', cpf: '111.111.111-11', nomemae: 'Ana Silva' },
    { prontu: 1002, cadsus: '898001000005678', nomereg: 'João Costa', sexo: 'M', datanasc: '1992-11-30', cpf: '222.222.222-22', nomemae: 'Joana Costa' },
    { prontu: 1003, cadsus: '898001000009012', nomereg: 'Ana Beatriz', sexo: 'F', datanasc: '2001-02-10', cpf: '333.333.333-33', nomemae: 'Carla Souza' }
];

// (Passo 3) Simulação da fila de atendimento
let filaAtendimento = [];

// (Passo 4) Simulação das prescrições pendentes
let prescricoesPendentes = [];

// Contador para IDs de atendimento
let proximoAtendimentoId = 1;

// (Passo 4) Lógica de Kits de Estoque (convertida de Python para JS)
const MAPA_DE_KITS = {
    "DIPIRONA_EV_1G": [
        { item_sal: 'DIPIRONA_AMP_1G', qtd: 1, un: 'AMP' },
        { item_sal: 'SERINGA_10ML', qtd: 1, un: 'UN' },
        { item_sal: 'AGULHA_40X12', qtd: 1, un: 'UN' },
        { item_sal: 'SF_100ML', qtd: 1, un: 'FR' },
        { item_sal: 'EQUIPO_MACRO', qtd: 1, un: 'UN'}
    ],
    "NEBULIZACAO_BEROTEC_ATROVENT": [
        { item_sal: 'BEROTEC_GTS', qtd: 10, un: 'GTS' },
        { item_sal: 'ATROVENT_GTS', qtd: 20, un: 'GTS' },
        { item_sal: 'SF_5ML', qtd: 1, un: 'FLAC' },
        { item_sal: 'MASCARA_NEBULIZACAO', qtd: 1, un: 'UN'}
    ],
    "PARACETAMOL_GTS_200MG": [
        { item_sal: 'PARACETAMOL_GTS_200MG', qtd: 1, un: 'FR'}
    ]
};

// --- LÓGICA DE TRIAGEM (Passo 1) ---

function verificar_alerta_emergencia(sinais_vitais, sintomas) {
    if ((sinais_vitais.temperatura > 38.0 || sinais_vitais.temperatura < 36.0) &&
       (sinais_vitais.freq_cardiaca > 100) &&
       (sinais_vitais.pressao_sistolica < 100)) {
        return { tipo: 'SEPSE', mensagem: 'Alerta de SEPSE!' };
    }
    if ((sintomas.includes('dor no peito') || sintomas.includes('dor toracica')) &&
       (sinais_vitais.pressao_sistolica > 160 || sinais_vitais.pressao_sistolica < 90)) {
        return { tipo: 'INFARTO', mensagem: 'Alerta de INFARTO!' };
    }
    return null;
}

function realizar_triagem(sinais_vitais, sintomas, nome_paciente, escala_dor) {
    const alerta = verificar_alerta_emergencia(sinais_vitais, sintomas);
    
    if (alerta) {
        // (Passo 1.1) Enviar direto ao médico
        const atendimentoEmergencia = {
            id: proximoAtendimentoId++,
            paciente: { nomereg: nome_paciente, prontu: null }, // Prontuário desconhecido por enquanto
            classificacao: 'EMERGENCIA',
            horario_chegada: new Date(),
            alerta: alerta.tipo,
            sinaisVitais: sinais_vitais // Leva os sinais para o médico
        };
        filaAtendimento.push(atendimentoEmergencia);
        
        return { status: 'DIRETO_MEDICO', classificacao: 'EMERGENCIA', nome: nome_paciente };
    }

    // Triagem normal
    let classificacao = 'AZUL'; // Padrão
    if (escala_dor >= 7 || sintomas.includes('dor intensa')) {
        classificacao = 'AMARELO';
    } else if (escala_dor > 0 || sintomas.includes('dor leve')) {
        classificacao = 'VERDE';
    }
        
    return { status: 'AGUARDANDO_FICHA', classificacao: classificacao, nome: nome_paciente };
}


// --- ROTAS DO SERVIDOR (O FLUXO) ---

/**
 * ROTA 0: Página Inicial
 * Serve o HTML da Triagem (index.html)
 */
app.get('/', (req, res) => {
    // __dirname é a pasta atual onde o server.js está
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * ROTA 1: Processar Triagem (Passo 1)
 * Recebe dados do formulário de triagem (index.html)
 */
app.post('/triagem', (req, res) => {
    // 1. Coletar dados do formulário (req.body)
    const { nome_paciente, sintomas, temperatura, freq_cardiaca, pressao_sistolica, escala_dor } = req.body;
    
    const sinais_vitais = {
        temperatura: parseFloat(temperatura) || 36.5,
        freq_cardiaca: parseInt(freq_cardiaca) || 80,
        pressao_sistolica: parseInt(pressao_sistolica) || 120
    };
    const sintomas_array = sintomas.toLowerCase().split(','); // Ex: "dor, febre"
    const dor = parseInt(escala_dor) || 0;

    // 2. Executar a lógica de triagem
    const resultado = realizar_triagem(sinais_vitais, sintomas_array, nome_paciente, dor);

    // 3. Redirecionar o paciente
    if (resultado.status === 'DIRETO_MEDICO') {
        // (Passo 1.1) Paciente crítico vai direto para a fila
        // Adicionamos um 'query param' para o médico saber do alerta
        res.redirect(`/fila-medica?alerta=${resultado.tipo}&nome=${resultado.nome}`);
    } else {
        // Paciente normal vai abrir a ficha
        // Passamos os dados da triagem para a próxima página via 'query params'
        res.redirect(`/abertura-ficha?nome=${resultado.nome}&classificacao=${resultado.classificacao}`);
    }
});

/**
 * ROTA 2: Página de Abertura de Ficha (Passo 2)
 * Serve o HTML 'abertura-ficha.html'
 */
app.get('/abertura-ficha', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'abertura-ficha.html'));
});

/**
 * ROTA 2.1: API para Buscar Paciente (Passo 2.1)
 * Esta rota é chamada pelo JavaScript da página 'abertura-ficha.html'
 */
app.post('/api/buscar-paciente', (req, res) => {
    const { cpf, nome, datanasc } = req.body;
    
    // Simula o SELECT * FROM qhos.paciente WHERE...
    const resultados = pacientesDB.filter(paciente => {
        if (cpf && paciente.cpf === cpf) return true;
        if (nome && paciente.nomereg.toLowerCase().includes(nome.toLowerCase())) return true;
        if (datanasc && paciente.datanasc === datanasc) return true;
        return false;
    });

    // Devolve os resultados como JSON
    res.json(resultados);
});

/**
 * ROTA 2.2: Abrir Atendimento
 * Confirma o paciente e o coloca na fila médica
 */
app.post('/abrir-atendimento', (req, res) => {
    const { prontu, classificacao } = req.body;

    const paciente = pacientesDB.find(p => p.prontu == prontu);
    if (!paciente) {
        return res.status(404).json({ message: 'Paciente não encontrado' });
    }

    const novoAtendimento = {
        id: proximoAtendimentoId++,
        paciente: paciente,
        classificacao: classificacao,
        horario_chegada: new Date(),
        alerta: null,
        sinaisVitais: {} // Sinais da triagem seriam anexados aqui
    };

    filaAtendimento.push(novoAtendimento);
    
    // Confirma que deu certo e o JavaScript irá redirecionar
    res.json({ success: true, message: 'Paciente na fila médica!' });
});


/**
 * ROTA 3: Fila Médica (Passo 3)
 * Serve o HTML 'fila-medica.html'
 */
app.get('/fila-medica', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'fila-medica.html'));
});

/**
 * ROTA 3.1: API para Listar Fila Médica (Passo 3.1)
 * Chamada pelo JavaScript da 'fila-medica.html'
 */
app.get('/api/fila-medica', (req, res) => {
    // Mapeia o texto da classificação para um número de prioridade
    const prioridade = { 'EMERGENCIA': 1, 'AMARELO': 2, 'VERDE': 3, 'AZUL': 4 };

    // Simula o ORDER BY FIELD(...) E horario_chegada ASC
    const filaOrdenada = filaAtendimento.sort((a, b) => {
        const prioridadeA = prioridade[a.classificacao] || 99;
        const prioridadeB = prioridade[b.classificacao] || 99;
        
        if (prioridadeA !== prioridadeB) {
            return prioridadeA - prioridadeB; // Ordena pela prioridade
        }
        // Se prioridade igual, ordena pelo mais antigo
        return new Date(a.horario_chegada) - new Date(b.horario_chegada);
    });

    res.json(filaOrdenada);
});

/**
 * ROTA 3.2: Tela de Atendimento (SOAP) (Passo 3.2)
 * Serve o HTML 'atendimento-medico.html'
 */
app.get('/atendimento/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'atendimento-medico.html'));
});

/**
 * ROTA 3.3: API para buscar dados do Atendimento
 * Chamada pelo JS da tela 'atendimento-medico.html' para preencher o cabeçalho
 */
app.get('/api/atendimento/:id', (req, res) => {
    const { id } = req.params;
    const atendimento = filaAtendimento.find(a => a.id == id);

    if (atendimento) {
        // Simula um score MEWS
        atendimento.mews_score = (atendimento.classificacao === 'AMARELO') ? 3 : 1;
        res.json(atendimento);
    } else {
        res.status(404).json({ message: 'Atendimento não encontrado' });
    }
});

/**
 * ROTA 4: Salvar Atendimento e Prescrição (Passo 4)
 * Recebe o formulário SOAP
 */
app.post('/salvar-atendimento/:id', (req, res) => {
    const { id } = req.params;
    const { soap_s, soap_o, soap_a, soap_p, sal_prescrito, qtd_prescrita } = req.body;

    // 1. Remove paciente da fila de atendimento
    const indexFila = filaAtendimento.findIndex(a => a.id == id);
    let atendimentoConcluido = null;
    if (indexFila !== -1) {
        atendimentoConcluido = filaAtendimento.splice(indexFila, 1)[0];
    } else {
        return res.redirect('/fila-medica?msg=erro_atendimento');
    }

    // 2. Processar Prescrição (Lógica de Kit - Passo 4)
    if (sal_prescrito && qtd_prescrita) {
        const qtd = parseInt(qtd_prescrita) || 1;
        
        let materiais_necessarios = [];
        
        if (MAPA_DE_KITS[sal_prescrito]) {
            // É um kit, expandir materiais
            materiais_necessarios = MAPA_DE_KITS[sal_prescrito].map(item => ({
                ...item,
                qtd_total: item.qtd * qtd
            }));
        } else {
            // É um item simples
            materiais_necessarios.push({ item_sal: sal_prescrito, qtd_total: qtd, un: 'UN' });
        }

        // 3. Adicionar à fila da farmácia
        prescricoesPendentes.push({
            id: proximoAtendimentoId++, // Reusa o contador para ID da prescrição
            atendimento_id: id,
            paciente_nome: atendimentoConcluido.paciente.nomereg,
            item_prescrito: sal_prescrito,
            qtd_prescrita: qtd,
            materiais_para_baixa: materiais_necessarios
        });
    }
    
    // 4. (Opcional) Salvar dados do SOAP (aqui apenas simulamos)
    console.log(`Atendimento ${id} salvo. Paciente: ${atendimentoConcluido.paciente.nomereg}`);
    console.log(`Prescrição: ${sal_prescrito} (Qtd: ${qtd_prescrita})`);

    // 5. Redirecionar médico de volta para a fila
    res.redirect('/fila-medica?msg=atendimento_concluido');
});

/**
 * ROTA 5: Tela da Farmácia
 * Serve o HTML 'farmacia.html'
 */
app.get('/farmacia', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'farmacia.html'));
});

/**
 * ROTA 5.1: API para Listar Prescrições Pendentes
 * Chamada pelo JS da 'farmacia.html'
 */
app.get('/api/farmacia/pendentes', (req, res) => {
    // Simplesmente retorna a lista de prescrições pendentes
    res.json(prescricoesPendentes);
});

/**
 * ROTA 5.2: API para Dispensar Item
 * Chamada pelo JS da 'farmacia.html'
 */
app.post('/api/farmacia/dispensar/:id', (req, res) => {
    const { id } = req.params;
    const index = prescricoesPendentes.findIndex(p => p.id == id);

    if (index !== -1) {
        const dispensado = prescricoesPendentes.splice(index, 1);
        console.log('Dispensado:', dispensado[0].item_prescrito);
        res.json({ success: true });
    } else {
        res.status(404).json({ message: 'Prescrição não encontrada' });
    }
});


// --- Iniciar o Servidor ---
app.listen(PORT, () => {
    console.log(`Servidor "Parceiro de Programação" rodando em http://localhost:${PORT}`);
    console.log('Acesse http://localhost:3000 para iniciar a triagem.');
    console.log('Acesse http://localhost:3000/farmacia para ver a dispensação.');
});