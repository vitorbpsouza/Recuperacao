import { createFileRoute, redirect } from '@tanstack/react-router';

import { PaginaUsuarios } from '@/features/gestao/pagina-usuarios.tsx';
import { pode, usuariosQuery } from '@/lib/api.ts';

export const Route = createFileRoute('/_app/gestao/usuarios')({
  beforeLoad: ({ context }) => {
    if (!pode.administrar(context.sessao)) throw redirect({ to: '/' });
  },
  loader: ({ context }) => void context.queryClient.prefetchQuery(usuariosQuery),
  staticData: { titulo: 'Usuários' },
  component: PaginaUsuarios,
});
