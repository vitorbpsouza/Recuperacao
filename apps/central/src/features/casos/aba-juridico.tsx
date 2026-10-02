import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2Icon, CircleAlertIcon, PencilIcon } from 'lucide-react';
import { useState } from 'react';
import type { z } from 'zod';

import {
  procedimentoExtrajudicialEntrada,
  processoJudicialEntrada,
  provaMoraEntrada,
  RITOS,
  ROTULO_MODALIDADE,
  ROTULO_RITO,
  STATUS_DE_PREPARO,
  verificacaoRjEntrada,
  type Rito,
} from '@workspace/domain';
import { Rotulo } from '@workspace/ui/brand/rotulo';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Checkbox } from '@workspace/ui/components/checkbox';
import { Field, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { formatarData, formatarDataHora } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { useAgora } from '@/lib/agora.ts';
import { api, credoresQuery, exigir, juridicoQuery, pode, type JuridicoCaso, type UsuarioSessao } from '@/lib/api.ts';

import { useAtualizarCaso } from './painel-acoes.tsx';

const ROTULO_MEIO = { carta_ar: 'Carta com AR', cartorio: 'Notificação por cartório', protesto: 'Protesto', eletronico: 'Meio eletrônico' };
const ROTULO_LIMINAR = { pendente: 'Pendente', deferida: 'Deferida', indeferida: 'Indeferida', revogada: 'Revogada' };
const ROTULO_RJ = { sem_registro: 'Sem registro', recuperacao_judicial: 'Em recuperação judicial', falencia: 'Falência' };

/** Data civil (AAAA-MM-DD) como dd/mm/aaaa, sem passar por fuso. */
const dia = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '—');

/** Erros do zod por campo. */
const errosDe = (r: { success: false; error: z.ZodError }) =>
  Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));

/**
 * O lado jurídico do caso do Plano A: o que o rito exige, provado e datado.
 * Cada registro alimenta as guardas do banco — é daqui que saem (ou somem) as
 * pendências dos próximos passos.
 */
export function AbaJuridico({ casoId, sessao }: { casoId: string; sessao: UsuarioSessao }) {
  const consulta = useQuery(juridicoQuery(casoId));
  if (consulta.isPending) return <Skeleton className="h-64 rounded-xl" />;
  if (consulta.isError) return <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />;
  const j = consulta.data;
  const escreve = pode.escrever(sessao);
  return (
    <div className="space-y-4">
      <RitoECredor casoId={casoId} j={j} escreve={escreve} />
      <ProvaDaMora casoId={casoId} j={j} escreve={escreve} />
      {j.rito === 'judicial' ? <ProcessoJudicial casoId={casoId} j={j} escreve={escreve} /> : null}
      {j.rito === 'extrajudicial' ? <Extrajudicial casoId={casoId} j={j} escreve={escreve} /> : null}
      <RecuperacaoJudicial casoId={casoId} j={j} escreve={escreve} />
      {j.retomada ? <Retomada j={j} /> : null}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-2 last:border-0">
      <Rotulo>{rotulo}</Rotulo>
      <span className="text-sm text-white">{children}</span>
    </div>
  );
}

function Pendente({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-amber-300">
      <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** Cartão com modo leitura e, para quem escreve, um formulário. */
function Secao({
  titulo,
  descricao,
  podeEditar,
  leitura,
  formulario,
}: {
  titulo: string;
  descricao: string;
  podeEditar: boolean;
  leitura: React.ReactNode;
  formulario: (fechar: () => void) => React.ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-white">{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
        {podeEditar && !editando ? (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
              <PencilIcon />
              Registrar
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>{editando ? formulario(() => setEditando(false)) : leitura}</CardContent>
    </Card>
  );
}

/** Rodapé dos formulários: erro do servidor e botões. */
function Rodape({ pendente, erro, aoCancelar }: { pendente: boolean; erro: Error | null; aoCancelar: () => void }) {
  return (
    <>
      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={aoCancelar}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Spinner /> : null}
          Salvar
        </Button>
      </div>
    </>
  );
}

/** Mutação que, salva, avisa e recarrega a ficha. */
const useSalvar = <T,>(casoId: string, fn: (corpo: T) => Promise<unknown>, aoSalvar: () => void) => {
  const atualizar = useAtualizarCaso(casoId);
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success('Registrado.');
      atualizar();
      aoSalvar();
    },
  });
};

