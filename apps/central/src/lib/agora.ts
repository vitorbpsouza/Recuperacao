import { useSyncExternalStore } from 'react';

const INTERVALO_MS = 60_000;
let instante = Date.now();
const ouvintes = new Set<() => void>();
let relogio: ReturnType<typeof setInterval> | null = null;

const assinar = (aoMudar: () => void) => {
  ouvintes.add(aoMudar);
  // Um relógio só para a tela inteira, enquanto houver quem o observe. Ao
  // religar, o instante guardado pode ter minutos: volta a valer o de agora.
  if (!relogio) {
    instante = Date.now();
    relogio = setInterval(() => {
      instante = Date.now();
      ouvintes.forEach((o) => o());
    }, INTERVALO_MS);
  }
  return () => {
    ouvintes.delete(aoMudar);
    if (ouvintes.size === 0 && relogio) {
      clearInterval(relogio);
      relogio = null;
    }
  };
};

/**
 * O instante atual, atualizado a cada minuto. Ler `Date.now()` durante a
 * renderização deixa a tela impura (cada render dá um resultado); este hook
 * dá um valor estável que avança sozinho — prazos se atualizam sem recarregar.
 */
export const useAgora = (): number => useSyncExternalStore(assinar, () => instante, () => instante);
