import { useQuery } from '@tanstack/react-query';
import { CarFrontIcon, CheckCircle2Icon, ClockIcon, HandCoinsIcon, InboxIcon, TrendingUpIcon } from 'lucide-react';

import { casosPorStatus, resumoRecuperacao, STATUS_RECUPERACAO, ETAPAS_RECUPERACAO } from '@workspace/domain';
import { InfoTooltip } from '@workspace/ui/brand/info-tooltip';
import { KpiCard } from '@workspace/ui/brand/kpi-card';
import { PlacaMercosul } from '@workspace/ui/brand/placa-mercosul';
import { PrazoBadge } from '@workspace/ui/brand/prazo-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { formatarNumero, formatarPercentual } from '@workspace/ui/lib/formato';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { useAgora } from '@/lib/agora.ts';
import { casosQuery } from '@/lib/api.ts';

import { GraficoStatus } from './grafico-status.tsx';
import { ListaRecentes } from './lista-recentes.tsx';

const HORAS_DE_ALERTA = 48;

export function PainelRecuperacao() {
  const consulta = useQuery(casosQuery('plataforma_credor'));
  const casos = consulta.data?.casos ?? [];
  const resumo = resumoRecuperacao(casos);

  // Casos em andamento com prazo máximo nas próximas 48h — onde a central age primeiro.
  const agora = useAgora();
  const vencendo = casos
    .filter((c) => (ETAPAS_RECUPERACAO.campo as readonly string[]).includes(c.status) && c.prazoMaximo)
    .filter((c) => new Date(c.prazoMaximo!).getTime() - agora < HORAS_DE_ALERTA * 3_600_000)
    .sort((x, y) => x.prazoMaximo!.localeCompare(y.prazoMaximo!));

  return (
    <>
      <CabecalhoDePagina titulo="Painel · Recuperação" descricao="Carteira dos credores: etapa de cada caso, prazos e resultado." />
      {consulta.isError ? (
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {consulta.isPending ? (
              Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
            ) : (
              <>
                <KpiCard titulo="Na carteira" valor={formatarNumero(resumo.total)} icone={CarFrontIcon} info="Casos recebidos dos credores, em qualquer etapa." />
                <KpiCard titulo="Em preparo" valor={formatarNumero(resumo.preparo)} icone={InboxIcon} cor="cinza" info="Recebidos, em enriquecimento, em análise ou prontos para campo: ainda sem recuperador." />
                <KpiCard titulo="Em campo" valor={formatarNumero(resumo.campo)} icone={ClockIcon} cor="ambar" info="Distribuídos, aceitos, em campo ou localizados." />
                <KpiCard titulo="Retomados" valor={formatarNumero(resumo.retomados)} icone={CheckCircle2Icon} cor="verde" info="Bens apreendidos ou entregues voluntariamente: no pátio, aguardando a purga ou já entregues ao credor." />
                <KpiCard
                  titulo="Taxa de recuperação"
                  valor={formatarPercentual(resumo.taxaRecuperacao)}
                  icone={TrendingUpIcon}
                  cor="indigo"
                  info="Retomados ÷ casos na carteira. Sem casos, não há taxa."
                  detalhe={resumo.total ? `de ${formatarNumero(resumo.total)} recebidos` : undefined}
                />
                <KpiCard
                  titulo="Curados"
                  valor={formatarNumero(resumo.curados)}
                  icone={HandCoinsIcon}
                  cor="verde"
                  info="Dívidas pagas ou acordadas durante o caso. Para o credor, também é sucesso."
                  detalhe={resumo.taxaCura === null ? undefined : `taxa de cura ${formatarPercentual(resumo.taxaCura)}`}
                />
              </>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  Casos por etapa
                  <InfoTooltip text="Quantidade de casos em cada status do ciclo de recuperação." />
                </CardTitle>
                <CardDescription>Do recebimento à retomada.</CardDescription>
              </CardHeader>
              <CardContent>
                {consulta.isPending ? (
                  <Skeleton className="h-72" />
                ) : (
                  <GraficoStatus dados={casosPorStatus(casos, STATUS_RECUPERACAO)} cor="var(--chart-1)" />
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  Prazos nas próximas 48h
                  <InfoTooltip text="Casos em andamento cujo prazo máximo vence em até 48 horas." />
                </CardTitle>
                <CardDescription>{vencendo.length ? `${vencendo.length} caso(s) exigem atenção.` : 'Nenhum prazo crítico agora.'}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {vencendo.slice(0, 6).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 rounded-lg bg-white/3 p-3 ring-1 ring-white/5">
                      <PlacaMercosul placa={c.placa} tamanho="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{c.recuperadorNome ?? 'sem recuperador'}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.status}</p>
                      </div>
                      <PrazoBadge ate={c.prazoMaximo} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-white">Recebidos recentemente</CardTitle>
            </CardHeader>
            <CardContent>{consulta.isPending ? <Skeleton className="h-40" /> : <ListaRecentes canal="a" casos={casos} />}</CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
