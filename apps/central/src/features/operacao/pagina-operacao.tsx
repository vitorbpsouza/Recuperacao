import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  CarIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  MapPinIcon,
  MessageCircleIcon,
  MicIcon,
  PaperclipIcon,
  PencilIcon,
  SendIcon,
  ShieldAlertIcon,
  SmileIcon,
  SquareIcon,
  UserPlusIcon,
  VideoIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@workspace/ui/components/command';
import { Input } from '@workspace/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@workspace/ui/components/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { formatarDataHora } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';
import { cn } from '@workspace/ui/lib/utils';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import {
  api,
  casosQuery,
  conversasQuery,
  exigir,
  integracoesQuery,
  mensagensQuery,
  pode,
  recuperadoresQuery,
  type Caso,
  type Conversa,
  type Mensagem as MensagemWhatsapp,
  type UsuarioSessao,
} from '@/lib/api.ts';
import { formatarTelefone } from '@/lib/pessoa.ts';

type TipoDeMidia = NonNullable<MensagemWhatsapp['midiaTipo']>;

/** Só dígitos com DDI 55. */
const numeroDe = (telefone: string) => {
  const d = telefone.replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
};
const exibir = (numero: string) => formatarTelefone(numero.startsWith('55') ? numero.slice(2) : numero);

const MIDIA: Record<TipoDeMidia, { rotulo: string; Icone: ComponentType<{ className?: string }> }> = {
  imagem: { rotulo: 'Foto', Icone: ImageIcon },
  audio: { rotulo: 'Áudio', Icone: MicIcon },
  video: { rotulo: 'Vídeo', Icone: VideoIcon },
  documento: { rotulo: 'Documento', Icone: FileTextIcon },
  figurinha: { rotulo: 'Figurinha', Icone: SmileIcon },
  localizacao: { rotulo: 'Localização', Icone: MapPinIcon },
};

/** Limite de um anexo, o mesmo da API. */
const LIMITE_MB = 32;

/** Status em que o caso ainda pede gente em campo: são os oferecidos para ligar à conversa. */
const STATUS_DE_CAMPO = ['Recebido', 'Em Enriquecimento', 'Enriquecido', 'Em Análise', 'Pronto para Campo', 'Distribuído', 'Aceito', 'Em Campo', 'Localizado'];

const lerComoBase64 = (arquivo: Blob) =>
  new Promise<string>((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).split(',')[1] ?? '');
    leitor.onerror = () => rejeitar(leitor.error ?? new Error('não foi possível ler o arquivo'));
    leitor.readAsDataURL(arquivo);
  });

/**
 * Mensagem de caso para a rede de campo. Leva o que identifica o bem e onde
 * procurar — nunca valor da dívida nem dado do devedor (proibido expor a
 * dívida a terceiros: CDC art. 42 e LGPD).
 */
const mensagemDoCaso = (c: Caso) =>
  [
    `Caso disponível · placa ${c.placa}`,
    c.modelo ? `Veículo: ${c.modelo}` : null,
    [c.cidade, c.uf].filter(Boolean).length ? `Região: ${[c.cidade, c.uf].filter(Boolean).join('/')}` : null,
    'Responda ACEITO para assumir. Abordagem sem violência e sem entrar em residência.',
  ]
    .filter(Boolean)
    .join('\n');

