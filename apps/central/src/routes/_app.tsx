import { createFileRoute, Outlet, redirect, useMatches } from '@tanstack/react-router';
import { useState } from 'react';

import { SidebarInset, SidebarProvider } from '@workspace/ui/components/sidebar';

import { AppHeader } from '@/components/layout/app-header.tsx';
import { AppSidebar } from '@/components/layout/app-sidebar.tsx';
import { MenuDeComandos } from '@/components/layout/menu-de-comandos.tsx';
import { CANAL_DA_ORIGEM, sessaoQuery, type Canal } from '@/lib/api.ts';

/**
 * Layout autenticado. A sessão é revalidada no servidor antes de qualquer
 * tela: um cookie no navegador não prova nada — pode ter expirado ou sido
 * revogado.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const sessao = await context.queryClient.ensureQueryData(sessaoQuery);
    if (!sessao) throw redirect({ to: '/login', search: { voltar: location.href } });
    return { sessao };
  },
  component: LayoutAutenticado,
});

function LayoutAutenticado() {
  const { sessao } = Route.useRouteContext();
  const [buscaAberta, setBuscaAberta] = useState(false);

  // O plano vem da rota (/a ou /b). Fora delas, o primeiro que o usuário enxerga.
  const canalDaRota = useMatches({
    select: (ms) => ms.map((m) => (m.context as { canal?: Canal }).canal).findLast(Boolean),
  });
  const canal: Canal = canalDaRota ?? CANAL_DA_ORIGEM[sessao.canaisVisiveis[0] ?? 'plataforma_credor'];

  return (
    <SidebarProvider>
      <AppSidebar sessao={sessao} canal={canal} />
      <SidebarInset className="min-w-0">
        <AppHeader sessao={sessao} canal={canal} aoBuscar={() => setBuscaAberta(true)} />
        {/* Tela cheia: a operação trabalha com mapa, tabela e ficha lado a lado. */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-4 md:p-6 2xl:p-8">
          <div className="mx-auto w-full max-w-[2200px]">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
      <MenuDeComandos sessao={sessao} aberto={buscaAberta} aoMudar={setBuscaAberta} />
    </SidebarProvider>
  );
}
