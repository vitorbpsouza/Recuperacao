import { CircleDotIcon, FilePlus2Icon, GavelIcon, ScaleIcon, SendIcon } from 'lucide-react';

import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@workspace/ui/components/empty';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { formatarDataHora } from '@workspace/ui/lib/formato';

import type { EventoCaso } from '@/lib/api.ts';
import { tomDoStatus } from '@/lib/status.ts';

const ICONE = {
  criado: FilePlus2Icon,
  status_alterado: CircleDotIcon,
  distribuido: SendIcon,
  rito_definido: ScaleIcon,
  registro_juridico: GavelIcon,
} as const;

const REGISTRO: Record<string, string> = {
  processo_judicial: 'Processo judicial',
  procedimento_extrajudicial: 'Procedimento extrajudicial',
  prova_mora: 'Prova da mora',
  verificacao_rj: 'Verificação de recuperação judicial',
};

const RITO: Record<string, string> = { judicial: 'judicial', extrajudicial: 'extrajudicial', amigavel: 'amigável' };

const textoDe = (e: EventoCaso) => {
  switch (e.tipo) {
    case 'criado':
      return 'Caso recebido';
    case 'distribuido': {
      const { recuperador, anterior } = e.dados as { recuperador?: string; anterior?: string | null };
      return anterior ? `Redistribuído de ${anterior} para ${recuperador}` : `Distribuído para ${recuperador}`;
    }
    case 'rito_definido': {
      const { rito, credor } = e.dados as { rito?: string; credor?: string };
      return [rito ? `Rito ${RITO[rito] ?? rito}` : 'Rito removido', credor ? `credor ${credor}` : null].filter(Boolean).join(' · ');
    }
    case 'registro_juridico': {
      const { registro, operacao } = e.dados as { registro?: string; operacao?: string };
      return `${REGISTRO[registro ?? ''] ?? 'Registro jurídico'} ${operacao === 'update' ? 'atualizado' : 'registrado'}`;
    }
    default:
      return 'Status alterado';
  }
};

/**
 * Linha do tempo do caso. Escrita só pelo banco (trigger), com o usuário da
 * sessão: o que aparece aqui não pode ser editado nem apagado.
 */
export function LinhaDoTempo({ eventos, carregando }: { eventos: EventoCaso[] | undefined; carregando: boolean }) {
  if (carregando) return <Skeleton className="h-40" />;
  if (!eventos?.length) {
    return (
      <Empty className="border-0 py-8">
        <EmptyHeader>
          <EmptyTitle>Sem eventos</EmptyTitle>
          <EmptyDescription>Mudanças de status e distribuições aparecem aqui.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ol className="relative space-y-6 border-l border-border pl-6">
      {[...eventos].reverse().map((e) => {
        const Icone = ICONE[e.tipo];
        return (
          <li key={e.id} className="relative">
            <span className="absolute top-0.5 -left-[2.15rem] flex size-6 items-center justify-center rounded-full bg-background ring-1 ring-border">
              <Icone className="size-3.5 text-info" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-white">{textoDe(e)}</p>
              {e.statusPara ? <StatusBadge status={e.statusPara} tom={tomDoStatus(e.statusPara)} /> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {formatarDataHora(e.ocorridoEm)} · {e.usuarioNome ?? 'carga automática'}
              {e.statusDe ? ` · antes: ${e.statusDe}` : ''}
            </p>
            {typeof e.dados.motivo === 'string' ? <p className="mt-1 text-sm text-slate-300">{e.dados.motivo}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
