/**
 * Migração 0011: o que o leitor antigo deu à pessoa por engano ("IMPORTAÇÃO",
 * "ℹ OUTROS ℹ") volta para o veículo, e todo campo novo já guardado vira
 * campo dinâmico.
 */
import { cp, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { abrirBanco, type Banco } from '../src/cliente.ts';
import { migrar, PASTA_MIGRACOES } from '../src/migrar.ts';
import { semear } from '../src/seed.ts';

let banco: Banco;
let pasta: string;

beforeAll(async () => {
  // Só até a 0010: o estado do banco antes desta migração.
  pasta = await mkdtemp(join(tmpdir(), 'recredita-migracoes-'));
  for (const f of (await readdir(PASTA_MIGRACOES)).filter((x) => x < '0011')) await cp(join(PASTA_MIGRACOES, f), join(pasta, f));
  banco = await abrirBanco({ diretorio: null });
  await migrar(banco.bruta, pasta);
  await semear(banco.db);
  await banco.bruta.exec(`
    select set_config('app.tenant_id', 'recredita', false);
    insert into pessoa (id, tenant_id, origem, nome) values ('p1', 'recredita', 'plataforma_credor', 'PESSOA FICTICIA');
    insert into relatorio_colado (tenant_id, caso_id, texto, sha256) values ('recredita', 'caso-a-001', 'x', repeat('a', 64));
    insert into dado_extra (tenant_id, caso_id, relatorio_id, entidade, pessoa_id, secao, chave, rotulo, valor, sensivel, novo) values
      ('recredita', 'caso-a-001', 1, 'pessoa', 'p1', 'ℹ OUTROS ℹ', 'ℹ outros ℹ > financeira', 'Financeira', 'BANCO FICTICIO', false, true),
      ('recredita', 'caso-a-001', 1, 'pessoa', 'p1', 'IMPORTAÇÃO', 'importacao > importador', 'Importador', 'INEXISTENTE', false, true),
      ('recredita', 'caso-a-001', 1, 'pessoa', 'p1', 'DADOS BÁSICOS', 'dados basicos > signo', 'Signo', 'CAPRICORNIO', false, true),
      ('recredita', 'caso-a-001', 1, 'pessoa', 'p1', 'CREDIT ANALYTICS', 'credit analytics > fintech', 'Fintech', 'True', true, false);
  `);
  await cp(join(PASTA_MIGRACOES, '0011_campos_dinamicos.sql'), join(pasta, '0011_campos_dinamicos.sql'));
  await migrar(banco.bruta, pasta);
});
afterAll(() => banco.bruta.fechar());

describe('migração dos campos dinâmicos', () => {
  it('devolve ao veículo o que era do veículo', async () => {
    const linhas = await banco.bruta.query<{ secao: string; chave: string; entidade: string; pessoa_id: string | null }>(
      'select secao, chave, entidade, pessoa_id from dado_extra order by id',
    );
    expect(linhas).toEqual([
      { secao: 'OUTROS', chave: 'outros > financeira', entidade: 'veiculo', pessoa_id: null },
      { secao: 'IMPORTAÇÃO', chave: 'importacao > importador', entidade: 'veiculo', pessoa_id: null },
      { secao: 'DADOS BÁSICOS', chave: 'dados basicos > signo', entidade: 'pessoa', pessoa_id: 'p1' },
      { secao: 'CREDIT ANALYTICS', chave: 'credit analytics > fintech', entidade: 'pessoa', pessoa_id: 'p1' },
    ]);
  });

  it('promove todo campo novo não sensível', async () => {
    const campos = await banco.bruta.query<{ entidade: string; rotulo: string }>('select entidade, rotulo from campo_dinamico order by rotulo');
    expect(campos).toEqual([
      { entidade: 'veiculo', rotulo: 'Financeira' },
      { entidade: 'veiculo', rotulo: 'Importador' },
      { entidade: 'pessoa', rotulo: 'Signo' },
    ]);
  });
});
