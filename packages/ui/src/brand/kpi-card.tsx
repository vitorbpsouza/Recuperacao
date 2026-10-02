import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';

import { Card } from '../components/card.tsx';
import { InfoTooltip } from './info-tooltip.tsx';
import { Rotulo } from './rotulo.tsx';

const CORES = {
  azul: 'bg-info/10 text-info',
  verde: 'bg-success/10 text-success',
  ambar: 'bg-warning/10 text-warning',
  vermelho: 'bg-destructive/10 text-destructive',
  indigo: 'bg-canal-b/10 text-indigo-400',
  cinza: 'bg-slate-500/10 text-slate-400',
} as const;

interface KpiCardProps {
  titulo: string;
  /** Valor já formatado. `null` quando não há dado: mostra "—", nunca um número inventado. */
  valor: string | null;
  icone: LucideIcon;
  cor?: keyof typeof CORES;
  info?: string;
  /** Texto de apoio real (ex.: "de 12 recebidos"). Sem tendência fictícia. */
  detalhe?: string;
  className?: string;
}

export function KpiCard({ titulo, valor, icone: Icone, cor = 'azul', info, detalhe, className }: KpiCardProps) {
  return (
    <Card className={cn('gap-3 px-5 py-5 transition-colors hover:ring-foreground/20', className)}>
      <span className={cn('flex size-10 items-center justify-center rounded-lg', CORES[cor])}>
        <Icone className="size-5" aria-hidden />
      </span>
      {/* Altura fixa de duas linhas, rótulo na base: os valores ficam alinhados entre cartões. */}
      <div className="flex h-8 items-end">
        <Rotulo className="leading-tight">
          {titulo}
          {info ? <InfoTooltip text={info} className="ml-1 align-[-2px]" /> : null}
        </Rotulo>
      </div>
      <p className="text-2xl leading-none font-bold text-white tabular-nums">{valor ?? '—'}</p>
      {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
    </Card>
  );
}
