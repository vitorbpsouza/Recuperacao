import { createFileRoute } from '@tanstack/react-router';

import { PaginaOperacao } from '@/features/operacao/pagina-operacao.tsx';
import { conversasQuery, recuperadoresQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/a/operacao')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(conversasQuery);
    void context.queryClient.prefetchQuery(recuperadoresQuery);
  },
  staticData: { titulo: 'Operação' },
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return <PaginaOperacao sessao={sessao} />;
}
