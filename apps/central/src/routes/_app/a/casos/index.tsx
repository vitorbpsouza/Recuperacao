import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { PaginaCasos } from '@/features/casos/pagina-casos.tsx';
import { casosQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/a/casos/')({
  validateSearch: z.object({ busca: z.string().optional() }),
  // Pré-carrega sem bloquear: falha de consulta aparece na tela, não numa página de erro.
  loader: ({ context }) => void context.queryClient.prefetchQuery(casosQuery('plataforma_credor')),
  component: Pagina,
});

function Pagina() {
  const { busca = '' } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PaginaCasos
      canal="a"
      busca={busca}
      aoBuscar={(b) => void navigate({ search: { busca: b || undefined }, replace: true })}
    />
  );
}
