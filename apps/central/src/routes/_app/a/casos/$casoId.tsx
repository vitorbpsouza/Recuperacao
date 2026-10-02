import { createFileRoute } from '@tanstack/react-router';

import { FichaCaso } from '@/features/casos/ficha-caso.tsx';
import { casoQuery, eventosQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/a/casos/$casoId')({
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(casoQuery(params.casoId));
    void context.queryClient.prefetchQuery(eventosQuery(params.casoId));
  },
  staticData: { titulo: 'Ficha' },
  component: Pagina,
});

function Pagina() {
  const { casoId } = Route.useParams();
  const { sessao } = Route.useRouteContext();
  return <FichaCaso canal="a" casoId={casoId} sessao={sessao} />;
}
