import { useSyncExternalStore } from 'react';

const consulta = '(prefers-reduced-motion: reduce)';

const assinar = (aoMudar: () => void) => {
  const mq = window.matchMedia(consulta);
  mq.addEventListener('change', aoMudar);
  return () => mq.removeEventListener('change', aoMudar);
};

/**
 * Preferência do sistema por menos movimento. O CSS já desliga as animações
 * de transição; isto cobre as animações feitas em JavaScript (gráficos).
 */
export const useMovimentoReduzido = (): boolean =>
  useSyncExternalStore(
    assinar,
    () => window.matchMedia(consulta).matches,
    () => false,
  );
