import { CameraIcon, CheckCircle2Icon, ImageIcon, LocateFixedIcon, LocateOffIcon, SendIcon, TriangleAlertIcon, XCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';

export interface CorpoDaFoto {
  imagem: string;
  tipoMime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';
  latitude?: number;
  longitude?: number;
  precisao?: number;
  descricao?: string;
}

export interface RespostaDaFoto {
  repetida: boolean;
  placaLida: string | null;
  placaConfere: boolean | null;
  outroCaso: { id: string; placa: string } | null;
  origemCoordenada: 'exif' | 'aparelho' | null;
  avistamentoId: string | null;
  ocrStatus: 'lida' | 'ilegivel' | 'sem_modelo' | 'erro';
}

const LIMITE_MB = 20;

const lerComoBase64 = (arquivo: File) =>
  new Promise<string>((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).split(',')[1] ?? '');
    leitor.onerror = () => rejeitar(leitor.error ?? new Error('não foi possível ler a foto'));
    leitor.readAsDataURL(arquivo);
  });

const tipoDe = (arquivo: File): CorpoDaFoto['tipoMime'] => {
  const t = arquivo.type.toLowerCase();
  if (t === 'image/png' || t === 'image/webp' || t === 'image/heic' || t === 'image/heif') return t;
  if (/\.hei[cf]$/i.test(arquivo.name)) return 'image/heic';
  return 'image/jpeg';
};

type Localizacao = { estado: 'buscando' } | { estado: 'ok'; latitude: number; longitude: number; precisao: number } | { estado: 'sem'; motivo: string };

/**
 * Tirar a foto do veículo e enviar. O arquivo vai inteiro (com o EXIF, que o
 * servidor lê); a localização do aparelho segue junto só como reserva, para
 * quando a foto não traz GPS.
 */
export function CapturaFoto({ enviar, aoConcluir, compacto = false }: { enviar: (corpo: CorpoDaFoto) => Promise<RespostaDaFoto>; aoConcluir?: (r: RespostaDaFoto) => void; compacto?: boolean }) {
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState<Localizacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaDaFoto | null>(null);

  useEffect(() => () => void (previa && URL.revokeObjectURL(previa)), [previa]);

  const escolher = (f: File | undefined) => {
    if (!f) return;
    setErro(null);
    setResultado(null);
    if (f.size > LIMITE_MB * 1024 * 1024) return setErro(`Foto maior que ${LIMITE_MB} MB.`);
    setArquivo(f);
    setPrevia(URL.createObjectURL(f));
    if (!navigator.geolocation) return setLocal({ estado: 'sem', motivo: 'este navegador não informa a localização' });
    setLocal({ estado: 'buscando' });
    navigator.geolocation.getCurrentPosition(
      (p) => setLocal({ estado: 'ok', latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)), precisao: Math.round(p.coords.accuracy) }),
      (e) => setLocal({ estado: 'sem', motivo: e.code === e.PERMISSION_DENIED ? 'permissão de localização negada' : 'localização indisponível' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };

  const mandar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await enviar({
        imagem: await lerComoBase64(arquivo),
        tipoMime: tipoDe(arquivo),
        ...(local?.estado === 'ok' ? { latitude: local.latitude, longitude: local.longitude, precisao: local.precisao } : {}),
        ...(descricao.trim() ? { descricao: descricao.trim() } : {}),
      });
      setResultado(r);
      setArquivo(null);
      setDescricao('');
      aoConcluir?.(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar a foto.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3">
      <Input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
      <Input ref={galeria} type="file" accept="image/*" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />

      {!arquivo ? (
        <div className={compacto ? 'flex flex-wrap gap-2' : 'grid gap-2 sm:grid-cols-2'}>
          <Button size={compacto ? 'default' : 'lg'} className={compacto ? '' : 'h-14 text-base'} onClick={() => camera.current?.click()}>
            <CameraIcon />
            Tirar foto
          </Button>
          <Button size={compacto ? 'default' : 'lg'} variant="outline" className={compacto ? '' : 'h-14 text-base'} onClick={() => galeria.current?.click()}>
            <ImageIcon />
            Escolher da galeria
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.08]">
          {previa ? <img src={previa} alt="Prévia da foto" className="max-h-80 w-full rounded-lg object-contain" /> : null}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {local?.estado === 'ok' ? (
              <>
                <LocateFixedIcon className="size-3.5 text-emerald-300" aria-hidden />
                Localização do aparelho ±{local.precisao} m (reserva, se a foto não tiver GPS)
              </>
            ) : local?.estado === 'buscando' ? (
              <>
                <Spinner className="size-3.5" />
                Buscando a localização do aparelho…
              </>
            ) : (
              <>
                <LocateOffIcon className="size-3.5 text-amber-300" aria-hidden />
                Sem localização do aparelho ({local?.estado === 'sem' ? local.motivo : '—'}): vale o GPS da foto, se houver.
              </>
            )}
          </p>
          <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Onde está o veículo? (opcional) Ex.: estacionado em frente ao nº 120" aria-label="Descrição" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void mandar()} disabled={enviando || local?.estado === 'buscando'}>
              {enviando ? <Spinner /> : <SendIcon />}
              Enviar foto
            </Button>
            <Button variant="ghost" onClick={() => setArquivo(null)} disabled={enviando}>
              Trocar
            </Button>
          </div>
        </div>
      )}

      {erro ? (
        <Alert variant="destructive">
          <XCircleIcon />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      {resultado ? (
        <Alert className={resultado.placaConfere === false ? 'border-amber-400/40' : 'border-emerald-400/30'}>
          {resultado.placaConfere === false ? <TriangleAlertIcon className="text-amber-300" /> : <CheckCircle2Icon className="text-emerald-300" />}
          <AlertTitle>{resultado.repetida ? 'Esta foto já tinha sido enviada.' : 'Foto guardada.'}</AlertTitle>
          <AlertDescription className="space-y-1">
            <p className="flex flex-wrap items-center gap-1.5">
              Placa lida:{' '}
              {resultado.placaLida ? (
                <Badge className={resultado.placaConfere ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}>
                  {resultado.placaLida} · {resultado.placaConfere ? 'confere' : 'NÃO confere com o caso'}
                </Badge>
              ) : resultado.ocrStatus === 'sem_modelo' ? (
                'leitura automática desligada'
              ) : (
                'não foi possível ler'
              )}
            </p>
            {resultado.outroCaso ? <p>Essa placa é de outro caso da carteira ({resultado.outroCaso.placa}).</p> : null}
            <p>
              {resultado.origemCoordenada === 'exif'
                ? 'Localização tirada do GPS da própria foto.'
                : resultado.origemCoordenada === 'aparelho'
                  ? 'A foto não tinha GPS: valeu a localização do aparelho.'
                  : 'Sem localização: a foto ficou guardada, mas não entra no mapa.'}
              {resultado.avistamentoId ? ' Avistamento registrado.' : ''}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
