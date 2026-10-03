import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { ChevronsUpDownIcon, LogOutIcon } from 'lucide-react';

import { definirCsrf } from '@workspace/api-client';
import { CANAIS } from '@workspace/ui/brand/canal-badge';
import { TenantMark } from '@workspace/ui/brand/tenant-mark';
import { Avatar, AvatarFallback } from '@workspace/ui/components/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@workspace/ui/components/sidebar';
import { iniciais } from '@workspace/ui/lib/formato';
import { cn } from '@workspace/ui/lib/utils';

import { api, CANAL_DA_ORIGEM, type Canal, type UsuarioSessao } from '@/lib/api.ts';

import { NAVEGACAO_DO_CANAL, NAVEGACAO_GESTAO, type ItemNavegacao } from './navegacao.ts';

const PAPEL: Record<UsuarioSessao['papel'], string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  operador: 'Operador',
  auditor: 'Auditor (somente leitura)',
};

// Item ativo no desenho anterior: preenchido com a cor do plano e com brilho.
const ATIVO: Record<Canal, string> = {
  a: 'data-[active=true]:bg-canal-a data-[active=true]:text-white data-[active=true]:shadow-lg data-[active=true]:shadow-canal-a/20',
  b: 'data-[active=true]:bg-canal-b data-[active=true]:text-white data-[active=true]:shadow-lg data-[active=true]:shadow-canal-b/20',
};

export function AppSidebar({ sessao, canal }: { sessao: UsuarioSessao; canal: Canal }) {
  const caminho = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <SeletorDeCanal sessao={sessao} canal={canal} />
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar">
        <GrupoDeNavegacao
          titulo={CANAIS[canal].sub}
          itens={NAVEGACAO_DO_CANAL[canal]}
          caminho={caminho}
          ativo={ATIVO[canal]}
        />
        <GrupoDeNavegacao
          titulo="Gestão"
          itens={NAVEGACAO_GESTAO.filter((i) => !i.visivel || i.visivel(sessao))}
          caminho={caminho}
          ativo={ATIVO.a}
        />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <MenuDoUsuario sessao={sessao} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function GrupoDeNavegacao({
  titulo,
  itens,
  caminho,
  ativo,
}: {
  titulo: string;
  itens: ItemNavegacao[];
  caminho: string;
  ativo: string;
}) {
  if (!itens.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{titulo}</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {itens.map((item) => (
          <SidebarMenuItem key={item.para}>
            <SidebarMenuButton
              asChild
              isActive={item.exato ? caminho === item.para : caminho.startsWith(item.para)}
              tooltip={item.titulo}
              className={cn('h-10 rounded-lg font-medium', ativo)}
            >
              <Link to={item.para}>
                <item.icone aria-hidden />
                <span>{item.titulo}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/**
 * Marca do tenant e troca de plano. Só oferece os planos que o usuário pode
 * ver: um botão que sempre falha ensina a pessoa a ignorar erro.
 */
function SeletorDeCanal({ sessao, canal }: { sessao: UsuarioSessao; canal: Canal }) {
  const navigate = useNavigate();
  const canais = sessao.canaisVisiveis.map((o) => CANAL_DA_ORIGEM[o]);
  const { Icone } = CANAIS[canal];

  const conteudo = (
    <>
      <TenantMark sigla={sessao.tenant.sigla} nome={sessao.tenant.nome} logoUrl={sessao.tenant.logoUrl} tamanho="sm" />
      <span className="grid flex-1 text-left leading-tight">
        <span className="truncate font-bold text-white">{sessao.tenant.nome}</span>
        <span className={cn('flex items-center gap-1 truncate text-xs', canal === 'a' ? 'text-blue-300' : 'text-indigo-300')}>
          <Icone className="size-3" aria-hidden />
          Plano {canal.toUpperCase()} · {CANAIS[canal].titulo}
        </span>
      </span>
    </>
  );

  if (canais.length < 2) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            {conteudo}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label="Trocar de plano" className="data-[state=open]:bg-sidebar-accent">
              {conteudo}
              <ChevronsUpDownIcon className="ml-auto text-muted-foreground" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-64" align="start">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Plano de trabalho</DropdownMenuLabel>
            {canais.map((c) => {
              const { titulo, sub, Icone: IconeCanal } = CANAIS[c];
              return (
                <DropdownMenuItem key={c} onSelect={() => void navigate({ to: c === 'a' ? '/a' : '/b' })} className="gap-3 py-2">
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md',
                      c === 'a' ? 'bg-canal-a/15 text-blue-300' : 'bg-canal-b/15 text-indigo-300',
                    )}
                  >
                    <IconeCanal className="size-4" aria-hidden />
                  </span>
                  <span className="grid leading-tight">
                    <span className="font-medium">{titulo}</span>
                    <span className="text-xs text-muted-foreground">{sub}</span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function MenuDoUsuario({ sessao }: { sessao: UsuarioSessao }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const sair = async () => {
    // Avisa o servidor para revogar a sessão; se a rede falhar, ainda sai
    // localmente — prender o usuário numa sessão que ele pediu para encerrar
    // é pior que uma sessão órfã no banco.
    try {
      await api.POST('/api/auth/logout');
    } finally {
      definirCsrf(null);
      queryClient.clear();
      await navigate({ to: '/login' });
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-linear-to-br from-blue-600 to-indigo-700 text-xs font-bold text-white">
                  {iniciais(sessao.nome)}
                </AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium text-white">{sessao.nome}</span>
                <span className="truncate text-xs text-muted-foreground">{PAPEL[sessao.papel]}</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto text-muted-foreground" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56" side="top" align="start">
            <DropdownMenuLabel className="grid font-normal">
              <span className="font-medium">{sessao.nome}</span>
              <span className="text-xs text-muted-foreground">{sessao.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void sair()}>
              <LogOutIcon aria-hidden />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
