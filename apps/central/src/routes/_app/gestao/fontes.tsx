import { createFileRoute } from '@tanstack/react-router';

import { PaginaFontes } from '@/features/gestao/pagina-fontes.tsx';
import { fontesQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/gestao/fontes')({
  loader: ({ context }) => void context.queryClient.prefetchQuery(fontesQuery),
  staticData: { titulo: 'Fontes e credores' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaFontes sessao={sessao} />;
}
