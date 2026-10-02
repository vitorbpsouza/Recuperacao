import { createFileRoute } from '@tanstack/react-router';

import { PaginaRede } from '@/features/rede/pagina-rede.tsx';
import { recuperadoresQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/a/rede')({
  loader: ({ context }) => void context.queryClient.prefetchQuery(recuperadoresQuery),
  staticData: { titulo: 'Rede de campo' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaRede sessao={sessao} />;
}
