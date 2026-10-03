import { useQueries } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CarFrontIcon, HandshakeIcon, LayoutDashboardIcon } from 'lucide-react';
import { useEffect } from 'react';

import { formasDaPlaca } from '@workspace/domain';
import { PlacaMercosul } from '@workspace/ui/brand/placa-mercosul';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@workspace/ui/components/command';

import { CANAL_DA_ORIGEM, casosQuery, type UsuarioSessao } from '@/lib/api.ts';

interface Props {
  sessao: UsuarioSessao;
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
}

/**
 * Busca global (Ctrl/⌘ K). Procura só nos canais que o usuário enxerga — a
 * mesma regra da API, que de todo modo não devolveria o resto.
 */
export function MenuDeComandos({ sessao, aberto, aoMudar }: Props) {
  const navigate = useNavigate();
  const consultas = useQueries({
    queries: sessao.canaisVisiveis.map((o) => ({ ...casosQuery(o), enabled: aberto })),
  });

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        aoMudar(!aberto);
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberto, aoMudar]);

  const ir = (fn: () => Promise<void>) => {
    aoMudar(false);
    void fn();
  };

  return (
    <CommandDialog
      open={aberto}
      onOpenChange={aoMudar}
      title="Busca"
      description="Buscar placa, modelo, cidade ou tela"
      className="sm:max-w-xl"
    >
      {/* No shadcn v4 o CommandDialog não traz o <Command>: sem ele o cmdk quebra ao abrir. */}
      <Command>
        <CommandInput placeholder="Placa, modelo, cidade ou tela…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup heading="Ir para">
            {sessao.canaisVisiveis.map((o) => {
              const c = CANAL_DA_ORIGEM[o];
              return [
                <CommandItem key={`${c}-painel`} onSelect={() => ir(() => navigate({ to: c === 'a' ? '/a' : '/b' }))}>
                  <LayoutDashboardIcon />
                  Painel do Plano {c.toUpperCase()}
                </CommandItem>,
                <CommandItem key={`${c}-casos`} onSelect={() => ir(() => navigate({ to: c === 'a' ? '/a/casos' : '/b/casos' }))}>
                  {c === 'a' ? <CarFrontIcon /> : <HandshakeIcon />}
                  {c === 'a' ? 'Casos do Plano A' : 'Negociações do Plano B'}
                </CommandItem>,
              ];
            })}
          </CommandGroup>
          {consultas.map((q, i) => {
            const origem = sessao.canaisVisiveis[i]!;
            const canal = CANAL_DA_ORIGEM[origem];
            const casos = q.data?.casos ?? [];
            if (casos.length === 0) return null;
            return (
              <div key={origem}>
                <CommandSeparator />
                <CommandGroup heading={canal === 'a' ? 'Casos · Plano A' : 'Negociações · Plano B'}>
                  {casos.map((caso) => (
                    <CommandItem
                      key={caso.id}
                      value={`${formasDaPlaca(caso.placa).join(' ')} ${caso.modelo ?? ''} ${caso.cidade ?? ''} ${caso.status}`}
                      onSelect={() =>
                        ir(() =>
                          navigate({
                            to: canal === 'a' ? '/a/casos/$casoId' : '/b/casos/$casoId',
                            params: { casoId: caso.id },
                          }),
                        )
                      }
                    >
                      <PlacaMercosul placa={caso.placa} tamanho="sm" />
                      <span className="truncate">{caso.modelo ?? 'Modelo não informado'}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{caso.status}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            );
          })}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
