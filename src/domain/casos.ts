/**
 * Fronteira de finalidade entre os dois canais de operação.
 *
 * Plano A (recuperação): o caso vem da plataforma do credor. O dado do devedor
 * chega sob finalidade travada pelo Termo de Uso — localizar e entregar o bem.
 * Plano B (aquisição): o caso vem de lead próprio. Aqui você é controlador e
 * negocia direto com o devedor, com quitação e anuência do credor.
 *
 * A regra que este arquivo existe para impor: um caso de origem `plataforma_credor`
 * NUNCA pode ser tratado com finalidade `aquisicao_com_quitacao`. A separação é
 * estrutural (tipo + CHECK no banco), não procedimental.
 */

/** De onde o caso entrou. Define o que se pode fazer com ele. */
export type OrigemCaso =
  | 'plataforma_credor' // Plano A — finalidade travada pelo ToS da plataforma.
  | 'lead_proprio'; // Plano B — inbound, indicação ou parceria. Origem independente.

/** O que é permitido fazer. Derivado da origem — nunca definido à mão. */
export type FinalidadePermitida =
  | 'recuperacao_para_credor' // localizar e entregar ao credor
  | 'aquisicao_com_quitacao'; // negociar com devedor, quitar, adquirir

/** Mapa origem → finalidade. Única fonte de verdade da fronteira. */
const FINALIDADE_POR_ORIGEM: Record<OrigemCaso, FinalidadePermitida> = {
  plataforma_credor: 'recuperacao_para_credor',
  lead_proprio: 'aquisicao_com_quitacao',
};

export const finalidadeDe = (origem: OrigemCaso): FinalidadePermitida =>
  FINALIDADE_POR_ORIGEM[origem];

/**
 * De onde o ativo foi suprido. Substitui o `Banco` direto do modelo atual:
 * hoje a relação é com a plataforma, não com o credor.
 */
export interface FonteAtivo {
  id: string;
  nome: string;
  tipo: 'Plataforma' | 'Credor Direto' | 'Lead Próprio';
  /** Como o ativo entra. `Manual` e `Exportação` respeitam qualquer ToS; `API` só se oferecida. */
  ingestao: 'Manual' | 'Exportação' | 'API';
  /** Limite de finalidade que esta fonte impõe por contrato ou ToS. */
  finalidadePermitida: FinalidadePermitida;
  termoDeUsoUrl?: string;
  credorNome?: string;
  ativa: boolean;
}

/**
 * Procedência de uma consulta a bureau. Registra a *origem* do dado em vez de
 * omiti-la: o ônus de demonstrar base legal é de quem trata (LGPD art. 6, IX e 37).
 * Dado sem procedência é dado sem amparo — e reprova em due diligence.
 */
export interface ConsultaAuditoria {
  id: string;
  casoId: string;
  origemCaso: OrigemCaso;
  finalidade: FinalidadePermitida;
  bureauId: string;
  /** Contrato que ampara a consulta. Sem isto, a consulta não deve ocorrer. */
  contratoFornecedorId: string;
  baseLegal:
    | 'execucao_contrato'
    | 'legitimo_interesse'
    | 'obrigacao_legal'
    | 'consentimento';
  /** Por que esta consulta, neste caso. Texto livre, obrigatório, auditável. */
  justificativa: string;
  operadorId: string;
  consultadoEm: string;
  /** Os campos retornados, não os valores — a auditoria não precisa replicar o dado. */
  camposRetornados: string[];
  retencaoAte: string;
  custo: number;
}

/**
 * Mesma placa presente nos dois canais. É o ponto em que a fronteira é testada:
 * sem registro, é indistinguível de desvio de finalidade. Detectar e resolver
 * explicitamente é o que torna a operação defensável.
 */
export interface ColisaoOrigem {
  id: string;
  placa: string;
  casoPlataformaId: string;
  leadProprioId: string;
  detectadoEm: string;
  resolucao: 'lead_descartado' | 'prosseguiu_com_origem_independente';
  /** Obrigatória em qualquer resolução. */
  justificativa: string;
  /** Como se prova que o lead não nasceu do dado da plataforma. Exigida para prosseguir. */
  evidenciaIndependente?: string;
  operadorId: string;
}

/** Caso do Plano A: recuperação para o credor. */
export interface CasoRecuperacao {
  origem: 'plataforma_credor';
  finalidade: 'recuperacao_para_credor';
  id: string;
  ativoId: string;
  fonteId: string;
  recuperadorId?: string;
  prazoVinculo: string;
  prazoMaximo: string;
}

/** Caso do Plano B: aquisição via quitação, com anuência do credor. */
export interface CasoAquisicao {
  origem: 'lead_proprio';
  finalidade: 'aquisicao_com_quitacao';
  id: string;
  ativoId: string;
  /** Como o lead chegou. É a evidência de origem independente — não é opcional. */
  canalLead: 'Inbound Site' | 'WhatsApp' | 'Indicação' | 'Parceria' | 'Anúncio';
  evidenciaLead: string;
  saldoDevedor: number;
  valorQuitacaoNegociado?: number;
  valorPagoAoDevedor?: number;
  /** Sem anuência não há transferência: o bem é do credor (CC art. 1.361). */
  anuenciaCredor: 'Pendente' | 'Obtida' | 'Negada';
  /** Restrição judicial averbada bloqueia transferência e precisa cair na origem. */
  renajudAtivo: boolean;
  gravameBaixado: boolean;
}

export type Caso = CasoRecuperacao | CasoAquisicao;

/**
 * Cada canal tem seu próprio ciclo de vida. Recuperação termina entregando o
 * bem ao credor; aquisição termina com a transferência no nome do comprador.
 * Vocabulários separados evitam que uma tela ofereça "Recuperado" para um caso
 * de aquisição — estado que não significa nada ali.
 */
export const STATUS_RECUPERACAO = [
  'Recebido',
  'Em Enriquecimento',
  'Enriquecido',
  'Em Análise',
  'Distribuído',
  'Aceito',
  'Em Campo',
  'Localizado',
  'Recuperado',
  'Encerrado',
  'Removido pelo Banco',
] as const;

export const STATUS_AQUISICAO = [
  'Lead Recebido',
  'Em Contato',
  'Proposta Enviada',
  'Negociando com Credor',
  'Quitação Aprovada',
  'Quitado',
  'Transferido',
  'Encerrado',
  'Desistiu',
] as const;

export type StatusRecuperacao = (typeof STATUS_RECUPERACAO)[number];
export type StatusAquisicao = (typeof STATUS_AQUISICAO)[number];
export type StatusCaso = StatusRecuperacao | StatusAquisicao;

export const statusValidos = (finalidade: FinalidadePermitida): readonly StatusCaso[] =>
  finalidade === 'recuperacao_para_credor' ? STATUS_RECUPERACAO : STATUS_AQUISICAO;

export const statusPertenceA = (finalidade: FinalidadePermitida, status: string): boolean =>
  (statusValidos(finalidade) as readonly string[]).includes(status);

/**
 * Guarda da fronteira. Chamar antes de qualquer ação de aquisição.
 * Impede em runtime o que o tipo já impede em compilação.
 */
export const podeAdquirir = (caso: Caso): caso is CasoAquisicao =>
  caso.origem === 'lead_proprio' &&
  finalidadeDe(caso.origem) === 'aquisicao_com_quitacao';

/** Pré-condições jurídicas da transferência. Todas obrigatórias. */
export const podeTransferir = (caso: CasoAquisicao): boolean =>
  caso.anuenciaCredor === 'Obtida' && !caso.renajudAtivo && caso.gravameBaixado;
