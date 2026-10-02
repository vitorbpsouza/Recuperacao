import { Link, useMatches } from '@tanstack/react-router';
import { BellIcon, SearchIcon } from 'lucide-react';
import { Fragment } from 'react';

import { CanalBadge } from '@workspace/ui/brand/canal-badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@workspace/ui/components/breadcrumb';
import { Button } from '@workspace/ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@workspace/ui/components/empty';
import { Kbd } from '@workspace/ui/components/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@workspace/ui/components/popover';
import { Separator } from '@workspace/ui/components/separator';
import { SidebarTrigger } from '@workspace/ui/components/sidebar';

import type { Canal, UsuarioSessao } from '@/lib/api.ts';

import { PainelCamila } from './painel-camila.tsx';

interface Props {
  sessao: UsuarioSessao;
  canal: Canal;
  aoBuscar: () => void;
}

export function AppHeader({ sessao, canal, aoBuscar }: Props) {
  // Cada rota declara seu título em staticData; o caminho vira o breadcrumb.
  const trilha = useMatches().filter((m) => m.staticData?.titulo);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/60 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <span className="text-muted-foreground">{sessao.tenant.nome}</span>
          </BreadcrumbItem>
          {trilha.map((m, i) => (
            <Fragment key={m.id}>
              {/* No celular o nome do tenant some; o separador logo depois dele também. */}
              <BreadcrumbSeparator className={i === 0 ? 'hidden md:block' : undefined} />
              <BreadcrumbItem>
                {i === trilha.length - 1 ? (
                  <BreadcrumbPage className="font-semibold text-white">{m.staticData.titulo}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={m.pathname}>{m.staticData.titulo}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <CanalBadge canal={canal} className="hidden lg:inline-flex" />
        <Button variant="outline" size="sm" onClick={aoBuscar} className="hidden gap-2 text-muted-foreground sm:inline-flex">
          <SearchIcon aria-hidden />
          Buscar placa ou caso
          <Kbd>Ctrl K</Kbd>
        </Button>
        <Button variant="ghost" size="icon" onClick={aoBuscar} className="sm:hidden" aria-label="Buscar">
          <SearchIcon />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notificações">
              <BellIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            {/* Notificações reais chegam com os prazos e eventos de campo (Fase 2). */}
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellIcon />
                </EmptyMedia>
                <EmptyTitle>Nenhuma notificação</EmptyTitle>
                <EmptyDescription>Prazos e alertas de campo aparecem aqui.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </PopoverContent>
        </Popover>
        <PainelCamila sessao={sessao} />
      </div>
    </header>
  );
}
