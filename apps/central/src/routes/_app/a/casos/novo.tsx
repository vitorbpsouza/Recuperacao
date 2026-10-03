import { createFileRoute } from '@tanstack/react-router';

import { PaginaNovoCaso } from '@/features/casos/pagina-novo-caso.tsx';
import { credoresQuery, fontesQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/a/casos/novo')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(fontesQuery);
    void context.queryClient.prefetchQuery(credoresQuery);
  },
  staticData: { titulo: 'Novo caso' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaNovoCaso canal="a" sessao={sessao} />;
}
