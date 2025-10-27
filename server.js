// server.js (Corrigido)
require('dotenv').config(); // Carrega o .env
const express = require('express');
const cors = require('cors');
const path = require('path');

// Importa as nossas "mini-apis"
const totemRoutes = require('./routes/totem');
const triagemRoutes = require('./routes/triagem');
const recepcaoRoutes = require('./routes/recepcao');
const medicoRoutes = require('./routes/medico');
const farmaciaRoutes = require('./routes/farmacia');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors()); // Permite comunicação entre front-end e back-end
app.use(express.json()); // Lê JSON
app.use(express.urlencoded({ extended: true })); // Lê formulários

// Servir a pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- OPÇÃO DE LIMPAR SENHAS AO INICIAR (PARA TESTES) ---
// Função assíncrona para garantir que a limpeza ocorra antes de continuar
async function limparBancoParaTestes() {
    if (process.env.CLEAR_DB_ON_START === 'true') {
        console.warn('--- ATENÇÃO: Limpando tabelas para testes (CLEAR_DB_ON_START=true) ---');
        try {
            // É importante deletar da tabela 'filha' (sinais_vitais) primeiro
            // devido à chave estrangeira, a menos que tenha ON DELETE CASCADE.
            await db.query('DELETE FROM sinais_vitais_triagem;');
            console.log('* Tabela sinais_vitais_triagem limpa.');

            await db.query('DELETE FROM fichas_pre_atendimento;');
            console.log('* Tabela fichas_pre_atendimento limpa.');

            // Opcional: Resetar a sequência diária (se necessário para testes muito específicos)
            // await db.query("SELECT setval('senha_diaria_seq', 1, false);");
            // console.log('* Sequência senha_diaria_seq resetada.');

            console.log('--- Limpeza concluída ---');
        } catch (err) {
            console.error('!!! ERRO DURANTE A LIMPEZA DO BANCO PARA TESTES:', err.message);
            // Decide se quer parar o servidor ou continuar mesmo com erro na limpeza
            // process.exit(1); // Descomente para parar o servidor se a limpeza falhar
        }
    } else {
        console.info('--- INFO: Limpeza de banco de dados desativada (CLEAR_DB_ON_START não é "true") ---');
    }
}

// Executa a limpeza ANTES de registrar as rotas e iniciar o servidor

// --- REGISTO DAS ROTAS ---
app.use('/api/totem', totemRoutes);
app.use('/api/triagem', triagemRoutes);
app.use('/api/recepcao', recepcaoRoutes);
app.use('/api/medico', medicoRoutes);
app.use('/api/farmacia', farmaciaRoutes);

// Rota principal (redireciona para o totem)
app.get('/', (req, res) => {
    res.redirect('/totem.html');
});

// Rota para servir a página PEP dinamicamente
app.get('/atendimento/:id/pep', (req, res) => {
    res.redirect(`/medico.html?atendimento_id=${req.params.id}`);
});

app.listen(PORT, () => {
    console.log(`Servidor principal (PostgreSQL) rodando em http://localhost:${PORT}`);
    console.log(`Conectando ao banco de dados em: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
});