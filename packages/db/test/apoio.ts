import { sql } from 'drizzle-orm';

import type { Banco } from '../src/cliente.ts';
import { comContexto, type Contexto, type Tx } from '../src/contexto.ts';
import { erroDoBanco } from '../src/erros.ts';
import { abrirBancoDeTeste } from '../src/teste.ts';

/** Banco limpo e migrado para um arquivo de teste (PGlite, ou Postgres com TEST_DATABASE_URL). */
export const bancoDeTeste = (): Promise<Banco> => abrirBancoDeTeste();

/** Executa SQL bruto como a API executaria: papel recredita_app, com contexto. */
export const comoApp = <T>(banco: Banco, ctx: Contexto, fn: (tx: Tx) => Promise<T>) =>
  comContexto(banco.db, ctx, fn);

/**
 * Linhas de uma consulta crua dentro de uma transação Drizzle. Em falha,
 * relança o erro do Postgres — é a mensagem dele que os testes conferem.
 */
export const linhas = async <T = Record<string, unknown>>(tx: Tx, consulta: string): Promise<T[]> => {
  try {
    const r = (await tx.execute(sql.raw(consulta))) as unknown as { rows: T[] };
    return r.rows;
  } catch (e) {
    const doBanco = erroDoBanco(e);
    throw doBanco ? Object.assign(new Error(doBanco.message), doBanco) : e;
  }
};
