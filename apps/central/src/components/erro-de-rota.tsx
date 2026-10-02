import { Link, type ErrorComponentProps } from '@tanstack/react-router';
import { CompassIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@workspace/ui/components/empty';

/**
 * Erro inesperado numa tela. Mostra o que houve e um caminho de volta, em vez
 * de uma página em branco; o detalhe técnico fica no console.
 */
export function ErroDeRota({ error, reset }: ErrorComponentProps) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Algo deu errado nesta tela</EmptyTitle>
          <EmptyDescription>{error instanceof Error ? error.message : 'Erro desconhecido.'}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button onClick={() => (reset ? reset() : window.location.reload())}>
            <RefreshCwIcon />
            Tentar de novo
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Ir para o início</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}

export function PaginaNaoEncontrada() {
  return (
    <Empty className="py-24">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CompassIcon />
        </EmptyMedia>
        <EmptyTitle>Página não encontrada</EmptyTitle>
        <EmptyDescription>O endereço não corresponde a nenhuma tela.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild>
          <Link to="/">Ir para o início</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
