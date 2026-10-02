import { cn } from 'cn';
import type * as React from 'react';

/**
 * O micro-rótulo em caixa alta da identidade anterior. Passa de 10px em
 * slate-500 para 11px em slate-400: mesmo desenho, legível (contraste AA).
 */
export function Rotulo({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('text-[11px] leading-none font-semibold tracking-widest text-muted-foreground uppercase', className)}
      {...props}
    />
  );
}
