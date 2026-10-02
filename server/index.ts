import 'dotenv/config';

import { GoogleGenAI, Type } from '@google/genai';
import express from 'express';

import { randomUUID } from 'node:crypto';

import {
  finalidadeDe,
  podeTransferir,
  statusPertenceA,
  statusValidos,
} from '../src/domain/casos.js';
import type { CasoAquisicao, FinalidadePermitida, OrigemCaso } from '../src/domain/casos.js';
import {
  autenticar,
  bloquearAuditorEmEscrita,
  criarUsuario,
  exigirAutenticacao,
  exigirPapel,
  revogarSessao,
} from './auth.js';
import { abrirBanco, custoPorBureau, registrarConsulta } from './db.js';

const db = abrirBanco();
const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3001);

// ---------------------------------------------------------------------------
// Autenticação (rotas abertas)
// ---------------------------------------------------------------------------

// Health check precisa responder sem credencial: é o que um balanceador ou
// monitor consulta. Registrado antes do middleware de sessão de propósito.
app.get('/api/saude', (_req, res) => res.json({ ok: true, em: new Date().toISOString() }));

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body ?? {};
  if (!email || !senha) return res.status(400).json({ erro: 'email e senha são obrigatórios' });

  const sessao = await autenticar(db, email, senha);
  // Credencial inválida e usuário inexistente dão a mesma resposta.
  if (!sessao) return res.status(401).json({ erro: 'credenciais inválidas' });
  res.json(sessao);
});

// ---------------------------------------------------------------------------
// Daqui para baixo, tudo exige sessão válida
// ---------------------------------------------------------------------------

app.use('/api', exigirAutenticacao(db), bloquearAuditorEmEscrita);

app.get('/api/auth/eu', (req, res) => res.json(req.usuario));

app.post('/api/auth/logout', (req, res) => {
  const token = req.header('authorization')?.slice(7).trim();
  if (token) revogarSessao(db, token);
  res.status(204).end();
});

