import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { EVENTO_SESSAO_EXPIRADA } from '@workspace/api-client';
import { Toaster } from '@workspace/ui/components/sonner';
import { TooltipProvider } from '@workspace/ui/components/tooltip';

import { ErroDeRota, PaginaNaoEncontrada } from '@/components/erro-de-rota.tsx';
import { sessaoQuery } from '@/lib/api.ts';

export interface ContextoRotas {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<ContextoRotas>()({
  component: Raiz,
  errorComponent: ErroDeRota,
  notFoundComponent: PaginaNaoEncontrada,
});

function Raiz() {
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();

  // O cliente da API avisa quando o servidor rejeita a sessão em qualquer
  // chamada: a tela volta ao login em vez de mostrar erro em cada componente.
  useEffect(() => {
    const aoExpirar = () => {
      if (queryClient.getQueryData(sessaoQuery.queryKey) === null) return;
      queryClient.setQueryData(sessaoQuery.queryKey, null);
      void router.navigate({ to: '/login', search: { voltar: router.state.location.href } });
    };
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  }, [queryClient, router]);

  return (
    <TooltipProvider delayDuration={200}>
      <Outlet />
      <Toaster position="top-right" richColors />
    </TooltipProvider>
  );
}
