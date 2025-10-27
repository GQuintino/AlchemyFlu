// routes/triagem.js (AJUSTADO)
const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/triagem/chamar-proxima
// (Esta função não muda)
router.get('/chamar-proxima', async (req, res) => {
    try {
        const proximo = await db.query(`
            SELECT id, senha FROM fichas_pre_atendimento
            WHERE status = 'aguardando_triagem'
            ORDER BY
                CASE WHEN prioridade <> 'Nenhuma' THEN 1 ELSE 2 END,
                data_hora_chegada ASC
            LIMIT 1;
        `);
        if (proximo.rows.length === 0) {
            return res.status(404).json({ message: "Nenhuma senha aguardando na fila da triagem." });
        }
        res.json(proximo.rows[0]);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

// GET /api/triagem/fichas/:senha
// (Esta função não muda)
router.get('/fichas/:senha', async (req, res) => {
    const { senha } = req.params;
    try {
        const result = await db.query("SELECT id, senha, prioridade FROM fichas_pre_atendimento WHERE senha = $1 AND status = 'aguardando_triagem'", [senha.toUpperCase()]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Senha não encontrada ou já triada." });
        res.json(result.rows[0]);
    } catch (err) { console.error(err.message); res.status(500).send('Erro no servidor'); }
});

// POST /api/triagem/salvar/:ficha_id
// (Esta função foi AJUSTADA)
router.post('/salvar/:ficha_id', async (req, res) => {
    const { ficha_id } = req.params;
    const { classificacao_risco, queixa_principal, historico_breve, alergias, sinais_vitais } = req.body;

    // Lógica de Alerta de SEPSE (Mantida)
    let alerta_sepse = false;
    if (sinais_vitais && ((sinais_vitais.temperatura > 38.3 || sinais_vitais.temperatura < 36) && sinais_vitais.frequencia_cardiaca > 90)) {
        alerta_sepse = true;
    }
    
    // --- MUDANÇA PRINCIPAL AQUI ---
    // Agora, todos os pacientes vão para a recepção, sem exceção.
    // A recepção saberá que é "vermelho" pela classificação e irá priorizar.
    const proximo_status = 'aguardando_recepcao';
    // --- FIM DA MUDANÇA ---
    
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Atualiza a ficha (agora com o status 'aguardando_recepcao')
        await client.query(
            `UPDATE fichas_pre_atendimento SET classificacao_risco=$1, queixa_principal=$2, historico_breve=$3, alergias=$4, alerta_sepse=$5, status=$6 WHERE id=$7`,
            [classificacao_risco, queixa_principal, historico_breve, alergias, alerta_sepse, proximo_status, ficha_id]
        );
        
        // 2. Insere os sinais vitais (isto não muda)
        await client.query(
            `INSERT INTO sinais_vitais_triagem (ficha_id, pressao_arterial, frequencia_cardiaca, frequencia_respiratoria, temperatura, saturacao_o2, glicemia_capilar, escala_dor) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             ON CONFLICT (ficha_id) DO UPDATE SET 
                pressao_arterial = EXCLUDED.pressao_arterial, 
                frequencia_cardiaca = EXCLUDED.frequencia_cardiaca, 
                frequencia_respiratoria = EXCLUDED.frequencia_respiratoria, 
                temperatura = EXCLUDED.temperatura, 
                saturacao_o2 = EXCLUDED.saturacao_o2, 
                glicemia_capilar = EXCLUDED.glicemia_capilar, 
                escala_dor = EXCLUDED.escala_dor`,
            [ficha_id, sinais_vitais.pressao_arterial, sinais_vitais.frequencia_cardiaca, sinais_vitais.frequencia_respiratoria, sinais_vitais.temperatura, sinais_vitais.saturacao_o2, sinais_vitais.glicemia_capilar || null, sinais_vitais.escala_dor]
        );
        
        await client.query('COMMIT');
        res.json({ message: "Triagem salva. Paciente encaminhado para Recepção.", proximo_passo: proximo_status });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).send('Erro no servidor');
    } finally {
        client.release();
    }
});

module.exports = router;