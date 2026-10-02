import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { PaginaCasos } from '@/features/casos/pagina-casos.tsx';
import { casosQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/b/casos/')({
  validateSearch: z.object({ busca: z.string().optional() }),
  loader: ({ context }) => void context.queryClient.prefetchQuery(casosQuery('lead_proprio')),
  component: Pagina,
});

function Pagina() {
  const { busca = '' } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PaginaCasos
      canal="b"
      busca={busca}
      aoBuscar={(b) => void navigate({ search: { busca: b || undefined }, replace: true })}
    />
  );
}