function RitoECredor({ casoId, j, escreve }: { casoId: string; j: JuridicoCaso; escreve: boolean }) {
  const emPreparo = (STATUS_DE_PREPARO as readonly string[]).includes(j.status);
  return (
    <Secao
      titulo="Rito e credor"
      descricao={emPreparo ? 'Definidos antes de ir a campo.' : 'Rito e credor só mudam com o caso em preparo.'}
      podeEditar={escreve && emPreparo}
      leitura={
        <>
          <Linha rotulo="Rito">{j.rito ? ROTULO_RITO[j.rito] : <Pendente>não definido</Pendente>}</Linha>
          <Linha rotulo="Credor">{j.credor?.nome ?? <Pendente>não informado</Pendente>}</Linha>
          <Linha rotulo="Mandato do credor">
            {j.mandatoVigente ? (
              `vigente até ${dia(j.mandatoVigente.fim)} · ${j.mandatoVigente.referencia}`
            ) : j.rito === 'judicial' ? (
              'não exigido no rito judicial'
            ) : (
              <Pendente>sem mandato vigente</Pendente>
            )}
          </Linha>
        </>
      }
      formulario={(fechar) => <FormRito casoId={casoId} j={j} aoFechar={fechar} />}
    />
  );
}

function FormRito({ casoId, j, aoFechar }: { casoId: string; j: JuridicoCaso; aoFechar: () => void }) {
  const credores = useQuery(credoresQuery);
  const [rito, setRito] = useState<Rito | ''>(j.rito ?? '');
  const [credorId, setCredorId] = useState(j.credor?.id ?? '');
  const salvar = useSalvar(
    casoId,
    () => exigir(api.PUT('/api/casos/{id}/rito', { params: { path: { id: casoId } }, body: { rito: rito as Rito, credorId } })),
    aoFechar,
  );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (rito && credorId) salvar.mutate(undefined);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Rito</FieldLabel>
          <Select value={rito} onValueChange={(v) => setRito(v as Rito)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {RITOS.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROTULO_RITO[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Credor</FieldLabel>
          <Select value={credorId} onValueChange={setCredorId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={credores.isPending ? 'Carregando…' : 'Escolha'} />
            </SelectTrigger>
            <SelectContent>
              {(credores.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Rodape pendente={salvar.isPending} erro={salvar.error} aoCancelar={aoFechar} />
    </form>
  );
}

function ProvaDaMora({ casoId, j, escreve }: { casoId: string; j: JuridicoCaso; escreve: boolean }) {
  return (
    <Secao
      titulo="Prova da mora"
      descricao="Basta o envio ao endereço do contrato, sem prova de recebimento (STJ, Tema 1.132)."
      podeEditar={escreve}
      leitura={
        j.mora ? (
          <>
            <Linha rotulo="Meio">{ROTULO_MEIO[j.mora.meio]}</Linha>
            <Linha rotulo="Enviada em">{dia(j.mora.enviadaEm)}</Linha>
            <Linha rotulo="Endereço do contrato">
              {j.mora.enderecoDoContrato ? 'sim' : <Pendente>não — não serve como prova</Pendente>}
            </Linha>
            <Linha rotulo="Comprovante">{j.mora.comprovante}</Linha>
          </>
        ) : j.rito === 'amigavel' ? (
          <p className="text-sm text-muted-foreground">Não exigida no rito amigável.</p>
        ) : (
          <Pendente>Mora ainda não comprovada.</Pendente>
        )
      }
      formulario={(fechar) => <FormMora casoId={casoId} j={j} aoFechar={fechar} />}
    />
  );
}

function FormMora({ casoId, j, aoFechar }: { casoId: string; j: JuridicoCaso; aoFechar: () => void }) {
  type Mora = z.infer<typeof provaMoraEntrada>;
  const [v, setV] = useState<Mora>({
    meio: j.mora?.meio ?? 'carta_ar',
    enviadaEm: j.mora?.enviadaEm ?? '',
    enderecoDoContrato: j.mora?.enderecoDoContrato ?? true,
    comprovante: j.mora?.comprovante ?? '',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const salvar = useSalvar(
    casoId,
    (corpo: Mora) => exigir(api.PUT('/api/casos/{id}/mora', { params: { path: { id: casoId } }, body: corpo })),
    aoFechar,
  );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const r = provaMoraEntrada.safeParse(v);
        if (!r.success) return setErros(errosDe(r));
        setErros({});
        salvar.mutate(r.data);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Meio</FieldLabel>
          <Select value={v.meio} onValueChange={(meio) => setV({ ...v, meio: meio as Mora['meio'] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROTULO_MEIO).map(([k, r]) => (
                <SelectItem key={k} value={k}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={!!erros.enviadaEm}>
          <FieldLabel htmlFor="enviada">Enviada em</FieldLabel>
          <Input id="enviada" type="date" value={v.enviadaEm} onChange={(e) => setV({ ...v, enviadaEm: e.target.value })} />
          <FieldError>{erros.enviadaEm}</FieldError>
        </Field>
      </div>
      <Field data-invalid={!!erros.comprovante}>
        <FieldLabel htmlFor="comprovante-mora">Comprovante</FieldLabel>
        <Input
          id="comprovante-mora"
          value={v.comprovante}
          onChange={(e) => setV({ ...v, comprovante: e.target.value })}
          placeholder="Código de rastreio, protocolo ou número do protesto"
        />
        <FieldError>{erros.comprovante}</FieldError>
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          id="endereco"
          checked={v.enderecoDoContrato}
          onCheckedChange={(c) => setV({ ...v, enderecoDoContrato: c === true })}
        />
        <FieldLabel htmlFor="endereco" className="font-normal">
          Enviada ao endereço que consta no contrato
        </FieldLabel>
      </Field>
      <Rodape pendente={salvar.isPending} erro={salvar.error} aoCancelar={aoFechar} />
    </form>
  );
}

function ProcessoJudicial({ casoId, j, escreve }: { casoId: string; j: JuridicoCaso; escreve: boolean }) {
  const p = j.processo;
  return (
    <Secao
      titulo="Processo judicial"
      descricao="Busca e apreensão (DL 911/69, art. 3º): liminar, mandado e prazo de purga."
      podeEditar={escreve}
      leitura={
        p ? (
          <>
            <Linha rotulo="Número CNJ">
              <span className="font-mono text-xs">{p.numeroCnj}</span>
            </Linha>
            <Linha rotulo="Juízo">{[p.vara, `${p.comarca}/${p.uf}`].filter(Boolean).join(' · ')}</Linha>
            <Linha rotulo="Ajuizado em">{dia(p.ajuizadoEm)}</Linha>
            <Linha rotulo="Liminar">
              {ROTULO_LIMINAR[p.liminar]}
              {p.liminarEm ? ` em ${dia(p.liminarEm)}` : ''}
            </Linha>
            <Linha rotulo="Mandado">{p.mandadoEm ? `expedido em ${dia(p.mandadoEm)}` : <Pendente>não expedido</Pendente>}</Linha>
          </>
        ) : (
          <Pendente>Processo não registrado.</Pendente>
        )
      }
      formulario={(fechar) => <FormProcesso casoId={casoId} j={j} aoFechar={fechar} />}
    />
  );
}

function FormProcesso({ casoId, j, aoFechar }: { casoId: string; j: JuridicoCaso; aoFechar: () => void }) {
  type Processo = z.infer<typeof processoJudicialEntrada>;
  const p = j.processo;
  const [v, setV] = useState({
    numeroCnj: p?.numeroCnj ?? '',
    vara: p?.vara ?? '',
    comarca: p?.comarca ?? '',
    uf: p?.uf ?? '',
    ajuizadoEm: p?.ajuizadoEm ?? '',
    liminar: (p?.liminar ?? 'pendente') as Processo['liminar'],
    liminarEm: p?.liminarEm ?? '',
    mandadoEm: p?.mandadoEm ?? '',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const salvar = useSalvar(
    casoId,
    (corpo: Processo) => exigir(api.PUT('/api/casos/{id}/processo', { params: { path: { id: casoId } }, body: corpo })),
    aoFechar,
  );
  const campo = (k: keyof typeof v, rotulo: string, tipo = 'text', dica?: string) => (
    <Field data-invalid={!!erros[k]}>
      <FieldLabel htmlFor={`proc-${k}`}>{rotulo}</FieldLabel>
      <Input id={`proc-${k}`} type={tipo} placeholder={dica} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
      <FieldError>{erros[k]}</FieldError>
    </Field>
  );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const corpo = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));
        const r = processoJudicialEntrada.safeParse({ ...corpo, uf: v.uf.toUpperCase() || undefined });
        if (!r.success) return setErros(errosDe(r));
        setErros({});
        salvar.mutate(r.data);
      }}
    >
      {campo('numeroCnj', 'Número CNJ', 'text', 'NNNNNNN-DD.AAAA.J.TR.OOOO')}
      <div className="grid gap-4 sm:grid-cols-3">
        {campo('vara', 'Vara')}
        {campo('comarca', 'Comarca')}
        {campo('uf', 'UF')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {campo('ajuizadoEm', 'Ajuizado em', 'date')}
        <Field>
          <FieldLabel>Liminar</FieldLabel>
          <Select value={v.liminar} onValueChange={(l) => setV({ ...v, liminar: l as Processo['liminar'] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROTULO_LIMINAR).map(([k, r]) => (
                <SelectItem key={k} value={k}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {campo('liminarEm', 'Decisão da liminar em', 'date')}
        {campo('mandadoEm', 'Mandado expedido em', 'date')}
      </div>
      <Rodape pendente={salvar.isPending} erro={salvar.error} aoCancelar={aoFechar} />
    </form>
  );
}

function Extrajudicial({ casoId, j, escreve }: { casoId: string; j: JuridicoCaso; escreve: boolean }) {
  const e = j.extrajudicial;
  return (
    <Secao
      titulo="Procedimento extrajudicial"
      descricao="Cartório (RTD) ou Detran: notificação com 20 dias, consolidação e certidão (DL 911/69, arts. 8º-B a 8º-E)."
      podeEditar={escreve}
      leitura={
        e ? (
          <>
            <Linha rotulo="Via">{e.via === 'rtd' ? `Cartório · ${e.orgao}` : `Detran · ${e.orgao}`}</Linha>
            <Linha rotulo="Cláusula em destaque">{e.clausulaDestaque ? 'conferida' : <Pendente>não conferida</Pendente>}</Linha>
            <Linha rotulo="Notificação">
              {e.notificadoEm ? `${dia(e.notificadoEm)} · prazo até ${dia(e.prazoNotificacao)}` : <Pendente>não registrada</Pendente>}
            </Linha>
            <Linha rotulo="Consolidação">{dia(e.consolidadoEm)}</Linha>
            <Linha rotulo="Certidão de busca e apreensão">
              {e.certidaoEm ? dia(e.certidaoEm) : <Pendente>não expedida</Pendente>}
            </Linha>
          </>
        ) : (
          <Pendente>Procedimento não registrado.</Pendente>
        )
      }
      formulario={(fechar) => <FormExtrajudicial casoId={casoId} j={j} aoFechar={fechar} />}
    />
  );
}

function FormExtrajudicial({ casoId, j, aoFechar }: { casoId: string; j: JuridicoCaso; aoFechar: () => void }) {
  type Extra = z.infer<typeof procedimentoExtrajudicialEntrada>;
  const e = j.extrajudicial;
  const [v, setV] = useState({
    via: (e?.via ?? 'rtd') as Extra['via'],
    orgao: e?.orgao ?? '',
    clausulaDestaque: e?.clausulaDestaque ?? false,
    notificadoEm: e?.notificadoEm ?? '',
    consolidadoEm: e?.consolidadoEm ?? '',
    certidaoEm: e?.certidaoEm ?? '',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const salvar = useSalvar(
    casoId,
    (corpo: Extra) => exigir(api.PUT('/api/casos/{id}/extrajudicial', { params: { path: { id: casoId } }, body: corpo })),
    aoFechar,
  );
  const data = (k: 'notificadoEm' | 'consolidadoEm' | 'certidaoEm', rotulo: string) => (
    <Field data-invalid={!!erros[k]}>
      <FieldLabel htmlFor={`extra-${k}`}>{rotulo}</FieldLabel>
      <Input id={`extra-${k}`} type="date" value={v[k]} onChange={(ev) => setV({ ...v, [k]: ev.target.value })} />
      <FieldError>{erros[k]}</FieldError>
    </Field>
  );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        const corpo = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));
        const r = procedimentoExtrajudicialEntrada.safeParse(corpo);
        if (!r.success) return setErros(errosDe(r));
        setErros({});
        salvar.mutate(r.data);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Via</FieldLabel>
          <Select value={v.via} onValueChange={(via) => setV({ ...v, via: via as Extra['via'] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rtd">Cartório de títulos e documentos</SelectItem>
              <SelectItem value="detran">Detran</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={!!erros.orgao}>
          <FieldLabel htmlFor="orgao">Cartório ou Detran</FieldLabel>
          <Input id="orgao" value={v.orgao} onChange={(ev) => setV({ ...v, orgao: ev.target.value })} />
          <FieldError>{erros.orgao}</FieldError>
        </Field>
      </div>
      <Field orientation="horizontal">
        <Checkbox id="clausula" checked={v.clausulaDestaque} onCheckedChange={(c) => setV({ ...v, clausulaDestaque: c === true })} />
        <FieldLabel htmlFor="clausula" className="font-normal">
          Conferi no contrato a cláusula em destaque que permite a via extrajudicial
        </FieldLabel>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {data('notificadoEm', 'Notificação')}
        {data('consolidadoEm', 'Consolidação')}
        {data('certidaoEm', 'Certidão')}
      </div>
      <Rodape pendente={salvar.isPending} erro={salvar.error} aoCancelar={aoFechar} />
    </form>
  );
}

function RecuperacaoJudicial({ casoId, j, escreve }: { casoId: string; j: JuridicoCaso; escreve: boolean }) {
  const ultima = j.verificacoesRj[0];
  if (j.devedorTipo === 'PF') return null;
  return (
    <Secao
      titulo="Recuperação judicial e falência"
      descricao="Devedor empresa: no stay period, bem de capital essencial não sai (Lei 11.101, arts. 6º e 49). Vale a verificação dos últimos 30 dias."
      podeEditar={escreve}
      leitura={
        j.devedorTipo === null ? (
          <Pendente>Documento do devedor não informado: não dá para saber se é empresa.</Pendente>
        ) : ultima ? (
          <div className="space-y-3">
            {j.verificacoesRj.map((v) => (
              <div key={v.id} className="rounded-lg bg-white/3 p-3 ring-1 ring-white/5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={v.resultado === 'sem_registro' ? 'secondary' : 'destructive'}>{ROTULO_RJ[v.resultado]}</Badge>
                  {v.liberadoPeloJuridico ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                      <CheckCircle2Icon className="size-3.5" aria-hidden />
                      liberado pelo jurídico
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatarDataHora(v.verificadoEm)} · {v.usuarioNome ?? '—'} · fonte: {v.fonte}
                </p>
                {v.justificativa ? <p className="mt-1 text-sm text-slate-300">{v.justificativa}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <Pendente>Devedor pessoa jurídica sem verificação.</Pendente>
        )
      }
      formulario={(fechar) => <FormRj casoId={casoId} aoFechar={fechar} />}
    />
  );
}

function FormRj({ casoId, aoFechar }: { casoId: string; aoFechar: () => void }) {
  type Verificacao = z.input<typeof verificacaoRjEntrada>;
  const [v, setV] = useState<Verificacao>({ resultado: 'sem_registro', fonte: '', detalhe: '', liberadoPeloJuridico: false, justificativa: '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const salvar = useSalvar(
    casoId,
    (corpo: z.output<typeof verificacaoRjEntrada>) =>
      exigir(api.POST('/api/casos/{id}/verificacoes-rj', { params: { path: { id: casoId } }, body: corpo })),
    aoFechar,
  );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const r = verificacaoRjEntrada.safeParse({
          ...v,
          detalhe: v.detalhe || undefined,
          justificativa: v.justificativa || undefined,
        });
        if (!r.success) return setErros(errosDe(r));
        setErros({});
        salvar.mutate(r.data);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Resultado</FieldLabel>
          <Select value={v.resultado} onValueChange={(resultado) => setV({ ...v, resultado: resultado as Verificacao['resultado'] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROTULO_RJ).map(([k, r]) => (
                <SelectItem key={k} value={k}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={!!erros.fonte}>
          <FieldLabel htmlFor="fonte-rj">Onde consultou</FieldLabel>
          <Input id="fonte-rj" value={v.fonte} onChange={(e) => setV({ ...v, fonte: e.target.value })} placeholder="Tribunal, certidão ou provedor" />
          <FieldError>{erros.fonte}</FieldError>
        </Field>
      </div>
      {v.resultado === 'recuperacao_judicial' ? (
        <>
          <Field orientation="horizontal" data-invalid={!!erros.liberadoPeloJuridico}>
            <Checkbox
              id="liberado"
              checked={v.liberadoPeloJuridico}
              onCheckedChange={(c) => setV({ ...v, liberadoPeloJuridico: c === true })}
            />
            <FieldLabel htmlFor="liberado" className="font-normal">
              O jurídico libera a retomada (bem não essencial, fora do stay period ou com autorização do juízo da recuperação)
            </FieldLabel>
          </Field>
          <Field data-invalid={!!erros.justificativa}>
            <FieldLabel htmlFor="justificativa-rj">Justificativa do jurídico</FieldLabel>
            <Textarea id="justificativa-rj" rows={3} value={v.justificativa} onChange={(e) => setV({ ...v, justificativa: e.target.value })} />
            <FieldError>{erros.justificativa}</FieldError>
          </Field>
        </>
      ) : null}
      <Rodape pendente={salvar.isPending} erro={salvar.error} aoCancelar={aoFechar} />
    </form>
  );
}

function Retomada({ j }: { j: JuridicoCaso }) {
  const r = j.retomada!;
  const agora = useAgora();
  const correndo = r.purgaAte && new Date(r.purgaAte).getTime() > agora;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-white">Retomada</CardTitle>
        <CardDescription>
          {r.purgaAte
            ? correndo
              ? 'O devedor ainda pode purgar a mora: o bem não pode ser entregue ao credor antes do prazo.'
              : 'Prazo de purga vencido: o bem pode ser entregue ao credor.'
            : 'Entrega voluntária: sem prazo de purga.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Linha rotulo="Quando">{formatarDataHora(r.em)}</Linha>
        <Linha rotulo="Modalidade">{ROTULO_MODALIDADE[r.modalidade]}</Linha>
        <Linha rotulo="Comprovante">{r.comprovante}</Linha>
        {r.purgaAte ? <Linha rotulo="Purga da mora até">{formatarDataHora(r.purgaAte)}</Linha> : null}
        <p className="mt-3 text-xs text-muted-foreground">Retomado em {formatarData(r.em)}.</p>
      </CardContent>
    </Card>
  );
}
