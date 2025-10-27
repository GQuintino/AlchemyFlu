// routes/recepcao.js (AJUSTADO)
const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/recepcao/chamar-proxima (Não muda)
router.get('/chamar-proxima', async (req, res) => {
    try {
        const proximo = await db.query(`
            SELECT id, senha, classificacao_risco FROM fichas_pre_atendimento
            WHERE status = 'aguardando_recepcao'
            ORDER BY
                CASE WHEN prioridade <> 'Nenhuma' THEN 1 ELSE 2 END,
                CASE classificacao_risco
                    WHEN 'vermelho' THEN 1 WHEN 'amarelo' THEN 2 WHEN 'verde' THEN 3 WHEN 'azul' THEN 4
                END,
                data_hora_chegada ASC
            LIMIT 1;
        `);
        if (proximo.rows.length === 0) {
            return res.status(404).json({ message: "Nenhuma senha aguardando na fila da recepção." });
        }
        res.json(proximo.rows[0]);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

// GET /api/recepcao/fichas/:senha (Não muda)
router.get('/fichas/:senha', async (req, res) => {
    try {
        const { senha } = req.params;
        const result = await db.query(
            "SELECT id, senha, classificacao_risco FROM fichas_pre_atendimento WHERE senha = $1 AND status = 'aguardando_recepcao'",
            [senha.toUpperCase()]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "Senha não encontrada ou não está aguardando na recepção." });
        res.json(result.rows[0]);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

// POST /api/recepcao/buscar-paciente (Não muda, já está funcional)
router.post('/buscar-paciente', async (req, res) => {
    const { nome, cpf, dataNasc } = req.body;
    let query = "SELECT prontu, nomereg, cadsus, cpf, TO_CHAR(datanasc, 'YYYY-MM-DD') as datanasc FROM qhos.paciente WHERE (ativo = 'S' OR ativo IS NULL) AND prontu <> 'TEMP-000000'";
    const params = [];
    if (nome) {
        params.push(`%${nome.toUpperCase()}%`);
        query += ` AND nomereg ILIKE $${params.length}`;
    }
    if (cpf) {
        params.push(cpf.replace(/\D/g, ''));
        query += ` AND cpf = $${params.length}`;
    }
    if (dataNasc) {
        params.push(dataNasc);
        query += ` AND datanasc::date = $${params.length}`;
    }
    if (params.length === 0) {
         return res.status(400).json({ message: 'Forneça ao menos um critério de busca.' });
    }
    try {
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

// POST /api/recepcao/formalizar-atendimento (AJUSTADO)
router.post('/formalizar-atendimento', async (req, res) => {
    // ficha_id pode vir nulo ou vazio
    const { ficha_id, paciente_prontu, tipo_atendimento, setor_destino } = req.body;
    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. Cria o atendimento formal (isto é feito em ambos os fluxos)
        const novoAtendimento = await client.query(
            `INSERT INTO atendimentos (paciente_prontu, tipo_atendimento, setor_destino, status, status_identificacao) 
             VALUES ($1, $2, $3, 'aberto', 'identificado') RETURNING id`,
            [paciente_prontu, tipo_atendimento, setor_destino]
        );
        const atendimentoId = novoAtendimento.rows[0].id;
        
        let senha_final = null;

        if (ficha_id) {
            // --- FLUXO 1: COM SENHA (Veio da Triagem) ---
            // A ficha já existe, apenas vinculamos o atendimento_id e atualizamos o status.
            const fichaAtualizada = await client.query(
                "UPDATE fichas_pre_atendimento SET atendimento_id = $1, status = 'aguardando_atendimento_medico' WHERE id = $2 RETURNING senha",
                [atendimentoId, ficha_id]
            );
            senha_final = fichaAtualizada.rows[0].senha;

        } else {
            // --- FLUXO 2: SEM SENHA (Eletivo / Ambulatório) ---
            // A ficha não existe, então criamos uma ficha "fantasma"
            // para que o paciente possa aparecer na fila do médico.
            
            // Cria uma senha simples baseada no ID (ex: 'E101')
            senha_final = `E${atendimentoId.toString().padStart(4, '0')}`;
            
            await client.query(
                `INSERT INTO fichas_pre_atendimento 
                 (senha, fila_destino, prioridade, status, classificacao_risco, atendimento_id) 
                 VALUES ($1, $2, 'Nenhuma', 'aguardando_atendimento_medico', 'azul', $3)`,
                [senha_final, setor_destino, atendimentoId]
            );
            // Nota: Classificamos como 'azul' (não urgente) por padrão
        }
        
        // 4. Confirma a transação
        await client.query('COMMIT');
        res.status(201).json({ 
            message: "Atendimento formalizado. Paciente aguardando chamada médica.",
            atendimento_id: atendimentoId,
            senha: senha_final
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message); res.status(500).send('Erro no servidor ao formalizar atendimento.');
    } finally {
        client.release();
    }
});

// GET /api/recepcao/setores (Não muda)
router.get('/setores', (req, res) => {
    res.json(['Pronto Socorro Adulto', 'Pronto Socorro Infantil', 'Ambulatório de Ortopedia', 'Ambulatório de Cardiologia', 'Pequena Cirurgia', 'Internação Clínica', 'Internação Cirúrgica']);
});

module.exports = router;