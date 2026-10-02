import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';

/**
 * Falha de consulta, visível. Devolver lista vazia aqui faria a tela dizer
 * "nenhum caso" quando a verdade é "não foi possível consultar".
 */
export function ErroDeConsulta({ erro, aoTentar }: { erro: unknown; aoTentar: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>Não foi possível carregar</AlertTitle>
      <AlertDescription>{erro instanceof Error ? erro.message : 'Falha desconhecida.'}</AlertDescription>
      <AlertAction>
        <Button variant="outline" size="sm" onClick={aoTentar}>
          <RefreshCwIcon />
          Tentar de novo
        </Button>
      </AlertAction>
    </Alert>
  );
}

/** Título de página no desenho anterior: título forte, descrição curta. */
export function CabecalhoDePagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}
