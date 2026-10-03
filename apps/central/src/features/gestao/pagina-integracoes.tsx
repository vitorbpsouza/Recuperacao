import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  CloudDownloadIcon,
  CopyIcon,
  KeyRoundIcon,
  MessageCircleIcon,
  PlugZapIcon,
  PlusIcon,
  PowerIcon,
  WebhookIcon,
  XCircleIcon,
} from 'lucide-react';
import { useState } from 'react';

import { atualizarIntegracaoEntrada, novaIntegracaoEntrada } from '@workspace/domain';
import { Rotulo } from '@workspace/ui/brand/rotulo';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { RadioGroup, RadioGroupItem } from '@workspace/ui/components/radio-group';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { formatarDataHora, formatarMoeda } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';
import { cn } from '@workspace/ui/lib/utils';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, exigir, integracoesQuery, pode, type Integracao, type UsuarioSessao } from '@/lib/api.ts';

const TIPOS = {
  apibrasil: {
    titulo: 'API Brasil',
    icone: CloudDownloadIcon,
    resumo: 'Consulta veicular paga pela placa, direto na ficha do caso. A resposta inteira é guardada e lida como um relatório colado.',
  },
  evolution: {
    titulo: 'Evolution API (WhatsApp)',
    icone: MessageCircleIcon,
    resumo: 'WhatsApp da operação: conversa com a rede de campo e terceiros, e conferência de quais celulares do devedor têm WhatsApp.',
  },
} as const;

const copiar = (t: string) => void navigator.clipboard.writeText(t).then(() => toast.success('Copiado.'));

