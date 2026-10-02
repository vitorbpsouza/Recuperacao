import { createFileRoute } from '@tanstack/react-router';

import { PaginaRepasses } from '@/features/repasses/pagina-repasses.tsx';
import { repassesQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/a/repasses')({
  loader: ({ context }) => void context.queryClient.prefetchQuery(repassesQuery),
  staticData: { titulo: 'Repasses' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaRepasses sessao={sessao} />;
}
