import { cn } from 'cn';
import { HandshakeIcon, ShieldCheckIcon } from 'lucide-react';

export type Canal = 'a' | 'b';

export const CANAIS: Record<Canal, { titulo: string; sub: string; Icone: typeof ShieldCheckIcon }> = {
  a: { titulo: 'Recuperação', sub: 'Plano A · carteira do credor', Icone: ShieldCheckIcon },
  b: { titulo: 'Aquisição', sub: 'Plano B · lead próprio', Icone: HandshakeIcon },
};

/** Em que plano a tela está. Azul no Plano A, índigo no Plano B — sempre visível. */
export function CanalBadge({ canal, className }: { canal: Canal; className?: string }) {
  const { titulo, Icone } = CANAIS[canal];
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold',
        canal === 'a'
          ? 'border-canal-a/30 bg-canal-a/15 text-blue-300'
          : 'border-canal-b/30 bg-canal-b/15 text-indigo-300',
        className,
      )}
    >
      <Icone className="size-3.5" aria-hidden />
      Plano {canal.toUpperCase()} · {titulo}
    </span>
  );
}
