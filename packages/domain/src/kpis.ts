/**
 * Fórmulas dos indicadores. Um lugar só: painel, relatórios e Portal do
 * Credor calculam igual, e uma mudança de definição muda em todos.
 *
 * Sem dado, o indicador é `null` — nunca zero nem estimativa. "Não há casos"
 * e "taxa de 0%" são afirmações diferentes.
 */
import type { StatusAquisicao, StatusRecuperacao } from './casos.ts';

/**
 * Etapas do Plano A.
 *
 * Retomado e Em Custódia já contam como recuperação: o bem está sob a guarda
 * do credor, ainda que corra o prazo de purga. Curado é o outro sucesso — o
 * credor recebeu, com ou sem retomada. Recall por outro motivo e "não
 * localizado" encerram sem êxito, o que não é o mesmo que perda do credor.
 */
export const ETAPAS_RECUPERACAO = {
  preparo: ['Recebido', 'Em Enriquecimento', 'Enriquecido', 'Em Análise', 'Pronto para Campo'],
  campo: ['Distribuído', 'Aceito', 'Em Campo', 'Localizado'],
  retomados: ['Retomado', 'Em Custódia', 'Entregue ao Credor'],
  curados: ['Curado'],
  semExito: ['Não Localizado', 'Removido pelo Banco', 'Encerrado'],
  suspensos: ['Suspenso'],
} as const satisfies Record<string, readonly StatusRecuperacao[]>;

export const ETAPAS_AQUISICAO = {
  entrada: ['Lead Recebido', 'Em Contato'],
  negociacao: ['Proposta Enviada', 'Negociando com Credor', 'Quitação Aprovada'],
  exito: ['Quitado', 'Transferido'],
  perda: ['Desistiu', 'Encerrado'],
} as const satisfies Record<string, readonly StatusAquisicao[]>;

const contar = (casos: readonly { status: string }[], estados: readonly string[]) =>
  casos.filter((c) => estados.includes(c.status)).length;

export const resumoRecuperacao = (casos: readonly { status: string }[]) => {
  const total = casos.length;
  const retomados = contar(casos, ETAPAS_RECUPERACAO.retomados);
  const curados = contar(casos, ETAPAS_RECUPERACAO.curados);
  return {
    total,
    preparo: contar(casos, ETAPAS_RECUPERACAO.preparo),
    campo: contar(casos, ETAPAS_RECUPERACAO.campo),
    retomados,
    curados,
    semExito: contar(casos, ETAPAS_RECUPERACAO.semExito),
    suspensos: contar(casos, ETAPAS_RECUPERACAO.suspensos),
    /** Bens retomados (apreensão ou entrega voluntária) ÷ casos na carteira. */
    taxaRecuperacao: total > 0 ? retomados / total : null,
    /** Dívidas pagas ou acordadas durante o caso ÷ casos na carteira. */
    taxaCura: total > 0 ? curados / total : null,
  };
};

export const resumoAquisicao = (casos: readonly { status: string; saldoDevedor: number | null }[]) => {
  const total = casos.length;
  const emNegociacao = casos.filter((c) => (ETAPAS_AQUISICAO.negociacao as readonly string[]).includes(c.status));
  const exito = contar(casos, ETAPAS_AQUISICAO.exito);
  return {
    total,
    entrada: contar(casos, ETAPAS_AQUISICAO.entrada),
    negociacao: emNegociacao.length,
    exito,
    perda: contar(casos, ETAPAS_AQUISICAO.perda),
    /** Saldo devedor somado dos casos em negociação: o capital que a carteira pode exigir. */
    saldoEmNegociacao: emNegociacao.length
      ? emNegociacao.reduce((soma, c) => soma + (c.saldoDevedor ?? 0), 0)
      : null,
    /** Quitados ou transferidos ÷ leads recebidos. */
    taxaConversao: total > 0 ? exito / total : null,
  };
};

/** Quantos casos em cada status, na ordem do vocabulário (para gráficos). */
export const casosPorStatus = (casos: readonly { status: string }[], vocabulario: readonly string[]) =>
  vocabulario.map((status) => ({ status, quantidade: casos.filter((c) => c.status === status).length }));
