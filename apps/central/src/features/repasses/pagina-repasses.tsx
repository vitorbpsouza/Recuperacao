import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrainCircuitIcon, CheckCircle2Icon, ClockIcon, WalletIcon, XCircleIcon } from 'lucide-react';
import { useState } from 'react';

import { KpiCard } from '@workspace/ui/brand/kpi-card';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { ToggleGroup, ToggleGroupItem } from '@workspace/ui/components/toggle-group';
import { formatarData, formatarMoeda } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, ErroApi, exigir, pode, repassesQuery, type RecomendacaoCamila, type Repasse, type UsuarioSessao } from '@/lib/api.ts';

const TOM = { Pendente: 'alerta', Pago: 'sucesso', Cancelado: 'perigo' } as const;
const ICONE = { Pendente: ClockIcon, Pago: CheckCircle2Icon, Cancelado: XCircleIcon } as const;
const TOM_PRIORIDADE: Record<string, string> = {
  Crítica: 'border-destructive/40 text-red-300',
  Alta: 'border-warning/40 text-amber-300',
  Média: 'border-info/40 text-blue-300',
};

type Filtro = 'todos' | Repasse['status'];

export function PaginaRepasses({ sessao }: { sessao: UsuarioSessao }) {
  const queryClient = useQueryClient();
  const consulta = useQuery(repassesQuery);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [confirmando, setConfirmando] = useState<Repasse | null>(null);

  const repasses = consulta.data ?? [];
  const soma = (status: Repasse['status']) =>
    repasses.filter((r) => r.status === status).reduce((t, r) => t + r.valor, 0);
  const visiveis = filtro === 'todos' ? repasses : repasses.filter((r) => r.status === filtro);

  const pagar = useMutation({
    mutationFn: (id: string) => exigir(api.POST('/api/repasses/{id}/pagar', { params: { path: { id } } })),
    onSuccess: () => {
      toast.success('Repasse marcado como pago.');
      setConfirmando(null);
      void queryClient.invalidateQueries({ queryKey: ['repasses'] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Prioridades da CAMILA: só sob pedido, e só o que o servidor devolver.
  const camila = useMutation({
    mutationFn: () => exigir(api.POST('/api/camila/prioridades')),
  });
  const recomendacoes = new Map<string, RecomendacaoCamila>((camila.data ?? []).map((r) => [r.repasseId, r]));

  return (
    <>
      <CabecalhoDePagina
        titulo="Repasses"
        descricao="Comissões, ajudas de custo e bônus devidos à rede de campo."
        acoes={
          <Button variant="outline" onClick={() => camila.mutate()} disabled={camila.isPending || !repasses.some((r) => r.status === 'Pendente')}>
            {camila.isPending ? <Spinner /> : <BrainCircuitIcon />}
            Priorizar com a CAMILA
          </Button>
        }
      />

      {camila.error ? (
        <Alert className="mb-6">
          <BrainCircuitIcon />
          <AlertTitle>CAMILA indisponível</AlertTitle>
          <AlertDescription>
            {camila.error instanceof ErroApi && camila.error.status === 503
              ? 'Nenhum modelo configurado no servidor. A priorização aparece aqui quando a credencial da Vertex AI estiver definida.'
              : camila.error.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {consulta.isError ? (
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {consulta.isPending ? (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
            ) : (
              <>
                <KpiCard titulo="Pendente" valor={formatarMoeda(soma('Pendente'))} icone={ClockIcon} cor="ambar" info="Soma dos repasses ainda não pagos." />
                <KpiCard titulo="Pago" valor={formatarMoeda(soma('Pago'))} icone={CheckCircle2Icon} cor="verde" info="Soma dos repasses já pagos." />
                <KpiCard titulo="Repasses" valor={String(repasses.length)} icone={WalletIcon} info="Quantidade de repasses registrados." />
                <KpiCard
                  titulo="Ticket médio"
                  valor={repasses.length ? formatarMoeda(repasses.reduce((t, r) => t + r.valor, 0) / repasses.length) : null}
                  icone={WalletIcon}
                  cor="indigo"
                  info="Valor médio por repasse."
                />
              </>
            )}
          </div>

          <ToggleGroup type="single" value={filtro} onValueChange={(v) => v && setFiltro(v as Filtro)} variant="outline" size="sm">
            <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
            <ToggleGroupItem value="Pendente">Pendentes</ToggleGroupItem>
            <ToggleGroupItem value="Pago">Pagos</ToggleGroupItem>
            <ToggleGroupItem value="Cancelado">Cancelados</ToggleGroupItem>
          </ToggleGroup>

          <div className="custom-scrollbar overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow className="bg-white/3 hover:bg-white/3">
                  {['Data', 'Recuperador', 'Caso', 'Tipo', 'Valor', 'CAMILA', 'Status', ''].map((t) => (
                    <TableHead key={t} className="px-4 text-[11px] font-semibold tracking-widest uppercase">
                      {t}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {consulta.isPending ? (
                  <TableRow>
                    <TableCell colSpan={8} className="px-4 py-4">
                      <Skeleton className="h-24" />
                    </TableCell>
                  </TableRow>
                ) : (
                  visiveis.map((r) => {
                    const Icone = ICONE[r.status];
                    const rec = recomendacoes.get(r.id);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="px-4 text-muted-foreground tabular-nums">{formatarData(r.data)}</TableCell>
                        <TableCell className="px-4 font-medium text-white">{r.recuperadorNome}</TableCell>
                        <TableCell className="px-4 font-mono text-xs">{r.placa}</TableCell>
                        <TableCell className="px-4">
                          <span className={r.tipo === 'Comissão' ? 'text-blue-300' : 'text-indigo-300'}>{r.tipo}</span>
                          {r.observacao ? <p className="text-xs text-muted-foreground">{r.observacao}</p> : null}
                        </TableCell>
                        <TableCell className="px-4 font-semibold text-white tabular-nums">{formatarMoeda(r.valor)}</TableCell>
                        <TableCell className="max-w-56 px-4">
                          {rec ? (
                            <div className="space-y-1">
                              <Badge variant="outline" className={TOM_PRIORIDADE[rec.prioridade] ?? ''}>
                                {rec.prioridade}
                              </Badge>
                              <p className="line-clamp-2 text-xs text-muted-foreground" title={rec.justificativa}>
                                {rec.justificativa}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4">
                          <span className="inline-flex items-center gap-1.5">
                            <Icone className="size-3.5 text-muted-foreground" aria-hidden />
                            <StatusBadge status={r.status} tom={TOM[r.status]} />
                          </span>
                        </TableCell>
                        <TableCell className="px-4 text-right">
                          {r.status === 'Pendente' && pode.administrar(sessao) ? (
                            <Button size="sm" onClick={() => setConfirmando(r)}>
                              Pagar
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <AlertDialog open={!!confirmando} onOpenChange={(a) => !a && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar repasse como pago?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmando
                ? `${formatarMoeda(confirmando.valor)} para ${confirmando.recuperadorNome} (${confirmando.tipo}). Esta ação não se desfaz pela tela.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmando && pagar.mutate(confirmando.id)} disabled={pagar.isPending}>
              {pagar.isPending ? <Spinner /> : null}
              Confirmar pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
