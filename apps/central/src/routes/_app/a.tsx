import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

/**
 * Plano A — recuperação para o credor. Quem não enxerga o canal nem chega à
 * tela: a API recusaria de todo jeito (403), mas mostrar uma tela que sempre
 * falha ensina a pessoa a ignorar erro.
 */
export const Route = createFileRoute('/_app/a')({
  beforeLoad: ({ context }) => {
    if (!context.sessao.canaisVisiveis.includes('plataforma_credor')) throw redirect({ to: '/' });
    return { canal: 'a' as const };
  },
  staticData: { titulo: 'Plano A' },
  component: Outlet,
});
