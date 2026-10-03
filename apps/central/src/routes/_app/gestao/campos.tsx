import { createFileRoute, redirect } from '@tanstack/react-router';

import { PaginaCampos } from '@/features/gestao/pagina-campos.tsx';
import { camposDinamicosQuery, pode } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/gestao/campos')({
  beforeLoad: ({ context }) => {
    if (!pode.auditar(context.sessao)) throw redirect({ to: '/' });
  },
  loader: ({ context }) => void context.queryClient.prefetchQuery(camposDinamicosQuery),
  staticData: { titulo: 'Campos dos relatórios' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaCampos sessao={sessao} />;
}
