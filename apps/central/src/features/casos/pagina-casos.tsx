import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';

import { STATUS_AQUISICAO, STATUS_RECUPERACAO } from '@workspace/domain';
import { Button } from '@workspace/ui/components/button';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { casosQuery, ORIGEM_DO_CANAL, type Canal } from '@/lib/api.ts';

import { TabelaCasos } from './tabela-casos.tsx';

const TEXTO: Record<Canal, { titulo: string; descricao: string }> = {
  a: {
    titulo: 'Casos',
    descricao: 'Carteira recebida dos credores para localização e retomada do bem.',
  },
  b: {
    titulo: 'Negociações',
    descricao: 'Leads próprios em aquisição via quitação, com as pendências até a transferência.',
  },
};

interface Props {
  canal: Canal;
  busca: string;
  aoBuscar: (busca: string) => void;
}

export function PaginaCasos({ canal, busca, aoBuscar }: Props) {
  const consulta = useQuery({ ...casosQuery(ORIGEM_DO_CANAL[canal]), placeholderData: keepPreviousData });

  return (
    <>
      <CabecalhoDePagina
        titulo={TEXTO[canal].titulo}
        descricao={TEXTO[canal].descricao}
        acoes={
          <Button variant="outline" size="sm" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
            <RefreshCwIcon className={consulta.isFetching ? 'animate-spin' : undefined} />
            Atualizar
          </Button>
        }
      />
      {consulta.isError ? (
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      ) : (
        <TabelaCasos
          canal={canal}
          casos={consulta.data?.casos}
          carregando={consulta.isPending}
          atualizando={consulta.isFetching && !consulta.isPending && consulta.isPlaceholderData}
          vocabulario={canal === 'a' ? STATUS_RECUPERACAO : STATUS_AQUISICAO}
          busca={busca}
          aoBuscar={aoBuscar}
        />
      )}
    </>
  );
}
