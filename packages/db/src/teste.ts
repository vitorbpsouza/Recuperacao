import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { abrirBanco, type Banco } from './cliente.ts';
import { migrar } from './migrar.ts';

const executarNoServidor = async (url: string, sql: string) => {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
};

/**
 * Banco novo e migrado para um arquivo de teste.
 *
 * Sem `TEST_DATABASE_URL`: PGlite em memória. Com ela (o CI aponta para um
 * Postgres de servidor): um banco descartável por arquivo, apagado no
 * `fechar()`. Cada arquivo tem o seu, então rodam em paralelo sem se ver.
 */
export const abrirBancoDeTeste = async (): Promise<Banco> => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const banco = await abrirBanco({ diretorio: null });
    await migrar(banco.bruta);
    return banco;
  }

  // Papel é do cluster, não do banco. Criado aqui, à prova de corrida entre
  // arquivos que migram ao mesmo tempo; a migração só o encontra pronto.
  await executarNoServidor(
    url,
    `do $$ begin create role recredita_app nologin;
       exception when duplicate_object or unique_violation then null; end $$`,
  );
  const nome = `teste_${randomUUID().replaceAll('-', '')}`;
  await executarNoServidor(url, `create database ${nome}`);

  const alvo = new URL(url);
  alvo.pathname = `/${nome}`;
  const banco = await abrirBanco({ url: alvo.toString() });
  await migrar(banco.bruta);
  return {
    ...banco,
    bruta: {
      ...banco.bruta,
      fechar: async () => {
        await banco.bruta.fechar();
        await executarNoServidor(url, `drop database if exists ${nome} with (force)`);
      },
    },
  };
};
