import { createFileRoute, redirect } from '@tanstack/react-router';

import { PaginaCamposNovos } from '@/features/gestao/pagina-campos-novos.tsx';
import { camposNovosQuery, pode } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/gestao/campos-novos')({
  beforeLoad: ({ context }) => {
    if (!pode.auditar(context.sessao)) throw redirect({ to: '/' });
  },
  loader: ({ context }) => void context.queryClient.prefetchQuery(camposNovosQuery),
  staticData: { titulo: 'Campos novos' },
  component: PaginaCamposNovos,
});
