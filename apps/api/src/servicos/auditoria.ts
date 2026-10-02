import { desc, eq, lt, sql } from 'drizzle-orm';

import { schema, type Tx } from '@workspace/db';
import type { FinalidadePermitida } from '@workspace/domain';

const { bureau, caso, consultaAuditoria, usuario } = schema;

/** Dias de retenção por finalidade. Prazo curto é o default seguro. */
const RETENCAO_DIAS: Record<FinalidadePermitida, number> = {
  recuperacao_para_credor: 180,
  aquisicao_com_quitacao: 365,
};

export interface ConsultaSolicitada {
  casoId: string;
  bureauId: string;
  baseLegal: 'execucao_contrato' | 'legitimo_interesse' | 'obrigacao_legal' | 'consentimento';
  justificativa: string;
  camposRetornados: string[];
}

export class CasoNaoEncontrado extends Error {
  constructor(casoId: string) {
    super(`caso não encontrado: ${casoId}`);
  }
}

/**
 * Registra uma consulta a bureau com procedência completa.
 *
 * `origem`, `finalidade` e `contrato_fornecedor_id` NÃO são aceitos do
 * chamador: são derivados do caso e do bureau. O operador vem da sessão (o
 * trigger do banco sobrescreve qualquer outro valor). Quem chama não pode
 * declarar uma finalidade diferente da que o caso carrega.
 *
 * Roda dentro da transação da requisição: o RLS já esconde casos de outro
 * canal, então "caso de outro canal" e "caso inexistente" dão a mesma resposta.
 */
export const registrarConsulta = async (tx: Tx, operadorId: string, req: ConsultaSolicitada) => {
  const [c] = await tx
    .select({ origem: caso.origem, finalidade: caso.finalidade })
    .from(caso)
    .where(eq(caso.id, req.casoId));
  if (!c) throw new CasoNaoEncontrado(req.casoId);

  const [b] = await tx
    .select({ contrato: bureau.contratoFornecedorId, custo: bureau.custoConsulta, ativo: bureau.ativo })
    .from(bureau)
    .where(eq(bureau.id, req.bureauId));
  if (!b || !b.ativo) throw Object.assign(new Error(`bureau inexistente ou inativo: ${req.bureauId}`), { statusCode: 409 });

  const retencaoAte = new Date();
  retencaoAte.setUTCDate(retencaoAte.getUTCDate() + RETENCAO_DIAS[c.finalidade]);

  const [linha] = await tx
    .insert(consultaAuditoria)
    .values({
      casoId: req.casoId,
      origemCaso: c.origem,
      finalidade: c.finalidade,
      bureauId: req.bureauId,
      contratoFornecedorId: b.contrato,
      baseLegal: req.baseLegal,
      justificativa: req.justificativa,
      operadorId,
      camposRetornados: req.camposRetornados,
      retencaoAte,
      custo: b.custo,
    })
    .returning();
  return linha!;
};

/** Últimas consultas, com nome do bureau e do operador. */
export const listarAuditoria = (tx: Tx) =>
  tx
    .select({
      id: consultaAuditoria.id,
      casoId: consultaAuditoria.casoId,
      origemCaso: consultaAuditoria.origemCaso,
      finalidade: consultaAuditoria.finalidade,
      bureauId: consultaAuditoria.bureauId,
      contratoFornecedorId: consultaAuditoria.contratoFornecedorId,
      baseLegal: consultaAuditoria.baseLegal,
      justificativa: consultaAuditoria.justificativa,
      operadorId: consultaAuditoria.operadorId,
      consultadoEm: consultaAuditoria.consultadoEm,
      camposRetornados: consultaAuditoria.camposRetornados,
      retencaoAte: consultaAuditoria.retencaoAte,
      custo: consultaAuditoria.custo,
      bureauNome: bureau.nome,
      operadorNome: usuario.nome,
    })
    .from(consultaAuditoria)
    .innerJoin(bureau, eq(bureau.id, consultaAuditoria.bureauId))
    .innerJoin(usuario, eq(usuario.id, consultaAuditoria.operadorId))
    .orderBy(desc(consultaAuditoria.consultadoEm))
    .limit(500);

/**
 * Custo real de aquisição de dado, por bureau. A mesma tabela que defende a
 * operação diz qual fornecedor vale o preço.
 */
export const custoPorBureau = async (tx: Tx) => {
  const linhas = await tx
    .select({
      nome: bureau.nome,
      consultas: sql<number>`count(*)::int`,
      custoTotal: sql<string>`round(sum(${consultaAuditoria.custo}), 2)`,
    })
    .from(consultaAuditoria)
    .innerJoin(bureau, eq(bureau.id, consultaAuditoria.bureauId))
    .groupBy(bureau.id, bureau.nome)
    .orderBy(sql`3 desc`);
  // numeric chega como texto pelo driver: converter aqui, onde se sabe a escala.
  return linhas.map((l) => ({ ...l, custoTotal: Number(l.custoTotal) }));
};

/** Consultas cujo prazo de retenção venceu e devem ter o dado expurgado. */
export const consultasVencidas = (tx: Tx) =>
  tx
    .select({ id: consultaAuditoria.id, casoId: consultaAuditoria.casoId, retencaoAte: consultaAuditoria.retencaoAte })
    .from(consultaAuditoria)
    .where(lt(consultaAuditoria.retencaoAte, new Date()));
