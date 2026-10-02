import { cn } from 'cn';
import { InfoIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip.tsx';

interface InfoTooltipProps {
  text: string;
  className?: string;
}

/** Explicação curta ao lado de um rótulo. Mesma API da versão anterior; acessível por teclado. */
export function InfoTooltip({ text, className }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className={cn(
            'inline-flex rounded-sm text-muted-foreground transition-colors hover:text-info focus-visible:text-info focus-visible:outline-none',
            className,
          )}
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-60 text-pretty">{text}</TooltipContent>
    </Tooltip>
  );
}
