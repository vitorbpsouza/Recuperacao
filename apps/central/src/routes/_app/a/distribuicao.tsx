import { createFileRoute } from '@tanstack/react-router';

import { PaginaDistribuicao } from '@/features/distribuicao/pagina-distribuicao.tsx';
import { casosQuery, recuperadoresQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/a/distribuicao')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(casosQuery('plataforma_credor'));
    void context.queryClient.prefetchQuery(recuperadoresQuery);
  },
  staticData: { titulo: 'Distribuição' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaDistribuicao sessao={sessao} />;
}
