// routes/medico.js (CORRIGIDO)
const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/medico/fila-espera
// (Esta função não muda)
router.get('/fila-espera', async (req, res) => {
    try {
        const query = `
            SELECT f.senha, f.classificacao_risco, f.prioridade, 
                   TO_CHAR(f.data_hora_chegada, 'HH24:MI:SS') as hora_chegada,
                   p.nomereg as nome_paciente,
                   a.id as atendimento_id
            FROM fichas_pre_atendimento f
            JOIN atendimentos a ON f.atendimento_id = a.id
            JOIN qhos.paciente p ON a.paciente_prontu = p.prontu
            WHERE f.status = 'aguardando_atendimento_medico'
            ORDER BY
                CASE WHEN f.prioridade <> 'Nenhuma' THEN 1 ELSE 2 END,
                CASE f.classificacao_risco
                    WHEN 'vermelho' THEN 1 WHEN 'amarelo' THEN 2 WHEN 'verde' THEN 3 WHEN 'azul' THEN 4
                END,
                f.data_hora_chegada ASC;
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).send('Erro ao buscar fila de espera.'); }
});

// POST /api/medico/chamar-proximo
// (Esta função não muda)
router.post('/chamar-proximo', async (req, res) => {
    const { profissional_id } = req.body;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        
        const proximo = await client.query(`
            SELECT f.id, f.atendimento_id, f.senha 
            FROM fichas_pre_atendimento f
            WHERE f.status = 'aguardando_atendimento_medico'
            ORDER BY
                CASE WHEN f.prioridade <> 'Nenhuma' THEN 1 ELSE 2 END,
                CASE f.classificacao_risco
                    WHEN 'vermelho' THEN 1 WHEN 'amarelo' THEN 2 WHEN 'verde' THEN 3 WHEN 'azul' THEN 4
                END,
                f.data_hora_chegada ASC
            LIMIT 1 FOR UPDATE;
        `);
        
        if (proximo.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Nenhum paciente na fila de espera." });
        }
        
        const { id: ficha_id, atendimento_id, senha } = proximo.rows[0];
        
        await client.query("UPDATE fichas_pre_atendimento SET status = 'em_atendimento' WHERE id = $1", [ficha_id]);
        await client.query("UPDATE atendimentos SET profissional_atendimento_id = $1, status = 'em_atendimento' WHERE id = $2", [profissional_id, atendimento_id]);
        
        await client.query('COMMIT');
        res.json({ message: "Paciente chamado com sucesso.", senha_chamada: senha, atendimento_id: atendimento_id });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message); res.status(500).send('Erro ao chamar paciente.');
    } finally {
        client.release();
    }
});

// GET /api/medico/atendimento/:id/dados-completos
// (Esta função não muda)
router.get('/atendimento/:id/dados-completos', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT 
                p.nomereg, p.prontu, p.datanasc, p.sexo,
                DATE_PART('year', AGE(p.datanasc)) as idade,
                f.senha, f.classificacao_risco, f.alergias, f.alerta_sepse, f.prioridade,
                sv.pressao_arterial, sv.frequencia_cardiaca, sv.frequencia_respiratoria, 
                sv.temperatura, sv.saturacao_o2, sv.escala_dor
            FROM atendimentos a
            LEFT JOIN qhos.paciente p ON a.paciente_prontu = p.prontu
            LEFT JOIN fichas_pre_atendimento f ON a.id = f.atendimento_id
            LEFT JOIN sinais_vitais_triagem sv ON f.id = sv.ficha_id
            WHERE a.id = $1
        `;
        const result = await db.query(query, [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Atendimento não encontrado." });
        res.json(result.rows[0]);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

// POST /api/medico/atendimento/:id/evolucoes
// (Esta função não muda)
router.post('/atendimento/:id/evolucoes', async (req, res) => {
    const { id: atendimento_id } = req.params;
    const { subjetivo, objetivo, avaliacao, plano, profissional_id } = req.body;
    try {
        const novaEvolucao = await db.query(
            "INSERT INTO evolucoes_pep (atendimento_id, profissional_id, subjetivo, objetivo, avaliacao, plano) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [atendimento_id, profissional_id, subjetivo, objetivo, avaliacao, plano]
        );
        res.status(201).json(novaEvolucao.rows[0]);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

// GET /api/medico/atendimento/:id/evolucoes
// (Esta função não muda)
router.get('/atendimento/:id/evolucoes', async (req, res) => {
    const { id: atendimento_id } = req.params;
    try {
        const evolucoes = await db.query(
            "SELECT *, TO_CHAR(data_evolucao, 'DD/MM/YYYY HH24:MI') as data_formatada FROM evolucoes_pep WHERE atendimento_id = $1 ORDER BY data_evolucao DESC",
            [atendimento_id]
        );
        res.json(evolucoes.rows);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

// POST /api/medico/atendimento/:id/prescrever (CORRIGIDO)
router.post('/atendimento/:id/prescrever', async (req, res) => {
    const { id: atendimento_id } = req.params;
    // item_sal_codigo foi renomeado para item_sal_prescrito para corresponder ao BODY da requisição e ao DB
    const { profissional_id, item_sal_codigo, quantidade, dosagem, via, frequencia, observacoes } = req.body;
    
    // --- MUDANÇA 1 ---
    // Renomeamos a variável que vai para o banco de dados
    const item_sal_prescrito = item_sal_codigo;

    try {
        // Validação de Alergia (já estava correta, verificando 'item_sal_codigo' vindo do front-end)
        const fichaResult = await db.query(
            `SELECT alergias FROM fichas_pre_atendimento WHERE atendimento_id = $1`,
            [atendimento_id]
        );

        if (fichaResult.rows.length > 0 && fichaResult.rows[0].alergias) {
            const alergiasTexto = fichaResult.rows[0].alergias.toUpperCase();
            const alergiasArray = alergiasTexto.split(',').map(s => s.trim()).filter(s => s.length > 0);

            // A variável 'item_sal_codigo' ainda contém o valor vindo do frontend (Ex: DIPIRONA_AMP_1G)
            if (alergiasArray.includes(item_sal_codigo.toUpperCase())) {
                return res.status(400).json({ 
                    message: `ALERTA DE ALERGIA: Paciente alérgico a ${item_sal_codigo}. Prescrição bloqueada.` 
                });
            }
        }
        
        // --- MUDANÇA 2 ---
        // Alterado "item_sal_codigo" para "item_sal_prescrito" no INSERT
        const result = await db.query(
            `INSERT INTO prescricao_itens 
             (atendimento_id, profissional_id, item_sal_prescrito, quantidade_prescrita, dosagem, via_administracao, frequencia, observacoes, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDENTE') RETURNING *`,
            [atendimento_id, profissional_id, item_sal_prescrito, quantidade, dosagem, via, frequencia, observacoes]
        );
        res.status(201).json(result.rows[0]);

    } catch (err) { 
        console.error(err.message); 
        res.status(500).send('Erro no servidor ao salvar prescrição.'); 
    }
});


// GET /api/medico/atendimento/:id/prescricoes (CORRIGIDO)
router.get('/atendimento/:id/prescricoes', async (req, res) => {
    const { id: atendimento_id } = req.params;
    try {
        // --- MUDANÇA 3 ---
        // Alterado "pr.item_sal_codigo" para "pr.item_sal_prescrito" no JOIN
        const prescricoes = await db.query(
            `SELECT pr.*, p.nome_produto 
             FROM prescricao_itens pr
             LEFT JOIN estoque_produtos p ON pr.item_sal_prescrito = p.sal_codigo
             WHERE pr.atendimento_id = $1 ORDER BY pr.data_prescricao DESC`,
            [atendimento_id]
        );
        res.json(prescricoes.rows);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});


// POST /api/medico/atendimento/:id/encaminhar
// (Esta função não muda)
router.post('/atendimento/:id/encaminhar', async (req, res) => {
    const { id: atendimento_id } = req.params;
    const { proximo_fluxo } = req.body;
    
    let novo_status = '';
    switch(proximo_fluxo) {
        case 'medicacao': novo_status = 'aguardando_medicacao'; break;
        case 'reavaliacao': novo_status = 'aguardando_reavaliacao'; break;
        case 'internacao': novo_status = 'aguardando_internacao'; break;
        case 'alta': novo_status = 'finalizado'; break;
        default: return res.status(400).json({ error: "Fluxo de destino inválido." });
    }
    
    try {
        await db.query("UPDATE fichas_pre_atendimento SET status = $1 WHERE atendimento_id = $2", [novo_status, atendimento_id]);
        if (proximo_fluxo === 'alta') {
            await db.query("UPDATE atendimentos SET data_saida = CURRENT_TIMESTAMP, status = 'finalizado' WHERE id = $1", [atendimento_id]);
        } else {
             await db.query("UPDATE atendimentos SET status = $1 WHERE id = $2", [novo_status, atendimento_id]);
        }
        res.json({ message: `Paciente encaminhado para: ${novo_status}` });
    } catch(err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

// GET /api/medico/farmacia/itens
// (Esta função não muda)
router.get('/farmacia/itens', async (req, res) => {
    try {
        const result = await db.query("SELECT sal_codigo, nome_produto FROM estoque_produtos ORDER BY nome_produto");
        res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

module.exports = router;