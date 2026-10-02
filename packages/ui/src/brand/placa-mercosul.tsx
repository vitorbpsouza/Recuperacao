import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

import { formatarPlaca } from '../lib/formato.ts';

// Proporção próxima da placa real (400 × 130 mm ≈ 3:1) e fonte proporcional
// ao tamanho: "AAA-0A00" cabe inteiro em qualquer variante.
const placa = cva(
  'inline-flex shrink-0 flex-col overflow-hidden rounded-md border-2 border-slate-800 bg-white shadow-sm',
  {
    variants: {
      tamanho: {
        sm: 'h-7 w-[4.75rem] [--faixa:--spacing(2.25)] [--texto:11px]',
        md: 'h-9 w-24 [--faixa:--spacing(2.75)] [--texto:var(--text-sm)]',
        lg: 'h-11 w-28 [--faixa:--spacing(3.25)] [--texto:var(--text-base)]',
      },
    },
    defaultVariants: { tamanho: 'md' },
  },
);

interface PlacaMercosulProps extends VariantProps<typeof placa> {
  placa: string;
  className?: string;
}

/** A placa no padrão Mercosul — assinatura visual da plataforma. */
export function PlacaMercosul({ placa: valor, tamanho, className }: PlacaMercosulProps) {
  const texto = formatarPlaca(valor);
  return (
    <span className={cn(placa({ tamanho }), className)} role="img" aria-label={`Placa ${texto}`}>
      <span className="flex h-(--faixa) items-center justify-between bg-blue-700 px-1" aria-hidden>
        <span className="flex gap-0.5">
          <span className="size-1 rounded-full bg-white/50" />
          <span className="size-1 rounded-full bg-white/50" />
        </span>
        <span className="text-[6px] leading-none font-bold tracking-tighter text-white uppercase">Brasil</span>
        <span className="size-1.5 rounded-full bg-white/20" />
      </span>
      <span
        className="flex flex-1 items-center justify-center text-(length:--texto) leading-none font-bold tracking-wide whitespace-nowrap text-slate-900 tabular-nums"
        aria-hidden
      >
        {texto}
      </span>
    </span>
  );
}
