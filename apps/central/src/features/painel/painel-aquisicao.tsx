import { useQuery } from '@tanstack/react-query';
import { BanknoteIcon, CheckCircle2Icon, HandshakeIcon, InboxIcon, TrendingUpIcon, XCircleIcon } from 'lucide-react';

import { casosPorStatus, resumoAquisicao, STATUS_AQUISICAO } from '@workspace/domain';
import { InfoTooltip } from '@workspace/ui/brand/info-tooltip';
import { KpiCard } from '@workspace/ui/brand/kpi-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { formatarMoeda, formatarNumero, formatarPercentual } from '@workspace/ui/lib/formato';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { casosQuery } from '@/lib/api.ts';

import { GraficoStatus } from './grafico-status.tsx';
import { ListaRecentes } from './lista-recentes.tsx';

export function PainelAquisicao() {
  const consulta = useQuery(casosQuery('lead_proprio'));
  const casos = consulta.data?.casos ?? [];
  const resumo = resumoAquisicao(casos);

  return (
    <>
      <CabecalhoDePagina titulo="Painel · Aquisição" descricao="Leads próprios: funil até a quitação e a transferência para a ReCredita." />
      {consulta.isError ? (
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {consulta.isPending ? (
              Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
            ) : (
              <>
                <KpiCard titulo="Leads" valor={formatarNumero(resumo.total)} icone={InboxIcon} cor="indigo" info="Leads próprios em qualquer etapa." />
                <KpiCard titulo="Em contato" valor={formatarNumero(resumo.entrada)} icone={HandshakeIcon} cor="cinza" info="Leads recebidos ou em primeiro contato." />
                <KpiCard titulo="Em negociação" valor={formatarNumero(resumo.negociacao)} icone={HandshakeIcon} cor="ambar" info="Proposta enviada, negociando com o credor ou quitação aprovada." />
                <KpiCard
                  titulo="Saldo em negociação"
                  valor={resumo.saldoEmNegociacao === null ? null : formatarMoeda(resumo.saldoEmNegociacao)}
                  icone={BanknoteIcon}
                  cor="azul"
                  info="Soma do saldo devedor dos casos em negociação: o capital que a carteira pode exigir."
                />
                <KpiCard
                  titulo="Conversão"
                  valor={formatarPercentual(resumo.taxaConversao)}
                  icone={TrendingUpIcon}
                  cor="verde"
                  info="Quitados ou transferidos ÷ leads recebidos."
                  detalhe={resumo.total ? `${formatarNumero(resumo.exito)} de ${formatarNumero(resumo.total)}` : undefined}
                />
                <KpiCard titulo="Desistências" valor={formatarNumero(resumo.perda)} icone={XCircleIcon} cor="vermelho" info="Desistiu ou encerrado sem aquisição." />
              </>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  Funil por etapa
                  <InfoTooltip text="Quantidade de negociações em cada status, do lead à transferência." />
                </CardTitle>
                <CardDescription>Do lead à transferência.</CardDescription>
              </CardHeader>
              <CardContent>
                {consulta.isPending ? (
                  <Skeleton className="h-72" />
                ) : (
                  <GraficoStatus dados={casosPorStatus(casos, STATUS_AQUISICAO)} cor="var(--chart-5)" />
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <CheckCircle2Icon className="size-4 text-success" aria-hidden />
                  Recebidos recentemente
                </CardTitle>
              </CardHeader>
              <CardContent>{consulta.isPending ? <Skeleton className="h-40" /> : <ListaRecentes canal="b" casos={casos} />}</CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
