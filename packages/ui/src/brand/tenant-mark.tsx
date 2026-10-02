import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

const marca = cva(
  'inline-flex shrink-0 items-center justify-center overflow-hidden bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20',
  {
    variants: {
      tamanho: {
        sm: 'size-8 rounded-lg text-sm',
        md: 'size-10 rounded-lg text-lg',
        lg: 'size-16 rounded-2xl text-2xl shadow-2xl shadow-primary/40',
      },
    },
    defaultVariants: { tamanho: 'md' },
  },
);

interface TenantMarkProps extends VariantProps<typeof marca> {
  /** Sigla exibida enquanto o tenant não tem logo (ex.: "RC"). */
  sigla: string;
  nome: string;
  logoUrl?: string | null;
  className?: string;
}

/**
 * O quadrado azul da marca — o mesmo da interface anterior, agora vindo do
 * tenant: cada empresa da plataforma tem sigla e logo próprios.
 */
export function TenantMark({ sigla, nome, logoUrl, tamanho, className }: TenantMarkProps) {
  return (
    <span className={cn(marca({ tamanho }), className)} role="img" aria-label={nome}>
      {logoUrl ? <img src={logoUrl} alt="" className="size-full object-contain" /> : sigla}
    </span>
  );
}
