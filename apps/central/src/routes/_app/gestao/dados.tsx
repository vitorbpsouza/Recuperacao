import { createFileRoute } from '@tanstack/react-router';

import { PaginaDados } from '@/features/gestao/pagina-dados.tsx';
import { bureausQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/gestao/dados')({
  loader: ({ context }) => void context.queryClient.prefetchQuery(bureausQuery),
  staticData: { titulo: 'Dados & Bureaus' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaDados sessao={sessao} />;
}
