import { createFileRoute } from '@tanstack/react-router';

import { PainelRecuperacao } from '@/features/painel/painel-recuperacao.tsx';
import { casosQuery, painelRecuperacaoQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/a/')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(casosQuery('plataforma_credor'));
    void context.queryClient.prefetchQuery(painelRecuperacaoQuery);
  },
  staticData: { titulo: 'Painel' },
  component: PainelRecuperacao,
});
