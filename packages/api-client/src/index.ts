/**
 * Cliente tipado da API, gerado do OpenAPI.
 *
 *   pnpm --filter @workspace/api openapi && pnpm --filter @workspace/api-client gerar
 *
 * A sessão vive num cookie httpOnly que o script não lê. O token CSRF chega no
 * login e em /auth/eu, fica só em memória e volta no cabeçalho X-CSRF-Token de
 * toda requisição que altera dado.
 */
import createClient, { type Middleware } from 'openapi-fetch';

import type { components, paths } from './esquema.ts';

export type { components, paths };
export type Esquemas = components['schemas'];

/** Disparado quando o servidor rejeita a sessão, para o app voltar ao login. */
export const EVENTO_SESSAO_EXPIRADA = 'recredita:sessao-expirada';

let csrfToken: string | null = null;

export const definirCsrf = (token: string | null) => {
  csrfToken = token;
};

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ROTAS_DE_SESSAO = new Set(['/api/auth/login', '/api/auth/eu']);

const sessao: Middleware = {
  onRequest({ request }) {
    if (!METODOS_SEGUROS.has(request.method) && csrfToken) {
      request.headers.set('X-CSRF-Token', csrfToken);
    }
    return request;
  },
  onResponse({ request, response }) {
    // 401 numa rota de dados significa sessão morta: avisar aqui evita que cada
    // tela precise lembrar de tratar isso. Login e /auth/eu ficam de fora — o
    // 401 deles é a resposta esperada para "sem sessão", não uma expiração.
    const caminho = new URL(request.url).pathname;
    if (response.status === 401 && !ROTAS_DE_SESSAO.has(caminho) && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
    }
    return response;
  },
};

export const criarCliente = (baseUrl = '') => {
  const cliente = createClient<paths>({ baseUrl, credentials: 'same-origin' });
  cliente.use(sessao);
  return cliente;
};

export const api = criarCliente();

/** Erro com o status HTTP e a mensagem do servidor — que é mais precisa que qualquer tradução local. */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly corpo?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

/**
 * Desembrulha a resposta do openapi-fetch: devolve o dado ou lança ErroApi.
 * Use nas queries e mutações para que o erro chegue à tela em vez de virar
 * lista vazia.
 */
export const exigir = async <T>(
  chamada: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> => {
  const { data, error, response } = await chamada;
  if (response.ok) return data as T;
  const mensagem =
    typeof error === 'object' && error !== null && 'erro' in error && typeof error.erro === 'string'
      ? error.erro
      : `falha ${response.status}`;
  throw new ErroApi(response.status, mensagem, error);
};
