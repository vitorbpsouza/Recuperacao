import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, Clock3Icon, LocateFixedIcon, MapPinIcon, ShieldAlertIcon } from 'lucide-react';
import { useState } from 'react';

import { avistamentoCampoEntrada } from '@workspace/domain';
import { PlacaMercosul } from '@workspace/ui/brand/placa-mercosul';
import { TenantMark } from '@workspace/ui/brand/tenant-mark';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { formatarDataHora } from '@workspace/ui/lib/formato';

import { CapturaFoto } from '@/components/captura-foto.tsx';
import { api, exigir } from '@/lib/api.ts';

/**
 * Página do link de campo: o recuperador terceiro abre no celular, sem login,
 * e manda foto e localização de um caso só. Vê o que identifica o bem e mais
 * nada — nem devedor, nem dívida.
 */
export function PaginaCampo({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const caso = useQuery({
    queryKey: ['campo', token],
    queryFn: () => exigir(api.GET('/api/campo/{token}', { params: { path: { token } } })),
    retry: false,
  });
  const atualizar = () => void queryClient.invalidateQueries({ queryKey: ['campo', token] });

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <TenantMark sigla="RC" nome="ReCredita" />
        <div>
          <p className="text-sm font-bold text-white">ReCredita</p>
          <p className="text-xs text-muted-foreground">Envio de campo</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg space-y-4 p-4">
        {caso.isPending ? (
          <Skeleton className="h-40" />
        ) : caso.isError ? (
          <Alert variant="destructive">
            <ShieldAlertIcon />
            <AlertTitle>Link indisponível</AlertTitle>
            <AlertDescription>Este link expirou ou foi revogado. Peça um novo à central.</AlertDescription>
          </Alert>
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-2 text-center">
                <PlacaMercosul placa={caso.data.placa} tamanho="lg" />
                <p className="text-lg font-bold text-white">{caso.data.modelo ?? 'Modelo não informado'}</p>
                <p className="text-sm text-muted-foreground">
                  {[caso.data.cor, [caso.data.cidade, caso.data.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || '—'}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3Icon className="size-3.5" aria-hidden />
                  Link de {caso.data.destinatario}, vale até {formatarDataHora(caso.data.expiraEm)}
                </p>
                {caso.data.fotos + caso.data.avistamentos > 0 ? (
                  <p className="flex items-center gap-1 text-xs text-emerald-300">
                    <CheckCircle2Icon className="size-3.5" aria-hidden />
                    Você já enviou {caso.data.fotos} foto(s) e {caso.data.avistamentos} localização(ões).
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-white">Achou o veículo? Tire uma foto</CardTitle>
                <CardDescription>
                  Com a placa visível. A localização e a hora vão junto. Fotografe em via pública, sem pessoas em foco e sem entrar em casa ou
                  garagem.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CapturaFoto
                  enviar={(corpo) => exigir(api.POST('/api/campo/{token}/fotos', { params: { path: { token } }, body: corpo }))}
                  aoConcluir={atualizar}
                />
              </CardContent>
            </Card>

            <SemFoto token={token} aoEnviar={atualizar} />
          </>
        )}
      </main>
    </div>
  );
}

/** Quando não dá para fotografar: só onde viu, com a localização do aparelho. */
function SemFoto({ token, aoEnviar }: { token: string; aoEnviar: () => void }) {
  const [descricao, setDescricao] = useState('');
  const [coordenada, setCoordenada] = useState<{ latitude: number; longitude: number; precisao: number } | null>(null);
  const [localizando, setLocalizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = useMutation({
    mutationFn: (corpo: ReturnType<typeof avistamentoCampoEntrada.parse>) =>
      exigir(api.POST('/api/campo/{token}/avistamentos', { params: { path: { token } }, body: corpo })),
    onSuccess: () => {
      setDescricao('');
      setCoordenada(null);
      aoEnviar();
    },
  });

  const localizar = () => {
    if (!navigator.geolocation) return setErro('Este celular não informa a localização.');
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoordenada({ latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)), precisao: Math.round(p.coords.accuracy) });
        setLocalizando(false);
      },
      () => {
        setErro('Não foi possível pegar a localização. Descreva o endereço.');
        setLocalizando(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-white">Viu, mas não deu para fotografar?</CardTitle>
        <CardDescription>Diga onde está o veículo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Rua, número, referência" aria-label="Onde está o veículo" />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={localizar} disabled={localizando}>
            {localizando ? <Spinner /> : <LocateFixedIcon />}
            Usar minha localização
          </Button>
          <span className="text-xs text-muted-foreground">{coordenada ? `±${coordenada.precisao} m` : 'sem localização'}</span>
        </div>
        {erro || enviar.error ? (
          <Alert variant="destructive">
            <AlertDescription>{erro ?? enviar.error?.message}</AlertDescription>
          </Alert>
        ) : null}
        {enviar.isSuccess ? <p className="text-sm text-emerald-300">Localização enviada. Obrigado.</p> : null}
        <Button
          className="w-full"
          disabled={enviar.isPending}
          onClick={() => {
            const r = avistamentoCampoEntrada.safeParse({ descricao, ...(coordenada ?? {}) });
            if (!r.success) return setErro(r.error.issues[0]!.message);
            setErro(null);
            enviar.mutate(r.data);
          }}
        >
          {enviar.isPending ? <Spinner /> : <MapPinIcon />}
          Enviar localização
        </Button>
      </CardContent>
    </Card>
  );
}
