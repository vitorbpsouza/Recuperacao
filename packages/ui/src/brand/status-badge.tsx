import { cn } from 'cn';

/** Tom semântico de um status. O mapeamento status → tom vive no domínio. */
export type Tom =
  | 'neutro'
  | 'info'
  | 'destaque'
  | 'progresso'
  | 'sucesso'
  | 'concluido'
  | 'alerta'
  | 'perigo'
  | 'encerrado';

const TONS: Record<Tom, string> = {
  neutro: 'bg-slate-500/10 text-slate-300',
  info: 'bg-info/10 text-blue-300',
  destaque: 'bg-canal-b/10 text-indigo-300',
  progresso: 'bg-info/15 text-blue-300 ring-1 ring-inset ring-info/30',
  sucesso: 'bg-success/10 text-emerald-300',
  concluido: 'bg-success text-white',
  alerta: 'bg-warning/10 text-amber-300',
  perigo: 'bg-destructive/10 text-red-300',
  encerrado: 'bg-slate-800 text-slate-400',
};

/** Pílula de status no desenho da interface anterior: caixa alta, compacta. */
export function StatusBadge({ status, tom, className }: { status: string; tom: Tom; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase',
        TONS[tom],
        className,
      )}
    >
      {status}
    </span>
  );
}
