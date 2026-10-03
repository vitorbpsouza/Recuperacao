import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GoogleGenAI } from '@google/genai';
import type { LightMyRequestResponse } from 'fastify';

import { comoDono, semear, TENANT_RECREDITA, type Banco } from '@workspace/db';
import { abrirBancoDeTeste } from '@workspace/db/teste';
import type { OrigemCaso } from '@workspace/domain';

import { lerAmbiente } from '../src/ambiente.ts';
import type { ClienteFipe } from '../src/integracoes/fipe.ts';
import { criarServidor, type Servidor } from '../src/servidor.ts';
import { criarUsuario } from '../src/servicos/usuarios.ts';

export const SENHA = 'senha-bem-longa-123';

/** Tabela FIPE falsa: os testes não dependem da internet nem do limite diário. */
export const FIPE_FALSA: ClienteFipe = {
  marcas: async () => [{ codigo: '26', nome: 'Hyundai' }],
  modelos: async () => [{ codigo: '1286', nome: 'Modelo Teste' }],
  anos: async () => [{ codigo: '2016-1', nome: '2016 Gasolina' }],
  valor: async () => ({ valor: 48900, codigoFipe: '015032-0', mesReferencia: 'outubro de 2026', marca: 'Hyundai', modelo: 'Modelo Teste', anoModelo: 2016 }),
};

const USUARIOS: Array<{ email: string; papel: 'admin' | 'gestor' | 'operador' | 'auditor'; canais: OrigemCaso[] }> = [
  { email: 'admin@teste.local', papel: 'admin', canais: [] },
  { email: 'gestor@teste.local', papel: 'gestor', canais: [] },
  { email: 'opa@teste.local', papel: 'operador', canais: ['plataforma_credor'] },
  { email: 'opb@teste.local', papel: 'operador', canais: ['lead_proprio'] },
  { email: 'auditor@teste.local', papel: 'auditor', canais: [] },
];

/** Chamadas que a API faria para fora (API Brasil, Evolution), com a resposta combinada no teste. */
export const externo = {
  chamadas: [] as { url: string; corpo: unknown; headers: Record<string, string> }[],
  responder: (_url: string, _corpo: unknown): unknown => ({}),
};

const FETCH_FALSO: typeof fetch = async (entrada, init) => {
  const url = String(entrada);
  const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
  externo.chamadas.push({ url, corpo, headers: (init?.headers ?? {}) as Record<string, string> });
  return new Response(JSON.stringify(externo.responder(url, corpo)), { status: 200, headers: { 'content-type': 'application/json' } });
};

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
/** Gemini falso: devolve a leitura de placa que o teste combinar. */
export const iaFalsa = { resposta: {} as Record<string, unknown> };
const IA_FALSA = {
  models: { generateContent: async () => ({ text: JSON.stringify(iaFalsa.resposta) }) },
} as unknown as GoogleGenAI;

export const ambienteDeTeste = async (opcoes: { comIa?: boolean } = {}): Promise<Ambiente & { fotosDir: string }> => {
  const fotosDir = await mkdtemp(join(tmpdir(), 'recredita-fotos-'));
  const banco = await abrirBancoDeTeste();
  await semear(banco.db);
  await comoDono(banco.db, TENANT_RECREDITA.id, async (tx) => {
    for (const u of USUARIOS) {
      await criarUsuario(tx, { ...u, nome: u.email.split('@')[0]!, senha: SENHA });
    }
  });

  const app = await criarServidor({ db: banco.db, ambiente: lerAmbiente({ NODE_ENV: 'test' }), logger: process.env.LOG_TESTE ? { level: 'error' } : false, fipe: FIPE_FALSA, executar: FETCH_FALSO, ia: opcoes.comIa ? IA_FALSA : null, fotosDir });

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
    fotosDir,
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
