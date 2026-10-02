import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckCircle2Icon, MapPinIcon, SendIcon, ZapIcon } from 'lucide-react';
import { useState } from 'react';

import { ETAPAS_RECUPERACAO, podeDistribuir } from '@workspace/domain';
import { InfoTooltip } from '@workspace/ui/brand/info-tooltip';
import { PlacaMercosul } from '@workspace/ui/brand/placa-mercosul';
import { PrazoBadge } from '@workspace/ui/brand/prazo-badge';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@workspace/ui/components/empty';
import { Skeleton } from '@workspace/ui/components/skeleton';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { DialogoDistribuir, ordenarCandidatos } from '@/features/casos/dialogo-distribuir.tsx';
import { casosQuery, pode, recuperadoresQuery, type Caso, type UsuarioSessao } from '@/lib/api.ts';
import { tomDoStatus } from '@/lib/status.ts';

/**
 * Fila de distribuição do Plano A: casos em preparo com a sugestão de
 * recuperador e o motivo dela, e os casos já em campo com o relógio correndo.
 */
export function PaginaDistribuicao({ sessao }: { sessao: UsuarioSessao }) {
  const casos = useQuery(casosQuery('plataforma_credor'));
  const recuperadores = useQuery(recuperadoresQuery);
  const [distribuindo, setDistribuindo] = useState<Caso | null>(null);

  const todos = casos.data?.casos ?? [];
  // Só vai a campo o caso habilitado: o banco recusa distribuir antes disso.
  const fila = todos.filter((c) => c.status === 'Pronto para Campo');
  const emCampo = todos
    .filter((c) => (ETAPAS_RECUPERACAO.campo as readonly string[]).includes(c.status))
    .sort((x, y) => (x.prazoMaximo ?? '').localeCompare(y.prazoMaximo ?? ''));

  return (
    <>
      <CabecalhoDePagina
        titulo="Distribuição"
        descricao="Envio de casos à rede de campo, com prazo de aceite e prazo máximo de retomada."
      />
      {casos.isError ? (
        <ErroDeConsulta erro={casos.error} aoTentar={() => void casos.refetch()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <SendIcon className="size-4 text-info" aria-hidden />
                Fila de distribuição
                <InfoTooltip text="Casos recebidos, em enriquecimento ou em análise: ainda sem recuperador em campo." />
              </CardTitle>
              <CardDescription>{fila.length ? `${fila.length} caso(s) aguardando.` : 'Fila vazia.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {casos.isPending ? (
                <Skeleton className="h-40" />
              ) : fila.length === 0 ? (
                <Empty className="border-0 py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="bg-success/10 text-success">
                      <CheckCircle2Icon />
                    </EmptyMedia>
                    <EmptyTitle>Fila limpa</EmptyTitle>
                    <EmptyDescription>Todos os casos em preparo já foram distribuídos.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                fila.map((c) => {
                  const [sugerido] = ordenarCandidatos(recuperadores.data ?? [], c.cidade);
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-4 rounded-lg bg-white/3 p-4 ring-1 ring-white/5">
                      <PlacaMercosul placa={c.placa} />
                      <div className="min-w-40 flex-1">
                        <Link to="/a/casos/$casoId" params={{ casoId: c.id }} className="font-semibold text-white hover:underline">
                          {c.modelo ?? 'Modelo não informado'}
                        </Link>
                        <p className="text-xs text-muted-foreground">{[c.cidade, c.uf].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                      <StatusBadge status={c.status} tom={tomDoStatus(c.status)} />
                      <div className="flex min-w-52 items-center gap-2 rounded-md bg-info/5 px-3 py-2 ring-1 ring-info/20">
                        <ZapIcon className="size-4 text-info" aria-hidden />
                        <div className="text-xs leading-tight">
                          {sugerido ? (
                            <>
                              <p className="font-semibold text-white">{sugerido.nome}</p>
                              <p className="text-muted-foreground">
                                {sugerido.local ? (
                                  <>
                                    <MapPinIcon className="mr-0.5 inline size-3" aria-hidden />
                                    atua na cidade ·{' '}
                                  </>
                                ) : (
                                  'fora da cidade · '
                                )}
                                score {sugerido.score}
                              </p>
                            </>
                          ) : (
                            <p className="text-muted-foreground">nenhum recuperador ativo</p>
                          )}
                        </div>
                      </div>
                      {pode.escrever(sessao) && podeDistribuir(c.status) ? (
                        <Button size="sm" onClick={() => setDistribuindo(c)}>
                          <SendIcon />
                          Distribuir
                        </Button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <MapPinIcon className="size-4 text-success" aria-hidden />
                Em campo
              </CardTitle>
              <CardDescription>Distribuídos, aceitos, em campo ou localizados — pelo prazo mais próximo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {casos.isPending ? (
                <Skeleton className="h-40" />
              ) : emCampo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum caso em campo.</p>
              ) : (
                emCampo.map((c) => (
                  <Link
                    key={c.id}
                    to="/a/casos/$casoId"
                    params={{ casoId: c.id }}
                    className="flex items-center gap-3 rounded-lg bg-white/3 p-3 ring-1 ring-white/5 transition-colors hover:bg-white/6"
                  >
                    <PlacaMercosul placa={c.placa} tamanho="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{c.recuperadorNome ?? 'sem recuperador'}</p>
                      <Badge variant="outline" className="mt-1">
                        {c.status}
                      </Badge>
                    </div>
                    <PrazoBadge ate={c.prazoMaximo} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {distribuindo ? (
        <DialogoDistribuir
          caso={distribuindo}
          aberto
          aoMudar={(aberto) => {
            if (!aberto) setDistribuindo(null);
          }}
        />
      ) : null}
    </>
  );
}
