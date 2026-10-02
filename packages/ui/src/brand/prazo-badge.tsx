import { cn } from 'cn';
import { ClockIcon } from 'lucide-react';

interface PrazoBadgeProps {
  /** Instante limite (ISO). */
  ate: string | Date | null | undefined;
  /** Abaixo disto (em horas), fica âmbar. */
  alertaHoras?: number;
  /** Abaixo disto (em horas), fica vermelho. */
  criticoHoras?: number;
  agora?: Date;
  className?: string;
}

const descrever = (horas: number) => {
  if (horas <= 0) return 'Vencido';
  if (horas < 1) return 'menos de 1h';
  if (horas < 48) return `${Math.floor(horas)}h restantes`;
  return `${Math.floor(horas / 24)} dias restantes`;
};

/** Tempo até um prazo (vínculo, SLA, purga da mora), com a cor da urgência. */
export function PrazoBadge({ ate, alertaHoras = 48, criticoHoras = 12, agora = new Date(), className }: PrazoBadgeProps) {
  if (!ate) return <span className="text-xs text-muted-foreground">sem prazo</span>;
  const horas = (new Date(ate).getTime() - agora.getTime()) / 3_600_000;
  const cor =
    horas <= criticoHoras
      ? 'bg-destructive/10 text-red-300'
      : horas <= alertaHoras
        ? 'bg-warning/10 text-amber-300'
        : 'bg-success/10 text-emerald-300';
  return (
    <span
      className={cn('inline-flex h-6 w-fit items-center gap-1.5 rounded-md px-2 text-xs font-semibold whitespace-nowrap tabular-nums', cor, className)}
    >
      <ClockIcon className="size-3" aria-hidden />
      {descrever(horas)}
    </span>
  );
}
