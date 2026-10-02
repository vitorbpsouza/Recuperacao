import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon, LocateFixedIcon, MapPinIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { avistamentoEntrada, FONTES_AVISTAMENTO } from '@workspace/domain';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { formatarDataHora } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, avistamentosQuery, exigir, pode, type UsuarioSessao } from '@/lib/api.ts';

import { useAtualizarCaso } from './painel-acoes.tsx';

const ROTULO_FONTE: Record<(typeof FONTES_AVISTAMENTO)[number], string> = {
  equipe_campo: 'Equipe de campo',
  credor: 'Credor',
  devedor: 'Devedor',
  outro: 'Outro',
};

const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/**
 * Onde o veículo foi visto, por quem e quando. É a fonte legítima de
 * localização do Plano A: registrada por quem viu, com a hora do servidor.
 */
export function AbaAvistamentos({ casoId, sessao }: { casoId: string; sessao: UsuarioSessao }) {
  const consulta = useQuery(avistamentosQuery(casoId));
  const [registrando, setRegistrando] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-white">Avistamentos</CardTitle>
        <CardDescription>Localização do bem — não da pessoa — com autor e hora do servidor. Não se edita nem se apaga.</CardDescription>
        {pode.escrever(sessao) && !registrando ? (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setRegistrando(true)}>
              <PlusIcon />
              Registrar
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {registrando ? <FormAvistamento casoId={casoId} aoFechar={() => setRegistrando(false)} /> : null}
        {consulta.isPending ? (
          <Skeleton className="h-24" />
        ) : consulta.isError ? (
          <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
        ) : consulta.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum avistamento registrado.</p>
        ) : (
          <ol className="space-y-3">
            {consulta.data.map((a) => (
              <li key={a.id} className="flex gap-3 rounded-lg bg-white/3 p-3 ring-1 ring-white/5">
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-blue-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{a.descricao}</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    visto em {formatarDataHora(a.observadoEm)} · {ROTULO_FONTE[a.fonte]} · registrado por {a.usuarioNome ?? '—'}
                  </p>
                  {a.latitude != null && a.longitude != null ? (
                    <a
                      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-300 hover:underline"
                      href={`https://www.openstreetmap.org/?mlat=${a.latitude}&mlon=${a.longitude}#map=17/${a.latitude}/${a.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.latitude.toFixed(5)}, {a.longitude.toFixed(5)} · ver no mapa
                      <ExternalLinkIcon className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function FormAvistamento({ casoId, aoFechar }: { casoId: string; aoFechar: () => void }) {
  const atualizar = useAtualizarCaso(casoId);
  const [observadoEm, setObservadoEm] = useState(agoraLocal());
  const [descricao, setDescricao] = useState('');
  const [fonte, setFonte] = useState<(typeof FONTES_AVISTAMENTO)[number]>('equipe_campo');
  const [coordenadas, setCoordenadas] = useState<{ latitude: number; longitude: number } | null>(null);
  const [localizando, setLocalizando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  const registrar = useMutation({
    mutationFn: (corpo: ReturnType<typeof avistamentoEntrada.parse>) =>
      exigir(api.POST('/api/casos/{id}/avistamentos', { params: { path: { id: casoId } }, body: corpo })),
    onSuccess: () => {
      toast.success('Avistamento registrado.');
      atualizar();
      aoFechar();
    },
  });

  const usarMinhaLocalizacao = () => {
    if (!navigator.geolocation) return toast.error('Este navegador não informa a localização.');
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoordenadas({ latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)) });
        setLocalizando(false);
      },
      (e) => {
        toast.error(e.code === e.PERMISSION_DENIED ? 'Permissão de localização negada.' : 'Não foi possível obter a localização.');
        setLocalizando(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <form
      noValidate
      className="space-y-4 rounded-lg bg-white/3 p-4 ring-1 ring-white/5"
      onSubmit={(e) => {
        e.preventDefault();
        const r = avistamentoEntrada.safeParse({
          observadoEm: new Date(observadoEm).toISOString(),
          descricao,
          fonte,
          ...(coordenadas ?? {}),
        });
        if (!r.success) return setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
        setErros({});
        registrar.mutate(r.data);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!erros.observadoEm}>
          <FieldLabel htmlFor="avist-quando">Quando foi visto</FieldLabel>
          <Input id="avist-quando" type="datetime-local" value={observadoEm} onChange={(e) => setObservadoEm(e.target.value)} />
          <FieldError>{erros.observadoEm}</FieldError>
        </Field>
        <Field>
          <FieldLabel>Quem informou</FieldLabel>
          <Select value={fonte} onValueChange={(f) => setFonte(f as typeof fonte)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONTES_AVISTAMENTO.map((f) => (
                <SelectItem key={f} value={f}>
                  {ROTULO_FONTE[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field data-invalid={!!erros.descricao}>
        <FieldLabel htmlFor="avist-onde">Onde</FieldLabel>
        <Textarea
          id="avist-onde"
          rows={2}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Endereço ou referência: rua, número, estacionamento, garagem"
        />
        <FieldError>{erros.descricao}</FieldError>
      </Field>
      <Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={usarMinhaLocalizacao} disabled={localizando}>
            {localizando ? <Spinner /> : <LocateFixedIcon />}
            Usar minha localização
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {coordenadas ? `${coordenadas.latitude}, ${coordenadas.longitude}` : 'sem coordenadas'}
          </span>
        </div>
        <FieldDescription>Do aparelho de quem está vendo o veículo, na hora.</FieldDescription>
      </Field>
      {registrar.error ? (
        <Alert variant="destructive">
          <AlertDescription>{registrar.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={registrar.isPending}>
          {registrar.isPending ? <Spinner /> : null}
          Registrar
        </Button>
      </div>
    </form>
  );
}
