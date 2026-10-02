import { createFileRoute } from '@tanstack/react-router';

import { PainelAquisicao } from '@/features/painel/painel-aquisicao.tsx';
import { casosQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/b/')({
  loader: ({ context }) => void context.queryClient.prefetchQuery(casosQuery('lead_proprio')),
  staticData: { titulo: 'Painel' },
  component: PainelAquisicao,
});
