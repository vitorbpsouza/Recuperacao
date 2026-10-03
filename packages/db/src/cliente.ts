import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import pg from 'pg';

import * as schema from './schema.ts';

export type Esquema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Esquema>;

/** Operações de uma conexão crua: migrações e SQL de várias instruções. */
export interface Executor {
  /** SQL de várias instruções, sem parâmetros. */
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** Conexão crua, para o que o Drizzle não cobre. */
export interface ConexaoBruta extends Executor {
  /** Executa `fn` numa conexão exclusiva — necessário para BEGIN/COMMIT com pool. */
  exclusiva<T>(fn: (c: Executor) => Promise<T>): Promise<T>;
  /**
   * LISTEN num canal do Postgres. `aoReceber` recebe o payload de cada NOTIFY
   * confirmado. Devolve a função que para de escutar.
   */
  ouvir(canal: string, aoReceber: (payload: string) => void): Promise<() => Promise<void>>;
  fechar(): Promise<void>;
}

const CANAL_VALIDO = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * LISTEN numa conexão própria, fora do pool: a conexão fica presa ao canal
 * enquanto a API estiver no ar. Caiu (restart do banco, rede), reconecta com
 * espera crescente — sem isso, o tempo real morreria calado.
 */
const ouvirNoServidor = async (url: string, canal: string, aoReceber: (payload: string) => void) => {
  let cliente: pg.Client | null = null;
  let parado = false;
  let espera = 1_000;

  const conectar = async (): Promise<void> => {
    const c = new pg.Client({ connectionString: url });
    c.on('notification', (n) => {
      if (n.channel === canal && n.payload !== undefined) aoReceber(n.payload);
    });
    c.on('error', () => {
      void c.end().catch(() => undefined);
      if (cliente === c) cliente = null;
      if (!parado) setTimeout(() => void conectar().catch(() => undefined), espera);
      espera = Math.min(espera * 2, 30_000);
    });
    await c.connect();
    await c.query(`listen ${canal}`);
    cliente = c;
    espera = 1_000;
  };

  await conectar();
  return async () => {
    parado = true;
    await cliente?.end().catch(() => undefined);
  };
};

export interface Banco {
  db: Db;
  bruta: ConexaoBruta;
  tipo: 'pglite' | 'postgres';
}

export interface OpcoesBanco {
  /** `postgres://…` — usa um servidor Postgres. Sem isto, usa PGlite. */
  url?: string;
  /** Diretório de dados do PGlite. `null` = em memória. */
  diretorio?: string | null;
}

/**
 * Diretório padrão do PGlite em desenvolvimento.
 *
 * Fica fora do repositório de propósito: o banco de dev contém dado pessoal
 * sintético e muitos arquivos pequenos — nada disso deve ir para o git nem
 * para a sincronização do OneDrive, que trava arquivos em uso.
 */
export const DIRETORIO_DEV = join(homedir(), '.recredita', 'pglite-dev');

/**
 * Abre o banco.
 *
 * Com `url`, conecta num Postgres de servidor (staging e produção). Sem `url`,
 * usa PGlite: o mesmo Postgres compilado para WASM, rodando no processo.
 * Assim dev e testes não dependem de Docker, e as constraints, triggers e
 * políticas de RLS testadas são as mesmas que valem em produção.
 */
export const abrirBanco = async (opcoes: OpcoesBanco = {}): Promise<Banco> => {
  const url = opcoes.url;
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    const executorDe = (c: pg.Pool | pg.PoolClient): Executor => ({
      exec: async (sql) => {
        await c.query(sql);
      },
      query: async <T>(sql: string, params?: unknown[]) =>
        (await c.query(sql, params as unknown[])).rows as T[],
    });
    return {
      tipo: 'postgres',
      db: drizzleNodePg(pool, { schema }) as unknown as Db,
      bruta: {
        ...executorDe(pool),
        exclusiva: async (fn) => {
          const cliente = await pool.connect();
          try {
            return await fn(executorDe(cliente));
          } finally {
            cliente.release();
          }
        },
        ouvir: (canal, aoReceber) => {
          if (!CANAL_VALIDO.test(canal)) throw new Error(`canal inválido: ${canal}`);
          return ouvirNoServidor(url, canal, aoReceber);
        },
        fechar: () => pool.end(),
      },
    };
  }

  // O PGlite cria a pasta de dados, mas não as pastas acima dela.
  if (opcoes.diretorio) await mkdir(opcoes.diretorio, { recursive: true });
  const pglite = new PGlite(opcoes.diretorio ?? undefined);
  await pglite.waitReady;
  const executor: Executor = {
    exec: async (sql) => {
      await pglite.exec(sql);
    },
    query: async <T>(sql: string, params?: unknown[]) =>
      (await pglite.query<T>(sql, params)).rows,
  };
  return {
    tipo: 'pglite',
    db: drizzlePglite(pglite, { schema }) as unknown as Db,
    bruta: {
      ...executor,
      // PGlite é uma conexão só: toda execução já é exclusiva.
      exclusiva: (fn) => fn(executor),
      ouvir: async (canal, aoReceber) => {
        if (!CANAL_VALIDO.test(canal)) throw new Error(`canal inválido: ${canal}`);
        const parar = await pglite.listen(canal, aoReceber);
        return async () => {
          if (!pglite.closed) await parar();
        };
      },
      fechar: () => pglite.close(),
    },
  };
};

/**
 * Abre o banco a partir do ambiente: `DATABASE_URL` ou PGlite em `PGLITE_DIR`.
 *
 * Em produção não há PGlite: sem `DATABASE_URL`, uma migração ou criação de
 * usuário "funcionaria" num banco efêmero dentro do container e sumiria.
 */
export const abrirBancoDoAmbiente = (): Promise<Banco> => {
  if (process.env.DATABASE_URL) return abrirBanco({ url: process.env.DATABASE_URL });
  if (process.env.NODE_ENV === 'production') {
    return Promise.reject(new Error('DATABASE_URL é obrigatória em produção'));
  }
  return abrirBanco({ diretorio: process.env.PGLITE_DIR ?? DIRETORIO_DEV });
};
