import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangleIcon,
  BanknoteIcon,
  CarFrontIcon,
  CheckCircle2Icon,
  ClockIcon,
  EyeIcon,
  HandCoinsIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';

import { casosPorStatus, resumoRecuperacao, STATUS_RECUPERACAO } from '@workspace/domain';
import { InfoTooltip } from '@workspace/ui/brand/info-tooltip';
import { KpiCard } from '@workspace/ui/brand/kpi-card';
import { PlacaMercosul } from '@workspace/ui/brand/placa-mercosul';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Badge } from '@workspace/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@workspace/ui/components/chart';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { useMovimentoReduzido } from '@workspace/ui/hooks/use-movimento-reduzido';
import { formatarData, formatarDataHora, formatarMoeda, formatarNumero, formatarPercentual } from '@workspace/ui/lib/formato';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { Mapa } from '@/components/mapa.tsx';
import { casosQuery, painelRecuperacaoQuery, type AlertaCaso } from '@/lib/api.ts';
import { tomDoStatus } from '@/lib/status.ts';

import { GraficoStatus } from './grafico-status.tsx';
import { ListaRecentes } from './lista-recentes.tsx';

/**
 * Paleta categórica validada (CVD e contraste) contra o fundo slate-950, em
 * ordem fixa: a cor segue o credor, nunca a posição. Do sexto em diante,
 * "Outros".
 */
const CATEGORICAS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'] as const;
const OUTROS = '#64748b';

/** Cor do ponto no mapa pela etapa do caso. */
const COR_DA_ETAPA = (status: string) =>
  ['Retomado', 'Em Custódia', 'Entregue ao Credor'].includes(status)
    ? '#199e70'
    : ['Distribuído', 'Aceito', 'Em Campo', 'Localizado'].includes(status)
      ? '#3987e5'
      : '#c98500';

const ICONE_ALERTA: Record<AlertaCaso['tipo'], string> = {
  prazo_vencido: 'Prazo vencido',
  prazo_48h: 'Vence em 48h',
  aceite_vencido: 'Aceite vencido',
  parado: 'Parado',
  proprietario_diferente: 'Proprietário ≠ devedor',
};

/** R$ 175,5 mil · R$ 1,2 mi: cabe no cartão; o valor exato fica no detalhe. */
const moedaCompacta = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v);

const mesCurto = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a!, m! - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
};

