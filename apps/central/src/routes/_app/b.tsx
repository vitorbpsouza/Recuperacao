import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

/** Plano B — aquisição via quitação. Mesma guarda do Plano A, para o outro canal. */
export const Route = createFileRoute('/_app/b')({
  beforeLoad: ({ context }) => {
    if (!context.sessao.canaisVisiveis.includes('lead_proprio')) throw redirect({ to: '/' });
    return { canal: 'b' as const };
  },
  staticData: { titulo: 'Plano B' },
  component: Outlet,
});
