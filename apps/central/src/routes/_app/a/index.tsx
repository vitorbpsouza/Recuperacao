import { createFileRoute } from '@tanstack/react-router';

import { PainelRecuperacao } from '@/features/painel/painel-recuperacao.tsx';
import { casosQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/a/')({
  loader: ({ context }) => void context.queryClient.prefetchQuery(casosQuery('plataforma_credor')),
  staticData: { titulo: 'Painel' },
  component: PainelRecuperacao,
});
