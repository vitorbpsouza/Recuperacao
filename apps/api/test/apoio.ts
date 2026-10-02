import type { LightMyRequestResponse } from 'fastify';

import { comoDono, semear, TENANT_RECREDITA, type Banco } from '@workspace/db';
import { abrirBancoDeTeste } from '@workspace/db/teste';
import type { OrigemCaso } from '@workspace/domain';

import { lerAmbiente } from '../src/ambiente.ts';
import { criarServidor, type Servidor } from '../src/servidor.ts';
import { criarUsuario } from '../src/servicos/usuarios.ts';

export const SENHA = 'senha-bem-longa-123';

const USUARIOS: Array<{ email: string; papel: 'admin' | 'operador' | 'auditor'; canais: OrigemCaso[] }> = [
  { email: 'admin@teste.local', papel: 'admin', canais: [] },
  { email: 'opa@teste.local', papel: 'operador', canais: ['plataforma_credor'] },
  { email: 'opb@teste.local', papel: 'operador', canais: ['lead_proprio'] },
  { email: 'auditor@teste.local', papel: 'auditor', canais: [] },
];

export interface Sessao {
  cookie: string;
  csrf: string;
}

export interface Ambiente {
  app: Servidor;
  banco: Banco;
  entrar: (email: string, senha?: string) => Promise<Sessao>;
  /** Requisição autenticada: cookie de sessão e, se alterar dado, o token CSRF. */
  chamar: (
    s: Sessao,
    metodo: 'GET' | 'POST' | 'PUT',
    url: string,
    corpo?: unknown,
  ) => Promise<LightMyRequestResponse>;
  fechar: () => Promise<void>;
}

/**
 * API completa com o seed sintético e um usuário de cada papel. Banco em
 * PGlite, ou num Postgres de servidor quando há TEST_DATABASE_URL (CI).
 */
export const ambienteDeTeste = async (): Promise<Ambiente> => {
  const banco = await abrirBancoDeTeste();
  await semear(banco.db);
  await comoDono(banco.db, TENANT_RECREDITA.id, async (tx) => {
    for (const u of USUARIOS) {
      await criarUsuario(tx, { ...u, nome: u.email.split('@')[0]!, senha: SENHA });
    }
  });

  const app = await criarServidor({ db: banco.db, ambiente: lerAmbiente({ NODE_ENV: 'test' }), logger: process.env.LOG_TESTE ? { level: 'error' } : false });

  const entrar = async (email: string, senha = SENHA): Promise<Sessao> => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, senha } });
    if (r.statusCode !== 200) throw new Error(`login de ${email} falhou: ${r.statusCode} ${r.body}`);
    const cookie = r.cookies.find((c) => c.name === 'sessao');
    if (!cookie) throw new Error('login não devolveu cookie de sessão');
    return { cookie: cookie.value, csrf: r.json().usuario.csrfToken };
  };

  const chamar: Ambiente['chamar'] = (s, metodo, url, corpo) =>
    app.inject({
      method: metodo,
      url,
      cookies: { sessao: s.cookie },
      headers: metodo === 'GET' ? {} : { 'x-csrf-token': s.csrf },
      ...(corpo === undefined ? {} : { payload: corpo as object }),
    });

  return {
    app,
    banco,
    entrar,
    chamar,
    fechar: async () => {
      await app.close();
      await banco.bruta.fechar();
    },
  };
};
