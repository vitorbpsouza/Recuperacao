import { Link } from '@tanstack/react-router';
import { BrainCircuitIcon, LockKeyholeIcon, WalletIcon } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet';

import { pode, type UsuarioSessao } from '@/lib/api.ts';

/**
 * A CAMILA no estado em que ela está: o que faz hoje e como trata o dado.
 * Nada de insight inventado — o que ela produz aparece na tela onde é usado.
 */
export function PainelCamila({ sessao }: { sessao: UsuarioSessao }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="CAMILA">
          <BrainCircuitIcon className="text-info" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-info/15 text-info">
              <BrainCircuitIcon className="size-5" aria-hidden />
            </span>
            <div>
              <SheetTitle className="text-white">CAMILA</SheetTitle>
              <SheetDescription>Assistente de análise da operação</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="space-y-6 px-4">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-white">O que ela faz hoje</h3>
            <div className="rounded-lg bg-white/3 p-4 ring-1 ring-white/5">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                <WalletIcon className="size-4 text-info" aria-hidden />
                Prioriza repasses pendentes
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ordena os pagamentos à rede de campo por atraso, valor e risco, com a justificativa de cada sugestão.
              </p>
              {pode.verPlanoA(sessao) ? (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/a/repasses">Abrir repasses</Link>
                </Button>
              ) : null}
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Como ela trata o dado</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <LockKeyholeIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                Recebe só o necessário para a tarefa: sem nome de pessoa, sem placa, sem documento.
              </li>
              <li className="flex gap-2">
                <LockKeyholeIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                Enxerga só o canal de quem pede — a fronteira entre os planos vale também para ela.
              </li>
              <li className="flex gap-2">
                <LockKeyholeIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                Sugere; quem decide e executa é sempre uma pessoa.
              </li>
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
