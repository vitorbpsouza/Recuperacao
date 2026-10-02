import { api } from '../api/client';
import type { CamilaFinancialRecommendation } from '../types';

/**
 * Prioridades de repasse sugeridas pela CAMILA.
 *
 * A análise roda no servidor (`POST /api/camila/prioridades`): a chave do Gemini
 * não pode existir no bundle do cliente, e os repasses pendentes vêm do banco,
 * não de mocks passados pela tela.
 *
 * Não há fallback simulado. A versão anterior devolvia `riscoCancelamento` com
 * `Math.random()` quando a chave faltava — um número inventado numa tela de
 * decisão financeira é pior que erro visível. Em falha, isto lança e a tela
 * mostra o problema.
 */
export const analyzeFinancialPriorities = async (): Promise<CamilaFinancialRecommendation[]> =>
  api.post<CamilaFinancialRecommendation[]>('/camila/prioridades');
