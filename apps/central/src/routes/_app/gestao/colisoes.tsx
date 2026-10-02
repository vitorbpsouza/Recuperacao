import { createFileRoute, redirect } from '@tanstack/react-router';

import { PaginaColisoes } from '@/features/gestao/pagina-colisoes.tsx';
import { pode } from '@/lib/api.ts';

/** Colisão cruza os dois planos: só quem enxerga os dois (admin e auditor). */
export const Route = createFileRoute('/_app/gestao/colisoes')({
  beforeLoad: ({ context }) => {
    if (!pode.auditar(context.sessao)) throw redirect({ to: '/' });
  },
  staticData: { titulo: 'Colisões' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaColisoes sessao={sessao} />;
}
