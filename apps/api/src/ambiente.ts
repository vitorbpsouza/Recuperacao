import { randomBytes } from 'node:crypto';

import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Postgres de servidor. Ausente: PGlite em PGLITE_DIR (só fora de produção). */
  DATABASE_URL: z.string().url().optional(),
  PGLITE_DIR: z.string().optional(),
  /** Build da central (`apps/central/dist`). Presente: a API o serve na mesma origem. */
  CENTRAL_DIR: z.string().optional(),
  /**
   * Segredo do token CSRF. Em produção é obrigatório: sem ele, cada instância
   * do Cloud Run geraria o seu e um token emitido por uma não valeria na outra.
   */
  SEGREDO_SESSAO: z.string().min(32).optional(),
  /**
   * Chave que cifra as credenciais das integrações (API Brasil, Evolution) no
   * banco. Trocá-la torna as credenciais guardadas ilegíveis: cadastre de novo.
   * Ausente em produção: derivada do SEGREDO_SESSAO.
   */
  CHAVE_SEGREDOS: z.string().min(32).optional(),
  /** Endereço público da API (https://…), para montar a URL do webhook da Evolution. */
  URL_PUBLICA: z.string().url().optional(),
  // CAMILA: Vertex AI quando houver projeto; chave do Gemini só em desenvolvimento.
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default('southamerica-east1'),
  GEMINI_API_KEY: z.string().optional(),
  CAMILA_MODELO: z.string().default('gemini-3-flash-preview'),
});

export type Ambiente = z.infer<typeof esquema> & { SEGREDO_SESSAO: string; CHAVE_SEGREDOS: string };

/** Lê e valida o ambiente. Falha alto em produção quando falta o que é obrigatório. */
export const lerAmbiente = (fonte: NodeJS.ProcessEnv = process.env): Ambiente => {
  const env = esquema.parse(fonte);
  if (env.NODE_ENV === 'production') {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatória em produção');
    if (!env.SEGREDO_SESSAO) throw new Error('SEGREDO_SESSAO é obrigatório em produção');
  }
  return {
    ...env,
    // Fora de produção, um segredo efêmero basta: o cliente busca um token
    // CSRF novo em /api/auth/eu a cada carga da página.
    SEGREDO_SESSAO: env.SEGREDO_SESSAO ?? randomBytes(32).toString('hex'),
    // Fora de produção, uma chave fixa: as credenciais de teste sobrevivem a reinícios da API.
    CHAVE_SEGREDOS:
      env.CHAVE_SEGREDOS ?? (env.NODE_ENV === 'production' ? `${env.SEGREDO_SESSAO}:integracoes` : 'recredita-desenvolvimento-local-nao-usar-em-producao'),
  };
};
