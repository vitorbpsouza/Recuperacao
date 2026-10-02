/** O que interessa de um erro do Postgres, venha ele do `pg` ou do PGlite. */
export interface ErroPostgres {
  /** SQLSTATE: '23514' check, '23505' unique, '23503' FK, 'P0001' raise, '42501' permissão/RLS. */
  code: string;
  message: string;
  constraint?: string;
}

const pareceErroPostgres = (e: unknown): e is ErroPostgres =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as { code?: unknown }).code === 'string' &&
  /^[0-9A-Z]{5}$/.test((e as { code: string }).code) &&
  typeof (e as { message?: unknown }).message === 'string';

/**
 * O erro original do Postgres por trás do invólucro do Drizzle.
 *
 * O Drizzle relança como "Failed query: …" e guarda o erro do banco em
 * `cause`. A mensagem do banco é a explicação mais precisa disponível — é ela
 * que diz qual constraint ou política recusou o dado.
 */
export const erroDoBanco = (e: unknown): ErroPostgres | null => {
  let atual: unknown = e;
  for (let i = 0; i < 5 && atual; i++) {
    if (pareceErroPostgres(atual)) return atual;
    atual = (atual as { cause?: unknown }).cause;
  }
  return null;
};
