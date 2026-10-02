import { useCallback, useEffect, useState } from 'react';

import type { FinalidadePermitida, OrigemCaso } from '../domain/casos';
import type { Ativo, Recuperador, Repasse, StatusAtivo } from '../types';
import { api } from './client';

/** Linha de `caso` + colunas de `ativo` como o SQLite devolve (snake_case). */
export interface LinhaCaso {
  id: string;
  ativo_id: string;
  fonte_id: string;
  origem: OrigemCaso;
  finalidade: FinalidadePermitida;
  status: string;
  recuperador_id: string | null;
  prazo_vinculo: string | null;
  prazo_maximo: string | null;
  canal_lead: string | null;
  evidencia_lead: string | null;
  saldo_devedor: number | null;
  valor_quitacao_negociado: number | null;
  valor_pago_ao_devedor: number | null;
  anuencia_credor: string | null;
  renajud_ativo: number | null;
  gravame_baixado: number | null;
  criado_em: string;
  placa: string;
  modelo: string | null;
  cidade: string | null;
}

export interface RespostaCasos {
  origem: OrigemCaso;
  finalidade: FinalidadePermitida;
  total: number;
  casos: LinhaCaso[];
}

/** Caso vindo da API no formato que os módulos já consomem, sem reescrevê-los. */
export type AtivoDoCaso = Ativo & {
  casoId: string;
  origem: OrigemCaso;
  finalidade: FinalidadePermitida;
};

/**
 * Adapta a linha do banco ao `Ativo` das telas.
 *
 * Os campos que o `GET /api/casos` não seleciona (`chassi`, `ano`, `cor`,
 * `devedor`, `documento`) vêm vazios em vez de inventados. Preenchê-los com
 * placeholder plausível faria a tela parecer ter dado que não tem.
 */
export const casoParaAtivo = (l: LinhaCaso): AtivoDoCaso => ({
  casoId: l.id,
  origem: l.origem,
  finalidade: l.finalidade,
  id: l.ativo_id,
  placa: l.placa,
  chassi: '',
  modelo: l.modelo ?? '',
  ano: 0,
  cor: '',
  devedor: '',
  documento: '',
  banco: '',
  valorDivida: l.saldo_devedor ?? 0,
  cidade: l.cidade ?? '',
  dataRecebimento: l.criado_em,
  status: l.status as StatusAtivo,
  prazoVinculo: l.prazo_vinculo ?? l.criado_em,
  prazoMaximo: l.prazo_maximo ?? l.criado_em,
  recuperadorId: l.recuperador_id ?? undefined,
});

interface Estado<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
}

/** GET com estado de carregamento e erro, sem mascarar falha com valor vazio. */
const useRecurso = <T>(caminho: string | null): Estado<T> => {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(caminho !== null);
  const [erro, setErro] = useState<string | null>(null);
  const [gatilho, setGatilho] = useState(0);

  const recarregar = useCallback(() => setGatilho((g) => g + 1), []);

  useEffect(() => {
    if (caminho === null) {
      setDados(null);
      setCarregando(false);
      return;
    }
    let ativo = true;
    setCarregando(true);
    setErro(null);
    api
      .get<T>(caminho)
      .then((d) => ativo && setDados(d))
      .catch((e) => {
        // Erro fica visível. Devolver lista vazia aqui faria a tela dizer
        // "nenhum caso" quando a verdade é "não foi possível consultar".
        if (ativo) {
          setErro(e instanceof Error ? e.message : 'falha ao carregar');
          setDados(null);
        }
      })
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [caminho, gatilho]);

  return { dados, carregando, erro, recarregar };
};

/** Casos de um canal. `origem` nula não consulta — para usuário sem canal. */
export const useCasos = (origem: OrigemCaso | null) => {
  const r = useRecurso<RespostaCasos>(origem ? `/casos?origem=${origem}` : null);
  return {
    ...r,
    ativos: (r.dados?.casos ?? []).map(casoParaAtivo),
    finalidade: r.dados?.finalidade ?? null,
  };
};

export const useRecuperadores = () => useRecurso<Recuperador[]>('/recuperadores');
export const useRepasses = () => useRecurso<Repasse[]>('/repasses');
export const useBureaus = () =>
  useRecurso<
    Array<{
      id: string;
      nome: string;
      tipo: string;
      contrato_fornecedor_id: string;
      custo_consulta: number;
    }>
  >('/bureaus');

export const mudarStatus = (casoId: string, status: string) =>
  api.post<{ id: string; status: string }>(`/casos/${casoId}/status`, { status });
