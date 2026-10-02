import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
} from 'lucide-react';
import { useState } from 'react';

import { statusValidos } from '@workspace/domain';
import { CanalBadge } from '@workspace/ui/brand/canal-badge';
import { InfoTooltip } from '@workspace/ui/brand/info-tooltip';
import { PlacaMercosul } from '@workspace/ui/brand/placa-mercosul';
import { PrazoBadge } from '@workspace/ui/brand/prazo-badge';
import { Rotulo } from '@workspace/ui/brand/rotulo';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { formatarData, formatarDataHora, formatarMoeda } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';
import { cn } from '@workspace/ui/lib/utils';

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import {
  acessosQuery,
  api,
  casoQuery,
  eventosQuery,
  exigir,
  juridicoQuery,
  pode,
  podeTransferirQuery,
  type Canal,
  type CasoDetalhe,
  type UsuarioSessao,
} from '@/lib/api.ts';
import { tomDoStatus } from '@/lib/status.ts';

import { AbaJuridico } from './aba-juridico.tsx';
import { DialogoDistribuir } from './dialogo-distribuir.tsx';
import { LinhaDoTempo } from './linha-do-tempo.tsx';
import { PainelAcoes } from './painel-acoes.tsx';
import { PainelDevedor } from './painel-devedor.tsx';

interface Props {
  canal: Canal;
  casoId: string;
  sessao: UsuarioSessao;
}

export function FichaCaso({ canal, casoId, sessao }: Props) {
  const consulta = useQuery(casoQuery(casoId));
  const eventos = useQuery(eventosQuery(casoId));
  const planoA = canal === 'a';
  const juridico = useQuery({ ...juridicoQuery(casoId), enabled: planoA });
  const [distribuindo, setDistribuindo] = useState(false);
  const voltar = canal === 'a' ? '/a/casos' : '/b/casos';

  if (consulta.isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to={voltar}>
            <ArrowLeftIcon />
            Voltar à lista
          </Link>
        </Button>
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      </div>
    );
  }

  const caso = consulta.data;
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
        <Link to={voltar}>
          <ArrowLeftIcon />
          {canal === 'a' ? 'Casos' : 'Negociações'}
        </Link>
      </Button>

      {caso ? <Cabecalho caso={caso} canal={canal} sessao={sessao} /> : <Skeleton className="h-24 rounded-xl" />}
      {caso && planoA ? <DialogoDistribuir caso={caso} aberto={distribuindo} aoMudar={setDistribuindo} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Tabs defaultValue="resumo" className="lg:col-span-2">
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            {planoA ? <TabsTrigger value="juridico">Jurídico</TabsTrigger> : null}
            <TabsTrigger value="linha-do-tempo">Linha do tempo</TabsTrigger>
            <TabsTrigger value="pessoa">{canal === 'a' ? 'Devedor' : 'Vendedor'}</TabsTrigger>
            {pode.auditar(sessao) ? <TabsTrigger value="acessos">Acessos</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="resumo">
            <Card>
              <CardContent className="pt-1">{caso ? <Resumo caso={caso} /> : <Skeleton className="h-48" />}</CardContent>
            </Card>
          </TabsContent>
          {planoA ? (
            <TabsContent value="juridico">
              <AbaJuridico casoId={casoId} sessao={sessao} />
            </TabsContent>
          ) : null}
          <TabsContent value="linha-do-tempo">
            <Card>
              <CardContent className="pt-2">
                <LinhaDoTempo eventos={eventos.data} carregando={eventos.isPending} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="pessoa">
            <Card>
              <CardContent className="pt-1">
                <PainelDevedor casoId={casoId} rotulo={canal === 'a' ? 'Devedor' : 'Vendedor'} />
              </CardContent>
            </Card>
          </TabsContent>
          {pode.auditar(sessao) ? (
            <TabsContent value="acessos">
              <Acessos casoId={casoId} />
            </TabsContent>
          ) : null}
        </Tabs>

        <div className="space-y-6">
          {caso && caso.origem === 'lead_proprio' ? <ParaTransferir casoId={casoId} /> : null}
          {caso && planoA ? (
            <PainelAcoes caso={caso} rito={juridico.data?.rito ?? null} sessao={sessao} aoDistribuir={() => setDistribuindo(true)} />
          ) : null}
          {caso && planoA ? <Prazos caso={caso} /> : null}
        </div>
      </div>
    </div>
  );
}

