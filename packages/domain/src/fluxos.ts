/**
 * Ciclo de vida do caso do Plano A (recuperação para o credor).
 *
 * As transições permitidas ficam aqui e numa tabela do banco
 * (`transicao_recuperacao`); um teste garante que as duas concordam. As
 * guardas — o que precisa estar provado para cada passo — ficam no banco,
 * que é quem recusa: a API devolve os motivos e a tela os mostra.
 *
 * O Plano B ganha a sua máquina de estados na fase 3a.
 */
import type { StatusRecuperacao } from './casos.ts';

/** Como o credor retoma o bem. Definido por caso, conforme o contrato. */
export const RITOS = ['judicial', 'extrajudicial', 'amigavel'] as const;
export type Rito = (typeof RITOS)[number];

export const ROTULO_RITO: Record<Rito, string> = {
  judicial: 'Judicial',
  extrajudicial: 'Extrajudicial',
  amigavel: 'Amigável',
};

/** Como o bem chegou às mãos do credor. */
export const MODALIDADES_RETOMADA = ['apreensao_judicial', 'apreensao_extrajudicial', 'entrega_voluntaria'] as const;
export type ModalidadeRetomada = (typeof MODALIDADES_RETOMADA)[number];

export const ROTULO_MODALIDADE: Record<ModalidadeRetomada, string> = {
  apreensao_judicial: 'Apreensão com mandado judicial',
  apreensao_extrajudicial: 'Apreensão extrajudicial',
  entrega_voluntaria: 'Entrega voluntária',
};

/** Modalidades que cada rito admite. Entrega voluntária cabe em qualquer um. */
export const MODALIDADES_DO_RITO: Record<Rito, readonly ModalidadeRetomada[]> = {
  judicial: ['apreensao_judicial', 'entrega_voluntaria'],
  extrajudicial: ['apreensao_extrajudicial', 'entrega_voluntaria'],
  amigavel: ['entrega_voluntaria'],
};

/** Encerramentos que todo caso ainda aberto admite. */
const SAIDAS: readonly StatusRecuperacao[] = ['Suspenso', 'Curado', 'Removido pelo Banco', 'Encerrado'];

/**
 * Para onde cada status pode ir. "Distribuído" volta a aparecer depois do
 * campo porque redistribuir é passar o caso a outro recuperador.
 */
export const TRANSICOES_RECUPERACAO: Record<StatusRecuperacao, readonly StatusRecuperacao[]> = {
  Recebido: ['Em Enriquecimento', 'Em Análise', ...SAIDAS],
  'Em Enriquecimento': ['Enriquecido', 'Em Análise', ...SAIDAS],
  Enriquecido: ['Em Análise', ...SAIDAS],
  'Em Análise': ['Pronto para Campo', 'Em Enriquecimento', ...SAIDAS],
  'Pronto para Campo': ['Distribuído', 'Em Análise', ...SAIDAS],
  Distribuído: ['Aceito', 'Pronto para Campo', 'Em Análise', ...SAIDAS],
  Aceito: ['Em Campo', 'Distribuído', 'Em Análise', ...SAIDAS],
  'Em Campo': ['Localizado', 'Retomado', 'Distribuído', 'Não Localizado', 'Em Análise', ...SAIDAS],
  Localizado: ['Retomado', 'Em Campo', 'Distribuído', 'Em Análise', ...SAIDAS],
  // Depois da retomada não se suspende: o bem já está sob guarda, e o que
  // falta é a purga correr (devolve ao devedor) ou vencer (entrega ao credor).
  Retomado: ['Em Custódia', 'Entregue ao Credor', 'Curado', 'Removido pelo Banco', 'Encerrado'],
  'Em Custódia': ['Entregue ao Credor', 'Curado', 'Removido pelo Banco', 'Encerrado'],
  Suspenso: ['Em Análise', 'Curado', 'Removido pelo Banco', 'Encerrado'],
  'Entregue ao Credor': [],
  Curado: [],
  'Não Localizado': [],
  'Removido pelo Banco': [],
  Encerrado: [],
};

export const destinosDe = (status: StatusRecuperacao): readonly StatusRecuperacao[] => TRANSICOES_RECUPERACAO[status];

/**
 * Status a partir dos quais o caso vai (ou volta) para um recuperador: pronto
 * para campo, ou já com alguém e precisando passar a outro.
 */
export const STATUS_DISTRIBUIVEIS: readonly StatusRecuperacao[] = (
  Object.keys(TRANSICOES_RECUPERACAO) as StatusRecuperacao[]
).filter((s) => s === 'Distribuído' || TRANSICOES_RECUPERACAO[s].includes('Distribuído'));

export const podeDistribuir = (status: string): boolean => (STATUS_DISTRIBUIVEIS as readonly string[]).includes(status);

export const ehFinal = (status: StatusRecuperacao): boolean => TRANSICOES_RECUPERACAO[status].length === 0;

/** Destinos que só se alcançam com motivo registrado na linha do tempo. */
export const EXIGEM_MOTIVO: readonly StatusRecuperacao[] = [
  'Suspenso',
  'Curado',
  'Removido pelo Banco',
  'Não Localizado',
  'Encerrado',
];

/** Status em que rito e credor ainda podem mudar: antes de o caso ir a campo. */
export const STATUS_DE_PREPARO: readonly StatusRecuperacao[] = [
  'Recebido',
  'Em Enriquecimento',
  'Enriquecido',
  'Em Análise',
];

/** O que o botão diz para levar o caso a cada status. */
export const ACAO_PARA: Record<StatusRecuperacao, string> = {
  Recebido: 'Voltar a recebido',
  'Em Enriquecimento': 'Enriquecer dados',
  Enriquecido: 'Concluir enriquecimento',
  'Em Análise': 'Enviar para análise',
  'Pronto para Campo': 'Habilitar para campo',
  Distribuído: 'Distribuir',
  Aceito: 'Registrar aceite da OS',
  'Em Campo': 'Pôr em campo',
  Localizado: 'Registrar localização',
  Retomado: 'Registrar retomada',
  'Em Custódia': 'Registrar entrada no pátio',
  'Entregue ao Credor': 'Entregar ao credor',
  Curado: 'Registrar cura',
  'Não Localizado': 'Encerrar como não localizado',
  Suspenso: 'Suspender',
  'Removido pelo Banco': 'Registrar recall do credor',
  Encerrado: 'Encerrar',
};
