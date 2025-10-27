// routes/totem.js (Atualizado)
const express = require('express');
const db = require('../db'); // Nossa conexão PG
const router = express.Router();

// --- FUNÇÃO DE GERAR SENHA ATUALIZADA ---
// Esta nova versão conta as senhas por *prefixo* (Ex: P001, P002... e R001, R002...)
// e reseta a contagem a cada dia, como era a intenção.
async function gerarProximaSenha(prioridade, fila_destino) {
    // 1. Determina o prefixo
    // (Lógica do teu totem.html: Prioridade = 'P', senão, a primeira letra)
    const prefixo = prioridade !== 'Nenhuma' ? 'P' : fila_destino.charAt(0).toUpperCase();

    // 2. Conta quantos tickets *com esse prefixo* já existem *hoje*
    const result = await db.query(
        "SELECT COUNT(*) FROM fichas_pre_atendimento WHERE DATE(data_hora_chegada) = CURRENT_DATE AND senha LIKE $1",
        [prefixo + '%'] // Ex: 'P%' ou 'R%'
    );
    
    // 3. O próximo número é o (total + 1)
    const proximoNumero = parseInt(result.rows[0].count) + 1;

    // 4. Retorna a senha formatada
    return `${prefixo}${proximoNumero.toString().padStart(3, '0')}`;
}

// POST /api/totem/gerar-senha
router.post('/gerar-senha', async (req, res) => {
    const { fila_destino, prioridade } = req.body;
    try {
        const novaSenha = await gerarProximaSenha(prioridade, fila_destino);
        
        const novaFicha = await db.query(
            "INSERT INTO fichas_pre_atendimento (senha, fila_destino, prioridade, status) VALUES ($1, $2, $3, 'aguardando_triagem') RETURNING senha",
            [novaSenha, fila_destino, prioridade]
        );
        
        res.status(201).json(novaFicha.rows[0]);

    } catch (err) { 
        console.error(err.message); 
        
        // Código de erro '23505' é "unique_violation" no Postgres
        // Isto pode acontecer se dois totems clicarem no mesmo milissegundo (race condition)
        if (err.code === '23505') { 
             return res.status(500).send('Erro de concorrência. Tente gerar a senha novamente.');
        }
        
        res.status(500).send('Erro no servidor'); 
    }
});

module.exports = router;