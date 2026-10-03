import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { ActivityIcon, CpuIcon, DatabaseIcon, MapPinnedIcon, ScaleIcon, ShieldCheckIcon } from 'lucide-react';

import { InfoTooltip } from '@workspace/ui/brand/info-tooltip';
import { Rotulo } from '@workspace/ui/brand/rotulo';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { formatarDataHora, formatarMoeda, formatarNumero } from '@workspace/ui/lib/formato';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { DialogoFornecedor } from './dialogo-fornecedor.tsx';
import { auditoriaQuery, bureausQuery, custosBureauQuery, pode, type Bureau, type UsuarioSessao } from '@/lib/api.ts';

const ICONE_DO_TIPO: Record<Bureau['tipo'], typeof ShieldCheckIcon> = {
  Crédito: ShieldCheckIcon,
  Veicular: CpuIcon,
  Localização: MapPinnedIcon,
  Judicial: ScaleIcon,
};

const BASE_LEGAL: Record<string, string> = {
  execucao_contrato: 'Execução de contrato',
  legitimo_interesse: 'Legítimo interesse',
  obrigacao_legal: 'Obrigação legal',
  consentimento: 'Consentimento',
};

/**
 * Fornecedores de dado e a trilha de cada consulta. A chave de API nunca
 * aparece aqui — nem o nome da variável que a guarda: só o contrato que
 * ampara a consulta, que é o que a auditoria precisa.
 */
export function PaginaDados({ sessao }: { sessao: UsuarioSessao }) {
  const auditor = pode.auditar(sessao);
  const [novo, setNovo] = useState(false);
  return (
    <>
      <CabecalhoDePagina
        titulo="Dados & Bureaus"
        descricao="Fornecedores contratados, custo por consulta e a trilha de procedência de cada dado."
        acoes={
          pode.administrar(sessao) ? (
            <Button size="sm" onClick={() => setNovo(true)}>
              <PlusIcon />
              Novo fornecedor
            </Button>
          ) : undefined
        }
      />
      {novo ? <DialogoFornecedor aoFechar={() => setNovo(false)} /> : null}
      <Tabs defaultValue="bureaus">
        <TabsList>
          <TabsTrigger value="bureaus">Bureaus</TabsTrigger>
          {auditor ? <TabsTrigger value="custos">Custos</TabsTrigger> : null}
          {auditor ? <TabsTrigger value="trilha">Trilha de consultas</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="bureaus">
          <Bureaus />
        </TabsContent>
        {auditor ? (
          <>
            <TabsContent value="custos">
              <Custos />
            </TabsContent>
            <TabsContent value="trilha">
              <Trilha />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </>
  );
}

function Bureaus() {
  const consulta = useQuery(bureausQuery);
  if (consulta.isError) return <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {consulta.isPending
        ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)
        : consulta.data.map((b) => {
            const Icone = ICONE_DO_TIPO[b.tipo];
            return (
              <Card key={b.id} className="gap-4 px-5 py-5">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-white/5 text-blue-300 ring-1 ring-white/5">
                    <Icone className="size-5" aria-hidden />
                  </span>
                  <Badge className="bg-success/15 text-emerald-300">Ativo</Badge>
                </div>
                <div>
                  <p className="font-bold text-white">{b.nome}</p>
                  <p className="text-xs text-muted-foreground">{b.tipo}</p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Contrato</span>
                    <span className="font-mono text-white">{b.contratoFornecedorId}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Custo por consulta</span>
                    <span className="font-semibold text-white tabular-nums">{formatarMoeda(b.custoConsulta)}</span>
                  </div>
                </div>
              </Card>
            );
          })}
    </div>
  );
}

function Custos() {
  const consulta = useQuery(custosBureauQuery);
  if (consulta.isError) return <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />;
  const total = (consulta.data ?? []).reduce((t, c) => t + c.custoTotal, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <DatabaseIcon className="size-4 text-info" aria-hidden />
          Custo real de aquisição de dado
          <InfoTooltip text="Somado da trilha de consultas: a mesma tabela que defende a operação diz qual fornecedor vale o preço." />
        </CardTitle>
        <CardDescription>{consulta.data?.length ? `Total: ${formatarMoeda(total)}` : 'Nenhuma consulta registrada ainda.'}</CardDescription>
      </CardHeader>
      <CardContent>
        {consulta.isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bureau</TableHead>
                <TableHead className="text-right">Consultas</TableHead>
                <TableHead className="text-right">Custo total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.data.map((c) => (
                <TableRow key={c.nome}>
                  <TableCell className="font-medium text-white">{c.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarNumero(c.consultas)}</TableCell>
                  <TableCell className="text-right font-semibold text-white tabular-nums">{formatarMoeda(c.custoTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Trilha() {
  const consulta = useQuery(auditoriaQuery);
  if (consulta.isError) return <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <ActivityIcon className="size-4 text-success" aria-hidden />
          Trilha de consultas
        </CardTitle>
        <CardDescription>
          Append-only: não se altera nem se apaga. Guarda os campos retornados, não os valores (LGPD art. 37).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {consulta.isPending ? (
          <Skeleton className="h-24" />
        ) : consulta.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma consulta registrada.</p>
        ) : (
          <div className="custom-scrollbar overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Bureau</TableHead>
                  <TableHead>Base legal</TableHead>
                  <TableHead>Justificativa</TableHead>
                  <TableHead>Campos</TableHead>
                  <TableHead>Retenção até</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consulta.data.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="tabular-nums">{formatarDataHora(l.consultadoEm)}</TableCell>
                    <TableCell>{l.operadorNome}</TableCell>
                    <TableCell>{l.bureauNome}</TableCell>
                    <TableCell>
                      <Rotulo>{BASE_LEGAL[l.baseLegal] ?? l.baseLegal}</Rotulo>
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal">{l.justificativa}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {l.camposRetornados.map((c) => (
                          <Badge key={c} variant="secondary">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatarDataHora(l.retencaoAte)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
