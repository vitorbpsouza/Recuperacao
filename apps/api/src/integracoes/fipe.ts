/**
 * Tabela FIPE pela API pública da Parallelum (sem chave).
 *
 * O limite é de 500 consultas por dia por IP, então listas (marcas, modelos,
 * anos) ficam em cache por um dia e valores por seis horas. Falha da tabela
 * vira erro claro para a tela — nunca um valor inventado.
 */
import type { TIPOS_FIPE } from '@workspace/domain';

export type TipoFipe = (typeof TIPOS_FIPE)[number];

export interface OpcaoFipe {
  codigo: string;
  nome: string;
}

export interface ValorFipe {
  valor: number;
  codigoFipe: string;
  mesReferencia: string;
  marca: string;
  modelo: string;
  anoModelo: number;
}

export interface ClienteFipe {
  marcas(tipo: TipoFipe): Promise<OpcaoFipe[]>;
  modelos(tipo: TipoFipe, marca: string): Promise<OpcaoFipe[]>;
  anos(tipo: TipoFipe, marca: string, modelo: string): Promise<OpcaoFipe[]>;
  valor(tipo: TipoFipe, marca: string, modelo: string, ano: string): Promise<ValorFipe>;
}

export class FipeIndisponivel extends Error {
  readonly statusCode = 502;
  constructor(detalhe: string) {
    super(`tabela FIPE indisponível agora (${detalhe}); tente de novo em instantes`);
  }
}

const BASE = 'https://parallelum.com.br/fipe/api/v1';
const DIA = 24 * 3_600_000;

/** "R$ 14.228,00" → 14228 */
export const lerValorFipe = (texto: string): number => Number(texto.replace(/[^\d,]/g, '').replace(',', '.'));

export const criarClienteFipe = (buscar: typeof fetch = fetch): ClienteFipe => {
  const cache = new Map<string, { expira: number; dado: unknown }>();

  const obter = async <T>(caminho: string, validadeMs: number): Promise<T> => {
    const guardado = cache.get(caminho);
    if (guardado && guardado.expira > Date.now()) return guardado.dado as T;
    let resposta: Response;
    try {
      resposta = await buscar(`${BASE}${caminho}`, { signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw new FipeIndisponivel((e as Error).name === 'TimeoutError' ? 'sem resposta em 10s' : 'falha de rede');
    }
    if (resposta.status === 429) throw new FipeIndisponivel('limite diário de consultas atingido');
    if (!resposta.ok) throw new FipeIndisponivel(`HTTP ${resposta.status}`);
    const dado = (await resposta.json()) as T;
    cache.set(caminho, { expira: Date.now() + validadeMs, dado });
    return dado;
  };

  const opcoes = (lista: Array<{ codigo: string | number; nome: string }>): OpcaoFipe[] =>
    lista.map((o) => ({ codigo: String(o.codigo), nome: o.nome }));

  return {
    marcas: async (tipo) => opcoes(await obter(`/${tipo}/marcas`, DIA)),
    modelos: async (tipo, marca) =>
      opcoes((await obter<{ modelos: OpcaoFipe[] }>(`/${tipo}/marcas/${encodeURIComponent(marca)}/modelos`, DIA)).modelos),
    anos: async (tipo, marca, modelo) =>
      opcoes(await obter(`/${tipo}/marcas/${encodeURIComponent(marca)}/modelos/${encodeURIComponent(modelo)}/anos`, DIA)),
    valor: async (tipo, marca, modelo, ano) => {
      const v = await obter<{
        Valor: string;
        CodigoFipe: string;
        MesReferencia: string;
        Marca: string;
        Modelo: string;
        AnoModelo: number;
      }>(
        `/${tipo}/marcas/${encodeURIComponent(marca)}/modelos/${encodeURIComponent(modelo)}/anos/${encodeURIComponent(ano)}`,
        DIA / 4,
      );
      const valor = lerValorFipe(v.Valor);
      if (!Number.isFinite(valor) || valor <= 0) throw new FipeIndisponivel('valor ilegível na resposta');
      return {
        valor,
        codigoFipe: v.CodigoFipe,
        mesReferencia: v.MesReferencia,
        marca: v.Marca,
        modelo: v.Modelo,
        anoModelo: v.AnoModelo,
      };
    },
  };
};