/** Criação de conta é privilégio de admin — não há auto-cadastro. */
app.post('/api/usuarios', exigirPapel('admin'), async (req, res) => {
  const { email, nome, senha, papel, canais } = req.body ?? {};
  if (!email || !nome || !senha || !papel) {
    return res.status(400).json({ erro: 'email, nome, senha e papel são obrigatórios' });
  }
  try {
    res
      .status(201)
      .json(await criarUsuario(db, { email, nome, senha, papel, canais: canais ?? [] }));
  } catch (e) {
    res.status(409).json({ erro: (e as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

/** Canais que o usuário pode ver. admin e auditor veem os dois. */
const canaisVisiveis = (req: express.Request): OrigemCaso[] =>
  req.usuario?.papel === 'admin' || req.usuario?.papel === 'auditor'
    ? ['plataforma_credor', 'lead_proprio']
    : (req.usuario?.canais ?? []);

app.get('/api/casos', (req, res) => {
  const origem = req.query.origem;
  // Listar sempre por canal: uma tela que mistura os dois convida ao erro que
  // o schema existe para impedir.
  if (origem !== 'plataforma_credor' && origem !== 'lead_proprio') {
    return res.status(400).json({
      erro: 'informe origem=plataforma_credor ou origem=lead_proprio',
    });
  }
  if (!canaisVisiveis(req).includes(origem)) {
    return res.status(403).json({ erro: `sem permissão para o canal ${origem}` });
  }
  const casos = db
    .prepare(
      `SELECT c.*, a.placa, a.modelo, a.cidade
         FROM caso c JOIN ativo a ON a.id = c.ativo_id
        WHERE c.origem = ?
        ORDER BY c.criado_em DESC`,
    )
    .all(origem);
  res.json({ origem, finalidade: finalidadeDe(origem), total: casos.length, casos });
});

app.post('/api/casos', (req, res) => {
  const { id, ativoId, fonteId, origem, status, ...resto } = req.body ?? {};
  if (!id || !ativoId || !fonteId || !origem || !status) {
    return res.status(400).json({ erro: 'id, ativoId, fonteId, origem e status são obrigatórios' });
  }
  if (origem !== 'plataforma_credor' && origem !== 'lead_proprio') {
    return res.status(400).json({ erro: `origem inválida: ${origem}` });
  }
  if (!canaisVisiveis(req).includes(origem)) {
    return res.status(403).json({ erro: `sem permissão para o canal ${origem}` });
  }

  // A finalidade nunca vem do cliente — é derivada da origem.
  const finalidade = finalidadeDe(origem);

  try {
    db.prepare(
      `INSERT INTO caso (
         id, ativo_id, fonte_id, origem, finalidade, status,
         recuperador_id, prazo_vinculo, prazo_maximo,
         canal_lead, evidencia_lead, saldo_devedor,
         valor_quitacao_negociado, valor_pago_ao_devedor,
         anuencia_credor, renajud_ativo, gravame_baixado
       ) VALUES (
         @id, @ativoId, @fonteId, @origem, @finalidade, @status,
         @recuperadorId, @prazoVinculo, @prazoMaximo,
         @canalLead, @evidenciaLead, @saldoDevedor,
         @valorQuitacaoNegociado, @valorPagoAoDevedor,
         @anuenciaCredor, @renajudAtivo, @gravameBaixado
       )`,
    ).run({
      id,
      ativoId,
      fonteId,
      origem,
      finalidade,
      status,
      recuperadorId: resto.recuperadorId ?? null,
      prazoVinculo: resto.prazoVinculo ?? null,
      prazoMaximo: resto.prazoMaximo ?? null,
      canalLead: resto.canalLead ?? null,
      evidenciaLead: resto.evidenciaLead ?? null,
      saldoDevedor: resto.saldoDevedor ?? null,
      valorQuitacaoNegociado: resto.valorQuitacaoNegociado ?? null,
      valorPagoAoDevedor: resto.valorPagoAoDevedor ?? null,
      anuenciaCredor: resto.anuenciaCredor ?? null,
      renajudAtivo: resto.renajudAtivo === undefined ? null : Number(Boolean(resto.renajudAtivo)),
      gravameBaixado:
        resto.gravameBaixado === undefined ? null : Number(Boolean(resto.gravameBaixado)),
    });
    res.status(201).json({ id, origem, finalidade });
  } catch (e) {
    // CHECK e trigger do schema chegam aqui. A mensagem do banco é a explicação
    // mais precisa disponível — repassá-la é melhor que traduzi-la.
    res.status(409).json({ erro: (e as Error).message });
  }
});

/** Pré-condições jurídicas da transferência, avaliadas sobre o dado gravado. */
app.get('/api/casos/:id/pode-transferir', (req, res) => {
  const row = db
    .prepare(
      `SELECT origem, anuencia_credor, renajud_ativo, gravame_baixado
         FROM caso WHERE id = ?`,
    )
    .get(req.params.id) as
    | {
        origem: string;
        anuencia_credor: CasoAquisicao['anuenciaCredor'] | null;
        renajud_ativo: number | null;
        gravame_baixado: number | null;
      }
    | undefined;

  if (!row) return res.status(404).json({ erro: 'caso não encontrado' });
  if (row.origem !== 'lead_proprio') {
    return res.status(409).json({
      erro: 'caso de plataforma não tem finalidade de aquisição; transferência não se aplica',
    });
  }

  const caso = {
    anuenciaCredor: row.anuencia_credor ?? 'Pendente',
    renajudAtivo: Boolean(row.renajud_ativo),
    gravameBaixado: Boolean(row.gravame_baixado),
  } as CasoAquisicao;

  res.json({
    podeTransferir: podeTransferir(caso),
    pendencias: [
      caso.anuenciaCredor !== 'Obtida' && 'anuência do credor não obtida',
      caso.renajudAtivo && 'RENAJUD ativo',
      !caso.gravameBaixado && 'gravame não baixado',
    ].filter(Boolean),
  });
});

/** Avança o status, validando contra o vocabulário do canal do caso. */
app.post('/api/casos/:id/status', (req, res) => {
  const { status } = req.body ?? {};
  if (!status) return res.status(400).json({ erro: 'status é obrigatório' });

  const caso = db.prepare('SELECT origem, finalidade FROM caso WHERE id = ?').get(req.params.id) as
    | { origem: OrigemCaso; finalidade: FinalidadePermitida }
    | undefined;
  if (!caso) return res.status(404).json({ erro: 'caso não encontrado' });
  if (!canaisVisiveis(req).includes(caso.origem)) {
    return res.status(403).json({ erro: `sem permissão para o canal ${caso.origem}` });
  }
  // Um status do outro canal não é erro de digitação: é sinal de que a tela
  // está oferecendo opções que não existem nesse ciclo de vida.
  if (!statusPertenceA(caso.finalidade, status)) {
    return res.status(422).json({
      erro: `status "${status}" não pertence ao canal ${caso.finalidade}`,
      validos: statusValidos(caso.finalidade),
    });
  }
  db.prepare('UPDATE caso SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ id: req.params.id, status });
});

/** Vocabulário de status de um canal, para a tela não inventar as opções. */
app.get('/api/status', (req, res) => {
  const f = req.query.finalidade;
  if (f !== 'recuperacao_para_credor' && f !== 'aquisicao_com_quitacao') {
    return res
      .status(400)
      .json({ erro: 'informe finalidade=recuperacao_para_credor|aquisicao_com_quitacao' });
  }
  res.json(statusValidos(f));
});

// ---------------------------------------------------------------------------
// Colisão de origem
// ---------------------------------------------------------------------------

/**
 * Registra uma colisão. O trigger do banco exige esta linha, com evidência
 * independente, antes de permitir abrir aquisição numa placa que já é caso de
 * plataforma — então esta rota é o único caminho legítimo para esse cenário.
 */
app.post('/api/colisoes', exigirPapel('admin'), (req, res) => {
  const {
    placa,
    casoPlataformaId,
    leadProprioRef,
    resolucao,
    justificativa,
    evidenciaIndependente,
  } = req.body ?? {};
  if (!placa || !casoPlataformaId || !resolucao || !justificativa?.trim()) {
    return res
      .status(400)
      .json({ erro: 'placa, casoPlataformaId, resolucao e justificativa são obrigatórios' });
  }
  try {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO colisao_origem
         (id, placa, caso_plataforma_id, lead_proprio_ref, resolucao, justificativa, evidencia_independente, operador_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      placa,
      casoPlataformaId,
      leadProprioRef ?? null,
      resolucao,
      justificativa,
      evidenciaIndependente ?? null,
      req.usuario!.id,
    );
    res.status(201).json({ id });
  } catch (e) {
    res.status(409).json({ erro: (e as Error).message });
  }
});

app.get('/api/colisoes', (_req, res) =>
  res.json(db.prepare('SELECT * FROM colisao_origem ORDER BY detectado_em DESC').all()),
);

// ---------------------------------------------------------------------------
// Cadastros
// ---------------------------------------------------------------------------

app.get('/api/ativos', (_req, res) =>
  res.json(db.prepare('SELECT * FROM ativo ORDER BY criado_em DESC').all()),
);

app.post('/api/ativos', (req, res) => {
  const a = req.body ?? {};
  if (!a.placa) return res.status(400).json({ erro: 'placa é obrigatória' });
  try {
    const id = a.id ?? randomUUID();
    db.prepare(
      `INSERT INTO ativo (id, placa, chassi, modelo, ano, cor, devedor_nome, devedor_doc,
                          credor_nome, valor_divida, cidade, uf, data_recebimento)
       VALUES (@id, @placa, @chassi, @modelo, @ano, @cor, @devedorNome, @devedorDoc,
               @credorNome, @valorDivida, @cidade, @uf, @dataRecebimento)`,
    ).run({
      id,
      placa: String(a.placa).toUpperCase().replace(/\s/g, ''),
      chassi: a.chassi ?? null,
      modelo: a.modelo ?? null,
      ano: a.ano ?? null,
      cor: a.cor ?? null,
      devedorNome: a.devedorNome ?? null,
      devedorDoc: a.devedorDoc ?? null,
      credorNome: a.credorNome ?? null,
      valorDivida: a.valorDivida ?? null,
      cidade: a.cidade ?? null,
      uf: a.uf ?? null,
      dataRecebimento: a.dataRecebimento ?? new Date().toISOString(),
    });
    res.status(201).json({ id });
  } catch (e) {
    res.status(409).json({ erro: (e as Error).message });
  }
});

app.get('/api/fontes', (_req, res) =>
  res.json(db.prepare('SELECT * FROM fonte_ativo WHERE ativa = 1').all()),
);

app.get('/api/recuperadores', (_req, res) =>
  res.json(db.prepare('SELECT * FROM recuperador ORDER BY score DESC').all()),
);

app.post('/api/recuperadores', exigirPapel('admin'), (req, res) => {
  const r = req.body ?? {};
  if (!r.nome) return res.status(400).json({ erro: 'nome é obrigatório' });
  try {
    const id = r.id ?? randomUUID();
    db.prepare(
      `INSERT INTO recuperador (id, nome, documento, telefone, cidades, status, score, taxa_recuperacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      r.nome,
      r.documento ?? null,
      r.telefone ?? null,
      JSON.stringify(r.cidades ?? []),
      r.status ?? 'Ativo',
      r.score ?? 0,
      r.taxaRecuperacao ?? 0,
    );
    res.status(201).json({ id });
  } catch (e) {
    res.status(409).json({ erro: (e as Error).message });
  }
});

// A chave de API do bureau não está no banco nem é exposta: só a referência
// do contrato, que é o que a auditoria precisa.
app.get('/api/bureaus', (_req, res) =>
  res.json(
    db
      .prepare(
        'SELECT id, nome, tipo, contrato_fornecedor_id, custo_consulta, ativo FROM bureau WHERE ativo = 1',
      )
      .all(),
  ),
);

app.get('/api/repasses', (_req, res) =>
  res.json(
    db
      .prepare(
        `SELECT r.*, rec.nome AS recuperador_nome, a.placa
           FROM repasse r
           JOIN recuperador rec ON rec.id = r.recuperador_id
           JOIN caso c ON c.id = r.caso_id
           JOIN ativo a ON a.id = c.ativo_id
          ORDER BY r.data DESC`,
      )
      .all(),
  ),
);

app.get('/api/auditoria', exigirPapel('admin', 'auditor'), (_req, res) =>
  res.json(
    db
      .prepare(
        `SELECT ca.*, b.nome AS bureau_nome, u.nome AS operador_nome
           FROM consulta_auditoria ca
           JOIN bureau b ON b.id = ca.bureau_id
           JOIN usuario u ON u.id = ca.operador_id
          ORDER BY ca.consultado_em DESC
          LIMIT 500`,
      )
      .all(),
  ),
);

// ---------------------------------------------------------------------------
// Consultas a bureau — sempre com procedência
// ---------------------------------------------------------------------------

app.post('/api/consultas', (req, res) => {
  const { casoId, bureauId, baseLegal, justificativa, camposRetornados } = req.body ?? {};
  if (!casoId || !bureauId || !baseLegal || !justificativa?.trim()) {
    return res.status(400).json({
      erro: 'casoId, bureauId, baseLegal e justificativa são obrigatórios',
    });
  }

  // Consultar exige permissão no canal do caso: senão um operador de aquisição
  // consultaria bureau sobre devedor da carteira da plataforma.
  const caso = db.prepare('SELECT origem FROM caso WHERE id = ?').get(casoId) as
    | { origem: OrigemCaso }
    | undefined;
  if (!caso) return res.status(404).json({ erro: 'caso não encontrado' });
  if (!canaisVisiveis(req).includes(caso.origem)) {
    return res.status(403).json({ erro: `sem permissão para o canal ${caso.origem}` });
  }

  try {
    const linha = registrarConsulta(db, {
      casoId,
      bureauId,
      baseLegal,
      justificativa,
      // Nunca do corpo da requisição: a trilha só vale se o ato for atribuído
      // a quem a sessão autenticou.
      operadorId: req.usuario!.id,
      camposRetornados: camposRetornados ?? [],
    });
    res.status(201).json(linha);
  } catch (e) {
    res.status(409).json({ erro: (e as Error).message });
  }
});

app.get('/api/custos/bureau', exigirPapel('admin', 'auditor'), (_req, res) =>
  res.json(custoPorBureau(db)),
);

// ---------------------------------------------------------------------------
// CAMILA — a chave do Gemini vive aqui, nunca no bundle do cliente
// ---------------------------------------------------------------------------

const chaveGemini = process.env.GEMINI_API_KEY;
const ai = chaveGemini ? new GoogleGenAI({ apiKey: chaveGemini }) : null;

app.post('/api/camila/prioridades', async (_req, res) => {
  const pendentes = db
    .prepare(
      `SELECT r.id, r.valor, r.data, r.tipo, rec.nome AS recuperador, rec.score,
              a.placa, c.status
         FROM repasse r
         JOIN recuperador rec ON rec.id = r.recuperador_id
         JOIN caso c ON c.id = r.caso_id
         JOIN ativo a ON a.id = c.ativo_id
        WHERE r.status = 'Pendente'`,
    )
    .all();

  if (pendentes.length === 0) return res.json([]);
  if (!ai) {
    return res.status(503).json({
      erro: 'GEMINI_API_KEY não configurada no servidor',
      // Sem fallback simulado: um número inventado numa tela financeira é pior
      // que a ausência dele.
      pendentes: pendentes.length,
    });
  }

  try {
    const resposta = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analise os repasses pendentes e sugira prioridade de pagamento.
Considere valor, tempo de atraso, risco de cancelamento e score do recuperador.
Dados: ${JSON.stringify(pendentes)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              repasseId: { type: Type.STRING },
              prioridade: { type: Type.STRING },
              justificativa: { type: Type.STRING },
              riscoCancelamento: { type: Type.NUMBER },
            },
            required: ['repasseId', 'prioridade', 'justificativa', 'riscoCancelamento'],
          },
        },
      },
    });
    res.json(JSON.parse(resposta.text || '[]'));
  } catch (e) {
    res.status(502).json({ erro: `falha na análise: ${(e as Error).message}` });
  }
});

app.listen(PORT, () => {
  console.log(`api em http://localhost:${PORT}`);
  console.log(`camila: ${ai ? 'ativa' : 'inativa (defina GEMINI_API_KEY)'}`);
});
