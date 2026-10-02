import { createFileRoute } from '@tanstack/react-router';

import { PaginaRelatorios } from '@/features/gestao/pagina-relatorios.tsx';

export const Route = createFileRoute('/_app/gestao/relatorios')({
  staticData: { titulo: 'Relatórios' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaRelatorios sessao={sessao} />;
}
