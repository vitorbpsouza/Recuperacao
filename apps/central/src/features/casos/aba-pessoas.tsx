import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  ClipboardPasteIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  LockIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
import { useState } from 'react';

import { finalidadeEntrada } from '@workspace/domain';
import { Rotulo } from '@workspace/ui/brand/rotulo';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@workspace/ui/components/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { Textarea } from '@workspace/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip';
import { formatarDataHora } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';
import { cn } from '@workspace/ui/lib/utils';

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, exigir, pessoasQuery, pode, type PessoaRevelada, type UsuarioSessao } from '@/lib/api.ts';
import {
  enderecoEmLinha,
  formatarDocumento,
  formatarNascimento,
  formatarTelefone,
  linkMapaDoEndereco,
  linkWhatsapp,
  ROTULO_PAPEL,
  ROTULO_TIPO_CONTATO,
} from '@/lib/pessoa.ts';

import { Dado, ListaDeExtras } from './aba-veiculo.tsx';
import { PainelDevedor } from './painel-devedor.tsx';

type Revelacao = { finalidade: string; pessoas: PessoaRevelada[]; sensivelLiberado: boolean; alertas: string[] };

/**
 * Pessoas do caso: devedor, proprietário atual, terceiro possuidor e
 * parentes. A lista começa mascarada; revelar exige finalidade e fica na
 * trilha de acesso. Perfil, crédito e parentes só para admin e gestor.
 */
