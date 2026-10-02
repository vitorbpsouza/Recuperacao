import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConexaoBruta } from './cliente.ts';

/**
 * Pasta das migrações. No código-fonte, ao lado de `src/`; no bundle da API
 * (onde `import.meta.url` aponta para `dist/`), informada por MIGRACOES_DIR.
 */
export const PASTA_MIGRACOES =
  process.env.MIGRACOES_DIR ?? fileURLToPath(new URL('../migrations/', import.meta.url));

// CRLF vs LF muda conforme o checkout (Windows ou CI); o conteúdo é o mesmo.
const checksum = (sql: string) =>
  createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

/**
 * Aplica, em ordem, as migrações SQL ainda não aplicadas.
 *
 * Cada arquivo roda numa transação própria. Uma migração já aplicada não pode
 * mudar: se o checksum divergir, o processo para em vez de seguir com um banco
 * que não corresponde ao código.
 */
export const migrar = async (
  bruta: ConexaoBruta,
  pasta: string = PASTA_MIGRACOES,
): Promise<string[]> => {
  await bruta.exec(`
    create table if not exists _migracao (
      nome        text primary key,
      checksum    text not null,
      aplicada_em timestamptz not null default now()
    )
  `);
  const aplicadas = new Map(
    (await bruta.query<{ nome: string; checksum: string }>('select nome, checksum from _migracao')).map(
      (m) => [m.nome, m.checksum],
    ),
  );

  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith('.sql')).sort();
  const novas: string[] = [];

  for (const arquivo of arquivos) {
    const sql = await readFile(join(pasta, arquivo), 'utf8');
    const soma = checksum(sql);
    const anterior = aplicadas.get(arquivo);
    if (anterior !== undefined) {
      if (anterior !== soma) {
        throw new Error(`migração ${arquivo} foi alterada depois de aplicada; crie uma nova migração`);
      }
      continue;
    }

    await bruta.exclusiva(async (c) => {
      await c.exec('begin');
      try {
        await c.exec(sql);
        await c.query('insert into _migracao (nome, checksum) values ($1, $2)', [arquivo, soma]);
        await c.exec('commit');
      } catch (e) {
        await c.exec('rollback');
        throw new Error(`falha ao aplicar ${arquivo}: ${(e as Error).message}`);
      }
    });
    novas.push(arquivo);
  }
  return novas;
};
