import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CompassIcon,
  CopyIcon,
  LinkIcon,
  MapPinnedIcon,
  MoonIcon,
  NavigationIcon,
  SendIcon,
  ShieldCheckIcon,
  SunIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { novoLinkCampoEntrada, ROTULO_SINAL, type TipoSinal } from '@workspace/domain';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { Progress } from '@workspace/ui/components/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Switch } from '@workspace/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip';
import { formatarDataHora } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';
import { cn } from '@workspace/ui/lib/utils';

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { useAgora } from '@/lib/agora.ts';
import { Mapa, type PontoDoMapa } from '@/components/mapa.tsx';
import {
  api,
  exigir,
  linksCampoQuery,
  localizacaoQuery,
  pode,
  recuperadoresQuery,
  type LugarProvavel,
  type UsuarioSessao,
} from '@/lib/api.ts';

const corDaConfianca = (c: number) => (c >= 70 ? '#199e70' : c >= 40 ? '#c98500' : '#64748b');

const COR_SINAL: Record<TipoSinal, string> = {
  foto: '#38bdf8',
  equipe_campo: '#3b82f6',
  camera: '#22d3ee',
  radar: '#a78bfa',
  credor: '#f59e0b',
  devedor: '#f59e0b',
  outro: '#94a3b8',
  endereco: '#f472b6',
  endereco_parente: '#fb7185',
};

const PERFIL = {
  pernoite: { rotulo: 'Pernoite', icone: MoonIcon, classe: 'bg-indigo-500/15 text-indigo-200' },
  diurno: { rotulo: 'Rotina diurna', icone: SunIcon, classe: 'bg-amber-500/15 text-amber-200' },
  misto: { rotulo: 'Horários variados', icone: CompassIcon, classe: 'bg-slate-500/15 text-slate-200' },
  sem_horario: { rotulo: 'Só endereço', icone: MapPinnedIcon, classe: 'bg-slate-500/15 text-slate-300' },
} as const;

const h2 = (h: number) => `${String(h).padStart(2, '0')}h`;