function Cartao({ titulo, info, descricao, children, className }: { titulo: string; info?: string; descricao?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          {titulo}
          {info ? <InfoTooltip text={info} /> : null}
        </CardTitle>
        {descricao ? <CardDescription>{descricao}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Painel executivo do Plano A: carteira, mapa, prazos, praças, credores e rede de campo — tudo com dado real. */
export function PainelRecuperacao() {
  const casos = useQuery(casosQuery('plataforma_credor'));
  const painel = useQuery(painelRecuperacaoQuery);
  const navigate = useNavigate();
  const semAnimacao = useMovimentoReduzido();
  const resumo = resumoRecuperacao(casos.data?.casos ?? []);
  const p = painel.data;

  const pontos = useMemo(
    () =>
      (p?.mapa ?? []).map((m) => ({
        id: m.casoId,
        latitude: m.latitude,
        longitude: m.longitude,
        cor: COR_DA_ETAPA(m.status),
        titulo: `${m.placa} · ${m.modelo ?? ''}`,
        linhas: [m.status, `${m.fonte === 'radar' ? 'Radar' : 'Avistado'} em ${formatarDataHora(m.observadoEm)}`, m.descricao],
        acao: { rotulo: 'Abrir caso', aoClicar: () => void navigate({ to: '/a/casos/$casoId', params: { casoId: m.casoId } }) },
      })),
    [p?.mapa, navigate],
  );

  const credores = useMemo(() => {
    const lista = p?.porCredor ?? [];
    const principais = lista.slice(0, 5).map((c, i) => ({ ...c, cor: CATEGORICAS[i]! }));
    const resto = lista.slice(5);
    return resto.length
      ? [...principais, { credor: 'Outros', total: resto.reduce((s, c) => s + c.total, 0), retomados: resto.reduce((s, c) => s + c.retomados, 0), valorDivida: null, cor: OUTROS }]
      : principais;
  }, [p?.porCredor]);

  if (casos.isError || painel.isError) {
    return (
      <>
        <CabecalhoDePagina titulo="Painel executivo" descricao="Recuperação para os credores." />
        <ErroDeConsulta erro={casos.error ?? painel.error} aoTentar={() => void Promise.all([casos.refetch(), painel.refetch()])} />
      </>
    );
  }

  const carregando = casos.isPending || painel.isPending;
  const configEvolucao = { recebidos: { label: 'Recebidos', color: CATEGORICAS[0] }, retomados: { label: 'Retomados', color: CATEGORICAS[1] } } satisfies ChartConfig;
  const configCidades = { total: { label: 'Casos', color: CATEGORICAS[0] } } satisfies ChartConfig;
  const configCredores = Object.fromEntries(credores.map((c) => [c.credor, { label: c.credor, color: c.cor }])) satisfies ChartConfig;

  return (
    <>
      <CabecalhoDePagina titulo="Painel executivo · Recuperação" descricao="Carteira dos credores em tempo real: onde estão os bens, o que vence, quem entrega." />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 2xl:grid-cols-8">
          {carregando ? (
            Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
          ) : (
            <>
              <KpiCard titulo="Na carteira" valor={formatarNumero(resumo.total)} icone={CarFrontIcon} info="Casos recebidos dos credores, em qualquer etapa." />
              <KpiCard titulo="Em campo" valor={formatarNumero(resumo.campo)} icone={ClockIcon} cor="ambar" info="Distribuídos, aceitos, em campo ou localizados." detalhe={`${formatarNumero(resumo.preparo)} em preparo`} />
              <KpiCard titulo="Retomados" valor={formatarNumero(resumo.retomados)} icone={CheckCircle2Icon} cor="verde" info="Apreendidos ou entregues: no pátio, aguardando a purga ou entregues ao credor." />
              <KpiCard titulo="Taxa de recuperação" valor={formatarPercentual(resumo.taxaRecuperacao)} icone={TrendingUpIcon} cor="indigo" info="Retomados ÷ casos na carteira." />
              <KpiCard titulo="Curados" valor={formatarNumero(resumo.curados)} icone={HandCoinsIcon} cor="verde" info="Dívidas pagas ou acordadas durante o caso." detalhe={resumo.taxaCura === null ? undefined : `cura ${formatarPercentual(resumo.taxaCura)}`} />
              <KpiCard titulo="Perdidos" valor={formatarNumero(resumo.semExito)} icone={TrendingDownIcon} cor="cinza" info="Não localizados, removidos pelo banco ou encerrados sem êxito." />
              <KpiCard titulo="Em alerta" valor={formatarNumero(p?.alertas.length ?? 0)} icone={AlertTriangleIcon} cor="vermelho" info="Prazo vencido ou vencendo, aceite vencido, caso parado há 7 dias ou proprietário diferente do devedor." />
              <KpiCard
                titulo="Dívida em carteira"
                valor={p?.valorDivida != null ? moedaCompacta(p.valorDivida) : null}
                icone={BanknoteIcon}
                info={`Soma do valor em aberto informado pelos credores${p?.valorDivida != null ? `: ${formatarMoeda(p.valorDivida)}` : ''}.`}
                detalhe={p?.fipeRetomados != null ? `FIPE retomada ${moedaCompacta(p.fipeRetomados)}` : undefined}
              />
            </>
          )}
        </div>

        <div className="grid gap-6 2xl:grid-cols-3">
          <Cartao
            className="2xl:col-span-2"
            titulo="Onde estão os bens"
            info="Último avistamento com coordenada de cada caso: radar dos relatórios colados ou equipe de campo. Sem coordenada, o caso não aparece."
            descricao={`${pontos.length} caso(s) com localização · verde retomado, azul em campo, âmbar em preparo`}
          >
            {carregando ? (
              <Skeleton className="h-[460px]" />
            ) : pontos.length ? (
              <Mapa pontos={pontos} className="h-[460px]" zoomMaximo={13} />
            ) : (
              <div className="flex h-[460px] items-center justify-center rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
                Nenhum caso com coordenada ainda. Cole as passagens de radar na ficha ou registre avistamentos com a localização do aparelho.
              </div>
            )}
          </Cartao>

          <Cartao titulo="Alertas" info="Onde a central age primeiro." descricao={p?.alertas.length ? `${p.alertas.length} caso(s) pedem atenção.` : 'Nenhum alerta agora.'}>
            {carregando ? (
              <Skeleton className="h-[460px]" />
            ) : (
              <ul className="custom-scrollbar max-h-[460px] space-y-2 overflow-y-auto pr-1">
                {(p?.alertas ?? []).map((a) => (
                  <li key={`${a.casoId}${a.tipo}`}>
                    <Link
                      to="/a/casos/$casoId"
                      params={{ casoId: a.casoId }}
                      className="flex items-center gap-3 rounded-lg bg-white/3 p-3 ring-1 ring-white/5 transition-colors hover:bg-white/6"
                    >
                      <PlacaMercosul placa={a.placa} tamanho="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{a.motivo}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.modelo ?? '—'} · {a.status}
                          {a.desde ? ` · ${formatarData(a.desde)}` : ''}
                        </p>
                      </div>
                      <Badge className={a.tipo === 'prazo_vencido' || a.tipo === 'aceite_vencido' ? 'bg-red-500/15 text-red-200' : 'bg-amber-500/15 text-amber-200'}>
                        <AlertTriangleIcon className="size-3" aria-hidden />
                        {ICONE_ALERTA[a.tipo]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Cartao titulo="Recebidos × retomados" info="Casos recebidos (pela data de recebimento) e bens retomados (pela data da retomada), por mês." descricao="Últimos 6 meses.">
            {carregando ? (
              <Skeleton className="h-72" />
            ) : (
              <ChartContainer config={configEvolucao} className="h-72 w-full">
                <LineChart data={(p?.evolucao ?? []).map((e) => ({ ...e, mes: mesCurto(e.mes) }))} margin={{ left: 0, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line dataKey="recebidos" stroke="var(--color-recebidos)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={!semAnimacao} />
                  <Line dataKey="retomados" stroke="var(--color-retomados)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={!semAnimacao} />
                </LineChart>
              </ChartContainer>
            )}
          </Cartao>
          <Cartao titulo="Casos por etapa" info="Quantidade de casos em cada status do ciclo de recuperação." descricao="Do recebimento ao encerramento.">
            {carregando ? <Skeleton className="h-72" /> : <GraficoStatus dados={casosPorStatus(casos.data?.casos ?? [], STATUS_RECUPERACAO)} cor={CATEGORICAS[0]} />}
          </Cartao>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Cartao titulo="Praças" info="Cidade do bem, como veio do credor ou do relatório." descricao="As 12 cidades com mais casos.">
            {carregando ? (
              <Skeleton className="h-80" />
            ) : p?.porCidade.length ? (
              <ChartContainer config={configCidades} className="w-full" style={{ height: Math.max(p.porCidade.length * 30 + 24, 120) }}>
                <BarChart data={p.porCidade.map((c) => ({ ...c, rotulo: c.uf ? `${c.cidade}/${c.uf}` : c.cidade }))} layout="vertical" margin={{ left: 0, right: 24 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} hide domain={[0, (maximo: number) => Math.max(maximo, 1)]} />
                  <YAxis type="category" dataKey="rotulo" width={140} tickLine={false} axisLine={false} fontSize={12} interval={0} />
                  <ChartTooltip cursor={{ fill: 'var(--accent)' }} content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={!semAnimacao}>
                    <LabelList dataKey="total" position="right" className="fill-foreground" fontSize={12} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Sem casos.</p>
            )}
          </Cartao>

          <Cartao titulo="Credores" info="Casos por credor. A cor segue o credor." descricao="Participação na carteira e retomadas.">
            {carregando ? (
              <Skeleton className="h-80" />
            ) : credores.length ? (
              <div className="space-y-4">
                <ChartContainer config={configCredores} className="mx-auto h-48 w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="credor" />} />
                    <Pie data={credores} dataKey="total" nameKey="credor" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="var(--background)" strokeWidth={2} isAnimationActive={!semAnimacao}>
                      {credores.map((c) => (
                        <Cell key={c.credor} fill={c.cor} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <ul className="space-y-1.5 text-sm">
                  {credores.map((c) => (
                    <li key={c.credor} className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.cor }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-slate-200">{c.credor}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {c.total} · {c.retomados} retomado(s)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem casos.</p>
            )}
          </Cartao>

          <Cartao titulo="Rede de campo" info="Casos vinculados a cada recuperador e quantos viraram retomada." descricao="Ordenado por retomadas.">
            {carregando ? (
              <Skeleton className="h-80" />
            ) : (
              <ol className="space-y-2">
                {(p?.recuperadores ?? []).slice(0, 6).map((r, i) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-lg bg-white/3 p-3 ring-1 ring-white/5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-slate-800 text-sm font-bold text-white">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{r.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.cidades.join(', ') || r.status}</p>
                    </div>
                    <div className="text-right text-xs tabular-nums">
                      <p className="font-bold text-emerald-300">{r.retomados} retomado(s)</p>
                      <p className="text-muted-foreground">
                        {r.emCampo} em campo · {r.casos} no total
                      </p>
                    </div>
                  </li>
                ))}
                {!p?.recuperadores.length ? <li className="text-sm text-muted-foreground">Nenhum recuperador cadastrado.</li> : null}
              </ol>
            )}
          </Cartao>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Cartao titulo="Bens mais vistos" info="Casos com mais avistamentos e passagens de radar: rotina conhecida, abordagem mais provável." descricao="Os 10 primeiros.">
            {carregando ? (
              <Skeleton className="h-60" />
            ) : p?.maisVistos.length ? (
              <ul className="space-y-2">
                {p.maisVistos.map((m) => (
                  <li key={m.casoId}>
                    <Link
                      to="/a/casos/$casoId"
                      params={{ casoId: m.casoId }}
                      className="flex items-center gap-3 rounded-lg bg-white/3 p-3 ring-1 ring-white/5 transition-colors hover:bg-white/6"
                    >
                      <PlacaMercosul placa={m.placa} tamanho="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{m.modelo ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          último em {formatarDataHora(m.ultimoEm)} · {m.locais} local(is)
                        </p>
                      </div>
                      <StatusBadge status={m.status} tom={tomDoStatus(m.status)} className="hidden md:inline-flex" />
                      <span className="flex items-center gap-1 text-sm font-bold text-violet-300 tabular-nums">
                        <EyeIcon className="size-4" aria-hidden />
                        {m.avistamentos}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum avistamento registrado.</p>
            )}
          </Cartao>
          <Cartao titulo="Recebidos recentemente">
            {casos.isPending ? <Skeleton className="h-60" /> : <ListaRecentes canal="a" casos={casos.data?.casos ?? []} />}
          </Cartao>
        </div>
      </div>
    </>
  );
}
