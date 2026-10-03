import { useMutation, useQuery } from '@tanstack/react-query';
import { CloudDownloadIcon, ShieldAlertIcon, SparklesIcon, TagIcon } from 'lucide-react';
import { useState } from 'react';

import { consultaIntegracaoEntrada, PAPEIS_DO_DOSSIE, TIPOS_FIPE, type PapelDoDossie } from '@workspace/domain';
import { Rotulo } from '@workspace/ui/brand/rotulo';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { formatarDataHora, formatarMoeda } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';
import { cn } from '@workspace/ui/lib/utils';

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import {
  api,
  dadosExtrasQuery,
  exigir,
  integracoesQuery,
  pode,
  verificacoesVeiculoQuery,
  type CasoDetalhe,
  type DadoExtra,
  type UsuarioSessao,
} from '@/lib/api.ts';
import { ROTULO_PAPEL } from '@/lib/pessoa.ts';

import { BASES_LEGAIS, descreverResumo, useAtualizarDepoisDeColar } from '../relatorio/dialogo-colar.tsx';
import { useAtualizarCaso } from './painel-acoes.tsx';

const ROTULO_TIPO = { carros: 'Carro', motos: 'Moto', caminhoes: 'Caminhão' } as const;

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-2 last:border-0">
      <Rotulo>{rotulo}</Rotulo>
      <span className="text-sm text-white">{children}</span>
    </div>
  );
}

export function Dado({ rotulo, valor, mono }: { rotulo: string; valor: React.ReactNode; mono?: boolean }) {
  const vazio = valor === null || valor === undefined || valor === '';
  return (
    <div className="min-w-0 rounded-lg bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.05]">
      <Rotulo className="text-[10px]">{rotulo}</Rotulo>
      <p
        className={cn('mt-0.5 line-clamp-2 text-sm break-words', vazio ? 'text-slate-600' : 'text-white', mono && 'font-mono text-xs')}
        title={typeof valor === 'string' ? valor : undefined}
      >
        {vazio ? '—' : valor}
      </p>
    </div>
  );
}

const simNao = (v: boolean | null | undefined, perigo: boolean) =>
  v == null ? <span className="text-muted-foreground">não informado</span> : v ? <span className={perigo ? 'text-red-300' : ''}>sim</span> : 'não';

/** Agrupa os dados extras por seção, na ordem em que vieram. */
export const porSecao = (extras: DadoExtra[]) => {
  const grupos = new Map<string, DadoExtra[]>();
  for (const e of extras) grupos.set(e.secao, [...(grupos.get(e.secao) ?? []), e]);
  return [...grupos.entries()];
};

