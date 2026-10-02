import { sql } from 'drizzle-orm';

import type { OrigemCaso } from '@workspace/domain';

import type { Db } from './cliente.ts';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Quem está agindo. Vem da sessão autenticada — nunca do corpo da requisição. */
export interface Contexto {
  tenantId: string;
  usuarioId: string | null;
  /** Canais que a sessão enxerga. admin e auditor recebem os dois. */
  canais: readonly OrigemCaso[];
}

/**
 * Executa `fn` numa transação com o contexto da sessão aplicado.
 *
 * `set_config(..., true)` e `SET LOCAL ROLE` valem só até o fim da transação:
 * nada vaza para a próxima requisição que reutilizar a conexão do pool. Como
 * `recredita_app` não é dono das tabelas, as políticas de RLS valem — a
 * fronteira entre tenants e entre canais é imposta pelo banco, não pela rota.
 */
export const comContexto = <T>(db: Db, ctx: Contexto, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`
      select set_config('app.tenant_id', ${ctx.tenantId}, true),
             set_config('app.usuario_id', ${ctx.usuarioId ?? ''}, true),
             set_config('app.canais', ${ctx.canais.join(',')}, true)
    `);
    await tx.execute(sql`set local role recredita_app`);
    return fn(tx);
  });

/**
 * Executa `fn` como dono das tabelas, com o tenant definido para os defaults.
 *
 * Fura o RLS por definição: só para seed, migração de dados e jobs internos.
 * Nunca usar em rota que atende requisição.
 */
export const comoDono = <T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
