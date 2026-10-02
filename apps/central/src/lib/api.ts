/**
 * Consultas e mutações da API, prontas para o TanStack Query.
 *
 * Toda consulta usa `exigir`: em falha, o erro sobe até a tela em vez de virar
 * lista vazia — "não foi possível consultar" não pode parecer "nenhum caso".
 */
import { queryOptions } from '@tanstack/react-query';

import { api, definirCsrf, ErroApi, exigir, type Esquemas } from '@workspace/api-client';

export { api, ErroApi, exigir };

export type UsuarioSessao = Esquemas['UsuarioSessao'];
export type Caso = Esquemas['Caso'];
export type Origem = Caso['origem'];

/** Canal na URL (/a, /b) ↔ origem no domínio. */
export type Canal = 'a' | 'b';
export const ORIGEM_DO_CANAL = { a: 'plataforma_credor', b: 'lead_proprio' } as const satisfies Record<Canal, Origem>;
export const CANAL_DA_ORIGEM: Record<Origem, Canal> = { plataforma_credor: 'a', lead_proprio: 'b' };

/**
 * Sessão atual. `null` quando não há sessão — estado esperado, não erro.
 * O token CSRF que vem junto fica só em memória, no cliente da API.
 */
export const sessaoQuery = queryOptions({
  queryKey: ['sessao'],
  queryFn: async (): Promise<UsuarioSessao | null> => {
    const { data, response } = await api.GET('/api/auth/eu');
    if (response.status === 401) return null;
    if (!data) throw new ErroApi(response.status, 'não foi possível verificar a sessão');
    definirCsrf(data.csrfToken);
    return data;
  },
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
});

export const casosQuery = (origem: Origem) =>
  queryOptions({
    queryKey: ['casos', origem],
    queryFn: () => exigir(api.GET('/api/casos', { params: { query: { origem } } })),
  });

export type CasoDetalhe = Esquemas['CasoDetalhe'];
export type EventoCaso = Esquemas['EventoCaso'];
export type Recuperador = Esquemas['Recuperador'];
export type Repasse = Esquemas['Repasse'];
export type Bureau = Esquemas['Bureau'];
export type LinhaAuditoria = Esquemas['LinhaAuditoria'];
export type CustoBureau = Esquemas['CustoBureau'];
export type Colisao = Esquemas['Colisao'];
export type Fonte = Esquemas['Fonte'];
export type UsuarioCriado = Esquemas['UsuarioCriado'];
export type RecomendacaoCamila = Esquemas['RecomendacaoCamila'];

export const casoQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id],
    queryFn: () => exigir(api.GET('/api/casos/{id}', { params: { path: { id } } })),
  });

export const eventosQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'eventos'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/eventos', { params: { path: { id } } })),
  });

export const acessosQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'acessos'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/acessos', { params: { path: { id } } })),
  });

export const podeTransferirQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'pode-transferir'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/pode-transferir', { params: { path: { id } } })),
  });

export const recuperadoresQuery = queryOptions({
  queryKey: ['recuperadores'],
  queryFn: () => exigir(api.GET('/api/recuperadores')),
});

export const repassesQuery = queryOptions({
  queryKey: ['repasses'],
  queryFn: () => exigir(api.GET('/api/repasses')),
});

export const bureausQuery = queryOptions({
  queryKey: ['bureaus'],
  queryFn: () => exigir(api.GET('/api/bureaus')),
});

export const custosBureauQuery = queryOptions({
  queryKey: ['custos', 'bureau'],
  queryFn: () => exigir(api.GET('/api/custos/bureau')),
});

export const auditoriaQuery = queryOptions({
  queryKey: ['auditoria'],
  queryFn: () => exigir(api.GET('/api/auditoria')),
});

export const colisoesQuery = queryOptions({
  queryKey: ['colisoes'],
  queryFn: () => exigir(api.GET('/api/colisoes')),
});

export const fontesQuery = queryOptions({
  queryKey: ['fontes'],
  queryFn: () => exigir(api.GET('/api/fontes')),
});

export const usuariosQuery = queryOptions({
  queryKey: ['usuarios'],
  queryFn: () => exigir(api.GET('/api/usuarios')),
});

/** Quem enxerga o quê, na tela, com a mesma regra da API (que de todo modo recusaria). */
export const pode = {
  administrar: (s: UsuarioSessao) => s.papel === 'admin',
  auditar: (s: UsuarioSessao) => s.papel === 'admin' || s.papel === 'auditor',
  escrever: (s: UsuarioSessao) => s.papel !== 'auditor',
  verPlanoA: (s: UsuarioSessao) => s.canaisVisiveis.includes('plataforma_credor'),
};
