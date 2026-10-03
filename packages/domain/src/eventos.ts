import type { OrigemCaso } from './casos.ts';

/**
 * Evento da linha do tempo entregue ao vivo (SSE). É o payload do NOTIFY da
 * migração 0012, sem o tenant: só o necessário para a tela saber o que
 * recarregar e se deve avisar. Nada de devedor, dívida ou endereço.
 */
export interface EventoAoVivo {
  id: number;
  casoId: string;
  origem: OrigemCaso;
  placa: string;
  tipo: string;
  statusDe: string | null;
  statusPara: string | null;
  /** Quem causou; nulo quando foi o sistema (prazo) ou uma carga. */
  usuarioId: string | null;
  /** Em `prazo_vencido` e na volta à fila por aceite vencido. */
  prazo: string | null;
  automatico: boolean;
  ocorridoEm: string;
}

/** O payload como sai do banco, com o tenant. */
export type EventoDoBanco = EventoAoVivo & { tenantId: string };

/**
 * Quem pode receber o evento: mesmo tenant e canal visível na sessão. É o
 * mesmo corte do RLS — a fronteira entre os planos vale também ao vivo.
 */
export const eventoVisivel = (
  evento: Pick<EventoDoBanco, 'tenantId' | 'origem'>,
  sessao: { tenantId: string; canais: readonly OrigemCaso[] },
): boolean => evento.tenantId === sessao.tenantId && sessao.canais.includes(evento.origem);