function Cabecalho({ caso, canal, sessao }: { caso: CasoDetalhe; canal: Canal; sessao: UsuarioSessao }) {
  const queryClient = useQueryClient();
  const outrosStatus = statusValidos(caso.finalidade).filter((s) => s !== caso.status);

  const mudarStatus = useMutation({
    mutationFn: (status: string) =>
      exigir(api.POST('/api/casos/{id}/status', { params: { path: { id: caso.id } }, body: { status } })),
    onSuccess: ({ status }) => {
      toast.success(`Status alterado para ${status}.`);
      void queryClient.invalidateQueries({ queryKey: ['caso', caso.id] });
      void queryClient.invalidateQueries({ queryKey: ['casos'] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="gap-4 px-6 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
      <PlacaMercosul placa={caso.placa} tamanho="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-white">{caso.modelo ?? 'Modelo não informado'}</h1>
        <p className="text-sm text-muted-foreground">
          {[caso.ativo.ano, caso.ativo.cor, [caso.cidade, caso.uf].filter(Boolean).join(' · ')].filter(Boolean).join(' · ') ||
            'Sem detalhes do veículo'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CanalBadge canal={canal} />
          <StatusBadge status={caso.status} tom={tomDoStatus(caso.status)} />
        </div>
      </div>
      {/* Plano A: as mudanças passam pelo painel de próximos passos, com as guardas do banco. */}
      {pode.escrever(sessao) && canal === 'b' ? (
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={mudarStatus.isPending}>
                Mudar status
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Ciclo do Plano B</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {outrosStatus.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => mudarStatus.mutate(s)}>
                  <span className={cn('size-2 rounded-full', tomDoStatus(s) === 'perigo' ? 'bg-destructive' : 'bg-info')} />
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </Card>
  );
}

function Item({ rotulo, children, info }: { rotulo: string; children: React.ReactNode; info?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Rotulo>{rotulo}</Rotulo>
        {info ? <InfoTooltip text={info} /> : null}
      </div>
      <div className="text-sm font-medium text-white">{children}</div>
    </div>
  );
}

function Resumo({ caso }: { caso: CasoDetalhe }) {
  const comuns = (
    <>
      <Item rotulo="Fonte">{caso.fonte.nome}</Item>
      <Item rotulo="Credor">{caso.ativo.credorNome ?? caso.fonte.credorNome ?? '—'}</Item>
      <Item rotulo="Recebido em">{formatarData(caso.ativo.dataRecebimento)}</Item>
      <Item rotulo="Chassi">
        <span className="font-mono text-xs">{caso.ativo.chassi ?? '—'}</span>
      </Item>
    </>
  );
  if (caso.origem === 'plataforma_credor') {
    return (
      <div className="grid gap-6 py-4 sm:grid-cols-2 lg:grid-cols-3">
        {comuns}
        <Item rotulo="Valor da dívida" info="Valor em aberto no contrato, informado pelo credor.">
          <span className="tabular-nums">{formatarMoeda(caso.ativo.valorDivida)}</span>
        </Item>
        <Item rotulo="Recuperador">{caso.recuperadorNome ?? 'sem vínculo'}</Item>
      </div>
    );
  }
  return (
    <div className="grid gap-6 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {comuns}
      <Item rotulo="Origem do lead">{caso.canalLead}</Item>
      <Item rotulo="Evidência de origem" info="Prova de que o lead não nasceu do dado de uma plataforma de credor.">
        {caso.evidenciaLead}
      </Item>
      <Item rotulo="Saldo devedor">
        <span className="tabular-nums">{formatarMoeda(caso.saldoDevedor)}</span>
      </Item>
      <Item rotulo="Quitação negociada">
        <span className="tabular-nums">{formatarMoeda(caso.valorQuitacaoNegociado)}</span>
      </Item>
      <Item rotulo="Pago ao vendedor">
        <span className="tabular-nums">{formatarMoeda(caso.valorPagoAoDevedor)}</span>
      </Item>
    </div>
  );
}

// Depois do aceite, o prazo de aceite deixa de correr: mostrar contagem ali
// seria dizer que o recuperador ainda pode recusar.
const ACEITOS = new Set(['Aceito', 'Em Campo', 'Localizado', 'Retomado', 'Em Custódia', 'Entregue ao Credor', 'Encerrado']);

/** Plano A: o relógio do caso. */
function Prazos({ caso }: { caso: CasoDetalhe }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-white">Prazos</CardTitle>
        <CardDescription>Vencido o aceite, o caso volta para a fila de distribuição.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Rotulo>Aceite do recuperador</Rotulo>
          {caso.status === 'Distribuído' ? (
            <PrazoBadge ate={caso.prazoVinculo} alertaHoras={6} criticoHoras={2} />
          ) : ACEITOS.has(caso.status) ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
              <CheckCircle2Icon className="size-3.5" aria-hidden />
              aceito
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">aguardando distribuição</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Rotulo>Prazo máximo</Rotulo>
          <PrazoBadge ate={caso.prazoMaximo} />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {caso.prazoMaximo ? `vence em ${formatarDataHora(caso.prazoMaximo)}` : 'Sem prazo até a distribuição.'}
        </p>
      </CardContent>
    </Card>
  );
}

/** Plano B: as pré-condições jurídicas da transferência, avaliadas no servidor. */
function ParaTransferir({ casoId }: { casoId: string }) {
  const consulta = useQuery(podeTransferirQuery(casoId));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          Para transferir
          <InfoTooltip text="Sem anuência do credor, com RENAJUD ativo ou gravame não baixado, a transferência não pode acontecer." />
        </CardTitle>
        <CardDescription>
          {consulta.data?.podeTransferir ? 'Todas as pré-condições cumpridas.' : 'Pré-condições pendentes.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {consulta.isPending ? (
          <Skeleton className="h-20" />
        ) : consulta.isError ? (
          <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
        ) : consulta.data.pendencias.length ? (
          <ul className="space-y-2">
            {consulta.data.pendencias.map((p) => (
              <li key={p} className="flex items-center gap-2 text-sm text-amber-300">
                <CircleAlertIcon className="size-4" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2Icon className="size-4" aria-hidden />
            Liberado para transferência
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Acessos({ casoId }: { casoId: string }) {
  const consulta = useQuery(acessosQuery(casoId));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-white">Acessos ao dado pessoal</CardTitle>
        <CardDescription>Quem revelou nome e documento, quando e com que finalidade.</CardDescription>
      </CardHeader>
      <CardContent>
        {consulta.isPending ? (
          <Skeleton className="h-20" />
        ) : consulta.isError ? (
          <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
        ) : consulta.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum acesso registrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>Finalidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="tabular-nums">{formatarDataHora(a.acessadoEm)}</TableCell>
                  <TableCell>{a.usuarioNome}</TableCell>
                  <TableCell className="max-w-80 text-pretty whitespace-normal">{a.finalidade}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
