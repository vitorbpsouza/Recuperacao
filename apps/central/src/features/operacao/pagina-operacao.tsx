import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MessageCircleIcon, SendIcon, ShieldAlertIcon, UserPlusIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { formatarDataHora } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';
import { cn } from '@workspace/ui/lib/utils';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, casosQuery, conversasQuery, exigir, integracoesQuery, mensagensQuery, pode, recuperadoresQuery, type Caso, type UsuarioSessao } from '@/lib/api.ts';
import { formatarTelefone } from '@/lib/pessoa.ts';

/** Só dígitos com DDI 55. */
const numeroDe = (telefone: string) => {
  const d = telefone.replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
};
const exibir = (numero: string) => formatarTelefone(numero.startsWith('55') ? numero.slice(2) : numero);

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
        descricao="WhatsApp com a rede de campo e terceiros. Mensagens enviadas e recebidas ficam no histórico, sem edição."
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
                    <Button
                      variant="ghost"
                      onClick={() => setNumero(c.numero)}
                      className={cn(
                        'block h-auto w-full rounded-lg p-3 text-left font-normal ring-1 transition-colors',
                        c.numero === numero ? 'bg-blue-500/10 ring-blue-400/40' : 'bg-white/3 ring-white/5 hover:bg-white/6',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{c.nome ?? exibir(c.numero)}</p>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{formatarDataHora(c.ultimaEm)}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.ultimaDirecao === 'enviada' ? 'Você: ' : ''}
                        {c.ultimaMensagem}
                      </p>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {numero ? (
          <Conversa
            numero={numero}
            titulo={atual?.nome ?? recuperadorAtual?.nome ?? exibir(numero)}
            subtitulo={recuperadorAtual ? `Recuperador · ${recuperadorAtual.cidades.join(', ') || recuperadorAtual.status}` : exibir(numero)}
            podeEnviar={pode.escrever(sessao) && !semEvolution}
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

function Conversa({ numero, titulo, subtitulo, podeEnviar }: { numero: string; titulo: string; subtitulo: string; podeEnviar: boolean }) {
  const queryClient = useQueryClient();
  const mensagens = useQuery(mensagensQuery(numero));
  const casos = useQuery(casosQuery('plataforma_credor'));
  const [texto, setTexto] = useState('');
  const [casoId, setCasoId] = useState<string | undefined>();
  const fim = useRef<HTMLDivElement>(null);
  const casosAbertos = useMemo(
    () => (casos.data?.casos ?? []).filter((c) => ['Pronto para Campo', 'Distribuído', 'Aceito', 'Em Campo', 'Localizado', 'Enriquecido'].includes(c.status)),
    [casos.data],
  );

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.data?.length]);

  const enviar = useMutation({
    mutationFn: () => exigir(api.POST('/api/conversas/{numero}', { params: { path: { numero } }, body: { texto, casoId } })),
    onSuccess: () => {
      setTexto('');
      setCasoId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['conversas'] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="border-b border-white/10 pb-4">
        <CardTitle className="text-white">{titulo}</CardTitle>
        <CardDescription>{subtitulo}</CardDescription>
      </CardHeader>
      <CardContent className="custom-scrollbar max-h-[55vh] min-h-64 flex-1 space-y-2 overflow-y-auto py-4">
        {mensagens.isPending ? (
          <Skeleton className="h-40" />
        ) : (mensagens.data ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma mensagem. A primeira sai daqui.</p>
        ) : (
          (mensagens.data ?? []).map((m) => (
            <div key={m.id} className={cn('flex', m.direcao === 'enviada' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap',
                  m.direcao === 'enviada' ? 'rounded-br-sm bg-blue-600 text-white' : 'rounded-bl-sm bg-slate-800 text-slate-100',
                )}
              >
                {m.texto}
                <p className={cn('mt-1 text-[10px]', m.direcao === 'enviada' ? 'text-blue-100/80' : 'text-slate-400')}>
                  {formatarDataHora(m.criadoEm)}
                  {m.usuarioNome ? ` · ${m.usuarioNome}` : ''}
                  {m.placa ? ` · caso ${m.placa}` : ''}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={fim} />
      </CardContent>
      {podeEnviar ? (
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
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (texto.trim()) enviar.mutate();
            }}
          >
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="Mensagem"
              aria-label="Mensagem"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) enviar.mutate();
              }}
            />
            <Button type="submit" disabled={!texto.trim() || enviar.isPending}>
              {enviar.isPending ? <Spinner /> : <SendIcon />}
              Enviar
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground">Ctrl+Enter envia. Nunca mande valor da dívida nem dado do devedor para terceiros.</p>
        </div>
      ) : null}
    </Card>
  );
}