/** Conexões com serviços pagos. A credencial entra cifrada e nunca volta para a tela. */
export function PaginaIntegracoes({ sessao }: { sessao: UsuarioSessao }) {
  const consulta = useQuery(integracoesQuery);
  const admin = pode.administrar(sessao);
  const [nova, setNova] = useState<'apibrasil' | 'evolution' | null>(null);
  const [webhook, setWebhook] = useState<string | null>(null);

  return (
    <>
      <CabecalhoDePagina
        titulo="Integrações"
        descricao="Conexões com a API Brasil e a Evolution. A chave fica cifrada no banco: depois de salva, aparece só o final dela."
      />
      {webhook ? (
        <Alert className="mb-6 border-emerald-400/30 bg-emerald-500/[0.06]">
          <WebhookIcon className="text-emerald-300" />
          <AlertTitle>Endereço do webhook (aparece só agora)</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>É por ele que as respostas do WhatsApp chegam na Operação. Se o botão “Configurar webhook” não conseguir gravar na Evolution, cole este endereço lá, no evento MESSAGES_UPSERT.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-2 py-1 font-mono text-xs">{webhook}</code>
              <Button size="sm" variant="outline" onClick={() => copiar(webhook)}>
                <CopyIcon />
                Copiar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {consulta.isError ? <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} /> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        {(['apibrasil', 'evolution'] as const).map((tipo) => {
          const t = TIPOS[tipo];
          const conexoes = (consulta.data ?? []).filter((i) => i.tipo === tipo);
          return (
            <Card key={tipo}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                    <t.icone className="size-5" aria-hidden />
                  </span>
                  {t.titulo}
                </CardTitle>
                <CardDescription>{t.resumo}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {consulta.isPending ? (
                  <Skeleton className="h-32" />
                ) : conexoes.length ? (
                  conexoes.map((i) => <CartaoConexao key={i.id} conexao={i} admin={admin} aoWebhook={setWebhook} />)
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
                    Nenhuma conexão cadastrada.
                  </div>
                )}
                {admin ? (
                  <Button variant="outline" onClick={() => setNova(tipo)}>
                    <PlusIcon />
                    Nova conexão {t.titulo}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {nova ? <DialogoNovaConexao tipoInicial={nova} aoFechar={() => setNova(null)} aoWebhook={setWebhook} /> : null}
    </>
  );
}

function CartaoConexao({ conexao: i, admin, aoWebhook }: { conexao: Integracao; admin: boolean; aoWebhook: (url: string) => void }) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const atualizar = () => void queryClient.invalidateQueries({ queryKey: ['integracoes'] });
  const testar = useMutation({
    mutationFn: () => exigir(api.POST('/api/integracoes/{id}/testar', { params: { path: { id: i.id } } })),
    onSuccess: (r) => {
      (r.ok ? toast.success : toast.error)(r.detalhe);
      atualizar();
    },
  });
  const webhook = useMutation({
    mutationFn: () => exigir(api.POST('/api/integracoes/{id}/webhook', { params: { path: { id: i.id } } })),
    onSuccess: (r) => {
      (r.configuradoNaEvolution ? toast.success : toast.warning)(r.detalhe);
      aoWebhook(r.url);
      atualizar();
    },
    onError: (e) => toast.error(e.message),
  });
  const alternar = useMutation({
    mutationFn: () => exigir(api.PUT('/api/integracoes/{id}', { params: { path: { id: i.id } }, body: { ativo: !i.ativo } })),
    onSuccess: atualizar,
  });

  return (
    <div className={cn('space-y-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]', !i.ativo && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-white">{i.nome}</p>
        <Badge className={i.ativo ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-500/15 text-slate-300'}>{i.ativo ? 'ativa' : 'desligada'}</Badge>
        {i.ultimoTesteOk != null ? (
          <Badge className={i.ultimoTesteOk ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}>
            {i.ultimoTesteOk ? <CheckCircle2Icon className="size-3" /> : <XCircleIcon className="size-3" />}
            {i.ultimoTesteOk ? 'teste ok' : 'teste falhou'}
          </Badge>
        ) : null}
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <Rotulo className="text-[10px]">Endereço</Rotulo>
          <p className="truncate font-mono text-xs text-slate-200">{i.baseUrl}</p>
        </div>
        <div>
          <Rotulo className="text-[10px]">Credencial</Rotulo>
          <p className="font-mono text-xs text-slate-200">{i.credenciaisFinal || '—'}</p>
        </div>
        {i.tipo === 'evolution' ? (
          <>
            <div>
              <Rotulo className="text-[10px]">Instância</Rotulo>
              <p className="text-slate-200">{i.config.instancia ?? '—'}</p>
            </div>
            <div>
              <Rotulo className="text-[10px]">Webhook</Rotulo>
              <p className="text-slate-200">{i.webhookConfigurado ? 'com token' : 'não configurado'}</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <Rotulo className="text-[10px]">Serviço</Rotulo>
              <p className="text-slate-200">{i.config.servico === 'consulta' ? 'Consulta por créditos' : 'Dados por placa (device)'}</p>
            </div>
            <div>
              <Rotulo className="text-[10px]">Contrato e custo</Rotulo>
              <p className="text-slate-200">
                {i.contrato ?? '—'} · {formatarMoeda(i.custoConsulta)} por consulta
              </p>
            </div>
          </>
        )}
      </div>
      {i.ultimoTesteDetalhe ? (
        <p className="text-xs text-muted-foreground">
          Último teste em {formatarDataHora(i.ultimoTesteEm)}: {i.ultimoTesteDetalhe}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => testar.mutate()} disabled={testar.isPending || !i.ativo}>
          {testar.isPending ? <Spinner /> : <PlugZapIcon />}
          Testar conexão
        </Button>
        {admin && i.tipo === 'evolution' ? (
          <Button size="sm" variant="outline" onClick={() => webhook.mutate()} disabled={webhook.isPending || !i.ativo}>
            {webhook.isPending ? <Spinner /> : <WebhookIcon />}
            Configurar webhook
          </Button>
        ) : null}
        {admin ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              <KeyRoundIcon />
              Trocar credencial
            </Button>
            <Button size="sm" variant="ghost" onClick={() => alternar.mutate()} disabled={alternar.isPending}>
              <PowerIcon />
              {i.ativo ? 'Desligar' : 'Ligar'}
            </Button>
          </>
        ) : null}
      </div>
      {editando ? <DialogoCredencial conexao={i} aoFechar={() => setEditando(false)} /> : null}
    </div>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  dica,
  tipo = 'text',
  obrigatorio,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string;
  dica?: React.ReactNode;
  tipo?: string;
  obrigatorio?: boolean;
}) {
  return (
    <Field data-invalid={!!erro}>
      <FieldLabel htmlFor={id}>
        {rotulo}
        {obrigatorio ? <span className="text-red-300">*</span> : null}
      </FieldLabel>
      <Input id={id} type={tipo} value={valor} onChange={(e) => aoMudar(e.target.value)} autoComplete="off" />
      {dica ? <FieldDescription>{dica}</FieldDescription> : null}
      <FieldError>{erro}</FieldError>
    </Field>
  );
}

function DialogoNovaConexao({
  tipoInicial,
  aoFechar,
  aoWebhook,
}: {
  tipoInicial: 'apibrasil' | 'evolution';
  aoFechar: () => void;
  aoWebhook: (url: string) => void;
}) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState(tipoInicial);
  const [v, setV] = useState<Record<string, string>>({
    nome: tipoInicial === 'apibrasil' ? 'API Brasil' : 'WhatsApp da operação',
    baseUrl: tipoInicial === 'apibrasil' ? 'https://gateway.apibrasil.io/api/v2' : '',
    servico: 'dados',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const definir = (k: string) => (valor: string) => setV({ ...v, [k]: valor });

  const criar = useMutation({
    mutationFn: (corpo: ReturnType<typeof novaIntegracaoEntrada.parse>) => exigir(api.POST('/api/integracoes', { body: corpo })),
    onSuccess: (r) => {
      toast.success('Conexão cadastrada. Teste para confirmar que a chave funciona.');
      if (r.webhookUrl) aoWebhook(r.webhookUrl);
      void queryClient.invalidateQueries({ queryKey: ['integracoes'] });
      void queryClient.invalidateQueries({ queryKey: ['bureaus'] });
      aoFechar();
    },
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const opcional = (s?: string) => (s?.trim() ? s.trim() : undefined);
    const corpo =
      tipo === 'apibrasil'
        ? {
            tipo,
            nome: v.nome ?? '',
            baseUrl: opcional(v.baseUrl),
            bearerToken: v.bearerToken ?? '',
            deviceToken: opcional(v.deviceToken),
            servico: v.servico as 'dados' | 'consulta',
            contratoFornecedorId: v.contrato ?? '',
            custoConsulta: v.custo?.trim() ? Number(v.custo.replace(',', '.')) : 0,
          }
        : { tipo, nome: v.nome ?? '', baseUrl: v.baseUrl ?? '', apikey: v.apikey ?? '', instancia: v.instancia ?? '' };
    const r = novaIntegracaoEntrada.safeParse(corpo);
    if (!r.success) return setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path.at(-1)), i.message])));
    setErros({});
    criar.mutate(r.data);
  };

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nova conexão</DialogTitle>
          <DialogDescription>A chave é cifrada antes de ir para o banco e nunca mais aparece inteira.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={enviar} className="space-y-5">
          <RadioGroup value={tipo} onValueChange={(t) => setTipo(t as typeof tipo)} className="grid gap-3 sm:grid-cols-2">
            {(['apibrasil', 'evolution'] as const).map((k) => (
              <label
                key={k}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-xl p-4 ring-1 transition-colors',
                  tipo === k ? 'bg-blue-500/10 ring-blue-400/50' : 'bg-white/[0.03] ring-white/[0.08] hover:bg-white/[0.05]',
                )}
              >
                <RadioGroupItem value={k} className="mt-1" />
                <div>
                  <p className="font-semibold text-white">{TIPOS[k].titulo}</p>
                  <p className="text-xs text-muted-foreground">{TIPOS[k].resumo}</p>
                </div>
              </label>
            ))}
          </RadioGroup>

          <Campo id="int-nome" rotulo="Nome da conexão" valor={v.nome ?? ''} aoMudar={definir('nome')} erro={erros.nome} obrigatorio />

          {tipo === 'apibrasil' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo
                  id="int-bearer"
                  rotulo="Bearer Token"
                  tipo="password"
                  valor={v.bearerToken ?? ''}
                  aoMudar={definir('bearerToken')}
                  erro={erros.bearerToken}
                  obrigatorio
                  dica="No painel da API Brasil: Minha conta › Credenciais."
                />
              </div>
              <Campo
                id="int-device"
                rotulo="DeviceToken"
                tipo="password"
                valor={v.deviceToken ?? ''}
                aoMudar={definir('deviceToken')}
                erro={erros.deviceToken}
                dica="Em Dispositivos, o device do serviço de veículos. Obrigatório no serviço “dados por placa”."
              />
              <Field>
                <FieldLabel>Serviço</FieldLabel>
                <RadioGroup value={v.servico ?? 'dados'} onValueChange={definir('servico')} className="gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="dados" /> Dados por placa (com DeviceToken)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="consulta" /> Consulta veicular por créditos
                  </label>
                </RadioGroup>
              </Field>
              <Campo
                id="int-contrato"
                rotulo="Contrato"
                valor={v.contrato ?? ''}
                aoMudar={definir('contrato')}
                erro={erros.contratoFornecedorId}
                obrigatorio
                dica="Número do pedido, termo de adesão ou contrato: é o que dá procedência a cada consulta na auditoria."
              />
              <Campo id="int-custo" rotulo="Custo por consulta (R$)" valor={v.custo ?? ''} aoMudar={definir('custo')} erro={erros.custoConsulta} dica="Entra no relatório de custos por fornecedor." />
              <div className="sm:col-span-2">
                <Campo id="int-url" rotulo="Endereço da API" valor={v.baseUrl ?? ''} aoMudar={definir('baseUrl')} erro={erros.baseUrl} />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo
                  id="int-url"
                  rotulo="Endereço do servidor Evolution"
                  valor={v.baseUrl ?? ''}
                  aoMudar={definir('baseUrl')}
                  erro={erros.baseUrl}
                  obrigatorio
                  dica="Ex.: https://evolution.suaempresa.com.br (sem barra no fim)."
                />
              </div>
              <Campo
                id="int-instancia"
                rotulo="Instância"
                valor={v.instancia ?? ''}
                aoMudar={definir('instancia')}
                erro={erros.instancia}
                obrigatorio
                dica="O nome da instância conectada ao número da operação."
              />
              <Campo
                id="int-apikey"
                rotulo="apikey"
                tipo="password"
                valor={v.apikey ?? ''}
                aoMudar={definir('apikey')}
                erro={erros.apikey}
                obrigatorio
                dica="A chave da instância (ou a global, AUTHENTICATION_API_KEY)."
              />
            </div>
          )}

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
              {criar.isPending ? <Spinner /> : <PlusIcon />}
              Cadastrar conexão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCredencial({ conexao: i, aoFechar }: { conexao: Integracao; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState<Record<string, string>>({ baseUrl: i.baseUrl, instancia: i.config.instancia ?? '' });
  const salvar = useMutation({
    mutationFn: (corpo: ReturnType<typeof atualizarIntegracaoEntrada.parse>) =>
      exigir(api.PUT('/api/integracoes/{id}', { params: { path: { id: i.id } }, body: corpo })),
    onSuccess: () => {
      toast.success('Conexão atualizada.');
      void queryClient.invalidateQueries({ queryKey: ['integracoes'] });
      aoFechar();
    },
  });
  const opcional = (s?: string) => (s?.trim() ? s.trim() : undefined);
  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Atualizar {i.nome}</DialogTitle>
          <DialogDescription>Deixe em branco a credencial que não for trocar.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = atualizarIntegracaoEntrada.safeParse({
              baseUrl: opcional(v.baseUrl),
              ...(i.tipo === 'apibrasil'
                ? { bearerToken: opcional(v.bearerToken), deviceToken: opcional(v.deviceToken) }
                : { apikey: opcional(v.apikey), instancia: opcional(v.instancia) }),
            });
            if (!r.success) return toast.error(r.error.issues[0]!.message);
            salvar.mutate(r.data);
          }}
        >
          <Campo id="ed-url" rotulo="Endereço" valor={v.baseUrl ?? ''} aoMudar={(x) => setV({ ...v, baseUrl: x })} />
          {i.tipo === 'apibrasil' ? (
            <>
              <Campo id="ed-bearer" rotulo="Novo Bearer Token" tipo="password" valor={v.bearerToken ?? ''} aoMudar={(x) => setV({ ...v, bearerToken: x })} />
              <Campo id="ed-device" rotulo="Novo DeviceToken" tipo="password" valor={v.deviceToken ?? ''} aoMudar={(x) => setV({ ...v, deviceToken: x })} />
            </>
          ) : (
            <>
              <Campo id="ed-inst" rotulo="Instância" valor={v.instancia ?? ''} aoMudar={(x) => setV({ ...v, instancia: x })} />
              <Campo id="ed-apikey" rotulo="Nova apikey" tipo="password" valor={v.apikey ?? ''} aoMudar={(x) => setV({ ...v, apikey: x })} />
            </>
          )}
          {salvar.error ? (
            <Alert variant="destructive">
              <AlertDescription>{salvar.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? <Spinner /> : <KeyRoundIcon />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
