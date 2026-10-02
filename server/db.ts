import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ConsultaAuditoria,
  FinalidadePermitida,
  OrigemCaso,
} from '../src/domain/casos.js';
import { finalidadeDe } from '../src/domain/casos.js';

const here = dirname(fileURLToPath(import.meta.url));

export const abrirBanco = (caminho = process.env.DB_PATH ?? join(here, '..', 'data.db')) => {
  const db = new Database(caminho);
  // WAL para leitura concorrente; foreign_keys não é default no SQLite.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf-8'));
  return db;
};

export type Banco = ReturnType<typeof abrirBanco>;

/** Dias de retenção por finalidade. Prazo curto é o default seguro. */
const RETENCAO_DIAS: Record<FinalidadePermitida, number> = {
  recuperacao_para_credor: 180,
  aquisicao_com_quitacao: 365,
};

const somaDias = (dias: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
};

export interface ConsultaSolicitada {
  casoId: string;
  bureauId: string;
  baseLegal: ConsultaAuditoria['baseLegal'];
  justificativa: string;
  operadorId: string;
  camposRetornados: string[];
}

/**
 * Registra uma consulta a bureau com procedência completa.
 *
 * `origem`, `finalidade` e `contrato_fornecedor_id` NÃO são aceitos do chamador:
 * são derivados do caso e do bureau no próprio banco. Quem chama não pode
 * declarar uma finalidade diferente da que o caso carrega.
 */
export const registrarConsulta = (db: Banco, req: ConsultaSolicitada): ConsultaAuditoria => {
  const caso = db
    .prepare('SELECT origem, finalidade FROM caso WHERE id = ?')
    .get(req.casoId) as { origem: OrigemCaso; finalidade: FinalidadePermitida } | undefined;
  if (!caso) throw new Error(`caso inexistente: ${req.casoId}`);

  const bureau = db
    .prepare('SELECT contrato_fornecedor_id, custo_consulta, ativo FROM bureau WHERE id = ?')
    .get(req.bureauId) as
    | { contrato_fornecedor_id: string; custo_consulta: number; ativo: number }
    | undefined;
  if (!bureau) throw new Error(`bureau inexistente: ${req.bureauId}`);
  if (!bureau.ativo) throw new Error(`bureau inativo: ${req.bureauId}`);

  // Coerência entre a origem registrada no caso e a finalidade canônica.
  // Uma divergência aqui significa dado corrompido, não erro de chamada.
  if (finalidadeDe(caso.origem) !== caso.finalidade) {
    throw new Error(
      `caso ${req.casoId} incoerente: origem=${caso.origem} finalidade=${caso.finalidade}`,
    );
  }

  const linha: ConsultaAuditoria = {
    id: randomUUID(),
    casoId: req.casoId,
    origemCaso: caso.origem,
    finalidade: caso.finalidade,
    bureauId: req.bureauId,
    contratoFornecedorId: bureau.contrato_fornecedor_id,
    baseLegal: req.baseLegal,
    justificativa: req.justificativa,
    operadorId: req.operadorId,
    consultadoEm: new Date().toISOString(),
    camposRetornados: req.camposRetornados,
    retencaoAte: somaDias(RETENCAO_DIAS[caso.finalidade]),
    custo: bureau.custo_consulta,
  };

  db.prepare(
    `INSERT INTO consulta_auditoria (
       id, caso_id, origem_caso, finalidade, bureau_id, contrato_fornecedor_id,
       base_legal, justificativa, operador_id, consultado_em,
       campos_retornados, retencao_ate, custo
     ) VALUES (
       @id, @casoId, @origemCaso, @finalidade, @bureauId, @contratoFornecedorId,
       @baseLegal, @justificativa, @operadorId, @consultadoEm,
       @camposRetornados, @retencaoAte, @custo
     )`,
  ).run({ ...linha, camposRetornados: JSON.stringify(linha.camposRetornados) });

  return linha;
};

/**
 * Custo real de aquisição de dado, por bureau. A mesma tabela que defende a
 * operação diz qual fornecedor vale o preço.
 */
export const custoPorBureau = (db: Banco) =>
  db
    .prepare(
      `SELECT b.nome, COUNT(*) AS consultas, ROUND(SUM(ca.custo), 2) AS custo_total
         FROM consulta_auditoria ca
         JOIN bureau b ON b.id = ca.bureau_id
        GROUP BY b.id
        ORDER BY custo_total DESC`,
    )
    .all();

/** Consultas cujo prazo de retenção venceu e devem ser expurgadas. */
export const consultasVencidas = (db: Banco) =>
  db
    .prepare('SELECT id, caso_id, retencao_ate FROM consulta_auditoria WHERE retencao_ate < ?')
    .all(new Date().toISOString());