/** Sinais por hora do dia: barras de 0h a 23h. */
function Horas({ horas }: { horas: number[] }) {
  const max = Math.max(1, ...horas);
  return (
    <div className="space-y-1" aria-label="Sinais por hora do dia">
      <div className="flex h-10 items-end gap-px">
        {horas.map((n, h) => (
          <Tooltip key={h}>
            <TooltipTrigger asChild>
              <div
                className={cn('flex-1 rounded-t-sm', n ? (h >= 19 || h < 7 ? 'bg-indigo-400' : 'bg-amber-400') : 'bg-white/[0.06]')}
                style={{ height: `${n ? Math.max(15, (n / max) * 100) : 8}%` }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {h2(h)}–{h2((h + 1) % 24)}: {n} sinal(is)
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  );
}

function CartaoLugar({ lugar: l, posicao }: { lugar: LugarProvavel; posicao: number }) {
  const perfil = PERFIL[l.perfil];
  const coordenadas = `${l.latitude}, ${l.longitude}`;
  return (
    <li className="space-y-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ring-2 ring-white/70"
          style={{ background: corDaConfianca(l.confianca) }}
        >
          {posicao}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">{l.descricao}</p>
          <p className="text-xs text-muted-foreground">
            raio de {l.raioMetros} m{l.ultimo ? ` · último sinal ${formatarDataHora(l.ultimo)}` : ''}
          </p>
        </div>
        <div className="w-28 shrink-0 text-right">
          <p className="text-lg font-bold text-white tabular-nums">{l.confianca}%</p>
          <Progress value={l.confianca} className="h-1.5" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge className={perfil.classe}>
          <perfil.icone className="size-3" aria-hidden />
          {perfil.rotulo}
        </Badge>
        {l.confirmadoPorAvistamento ? (
          <Badge className="bg-emerald-500/15 text-emerald-200">
            <ShieldCheckIcon className="size-3" aria-hidden />
            endereço confirmado
          </Badge>
        ) : null}
        {l.janela && l.janela.sinais > 1 ? (
          <Badge className="bg-blue-500/15 text-blue-200">
            melhor janela {h2(l.janela.inicio)}–{h2(l.janela.fim)}
          </Badge>
        ) : null}
        {Object.entries(l.porTipo).map(([t, n]) => (
          <Badge key={t} variant="outline" className="text-[11px] text-slate-300">
            <span className="size-2 rounded-full" style={{ background: COR_SINAL[t as TipoSinal] }} aria-hidden />
            {n} {ROTULO_SINAL[t as TipoSinal]}
          </Badge>
        ))}
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-300">
        {l.explicacao.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {l.horas.some(Boolean) ? <Horas horas={l.horas} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}`} target="_blank" rel="noreferrer">
            <NavigationIcon />
            Rota até aqui
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(coordenadas).then(() => toast.success('Coordenadas copiadas.'))}>
          <CopyIcon />
          {coordenadas}
        </Button>
      </div>
    </li>
  );
}

/**
 * Onde procurar: lugares ranqueados a partir dos endereços e dos avistamentos,
 * cada um com o porquê. Regra calculável (packages/domain/src/localizacao.ts),
 * não caixa-preta.
 */
export function AbaOndeProcurar({ casoId, sessao, planoA }: { casoId: string; sessao: UsuarioSessao; planoA: boolean }) {
  const queryClient = useQueryClient();
  const consulta = useQuery(localizacaoQuery(casoId));
  const tentado = useRef(false);

  const geocodificar = useMutation({
    mutationFn: () => exigir(api.POST('/api/casos/{id}/geocodificar', { params: { path: { id: casoId } } })),
    onSuccess: (r) => {
      if (r.localizados || r.falharam) {
        toast.success(`${r.localizados} endereço(s) no mapa${r.falharam ? `, ${r.falharam} não localizado(s)` : ''}.`);
      }
      void queryClient.invalidateQueries({ queryKey: ['caso', casoId, 'localizacao'] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Endereço novo sem coordenada: põe no mapa sozinho, uma vez por visita.
  const pendentes = consulta.data?.enderecosSemCoordenada ?? 0;
  const { mutate: geocodificarAgora } = geocodificar;
  useEffect(() => {
    if (pendentes > 0 && !tentado.current && pode.escrever(sessao)) {
      tentado.current = true;
      geocodificarAgora();
    }
  }, [pendentes, sessao, geocodificarAgora]);

  const lugares = useMemo(() => consulta.data?.lugares ?? [], [consulta.data?.lugares]);
  const pontos = useMemo<PontoDoMapa[]>(
    () => [
      ...(consulta.data?.sinais ?? []).map((s, i) => ({
        id: `s${i}`,
        latitude: s.latitude,
        longitude: s.longitude,
        cor: COR_SINAL[s.tipo],
        tamanho: 9,
        titulo: ROTULO_SINAL[s.tipo],
        linhas: [s.descricao, ...(s.quando ? [formatarDataHora(s.quando)] : [])],
      })),
      ...lugares.slice(0, 9).map((l, i) => ({
        id: `l${i}`,
        latitude: l.latitude,
        longitude: l.longitude,
        cor: corDaConfianca(l.confianca),
        tamanho: 26,
        rotulo: String(i + 1),
        titulo: `${i + 1}º · ${l.confianca}% · ${l.descricao}`,
        linhas: l.explicacao,
      })),
    ],
    [consulta.data?.sinais, lugares],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <CompassIcon className="size-5 text-blue-300" aria-hidden />
            Onde procurar
          </CardTitle>
          <CardDescription>
            Endereços cadastrados e avistamentos (radar, câmera, equipe, fotos), agrupados num raio de 300 m e ordenados pela força dos sinais.
            Sinal recente pesa mais; endereço confirmado por avistamento sobe.
          </CardDescription>
          {pendentes > 0 && pode.escrever(sessao) ? (
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => geocodificar.mutate()} disabled={geocodificar.isPending}>
                {geocodificar.isPending ? <Spinner /> : <MapPinnedIcon />}
                Pôr {pendentes} endereço(s) no mapa
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {geocodificar.isPending ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Localizando endereços no OpenStreetMap (um por segundo, regra do serviço)…
            </p>
          ) : null}
          {consulta.isPending ? (
            <Skeleton className="h-[420px]" />
          ) : consulta.isError ? (
            <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
          ) : pontos.length ? (
            <Mapa pontos={pontos} className="h-[460px]" />
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
              <MapPinnedIcon className="size-6 text-slate-600" aria-hidden />
              Ainda não há sinal com coordenada. Cole o dossiê (endereços), as passagens de radar ou envie fotos de campo.
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {(['foto', 'equipe_campo', 'camera', 'radar', 'endereco', 'endereco_parente'] as const).map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span className="size-2.5 rounded-full" style={{ background: COR_SINAL[t] }} aria-hidden />
                {ROTULO_SINAL[t]}
              </span>
            ))}
            <span className="ml-auto">círculo numerado = lugar provável (verde ≥ 70%)</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-white">Lugares prováveis</CardTitle>
            <CardDescription>O mais provável primeiro. A confiança compara cada lugar com o melhor e com a quantidade de evidência.</CardDescription>
          </CardHeader>
          <CardContent>
            {consulta.isPending ? (
              <Skeleton className="h-60" />
            ) : lugares.length ? (
              <ol className="space-y-3">
                {lugares.slice(0, 9).map((l, i) => (
                  <CartaoLugar key={`${l.latitude}${l.longitude}`} lugar={l} posicao={i + 1} />
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum lugar ainda.</p>
            )}
          </CardContent>
        </Card>
        {planoA ? <LinksDeCampo casoId={casoId} sessao={sessao} /> : null}
      </div>
    </div>
  );
}

/** Links para o terceiro mandar foto e avistamento sem login. */
function LinksDeCampo({ casoId, sessao }: { casoId: string; sessao: UsuarioSessao }) {
  const queryClient = useQueryClient();
  const links = useQuery(linksCampoQuery(casoId));
  const [criando, setCriando] = useState(false);
  const revogar = useMutation({
    mutationFn: (linkId: string) => exigir(api.POST('/api/casos/{id}/links-campo/{linkId}/revogar', { params: { path: { id: casoId, linkId } } })),
    onSuccess: () => {
      toast.success('Link revogado.');
      void queryClient.invalidateQueries({ queryKey: ['caso', casoId, 'links-campo'] });
    },
  });
  const agora = useAgora();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <LinkIcon className="size-4 text-blue-300" aria-hidden />
          Link de campo
        </CardTitle>
        <CardDescription>
          O recuperador terceiro abre no celular, sem login, e manda foto e localização deste caso. Ele vê só placa, modelo, cor e região.
        </CardDescription>
        {pode.escrever(sessao) ? (
          <CardAction>
            <Button size="sm" onClick={() => setCriando(true)}>
              <SendIcon />
              Novo link
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {links.isPending ? (
          <Skeleton className="h-24" />
        ) : !links.data?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum link enviado.</p>
        ) : (
          <ul className="space-y-2">
            {links.data.map((l) => {
              const ativo = !l.revogadoEm && new Date(l.expiraEm).getTime() > agora;
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{l.destinatario}</p>
                    <p className="text-xs text-muted-foreground">
                      {ativo ? `vale até ${formatarDataHora(l.expiraEm)}` : l.revogadoEm ? 'revogado' : 'expirado'} · {l.fotos} foto(s) ·{' '}
                      {l.avistamentos} avistamento(s) · {l.usos} acesso(s)
                    </p>
                  </div>
                  <Badge className={ativo ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-500/15 text-slate-300'}>{ativo ? 'ativo' : 'encerrado'}</Badge>
                  {ativo && pode.escrever(sessao) ? (
                    <Button size="sm" variant="ghost" onClick={() => revogar.mutate(l.id)} disabled={revogar.isPending}>
                      Revogar
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {criando ? <DialogoLink casoId={casoId} aoFechar={() => setCriando(false)} /> : null}
    </Card>
  );
}

function DialogoLink({ casoId, aoFechar }: { casoId: string; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const recuperadores = useQuery(recuperadoresQuery);
  const [recuperadorId, setRecuperadorId] = useState('');
  const [destinatario, setDestinatario] = useState('');
  const [horas, setHoras] = useState('72');
  const [enviarWhatsapp, setEnviarWhatsapp] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<{ url: string; whatsapp: string | null } | null>(null);

  const criar = useMutation({
    mutationFn: (corpo: ReturnType<typeof novoLinkCampoEntrada.parse>) =>
      exigir(api.POST('/api/casos/{id}/links-campo', { params: { path: { id: casoId } }, body: corpo })),
    onSuccess: (r) => {
      setCriado({ url: r.url, whatsapp: r.whatsapp });
      void queryClient.invalidateQueries({ queryKey: ['caso', casoId, 'links-campo'] });
    },
  });

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo link de campo</DialogTitle>
          <DialogDescription>Vale só para este caso e expira. O endereço aparece uma vez: o sistema guarda só o hash.</DialogDescription>
        </DialogHeader>
        {criado ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-2 py-1.5 font-mono text-xs">{criado.url}</code>
              <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(criado.url).then(() => toast.success('Link copiado.'))}>
                <CopyIcon />
                Copiar
              </Button>
            </div>
            {criado.whatsapp ? (
              <Alert>
                <AlertDescription>{criado.whatsapp}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button onClick={aoFechar}>Pronto</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const r = novoLinkCampoEntrada.safeParse({
                ...(recuperadorId ? { recuperadorId } : { destinatario: destinatario.trim() || undefined }),
                horas: Number(horas),
                enviarWhatsapp,
              });
              if (!r.success) return setErro(r.error.issues[0]!.message);
              setErro(null);
              criar.mutate(r.data);
            }}
          >
            <Field>
              <FieldLabel>Recuperador</FieldLabel>
              <Select value={recuperadorId || '__outro__'} onValueChange={(v) => setRecuperadorId(v === '__outro__' ? '' : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__outro__">Outra pessoa (digitar)</SelectItem>
                  {(recuperadores.data ?? [])
                    .filter((r) => r.status === 'Ativo')
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nome}
                        {r.telefone ? ` · ${r.telefone}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            {!recuperadorId ? (
              <Field data-invalid={!!erro}>
                <FieldLabel htmlFor="link-dest">Nome ou WhatsApp de quem recebe</FieldLabel>
                <Input id="link-dest" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} placeholder="Ex.: (37) 99999-0000 ou Parceiro de Betim" />
                <FieldDescription>Com número, o link pode ir direto pelo WhatsApp.</FieldDescription>
                <FieldError>{erro}</FieldError>
              </Field>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Validade</FieldLabel>
                <Select value={horas} onValueChange={setHoras}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 horas</SelectItem>
                    <SelectItem value="24">24 horas</SelectItem>
                    <SelectItem value="72">3 dias</SelectItem>
                    <SelectItem value="168">7 dias</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="link-wa">Enviar pelo WhatsApp</FieldLabel>
                <Switch id="link-wa" checked={enviarWhatsapp} onCheckedChange={setEnviarWhatsapp} />
              </Field>
            </div>
            {criar.error ? (
              <Alert variant="destructive">
                <AlertDescription>{criar.error.message}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={aoFechar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={criar.isPending}>
                {criar.isPending ? <Spinner /> : <LinkIcon />}
                Gerar link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