export function AbaPessoas({
  casoId,
  sessao,
  rotuloDevedor,
  aoColar,
}: {
  casoId: string;
  sessao: UsuarioSessao;
  rotuloDevedor: string;
  aoColar: () => void;
}) {
  const queryClient = useQueryClient();
  const consulta = useQuery(pessoasQuery(casoId));
  const [pedindo, setPedindo] = useState(false);
  const [revelado, setRevelado] = useState<Revelacao | null>(null);

  const revelar = useMutation({
    mutationFn: (finalidade: string) =>
      exigir(api.POST('/api/casos/{id}/pessoas/revelar', { params: { path: { id: casoId } }, body: { finalidade } })).then((r) => ({
        ...r,
        finalidade,
      })),
    onSuccess: (r) => {
      setRevelado(r);
      setPedindo(false);
      void queryClient.invalidateQueries({ queryKey: ['caso', casoId, 'acessos'] });
    },
  });

  const pessoas = consulta.data?.pessoas ?? [];
  const alertas = revelado?.alertas ?? consulta.data?.alertas ?? [];

  return (
    <div className="space-y-4">
      {alertas.map((a) => (
        <Alert key={a} className="border-amber-400/30 bg-amber-500/[0.06]">
          <AlertTriangleIcon className="text-amber-300" />
          <AlertTitle className="text-amber-200">Atenção na diligência</AlertTitle>
          <AlertDescription>{a}</AlertDescription>
        </Alert>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-white">Pessoas do caso</CardTitle>
          <CardDescription>
            {revelado
              ? `Revelado com a finalidade “${revelado.finalidade}”. O acesso está na trilha do caso.`
              : 'Mascaradas até alguém declarar a finalidade. Telefones e endereços vêm de todos os relatórios colados, sem repetição.'}
          </CardDescription>
          <CardAction className="flex gap-2">
            {pode.escrever(sessao) ? (
              <Button variant="ghost" size="sm" onClick={aoColar}>
                <ClipboardPasteIcon />
                Colar dossiê
              </Button>
            ) : null}
            {pessoas.length && !revelado ? (
              <Button size="sm" onClick={() => setPedindo(true)}>
                <EyeIcon />
                Revelar
              </Button>
            ) : null}
          </CardAction>
        </CardHeader>
        <CardContent>
          {consulta.isPending ? (
            <Skeleton className="h-24" />
          ) : consulta.isError ? (
            <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
          ) : pessoas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 p-8 text-center">
              <UsersIcon className="size-7 text-slate-600" aria-hidden />
              <p className="max-w-md text-sm text-muted-foreground">
                Nenhuma pessoa ligada ainda. Cole o relatório do veículo (traz o proprietário) ou o dossiê da pessoa: telefones, endereços,
                parentes e perfil entram de uma vez.
              </p>
            </div>
          ) : revelado ? (
            <div className="space-y-6">
              {revelado.pessoas
                .filter((p) => p.papel !== 'parente')
                .map((p) => (
                  <FichaPessoa
                    key={`${p.id}${p.papel}`}
                    casoId={casoId}
                    pessoa={p}
                    parentes={revelado.pessoas.filter((x) => x.papel === 'parente' && x.parenteDe === p.id)}
                    sensivelLiberado={revelado.sensivelLiberado}
                    escreve={pode.escrever(sessao)}
                    aoAtualizar={() => revelar.mutate(revelado.finalidade)}
                  />
                ))}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {pessoas.map((p) => (
                <div key={`${p.id}${p.papel}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-500/10 text-slate-300">
                    <UserRoundIcon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">
                      {ROTULO_PAPEL[p.papel]}
                      {p.vinculo ? <span className="font-normal text-muted-foreground"> · {p.vinculo}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {p.iniciais ?? '—'} · {p.documentoMascarado ?? 'sem documento'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {p.contatos} contato(s) · {p.enderecos} endereço(s)
                      {p.obito ? <span className="text-red-300"> · óbito registrado</span> : null}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-white">{rotuloDevedor} informado pelo credor</CardTitle>
          <CardDescription>Nome e documento da carteira, como chegaram no cadastro do caso.</CardDescription>
        </CardHeader>
        <CardContent>
          <PainelDevedor casoId={casoId} rotulo={rotuloDevedor} />
        </CardContent>
      </Card>

      <DialogoFinalidade
        aberto={pedindo}
        aoFechar={() => setPedindo(false)}
        aoConfirmar={(f) => revelar.mutate(f)}
        enviando={revelar.isPending}
        erro={revelar.error?.message}
        sensivel={pode.verSensivel(sessao)}
      />
    </div>
  );
}

export function DialogoFinalidade({
  aberto,
  aoFechar,
  aoConfirmar,
  enviando,
  erro,
  sensivel,
  titulo = 'Revelar dados das pessoas',
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar: (finalidade: string) => void;
  enviando: boolean;
  erro?: string;
  sensivel: boolean;
  titulo?: string;
}) {
  const [finalidade, setFinalidade] = useState('');
  const [invalido, setInvalido] = useState<string | null>(null);
  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            O acesso fica registrado com seu usuário, a data e a finalidade abaixo (LGPD, art. 37).
            {sensivel ? ' Seu perfil também vê perfil, crédito, IRPF e parentes.' : ''}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = finalidadeEntrada.safeParse({ finalidade });
            if (!r.success) return setInvalido(r.error.issues[0]!.message);
            setInvalido(null);
            aoConfirmar(r.data.finalidade);
          }}
        >
          <Field data-invalid={!!invalido}>
            <FieldLabel htmlFor="finalidade-pessoas">Finalidade</FieldLabel>
            <Textarea
              id="finalidade-pessoas"
              rows={3}
              value={finalidade}
              onChange={(e) => setFinalidade(e.target.value)}
              placeholder="Ex.: ligar para combinar a entrega amigável do veículo"
            />
            <FieldDescription>Seja específico: o texto é auditável.</FieldDescription>
            <FieldError>{invalido}</FieldError>
          </Field>
          {erro ? (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? <Spinner /> : <EyeIcon />}
              Revelar e registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const copiar = (texto: string) => {
  void navigator.clipboard.writeText(texto).then(() => toast.success('Copiado.'));
};

function FichaPessoa({
  casoId,
  pessoa: p,
  parentes,
  sensivelLiberado,
  escreve,
  aoAtualizar,
}: {
  casoId: string;
  pessoa: PessoaRevelada;
  parentes: PessoaRevelada[];
  sensivelLiberado: boolean;
  escreve: boolean;
  aoAtualizar: () => void;
}) {
  const conferir = useMutation({
    mutationFn: () =>
      exigir(
        api.POST('/api/casos/{id}/pessoas/{pessoaId}/conferir-whatsapp', { params: { path: { id: casoId, pessoaId: p.id } } }),
      ),
    onSuccess: (r) => {
      toast.success(`${r.comWhatsapp} de ${r.conferidos} celular(es) têm WhatsApp.`);
      aoAtualizar();
    },
    onError: (e) => toast.error(e.message),
  });
  const comuns = p.extras.filter((e) => !e.sensivel);
  const sensiveis = p.extras.filter((e) => e.sensivel);
  const celulares = p.contatos.filter((c) => c.tipo === 'celular' && c.valido);

  return (
    <article className="space-y-4 rounded-2xl bg-white/[0.02] p-5 ring-1 ring-white/[0.08]">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
          <UserRoundIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-white">{p.nome ?? 'Sem nome'}</h3>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatarDocumento(p.documento)}
            {p.tipoPessoa ? ` · ${p.tipoPessoa === 'PF' ? 'pessoa física' : 'pessoa jurídica'}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge className="bg-blue-500/15 text-blue-200">{ROTULO_PAPEL[p.papel]}</Badge>
          {p.obito ? <Badge className="bg-red-500/15 text-red-200">Óbito registrado</Badge> : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
        <Dado rotulo="Mãe" valor={p.nomeMae} />
        <Dado rotulo="Pai" valor={p.nomePai} />
        <Dado rotulo="Nascimento" valor={p.nascimento ? formatarNascimento(p.nascimento) : null} />
        <Dado rotulo="Sexo" valor={p.sexo} />
        <Dado rotulo="Estado civil" valor={p.estadoCivil} />
        <Dado rotulo="Profissão" valor={p.profissao} />
        <Dado rotulo="RG" valor={[p.rg, p.rgOrgao, p.rgUf].filter(Boolean).join(' ') || null} />
        <Dado rotulo="Título de eleitor" valor={p.tituloEleitor} />
        <Dado rotulo="Nacionalidade" valor={p.nacionalidade} />
        <Dado rotulo="Situação cadastral" valor={p.situacaoCadastral} />
        <Dado rotulo="Óbito" valor={p.obito == null ? null : p.obito ? 'Sim' : 'Não consta'} />
        <Dado rotulo="Atualizado em" valor={formatarDataHora(p.atualizadoEm)} />
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <PhoneIcon className="size-4 text-slate-400" aria-hidden />
            Contatos ({p.contatos.length})
          </h4>
          {escreve && celulares.length ? (
            <Button variant="outline" size="sm" className="ml-auto" disabled={conferir.isPending} onClick={() => conferir.mutate()}>
              {conferir.isPending ? <Spinner /> : <RefreshCwIcon />}
              Conferir WhatsApp
            </Button>
          ) : null}
        </div>
        {p.contatos.length ? (
          <div className="overflow-x-auto rounded-xl ring-1 ring-white/[0.06]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Tipo</TableHead>
                  <TableHead>Número / e-mail</TableHead>
                  <TableHead className="w-28">WhatsApp</TableHead>
                  <TableHead>Fontes</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.contatos.map((c) => {
                  const exibicao = c.tipo === 'email' ? c.valor : formatarTelefone(c.valor);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className={cn('text-xs', c.valido ? 'text-slate-300' : 'text-red-300')}>{ROTULO_TIPO_CONTATO[c.tipo]}</TableCell>
                      <TableCell className={cn('font-mono text-sm tabular-nums', c.valido ? 'text-white' : 'text-red-300 line-through')}>
                        {exibicao}
                        {!c.valido && c.original ? <span className="ml-2 font-sans text-[11px] text-muted-foreground no-underline">({c.original})</span> : null}
                      </TableCell>
                      <TableCell>
                        {c.tipo !== 'celular' ? (
                          <span className="text-xs text-slate-600">—</span>
                        ) : c.whatsapp == null ? (
                          <span className="text-xs text-muted-foreground">não conferido</span>
                        ) : c.whatsapp ? (
                          <Badge className="bg-emerald-500/15 text-emerald-200">tem</Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-400">não tem</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.fontes.map((f, i) => (
                            <Tooltip key={`${f.fonte}${i}`}>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="cursor-default text-[11px] text-slate-300">
                                  {f.fonte}
                                  {f.ranking ? ` #${f.ranking}` : ''}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {[f.titular ? `Titular: ${f.titular}` : null, f.data ? `Data: ${f.data}` : null, f.ranking ? `Ranking ${f.ranking}` : null]
                                  .filter(Boolean)
                                  .join(' · ') || 'Sem detalhe'}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.tipo === 'celular' && c.valido ? (
                            <Button variant="ghost" size="icon" className="size-8" asChild>
                              <a href={linkWhatsapp(c.valor)} target="_blank" rel="noreferrer" aria-label="Abrir no WhatsApp">
                                <MessageCircleIcon className="text-emerald-300" />
                              </a>
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => copiar(exibicao)} aria-label="Copiar">
                            <CopyIcon />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum contato.</p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Ordem: válidos primeiro, depois os citados por mais fontes. Número citado por várias bases costuma ser o atual.
        </p>
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
          <MapPinIcon className="size-4 text-slate-400" aria-hidden />
          Endereços ({p.enderecos.length})
        </h4>
        <div className="grid gap-2 xl:grid-cols-2">
          {p.enderecos.map((e) => {
            const linha = enderecoEmLinha(e);
            return (
              <Collapsible key={e.id} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">{linha}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {e.fontes.join(', ')}
                      {e.complemento ? ` · compl. ${e.complemento}` : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
                    <a href={linkMapaDoEndereco(linha)} target="_blank" rel="noreferrer" aria-label="Ver no mapa">
                      <ExternalLinkIcon />
                    </a>
                  </Button>
                </div>
                {e.variantes.length > 1 ? (
                  <>
                    <CollapsibleTrigger className="mt-1 text-[11px] text-blue-300 hover:underline">
                      {e.variantes.length} grafias juntadas
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-400">
                        {e.variantes.map((v) => (
                          <li key={v}>{v}</li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </>
                ) : null}
              </Collapsible>
            );
          })}
          {!p.enderecos.length ? <p className="text-sm text-muted-foreground">Nenhum endereço.</p> : null}
        </div>
      </section>

      {comuns.length ? (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-white">Outros dados</h4>
          <ListaDeExtras extras={comuns} />
        </section>
      ) : null}

      {sensivelLiberado ? (
        <section className="space-y-4 rounded-xl bg-violet-500/[0.04] p-4 ring-1 ring-violet-400/15">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-violet-200">
            <LockIcon className="size-4" aria-hidden />
            Perfil, crédito e parentes (restrito a admin e gestor)
          </h4>
          {parentes.length ? (
            <div>
              <Rotulo>Parentes</Rotulo>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {parentes.map((x) => (
                  <li key={x.id} className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm ring-1 ring-white/[0.05]">
                    <span className="text-white">{x.nome}</span>
                    <span className="text-muted-foreground"> · {x.vinculo} · {formatarDocumento(x.documento)}</span>
                    {x.contatos.length ? <span className="text-muted-foreground"> · {x.contatos.length} contato(s)</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {sensiveis.length ? <ListaDeExtras extras={sensiveis} /> : <p className="text-sm text-muted-foreground">Sem dados de perfil.</p>}
          <p className="flex items-center gap-1.5 text-[11px] text-violet-200/80">
            <ShieldCheckIcon className="size-3.5" aria-hidden />
            Uso operacional. Não cite esta fonte na petição nem nos autos.
          </p>
        </section>
      ) : null}
    </article>
  );
}
