import { createFileRoute, redirect } from '@tanstack/react-router';

import { PaginaIntegracoes } from '@/features/gestao/pagina-integracoes.tsx';
import { integracoesQuery, pode } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/gestao/integracoes')({
  beforeLoad: ({ context }) => {
    if (!pode.gerir(context.sessao)) throw redirect({ to: '/' });
  },
  loader: ({ context }) => void context.queryClient.prefetchQuery(integracoesQuery),
  staticData: { titulo: 'Integrações' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaIntegracoes sessao={sessao} />;
}
