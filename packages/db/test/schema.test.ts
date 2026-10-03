/**
 * O schema Drizzle descreve o mesmo banco que as migrações criam.
 *
 * A fonte de verdade é o SQL; o TypeScript só tipa as consultas. Se alguém
 * mudar um sem o outro, este teste falha antes de a consulta falhar em produção.
 * Também confere que o vocabulário de status do domínio é o mesmo que o banco aceita.
 */
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STATUS_AQUISICAO, STATUS_RECUPERACAO } from '@workspace/domain';

import type { Banco } from '../src/cliente.ts';
import * as schema from '../src/schema.ts';
import { TENANT_RECREDITA } from '../src/seed.ts';
import { bancoDeTeste } from './apoio.ts';

let banco: Banco;

beforeAll(async () => {
  banco = await bancoDeTeste();
});
afterAll(() => banco.bruta.fechar());

// Todo export de schema.ts é uma tabela.
const tabelas: PgTable[] = Object.values(schema);

describe('schema Drizzle × migrações', () => {
  it.each(tabelas.map((t) => [getTableConfig(t).name, t] as const))(
    'tabela %s tem as mesmas colunas e nulabilidade',
    async (nome, tabela) => {
      const noBanco = await banco.bruta.query<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = $1`,
        [nome],
      );
      const esperado = Object.fromEntries(noBanco.map((c) => [c.column_name, c.is_nullable === 'NO']));
      const declarado = Object.fromEntries(
        getTableConfig(tabela).columns.map((c) => [c.name, c.notNull]),
      );
      expect(declarado).toEqual(esperado);
    },
  );
});

describe('dado de base', () => {
  it('banco novo, sem seed, já tem as duas fontes (produção não depende do seed)', async () => {
    const fontes = await banco.bruta.query<{ id: string; finalidade: string }>(
      'select id, finalidade_permitida as finalidade from fonte_ativo order by id',
    );
    expect(fontes).toEqual([
      { id: 'fonte-inbound', finalidade: 'aquisicao_com_quitacao' },
      { id: 'fonte-plataforma', finalidade: 'recuperacao_para_credor' },
    ]);
  });

  it('a migração cria o tenant ReCredita igual ao TENANT_RECREDITA do código', async () => {
    const tenants = await banco.bruta.query('select id, nome, sigla from tenant');
    expect(tenants).toEqual([{ ...TENANT_RECREDITA }]);
  });
});

describe('vocabulário de status', () => {
  it('o banco aceita exatamente os status de cada canal do domínio', async () => {
    const [def] = await banco.bruta.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'status_do_canal'`,
    );
    // pg_get_constraintdef devolve "(finalidade = 'x'::text) AND (status = ANY (ARRAY['a'::text, …]))"
    // para cada canal: um bloco por finalidade, com os status entre aspas.
    const blocos = (def?.def ?? '').split("finalidade = '").slice(1);
    const porFinalidade = Object.fromEntries(
      blocos.map((bloco) => {
        const finalidade = bloco.slice(0, bloco.indexOf("'"));
        const status = [...bloco.matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
        return [finalidade, status.sort()];
      }),
    );
    expect(porFinalidade).toEqual({
      recuperacao_para_credor: [...STATUS_RECUPERACAO].sort(),
      aquisicao_com_quitacao: [...STATUS_AQUISICAO].sort(),
    });
  });
});
