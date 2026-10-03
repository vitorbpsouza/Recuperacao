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
export type JuridicoCaso = Esquemas['JuridicoCaso'];
export type AcaoCaso = Esquemas['AcaoCaso'];
export type Credor = Esquemas['Credor'];
export type VerificacaoVeicular = Esquemas['VerificacaoVeicular'];
export type Avistamento = Esquemas['Avistamento'];
export type ResumoImportacao = Esquemas['ResumoImportacao'];
export type RelatorioColado = Esquemas['RelatorioColado'];
export type DadoExtra = Esquemas['DadoExtra'];
export type PessoasDoCaso = Esquemas['PessoasDoCaso'];
export type PessoaRevelada = Esquemas['PessoaRevelada'];
export type ContatoPessoa = Esquemas['ContatoPessoa'];
export type EnderecoPessoa = Esquemas['EnderecoPessoa'];
export type CampoNovo = Esquemas['CampoNovo'];
export type Integracao = Esquemas['Integracao'];
export type Conversa = Esquemas['Conversa'];
export type Mensagem = Esquemas['Mensagem'];
export type PainelRecuperacao = Esquemas['PainelRecuperacao'];
export type AlertaCaso = Esquemas['AlertaCaso'];
export type LugarProvavel = Esquemas['LugarProvavel'];
export type Foto = Esquemas['Foto'];
export type FotoEnviada = Esquemas['FotoEnviada'];
export type LinkCampo = Esquemas['LinkCampo'];

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

/** Plano A: rito, credor, prova da mora, processo e retomada. */
export const juridicoQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'juridico'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/juridico', { params: { path: { id } } })),
  });

/** Plano A: próximos passos do caso, cada um com o que falta (calculado pelo banco). */
export const acoesQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'acoes'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/acoes', { params: { path: { id } } })),
  });

export const verificacoesVeiculoQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'verificacoes-veiculares'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/verificacoes-veiculares', { params: { path: { id } } })),
  });

export const avistamentosQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'avistamentos'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/avistamentos', { params: { path: { id } } })),
  });

export const relatoriosColadosQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'relatorios'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/relatorios', { params: { path: { id } } })),
  });

export const dadosExtrasQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'dados-extras'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/dados-extras', { params: { path: { id } } })),
  });

export const pessoasQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'pessoas'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/pessoas', { params: { path: { id } } })),
  });

export const camposNovosQuery = queryOptions({
  queryKey: ['campos-novos'],
  queryFn: () => exigir(api.GET('/api/campos-novos')),
});

export const integracoesQuery = queryOptions({
  queryKey: ['integracoes'],
  queryFn: () => exigir(api.GET('/api/integracoes')),
});

export const conversasQuery = queryOptions({
  queryKey: ['conversas'],
  queryFn: () => exigir(api.GET('/api/conversas')),
  refetchInterval: 15_000,
});

export const mensagensQuery = (numero: string) =>
  queryOptions({
    queryKey: ['conversas', numero],
    queryFn: () => exigir(api.GET('/api/conversas/{numero}', { params: { path: { numero } } })),
    refetchInterval: 10_000,
  });

export const painelRecuperacaoQuery = queryOptions({
  queryKey: ['painel', 'recuperacao'],
  queryFn: () => exigir(api.GET('/api/painel/recuperacao')),
});

export const localizacaoQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'localizacao'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/localizacao', { params: { path: { id } } })),
  });

export const fotosQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'fotos'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/fotos', { params: { path: { id } } })),
  });

export const linksCampoQuery = (id: string) =>
  queryOptions({
    queryKey: ['caso', id, 'links-campo'],
    queryFn: () => exigir(api.GET('/api/casos/{id}/links-campo', { params: { path: { id } } })),
  });

/** Endereço da imagem da foto (mesma origem, cookie de sessão). */
export const urlDaFoto = (id: number) => `/api/fotos/${id}/arquivo`;

export const credoresQuery = queryOptions({
  queryKey: ['credores'],
  queryFn: () => exigir(api.GET('/api/credores')),
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
  /** Perfil, crédito, parentes e o texto original colado. */
  verSensivel: (s: UsuarioSessao) => s.papel === 'admin' || s.papel === 'gestor',
  gerir: (s: UsuarioSessao) => s.papel === 'admin' || s.papel === 'gestor',
  auditar: (s: UsuarioSessao) => s.papel === 'admin' || s.papel === 'gestor' || s.papel === 'auditor',
  escrever: (s: UsuarioSessao) => s.papel !== 'auditor',
  verPlanoA: (s: UsuarioSessao) => s.canaisVisiveis.includes('plataforma_credor'),
};
