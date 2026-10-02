import { createFileRoute, redirect } from '@tanstack/react-router';

/** Entrada: o painel do primeiro plano que o usuário enxerga. */
export const Route = createFileRoute('/_app/')({
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.sessao.canaisVisiveis[0] === 'lead_proprio' ? '/b' : '/a' });
  },
});
