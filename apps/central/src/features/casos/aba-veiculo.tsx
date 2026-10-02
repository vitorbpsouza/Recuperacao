import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardPasteIcon, ShieldAlertIcon, TagIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { lerRelatorioVeicular, TIPOS_FIPE, verificacaoVeicularEntrada, type RelatorioVeicular } from '@workspace/domain';
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

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import {
  api,
  bureausQuery,
  exigir,
  pode,
  verificacoesVeiculoQuery,
  type CasoDetalhe,
  type UsuarioSessao,
} from '@/lib/api.ts';

import { useAtualizarCaso } from './painel-acoes.tsx';

const ROTULO_TIPO = { carros: 'Carro', motos: 'Moto', caminhoes: 'Caminhão' } as const;
const BASES = {
  execucao_contrato: 'Execução de contrato',
  legitimo_interesse: 'Legítimo interesse',
  obrigacao_legal: 'Obrigação legal',
  consentimento: 'Consentimento',
} as const;

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-2 last:border-0">
      <Rotulo>{rotulo}</Rotulo>
      <span className="text-sm text-white">{children}</span>
    </div>
  );
}

const simNao = (v: boolean | null | undefined, perigo: boolean) =>
  v == null ? <span className="text-muted-foreground">não informado</span> : v ? <span className={perigo ? 'text-red-300' : ''}>sim</span> : 'não';

