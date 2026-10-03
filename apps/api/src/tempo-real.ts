/**
 * Tempo real: um LISTEN por processo no canal `caso_evento` (migração 0012),
 * repassado em memória a cada conexão SSE aberta. Com várias instâncias, cada
 * uma escuta o banco — o NOTIFY chega a todas.
 */
import type { ConexaoBruta } from '@workspace/db';
import type { EventoDoBanco } from '@workspace/domain';

export interface Barramento {
  /** Recebe cada evento confirmado no banco. Devolve a função que cancela. */
  assinar(fn: (evento: EventoDoBanco) => void): () => void;
  fechar(): Promise<void>;
}

export const criarBarramento = async (
  bruta: Pick<ConexaoBruta, 'ouvir'>,
  aoFalhar: (erro: unknown) => void = () => undefined,
): Promise<Barramento> => {
  const ouvintes = new Set<(evento: EventoDoBanco) => void>();
  const parar = await bruta.ouvir('caso_evento', (payload) => {
    let evento: EventoDoBanco;
    try {
      evento = JSON.parse(payload) as EventoDoBanco;
    } catch (erro) {
      aoFalhar(erro);
      return;
    }
    for (const fn of ouvintes) {
      try {
        fn(evento);
      } catch (erro) {
        aoFalhar(erro);
      }
    }
  });
  return {
    assinar: (fn) => {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    fechar: async () => {
      ouvintes.clear();
      await parar();
    },
  };
};
