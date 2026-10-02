import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';

import { PlacaMercosul } from '@workspace/ui/brand/placa-mercosul';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@workspace/ui/components/empty';
import { formatarData } from '@workspace/ui/lib/formato';

import type { Canal, Caso } from '@/lib/api.ts';
import { tomDoStatus } from '@/lib/status.ts';

/** Os casos mais recentes do canal, com atalho para a ficha. */
export function ListaRecentes({ canal, casos }: { canal: Canal; casos: Caso[] }) {
  const recentes = [...casos].sort((x, y) => y.criadoEm.localeCompare(x.criadoEm)).slice(0, 5);
  if (!recentes.length) {
    return (
      <Empty className="border-0 py-8">
        <EmptyHeader>
          <EmptyTitle>Nenhum caso ainda</EmptyTitle>
          <EmptyDescription>Os casos recebidos aparecem aqui.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="space-y-2">
      {recentes.map((c) => (
        <li key={c.id}>
          <Link
            to={canal === 'a' ? '/a/casos/$casoId' : '/b/casos/$casoId'}
            params={{ casoId: c.id }}
            className="group flex items-center gap-3 rounded-lg bg-white/3 p-3 ring-1 ring-white/5 transition-colors hover:bg-white/6"
          >
            <PlacaMercosul placa={c.placa} tamanho="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{c.modelo ?? 'Modelo não informado'}</p>
              <p className="text-xs text-muted-foreground tabular-nums">recebido em {formatarData(c.criadoEm)}</p>
            </div>
            <StatusBadge status={c.status} tom={tomDoStatus(c.status)} className="hidden sm:inline-flex" />
            <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