/** Veículo: identificação, valor FIPE e verificações de fornecedor contratado. */
export function AbaVeiculo({ caso, sessao }: { caso: CasoDetalhe; sessao: UsuarioSessao }) {
  const verificacoes = useQuery(verificacoesVeiculoQuery(caso.id));
  const [fipe, setFipe] = useState(false);
  const [relatorio, setRelatorio] = useState(false);
  const escreve = pode.escrever(sessao);
  const ultima = verificacoes.data?.[0];
  const divida = caso.origem === 'plataforma_credor' ? caso.ativo.valorDivida : caso.saldoDevedor;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-white">Valor FIPE</CardTitle>
          <CardDescription>Tabela pública. Serve para comparar o bem com a dívida e medir o valor recuperado.</CardDescription>
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
          {caso.ativo.valorFipe != null ? (
            <>
              <Linha rotulo="Valor">
                <span className="tabular-nums">{formatarMoeda(caso.ativo.valorFipe)}</span>
              </Linha>
              <Linha rotulo="Referência">
                {caso.ativo.fipeReferencia} · código {caso.ativo.fipeCodigo}
              </Linha>
              {divida ? (
                <Linha rotulo={caso.origem === 'plataforma_credor' ? 'Valor ÷ dívida' : 'Saldo ÷ valor'}>
                  <span className="tabular-nums">
                    {caso.origem === 'plataforma_credor'
                      ? `${Math.round((caso.ativo.valorFipe / divida) * 100)}%`
                      : `${Math.round((divida / caso.ativo.valorFipe) * 100)}%`}
                  </span>
                </Linha>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Ainda não consultado.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-white">Verificação veicular</CardTitle>
          <CardDescription>
            Restrições e situação do veículo, trazidas por fornecedor contratado. Cada consulta fica na trilha de auditoria.
          </CardDescription>
          {escreve ? (
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => setRelatorio(true)}>
                <ClipboardPasteIcon />
                Colar relatório
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <Linha rotulo="Renavam">
            <span className="font-mono text-xs">{caso.ativo.renavam ?? '—'}</span>
          </Linha>
          <Linha rotulo="Chassi">
            <span className="font-mono text-xs">{caso.ativo.chassi ?? '—'}</span>
          </Linha>
          {verificacoes.isPending ? (
            <Skeleton className="mt-3 h-24" />
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
                    <Badge key={r} variant="outline">
                      {r}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">sem restrições</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {ultima.fornecedor} · {formatarDataHora(ultima.verificadoEm)} · {ultima.usuarioNome ?? '—'} · {BASES[ultima.baseLegal as keyof typeof BASES] ?? ultima.baseLegal}
              </p>
            </>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Nenhuma verificação registrada.</p>
          )}
        </CardContent>
      </Card>

      {fipe ? <DialogoFipe casoId={caso.id} aoFechar={() => setFipe(false)} /> : null}
      {relatorio ? <DialogoRelatorio caso={caso} aoFechar={() => setRelatorio(false)} /> : null}
    </div>
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

/** Rótulos legíveis do que o relatório trouxe, para a prévia. */
const previa = (r: RelatorioVeicular): [string, string][] =>
  (
    [
      ['Placa', r.placa],
      ['Chassi', r.chassi],
      ['Renavam', r.renavam],
      ['Modelo', r.modelo],
      ['Cor', r.cor],
      ['Ano fab./modelo', r.anoFabricacao ? `${r.anoFabricacao} / ${r.anoModelo ?? '—'}` : undefined],
      ['Situação', r.situacao],
      ['Restrições', r.restricoes.join(', ') || undefined],
      ['RENAJUD', r.renajud === undefined ? undefined : r.renajud ? 'sim' : 'não'],
      ['Roubo ou furto', r.rouboFurto === undefined ? undefined : r.rouboFurto ? 'sim' : 'não'],
      ['Leilão', r.leilao === undefined ? undefined : r.leilao ? 'sim' : 'não'],
      ['Licenciamento', r.anoLicenciamento ? String(r.anoLicenciamento) : undefined],
    ] as [string, string | undefined][]
  ).filter((x): x is [string, string] => !!x[1]);

function DialogoRelatorio({ caso, aoFechar }: { caso: CasoDetalhe; aoFechar: () => void }) {
  const atualizar = useAtualizarCaso(caso.id);
  const bureaus = useQuery(bureausQuery);
  const veiculares = (bureaus.data ?? []).filter((b) => b.tipo === 'Veicular');
  const [texto, setTexto] = useState('');
  const [bureauId, setBureauId] = useState('');
  const [baseLegal, setBaseLegal] = useState<keyof typeof BASES>('execucao_contrato');
  const [justificativa, setJustificativa] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const lido = useMemo(() => (texto.trim() ? lerRelatorioVeicular(texto) : null), [texto]);
  const placaDiferente = lido?.placa && lido.placa !== caso.placa;

  const registrar = useMutation({
    mutationFn: (corpo: ReturnType<typeof verificacaoVeicularEntrada.parse>) =>
      exigir(api.POST('/api/casos/{id}/verificacao-veicular', { params: { path: { id: caso.id } }, body: corpo })),
    onSuccess: () => {
      toast.success('Verificação registrada na trilha de auditoria.');
      atualizar();
      aoFechar();
    },
  });

  const enviar = () => {
    if (!lido) return;
    const r = verificacaoVeicularEntrada.safeParse({
      bureauId,
      baseLegal,
      justificativa,
      veiculo: {
        placa: lido.placa ?? caso.placa,
        chassi: lido.chassi,
        renavam: lido.renavam,
        modelo: lido.modelo,
        cor: lido.cor,
        anoFabricacao: lido.anoFabricacao,
        anoModelo: lido.anoModelo,
        situacao: lido.situacao,
      },
      restricoes: lido.restricoes,
      renajud: lido.renajud,
      rouboFurto: lido.rouboFurto,
      leilao: lido.leilao,
      alienacaoFiduciaria: lido.alienacaoFiduciaria,
      anoLicenciamento: lido.anoLicenciamento,
    });
    if (!r.success) return setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path.at(-1)), i.message])));
    setErros({});
    registrar.mutate(r.data);
  };

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Colar relatório do fornecedor</DialogTitle>
          <DialogDescription>
            Só os dados do veículo e as restrições são lidos. Dono, documento e localização por radar são descartados — o dado pessoal
            vem da carteira do credor, e localização legítima é o avistamento da equipe de campo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="relatorio">Relatório</FieldLabel>
            <Textarea id="relatorio" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} className="font-mono text-xs" />
          </Field>

          {lido ? (
            <div className="space-y-3 rounded-lg bg-white/3 p-4 ring-1 ring-white/5">
              <p className="text-sm font-semibold text-white">O que será guardado</p>
              {previa(lido).length ? (
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {previa(lido).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-right text-white">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-amber-300">Nenhum dado do veículo reconhecido no texto.</p>
              )}
              {lido.descartados.length ? (
                <Alert>
                  <ShieldAlertIcon />
                  <AlertTitle>Descartado: {lido.descartados.join(', ')}</AlertTitle>
                  <AlertDescription>
                    Relatório com dono e radar costuma vir de painel de consulta sem origem legal. Confira o contrato e a fonte do fornecedor
                    antes de continuar usando.
                  </AlertDescription>
                </Alert>
              ) : null}
              {placaDiferente ? (
                <p className="text-sm text-red-300">
                  O relatório é da placa {lido.placa}, e o caso é da {caso.placa}.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!erros.bureauId}>
              <FieldLabel>Fornecedor contratado</FieldLabel>
              <Select value={bureauId} onValueChange={setBureauId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={bureaus.isPending ? 'Carregando…' : 'Escolha'} />
                </SelectTrigger>
                <SelectContent>
                  {veiculares.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Cadastrado em Dados & Bureaus, com o contrato.</FieldDescription>
              <FieldError>{erros.bureauId}</FieldError>
            </Field>
            <Field>
              <FieldLabel>Base legal</FieldLabel>
              <Select value={baseLegal} onValueChange={(b) => setBaseLegal(b as keyof typeof BASES)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BASES).map(([k, r]) => (
                    <SelectItem key={k} value={k}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field data-invalid={!!erros.justificativa}>
            <FieldLabel htmlFor="justificativa-veiculo">Por que esta consulta</FieldLabel>
            <Textarea id="justificativa-veiculo" rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
            <FieldError>{erros.justificativa}</FieldError>
          </Field>
          {Object.keys(erros).some((k) => !['bureauId', 'justificativa'].includes(k)) ? (
            <p className="text-sm text-red-300">{Object.entries(erros).map(([k, m]) => `${k}: ${m}`).join(' · ')}</p>
          ) : null}
          {registrar.error ? (
            <Alert variant="destructive">
              <AlertDescription>{registrar.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button disabled={!lido || !!placaDiferente || registrar.isPending} onClick={enviar}>
            {registrar.isPending ? <Spinner /> : null}
            Registrar verificação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