/** Dados extras agrupados por seção, com o selo de campo novo. */
export function ListaDeExtras({ extras }: { extras: DadoExtra[] }) {
  return (
    <div className="space-y-4">
      {porSecao(extras).map(([secao, itens]) => (
        <div key={secao}>
          <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">{secao}</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {itens.map((e) => (
              <div key={e.id} className="flex min-w-0 items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.05]">
                <div className="min-w-0 flex-1">
                  <Rotulo className="text-[10px]">{e.rotulo}</Rotulo>
                  <p className="text-sm break-words text-white">{e.valor}</p>
                </div>
                {e.novo ? (
                  <Badge className="shrink-0 bg-amber-500/15 text-amber-200">
                    <SparklesIcon className="size-3" aria-hidden />
                    novo
                  </Badge>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Veículo: ficha técnica completa, valor FIPE, restrições e tudo o que veio sem campo próprio. */
export function AbaVeiculo({ caso, sessao }: { caso: CasoDetalhe; sessao: UsuarioSessao }) {
  const verificacoes = useQuery(verificacoesVeiculoQuery(caso.id));
  const extras = useQuery(dadosExtrasQuery(caso.id));
  const [fipe, setFipe] = useState(false);
  const [apiBrasil, setApiBrasil] = useState(false);
  const escreve = pode.escrever(sessao);
  const ultima = verificacoes.data?.[0];
  const divida = caso.origem === 'plataforma_credor' ? caso.ativo.valorDivida : caso.saldoDevedor;
  const a = caso.ativo;
  const extrasDoVeiculo = (extras.data ?? []).filter((e) => e.entidade !== 'pessoa');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-white">Ficha técnica</CardTitle>
          <CardDescription>Como veio do credor e dos relatórios colados ou consultados. O dado mais novo prevalece.</CardDescription>
          {escreve ? (
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setApiBrasil(true)}>
                <CloudDownloadIcon />
                Consultar API Brasil
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-4">
            <Dado rotulo="Placa" valor={caso.placa} mono />
            <Dado rotulo="Marca" valor={a.marca} />
            <Dado rotulo="Modelo" valor={caso.modelo} />
            <Dado rotulo="Ano fab./modelo" valor={a.anoFabricacao || a.ano ? `${a.anoFabricacao ?? '—'} / ${a.ano ?? '—'}` : null} />
            <Dado rotulo="Cor" valor={a.cor} />
            <Dado rotulo="Tipo" valor={a.tipo} />
            <Dado rotulo="Espécie" valor={a.especie} />
            <Dado rotulo="Categoria" valor={a.categoria} />
            <Dado rotulo="Carroceria" valor={a.carroceria} />
            <Dado rotulo="Combustível" valor={a.combustivel} />
            <Dado rotulo="Potência" valor={a.potencia} />
            <Dado rotulo="Cilindradas" valor={a.cilindradas} />
            <Dado rotulo="Motor" valor={a.motor} mono />
            <Dado rotulo="Procedência" valor={a.procedencia} />
            <Dado rotulo="Chassi" valor={a.chassi} mono />
            <Dado rotulo="Renavam" valor={a.renavam} mono />
            <Dado rotulo="Situação" valor={a.situacao} />
            <Dado rotulo="Emplacamento" valor={[a.municipioEmplacamento, a.ufEmplacamento].filter(Boolean).join(' / ') || null} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 2xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-white">Restrições e situação</CardTitle>
            <CardDescription>Do relatório mais recente. Cada texto colado fica no histórico do caso.</CardDescription>
          </CardHeader>
          <CardContent>
            {verificacoes.isPending ? (
              <Skeleton className="h-24" />
            ) : verificacoes.isError ? (
              <ErroDeConsulta erro={verificacoes.error} aoTentar={() => void verificacoes.refetch()} />
            ) : ultima ? (
              <>
                <Linha rotulo="Situação">{ultima.situacao ?? '—'}</Linha>
                <Linha rotulo="RENAJUD">{simNao(ultima.renajud, true)}</Linha>
                <Linha rotulo="Alienação fiduciária">{simNao(ultima.alienacaoFiduciaria, false)}</Linha>
                <Linha rotulo="Roubo ou furto">{simNao(ultima.rouboFurto, true)}</Linha>
                <Linha rotulo="Leilão">{simNao(ultima.leilao, true)}</Linha>
                <Linha rotulo="Licenciamento">{ultima.anoLicenciamento ?? '—'}</Linha>
                <div className="flex flex-wrap gap-1.5 py-2">
                  {ultima.restricoes.length ? (
                    ultima.restricoes.map((r) => (
                      <Badge key={r} className="bg-red-500/15 text-red-200">
                        {r}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">sem restrições</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ultima.fornecedor ?? 'Texto colado'} · {formatarDataHora(ultima.verificadoEm)} · {ultima.usuarioNome ?? '—'}
                  {ultima.baseLegal ? ` · ${BASES_LEGAIS[ultima.baseLegal as keyof typeof BASES_LEGAIS] ?? ultima.baseLegal}` : ''}
                </p>
              </>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">
                Nenhuma verificação ainda. Cole o relatório do veículo ou consulte a API Brasil.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-white">Valor FIPE</CardTitle>
            <CardDescription>Tabela pública. Compara o bem com a dívida e mede o valor recuperado.</CardDescription>
            {escreve ? (
              <CardAction>
                <Button variant="ghost" size="sm" onClick={() => setFipe(true)}>
                  <TagIcon />
                  Consultar FIPE
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {a.valorFipe != null ? (
              <>
                <p className="mb-2 text-3xl font-bold text-white tabular-nums">{formatarMoeda(a.valorFipe)}</p>
                <Linha rotulo="Referência">
                  {a.fipeReferencia} · código {a.fipeCodigo}
                </Linha>
                {divida ? (
                  <Linha rotulo={caso.origem === 'plataforma_credor' ? 'Valor ÷ dívida' : 'Saldo ÷ valor'}>
                    <span className="tabular-nums">
                      {caso.origem === 'plataforma_credor'
                        ? `${Math.round((a.valorFipe / divida) * 100)}%`
                        : `${Math.round((divida / a.valorFipe) * 100)}%`}
                    </span>
                  </Linha>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda não consultado.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-white">Outros dados do relatório</CardTitle>
          <CardDescription>
            O que veio sem campo próprio. Os marcados como novos aparecem em Gestão › Campos novos, para virar campo no próximo deploy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {extras.isPending ? (
            <Skeleton className="h-20" />
          ) : extrasDoVeiculo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada fora dos campos conhecidos.</p>
          ) : (
            <ListaDeExtras extras={extrasDoVeiculo} />
          )}
        </CardContent>
      </Card>

      {fipe ? <DialogoFipe casoId={caso.id} aoFechar={() => setFipe(false)} /> : null}
      {apiBrasil ? <DialogoApiBrasil caso={caso} aoFechar={() => setApiBrasil(false)} /> : null}
    </div>
  );
}

/** Consulta paga da placa: fornecedor, custo, base legal e justificativa na trilha. */
function DialogoApiBrasil({ caso, aoFechar }: { caso: CasoDetalhe; aoFechar: () => void }) {
  const integracoes = useQuery({ ...integracoesQuery, retry: false });
  const atualizar = useAtualizarDepoisDeColar();
  const [baseLegal, setBaseLegal] = useState<keyof typeof BASES_LEGAIS>('execucao_contrato');
  const [justificativa, setJustificativa] = useState('');
  const [papel, setPapel] = useState<PapelDoDossie | undefined>();
  const [erros, setErros] = useState<Record<string, string>>({});
  const conexao = integracoes.data?.find((i) => i.tipo === 'apibrasil' && i.ativo);

  const consultar = useMutation({
    mutationFn: (corpo: ReturnType<typeof consultaIntegracaoEntrada.parse>) =>
      exigir(api.POST('/api/casos/{id}/consulta-apibrasil', { params: { path: { id: caso.id } }, body: corpo })),
    onSuccess: (r) => {
      toast.success('Consulta gravada no caso.', { description: descreverResumo(r) });
      atualizar(caso.id);
      aoFechar();
    },
  });
  const precisaPapel = consultar.error?.message.includes('papel');

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Consultar a placa {caso.placa} na API Brasil</DialogTitle>
          <DialogDescription>
            Consulta paga. Fica na trilha de auditoria com o custo, a base legal e a justificativa. A resposta inteira é guardada e lida
            como um relatório colado.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = consultaIntegracaoEntrada.safeParse({ baseLegal, justificativa, papelPessoa: papel });
            if (!r.success) return setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
            setErros({});
            consultar.mutate(r.data);
          }}
        >
          {conexao ? (
            <p className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm ring-1 ring-white/[0.06]">
              {conexao.nome} ·{' '}
              {conexao.custoConsulta != null ? `${formatarMoeda(conexao.custoConsulta)} por consulta` : 'custo não informado'}
            </p>
          ) : integracoes.isPending ? (
            <Skeleton className="h-10" />
          ) : (
            <Alert>
              <ShieldAlertIcon />
              <AlertTitle>Sem conexão com a API Brasil</AlertTitle>
              <AlertDescription>Um administrador cadastra a chave em Gestão › Integrações.</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel>Base legal</FieldLabel>
            <Select value={baseLegal} onValueChange={(b) => setBaseLegal(b as keyof typeof BASES_LEGAIS)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BASES_LEGAIS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!!erros.justificativa}>
            <FieldLabel htmlFor="apib-just">Justificativa</FieldLabel>
            <Textarea id="apib-just" rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
            <FieldDescription>Ex.: confirmar chassi e restrições antes da diligência.</FieldDescription>
            <FieldError>{erros.justificativa}</FieldError>
          </Field>
          {precisaPapel ? (
            <Field>
              <FieldLabel>A resposta trouxe uma pessoa que não é o devedor. Qual o papel dela?</FieldLabel>
              <Select value={papel ?? ''} onValueChange={(p) => setPapel(p as PapelDoDossie)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {PAPEIS_DO_DOSSIE.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ROTULO_PAPEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : consultar.error ? (
            <Alert variant="destructive">
              <AlertDescription>{consultar.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!conexao || consultar.isPending}>
              {consultar.isPending ? <Spinner /> : <CloudDownloadIcon />}
              Consultar e gravar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Escolha({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  carregando,
  desabilitado,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: { codigo: string; nome: string }[];
  carregando?: boolean;
  desabilitado?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{rotulo}</FieldLabel>
      <Select value={valor} onValueChange={aoMudar} disabled={desabilitado}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={carregando ? 'Carregando…' : 'Escolha'} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.codigo} value={o.codigo}>
              {o.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function DialogoFipe({ casoId, aoFechar }: { casoId: string; aoFechar: () => void }) {
  const atualizar = useAtualizarCaso(casoId);
  const [tipo, setTipo] = useState<(typeof TIPOS_FIPE)[number]>('carros');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [ano, setAno] = useState('');

  const marcas = useQuery({
    queryKey: ['fipe', tipo],
    queryFn: () => exigir(api.GET('/api/fipe/{tipo}/marcas', { params: { path: { tipo } } })),
    staleTime: Infinity,
  });
  const modelos = useQuery({
    queryKey: ['fipe', tipo, marca],
    queryFn: () => exigir(api.GET('/api/fipe/{tipo}/marcas/{marca}/modelos', { params: { path: { tipo, marca } } })),
    enabled: !!marca,
    staleTime: Infinity,
  });
  const anos = useQuery({
    queryKey: ['fipe', tipo, marca, modelo],
    queryFn: () =>
      exigir(api.GET('/api/fipe/{tipo}/marcas/{marca}/modelos/{modelo}/anos', { params: { path: { tipo, marca, modelo } } })),
    enabled: !!modelo,
    staleTime: Infinity,
  });

  const consultar = useMutation({
    mutationFn: () => exigir(api.POST('/api/casos/{id}/fipe', { params: { path: { id: casoId } }, body: { tipo, marca, modelo, ano } })),
    onSuccess: (v) => {
      toast.success(`FIPE ${v.mesReferencia}: ${formatarMoeda(v.valor)}`);
      atualizar();
      aoFechar();
    },
  });

  const erro = marcas.error ?? modelos.error ?? anos.error ?? consultar.error;
  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Consultar tabela FIPE</DialogTitle>
          <DialogDescription>Escolha o veículo na tabela. O valor fica guardado no caso com o mês de referência.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Escolha
            rotulo="Tipo"
            valor={tipo}
            aoMudar={(t) => {
              setTipo(t as typeof tipo);
              setMarca('');
              setModelo('');
              setAno('');
            }}
            opcoes={TIPOS_FIPE.map((t) => ({ codigo: t, nome: ROTULO_TIPO[t] }))}
          />
          <Escolha
            rotulo="Marca"
            valor={marca}
            aoMudar={(m) => {
              setMarca(m);
              setModelo('');
              setAno('');
            }}
            opcoes={marcas.data ?? []}
            carregando={marcas.isPending}
          />
          <Escolha
            rotulo="Modelo"
            valor={modelo}
            aoMudar={(m) => {
              setModelo(m);
              setAno('');
            }}
            opcoes={modelos.data ?? []}
            carregando={modelos.isFetching}
            desabilitado={!marca}
          />
          <Escolha rotulo="Ano" valor={ano} aoMudar={setAno} opcoes={anos.data ?? []} carregando={anos.isFetching} desabilitado={!modelo} />
          {erro ? (
            <Alert variant="destructive">
              <AlertDescription>{erro.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button disabled={!ano || consultar.isPending} onClick={() => consultar.mutate()}>
            {consultar.isPending ? <Spinner /> : null}
            Consultar e guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
