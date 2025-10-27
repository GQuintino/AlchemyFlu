// routes/farmacia.js
const express = require('express');
const db = require('../db');
const router = express.Router();

// Função auxiliar para buscar itens (adaptada da nossa lógica anterior)
function buscarMateriaisDoItem(item_sal_prescrito, quantidade_prescrita) {
    return new Promise(async (resolve, reject) => {
        try {
            const sqlKit = `SELECT item_sal_codigo, quantidade_item FROM estoque_kits WHERE kit_sal_codigo = $1`;
            const kitResult = await db.query(sqlKit, [item_sal_prescrito]);
            
            let materiais_necessarios = [];
            if (kitResult.rows.length > 0) {
                materiais_necessarios = kitResult.rows.map(item => ({
                    item_sal: item.item_sal_codigo,
                    qtd_total: item.quantidade_item * quantidade_prescrita,
                }));
            } else {
                materiais_necessarios.push({ 
                    item_sal: item_sal_prescrito, 
                    qtd_total: quantidade_prescrita,
                });
            }
            resolve(materiais_necessarios);
        } catch (err) {
            reject(err);
        }
    });
}

// GET /api/farmacia/pendentes
router.get('/pendentes', async (req, res) => {
    const sql = `
        SELECT 
            pr.id, pr.item_sal_prescrito, pr.quantidade_prescrita, pr.dosagem, pr.via_administracao,
            p.nomereg AS paciente_nome,
            e.nome_produto
        FROM prescricao_itens AS pr
        JOIN atendimentos AS at ON pr.atendimento_id = at.id
        JOIN qhos.paciente AS p ON at.paciente_prontu = p.prontu
        LEFT JOIN estoque_produtos e ON pr.item_sal_prescrito = e.sal_codigo
        WHERE pr.status = 'PENDENTE'
        ORDER BY pr.id ASC
    `;
    
    try {
        const prescricoes = await db.query(sql);
        
        // Para cada prescrição, busca os itens do kit
        const prescricoesComKits = [];
        for (const pr of prescricoes.rows) {
            const materiais = await buscarMateriaisDoItem(pr.item_sal_prescrito, pr.quantidade_prescrita);
            prescricoesComKits.push({ ...pr, materiais_para_baixa: materiais });
        }
        res.json(prescricoesComKits);
    } catch (err) {
        console.error(err.message); res.status(500).json({ message: err.message });
    }
});

// POST /api/farmacia/dispensar/:id
router.post('/dispensar/:id', async (req, res) => {
    const { id } = req.params; // prescricao_id
    const client = await db.pool.connect();
    
    try {
        // 1. Buscar a prescrição
        const prescricaoResult = await client.query("SELECT item_sal_prescrito, quantidade_prescrita FROM prescricao_itens WHERE id = $1 AND status = 'PENDENTE'", [id]);
        if (prescricaoResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ message: 'Prescrição não encontrada ou já dispensada.' });
        }
        const prescricao = prescricaoResult.rows[0];
        
        // 2. Buscar os materiais necessários
        const materiais = await buscarMateriaisDoItem(prescricao.item_sal_prescrito, prescricao.quantidade_prescrita);
        
        // 3. Iniciar TRANSAÇÃO
        await client.query('BEGIN');

        // 4. Loop para dar baixa em CADA item
        for (const mat of materiais) {
            const sqlBaixa = `
                UPDATE estoque_produtos 
                SET quantidade_atual = quantidade_atual - $1 
                WHERE sal_codigo = $2 AND quantidade_atual >= $1
            `;
            const baixaResult = await client.query(sqlBaixa, [mat.qtd_total, mat.item_sal]);
            
            // Verifica se a baixa falhou (estoque insuficiente)
            if (baixaResult.rowCount === 0) {
                throw new Error(`Estoque insuficiente para: ${mat.item_sal}`);
            }
        }
        
        // 5. Mudar status da prescrição
        await client.query("UPDATE prescricao_itens SET status = 'DISPENSADA' WHERE id = $1", [id]);
        
        // 6. Concluir a Transação
        await client.query('COMMIT');
        res.json({ success: true, message: 'Dispensado com sucesso!' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Erro na transação de dispensa:", err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;