/** Operação: conversa com a rede de campo e terceiros pelo WhatsApp da Evolution. */
export function PaginaOperacao({ sessao }: { sessao: UsuarioSessao }) {
  const conversas = useQuery(conversasQuery);
  const recuperadores = useQuery(recuperadoresQuery);
  const integracoes = useQuery({ ...integracoesQuery, enabled: pode.gerir(sessao), retry: false });
  const [escolhido, setNumero] = useState<string | null>(null);

  const semEvolution = integracoes.isSuccess && !integracoes.data.some((i) => i.tipo === 'evolution' && i.ativo);
  const lista = useMemo(() => conversas.data ?? [], [conversas.data]);
  // Sem escolha, a conversa mais recente.
  const numero = escolhido ?? lista[0]?.numero ?? null;
  const atual = lista.find((c) => c.numero === numero);
  const recuperadorAtual = recuperadores.data?.find((r) => r.telefone && numeroDe(r.telefone) === numero);

  return (
    <>
      <CabecalhoDePagina
        titulo="Operação"
        descricao="WhatsApp com a rede de campo e terceiros. Mensagens, fotos e áudios enviados e recebidos ficam no histórico, sem edição."
      />
      {semEvolution ? (
        <Alert className="mb-6">
          <ShieldAlertIcon />
          <AlertTitle>WhatsApp não conectado</AlertTitle>
          <AlertDescription>
            Cadastre a Evolution em{' '}
            <Link to="/gestao/integracoes" className="text-blue-300 underline">
              Gestão › Integrações
            </Link>{' '}
            para enviar e receber mensagens.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid min-h-[70vh] gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle className="text-white">Conversas</CardTitle>
            <CardDescription>Atualiza sozinha a cada 15 segundos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value="" onValueChange={(n) => setNumero(n)}>
              <SelectTrigger className="w-full">
                <UserPlusIcon className="size-4" aria-hidden />
                <SelectValue placeholder="Nova conversa com recuperador" />
              </SelectTrigger>
              <SelectContent>
                {(recuperadores.data ?? [])
                  .filter((r) => r.telefone)
                  .map((r) => (
                    <SelectItem key={r.id} value={numeroDe(r.telefone!)}>
                      {r.nome} · {r.telefone}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {conversas.isPending ? (
              <Skeleton className="h-60" />
            ) : conversas.isError ? (
              <ErroDeConsulta erro={conversas.error} aoTentar={() => void conversas.refetch()} />
            ) : lista.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
            ) : (
              <ul className="custom-scrollbar max-h-[60vh] space-y-1 overflow-y-auto pr-1">
                {lista.map((c) => (
                  <li key={c.numero}>
                    <ItemDaLista conversa={c} ativa={c.numero === numero} aoEscolher={() => setNumero(c.numero)} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {numero ? (
          <PainelDaConversa
            key={numero}
            numero={numero}
            conversa={atual}
            recuperador={recuperadorAtual ? { nome: recuperadorAtual.nome, detalhe: recuperadorAtual.cidades.join(', ') || recuperadorAtual.status } : null}
            podeEnviar={pode.escrever(sessao) && !semEvolution}
            podeEditar={pode.escrever(sessao)}
          />
        ) : (
          <Card className="flex items-center justify-center p-10 text-center">
            <MessageCircleIcon className="mx-auto size-8 text-slate-600" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">Escolha uma conversa ou comece uma com um recuperador.</p>
          </Card>
        )}
      </div>
    </>
  );
}

function ItemDaLista({ conversa: c, ativa, aoEscolher }: { conversa: Conversa; ativa: boolean; aoEscolher: () => void }) {
  const midia = c.ultimaMidia ? MIDIA[c.ultimaMidia] : null;
  return (
    <Button
      variant="ghost"
      onClick={aoEscolher}
      className={cn(
        'block h-auto w-full rounded-lg p-3 text-left font-normal ring-1 transition-colors',
        ativa ? 'bg-blue-500/10 ring-blue-400/40' : 'bg-white/3 ring-white/5 hover:bg-white/6',
      )}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{c.nome ?? exibir(c.numero)}</p>
        <span className="text-[11px] text-muted-foreground tabular-nums">{formatarDataHora(c.ultimaEm)}</span>
      </div>
      {c.nome ? <p className="truncate text-[11px] text-muted-foreground tabular-nums">{exibir(c.numero)}</p> : null}
      <div className="mt-0.5 flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-muted-foreground">
          {c.ultimaDirecao === 'enviada' ? 'Você: ' : ''}
          {midia ? <midia.Icone className="size-3.5 shrink-0" /> : null}
          <span className="truncate">{c.ultimaMensagem || midia?.rotulo}</span>
        </p>
        {c.placa ? (
          <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
            {c.placa}
          </Badge>
        ) : null}
      </div>
    </Button>
  );
}

function PainelDaConversa({
  numero,
  conversa,
  recuperador,
  podeEnviar,
  podeEditar,
}: {
  numero: string;
  conversa: Conversa | undefined;
  recuperador: { nome: string; detalhe: string } | null;
  podeEnviar: boolean;
  podeEditar: boolean;
}) {
  const mensagens = useQuery(mensagensQuery(numero));
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.data?.length]);

  const titulo = conversa?.nome ?? recuperador?.nome ?? exibir(numero);
  const detalhes = [
    exibir(numero),
    recuperador ? `Recuperador · ${recuperador.detalhe}` : null,
    conversa?.nomeWhatsapp && conversa.nomeWhatsapp !== titulo ? `No WhatsApp: ${conversa.nomeWhatsapp}` : null,
  ].filter(Boolean);

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="border-b border-white/10 pb-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <CardTitle className="truncate text-white">{titulo}</CardTitle>
              {podeEditar ? <EditarNome numero={numero} atual={conversa?.nomeDado ?? null} sugestao={conversa?.nomeWhatsapp ?? null} /> : null}
            </div>
            <CardDescription className="tabular-nums">{detalhes.join(' · ')}</CardDescription>
          </div>
          <VeiculoDaConversa numero={numero} conversa={conversa} podeEditar={podeEditar} />
        </div>
      </CardHeader>
      <CardContent className="custom-scrollbar max-h-[55vh] min-h-64 flex-1 space-y-2 overflow-y-auto py-4">
        {mensagens.isPending ? (
          <Skeleton className="h-40" />
        ) : (mensagens.data ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma mensagem. A primeira sai daqui.</p>
        ) : (
          (mensagens.data ?? []).map((m) => <Bolha key={m.id} mensagem={m} />)
        )}
        <div ref={fim} />
      </CardContent>
      {podeEnviar ? <Compositor numero={numero} /> : null}
    </Card>
  );
}

/** O conteúdo da mensagem: mídia (servida pela API, sob o RLS) e texto ou legenda. */
function Bolha({ mensagem: m }: { mensagem: MensagemWhatsapp }) {
  const enviada = m.direcao === 'enviada';
  const url = `/api/mensagens/${m.id}/midia`;
  const midia = m.midiaTipo ? MIDIA[m.midiaTipo] : null;

  const conteudo = (() => {
    if (!m.midiaTipo) return null;
    if (m.midiaTipo === 'localizacao' && m.latitude !== null && m.longitude !== null) {
      return (
        <a
          href={`https://www.openstreetmap.org/?mlat=${m.latitude}&mlon=${m.longitude}#map=17/${m.latitude}/${m.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 underline"
        >
          <MapPinIcon className="size-4" aria-hidden />
          {m.latitude.toFixed(5)}, {m.longitude.toFixed(5)}
        </a>
      );
    }
    if (!m.temArquivo) {
      return (
        <MidiaFaltando mensagem={m} rotulo={midia?.rotulo ?? 'Mídia'} Icone={midia?.Icone ?? FileTextIcon} />
      );
    }
    switch (m.midiaTipo) {
      case 'imagem':
      case 'figurinha':
        return (
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={m.texto || midia?.rotulo}
              loading="lazy"
              className={cn('rounded-lg object-contain', m.midiaTipo === 'figurinha' ? 'max-h-32' : 'max-h-72 max-w-full')}
            />
          </a>
        );
      case 'audio':
        return <audio controls preload="metadata" src={url} className="h-10 w-64 max-w-full" />;
      case 'video':
        return <video controls preload="metadata" src={url} className="max-h-72 max-w-full rounded-lg" />;
      default:
        return (
          <a href={url} target="_blank" rel="noreferrer" download={m.midiaNome ?? true} className="flex items-center gap-2 underline">
            <FileTextIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{m.midiaNome ?? 'Documento'}</span>
          </a>
        );
    }
  })();

  return (
    <div className={cn('flex', enviada ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] space-y-1 rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap',
          enviada ? 'rounded-br-sm bg-blue-600 text-white' : 'rounded-bl-sm bg-slate-800 text-slate-100',
        )}
      >
        {conteudo}
        {m.texto ? <p>{m.texto}</p> : null}
        <p className={cn('text-[10px]', enviada ? 'text-blue-100/80' : 'text-slate-400')}>
          {formatarDataHora(m.criadoEm)}
          {m.usuarioNome ? ` · ${m.usuarioNome}` : enviada ? ' · pelo celular' : ''}
          {m.placa ? ` · caso ${m.placa}` : ''}
        </p>
      </div>
    </div>
  );
}

/** Mídia que não foi guardada: o motivo e, quando dá, baixar de novo da Evolution. */
function MidiaFaltando({
  mensagem: m,
  rotulo,
  Icone,
}: {
  mensagem: MensagemWhatsapp;
  rotulo: string;
  Icone: ComponentType<{ className?: string }>;
}) {
  const queryClient = useQueryClient();
  const baixar = useMutation({
    mutationFn: () => exigir(api.POST('/api/mensagens/{id}/midia/baixar', { params: { path: { id: m.id } } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['conversas'] }),
    onError: (e) => toast.error(`Não foi possível baixar: ${e.message}`),
  });
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 italic opacity-80">
        <Icone className="size-4" />
        {rotulo} não guardado no servidor
      </p>
      {m.midiaFalha ? <p className="text-[11px] opacity-70">{m.midiaFalha}</p> : null}
      {m.podeBaixar ? (
        <Button size="sm" variant="secondary" className="h-7" onClick={() => baixar.mutate()} disabled={baixar.isPending}>
          {baixar.isPending ? <Spinner /> : <DownloadIcon />}
          Baixar de novo
        </Button>
      ) : null}
    </div>
  );
}

const useSalvarContato = (numero: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (corpo: { nome?: string | null; casoId?: string | null }) =>
      exigir(api.PUT('/api/conversas/{numero}/contato', { params: { path: { numero } }, body: corpo })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['conversas'] }),
    onError: (e) => toast.error(e.message),
  });
};

/** Nome dado pela operação. Vazio volta ao nome do WhatsApp. */
function EditarNome({ numero, atual, sugestao }: { numero: string; atual: string | null; sugestao: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(atual ?? sugestao ?? '');
  const salvar = useSalvarContato(numero);
  return (
    <Popover
      open={aberto}
      onOpenChange={(a) => {
        setAberto(a);
        if (a) setNome(atual ?? sugestao ?? '');
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Editar nome do contato">
          <PencilIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const limpo = nome.trim();
            salvar.mutate({ nome: limpo.length ? limpo : null }, { onSuccess: () => setAberto(false) });
          }}
        >
          <p className="text-sm font-medium text-white">Nome do contato</p>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={sugestao ?? 'Nome'} aria-label="Nome do contato" autoFocus />
          <p className="text-[11px] text-muted-foreground">Deixe vazio para usar o nome do WhatsApp{sugestao ? ` (${sugestao})` : ''}.</p>
          <Button type="submit" size="sm" disabled={salvar.isPending || (nome.trim().length > 0 && nome.trim().length < 2)}>
            {salvar.isPending ? <Spinner /> : <CheckIcon />}
            Salvar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Veículo da conversa: as próximas mensagens entram ligadas a ele. */
function VeiculoDaConversa({ numero, conversa, podeEditar }: { numero: string; conversa: Conversa | undefined; podeEditar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const casos = useQuery({ ...casosQuery('plataforma_credor'), enabled: aberto });
  const salvar = useSalvarContato(numero);
  const opcoes = useMemo(() => (casos.data?.casos ?? []).filter((c) => STATUS_DE_CAMPO.includes(c.status)), [casos.data]);

  const atual = conversa?.casoId ? (
    <Link
      to="/a/casos/$casoId"
      params={{ casoId: conversa.casoId }}
      className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm ring-1 ring-white/10 hover:bg-white/10"
    >
      <CarIcon className="size-4 text-blue-300" aria-hidden />
      <span className="font-mono font-semibold text-white">{conversa.placa}</span>
      <span className="max-w-40 truncate text-xs text-muted-foreground">{[conversa.modelo, conversa.casoStatus].filter(Boolean).join(' · ')}</span>
    </Link>
  ) : null;

  if (!podeEditar) return atual;

  return (
    <div className="flex items-center gap-2">
      {atual}
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <CarIcon />
            {conversa?.casoId ? 'Trocar veículo' : 'Atribuir veículo'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <Command>
            <CommandInput placeholder="Placa ou modelo" />
            <CommandList>
              {casos.isPending ? (
                <div className="p-3">
                  <Skeleton className="h-24" />
                </div>
              ) : (
                <CommandEmpty>Nenhum caso em andamento com essa placa.</CommandEmpty>
              )}
              {conversa?.casoId ? (
                <CommandGroup>
                  <CommandItem value="remover-veiculo" onSelect={() => salvar.mutate({ casoId: null }, { onSuccess: () => setAberto(false) })}>
                    <XIcon />
                    Tirar o veículo da conversa
                  </CommandItem>
                </CommandGroup>
              ) : null}
              <CommandGroup heading="Casos do Plano A">
                {opcoes.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.placa} ${c.modelo ?? ''} ${c.cidade ?? ''}`}
                    onSelect={() => salvar.mutate({ casoId: c.id }, { onSuccess: () => setAberto(false) })}
                  >
                    <span className="font-mono font-semibold">{c.placa}</span>
                    <span className="truncate text-xs text-muted-foreground">{[c.modelo, c.status].filter(Boolean).join(' · ')}</span>
                    {c.id === conversa?.casoId ? <CheckIcon className="ml-auto" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Compositor({ numero }: { numero: string }) {
  const queryClient = useQueryClient();
  const casos = useQuery(casosQuery('plataforma_credor'));
  const [texto, setTexto] = useState('');
  const [casoId, setCasoId] = useState<string | undefined>();
  const [anexo, setAnexo] = useState<File | null>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const casosAbertos = useMemo(
    () => (casos.data?.casos ?? []).filter((c) => ['Pronto para Campo', 'Distribuído', 'Aceito', 'Em Campo', 'Localizado', 'Enriquecido'].includes(c.status)),
    [casos.data],
  );

  const aposEnviar = () => {
    setTexto('');
    setCasoId(undefined);
    setAnexo(null);
    void queryClient.invalidateQueries({ queryKey: ['conversas'] });
  };

  const enviarTexto = useMutation({
    mutationFn: () => exigir(api.POST('/api/conversas/{numero}', { params: { path: { numero } }, body: { texto, casoId } })),
    onSuccess: aposEnviar,
    onError: (e) => toast.error(e.message),
  });

  const enviarMidia = useMutation({
    mutationFn: async (m: { arquivo: Blob; tipoMime: string; nomeArquivo?: string; voz?: boolean }) =>
      exigir(
        api.POST('/api/conversas/{numero}/midia', {
          params: { path: { numero } },
          body: {
            arquivo: await lerComoBase64(m.arquivo),
            tipoMime: m.tipoMime || 'application/octet-stream',
            ...(m.nomeArquivo ? { nomeArquivo: m.nomeArquivo } : {}),
            ...(!m.voz && texto.trim() ? { legenda: texto.trim() } : {}),
            ...(m.voz ? { voz: true } : {}),
            ...(casoId ? { casoId } : {}),
          },
        }),
      ),
    onSuccess: (_r, m) => {
      // A voz não leva o texto digitado: ele continua na caixa.
      if (m.voz) void queryClient.invalidateQueries({ queryKey: ['conversas'] });
      else aposEnviar();
    },
    onError: (e) => toast.error(e.message),
  });

  const enviando = enviarTexto.isPending || enviarMidia.isPending;
  const enviar = () => {
    if (enviando) return;
    if (anexo) enviarMidia.mutate({ arquivo: anexo, tipoMime: anexo.type, nomeArquivo: anexo.name });
    else if (texto.trim()) enviarTexto.mutate();
  };

  const escolher = (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (arquivo.size > LIMITE_MB * 1024 * 1024) {
      toast.error(`Arquivo grande demais (máximo de ${LIMITE_MB} MB).`);
      return;
    }
    setAnexo(arquivo);
  };

  return (
    <div className="space-y-2 border-t border-white/10 p-4">
      <div className="flex flex-wrap gap-2">
        <Select
          value={casoId ?? ''}
          onValueChange={(id) => {
            const c = casosAbertos.find((x) => x.id === id);
            setCasoId(id);
            if (c) setTexto(mensagemDoCaso(c));
          }}
        >
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Enviar um caso (sem dado da dívida)" />
          </SelectTrigger>
          <SelectContent>
            {casosAbertos.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.placa} · {c.modelo ?? '—'} · {c.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {anexo ? (
        <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10">
          <PaperclipIcon className="size-4 text-blue-300" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-white">{anexo.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{(anexo.size / 1024 / 1024).toFixed(1)} MB</span>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Tirar o anexo" onClick={() => setAnexo(null)}>
            <XIcon className="size-4" />
          </Button>
        </div>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <Input
          ref={seletor}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={(e) => {
            escolher(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button type="button" variant="outline" size="icon" aria-label="Anexar arquivo" onClick={() => seletor.current?.click()} disabled={enviando}>
          <PaperclipIcon />
        </Button>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder={anexo ? 'Legenda (opcional)' : 'Mensagem'}
          aria-label="Mensagem"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar();
          }}
        />
        <GravadorDeAudio desabilitado={enviando} aoGravar={(audio) => enviarMidia.mutate({ arquivo: audio, tipoMime: audio.type, voz: true })} />
        <Button type="submit" disabled={(!texto.trim() && !anexo) || enviando}>
          {enviando ? <Spinner /> : <SendIcon />}
          Enviar
        </Button>
      </form>
      <p className="text-[11px] text-muted-foreground">
        Ctrl+Enter envia. Anexo de até {LIMITE_MB} MB; o texto vai como legenda. Nunca mande valor da dívida nem dado do devedor para terceiros.
      </p>
    </div>
  );
}

/** Formato que o navegador grava: ogg no Firefox, webm no Chrome. A Evolution converte para o WhatsApp. */
const formatoDeGravacao = () =>
  ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
    (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
  );

/** Grava pelo microfone e manda como mensagem de voz. */
function GravadorDeAudio({ desabilitado, aoGravar }: { desabilitado: boolean; aoGravar: (audio: Blob) => void }) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  // Saiu da conversa gravando: solta o microfone sem enviar.
  useEffect(
    () => () => {
      const g = gravador.current;
      if (g && g.state !== 'inactive') {
        g.ondataavailable = null;
        g.onstop = null;
        g.stop();
        g.stream.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  const comecar = async () => {
    const formato = formatoDeGravacao();
    if (!navigator.mediaDevices?.getUserMedia || !formato) {
      toast.error('Este navegador não grava áudio.');
      return;
    }
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('Sem permissão para usar o microfone.');
      return;
    }
    const partes: Blob[] = [];
    const g = new MediaRecorder(fluxo, { mimeType: formato });
    g.ondataavailable = (e) => {
      if (e.data.size) partes.push(e.data);
    };
    g.onstop = () => {
      fluxo.getTracks().forEach((t) => t.stop());
      const audio = new Blob(partes, { type: formato });
      if (audio.size > 0) aoGravar(audio);
    };
    gravador.current = g;
    g.start();
    setSegundos(0);
    setGravando(true);
  };

  const parar = () => {
    gravador.current?.stop();
    setGravando(false);
  };

  if (gravando) {
    return (
      <Button type="button" variant="destructive" onClick={parar} aria-label="Parar e enviar o áudio">
        <SquareIcon />
        <span className="tabular-nums">
          {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
        </span>
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="icon" aria-label="Gravar áudio" onClick={() => void comecar()} disabled={desabilitado}>
      <MicIcon />
    </Button>
  );
}
