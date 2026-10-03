import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon, ClipboardPasteIcon, SaveIcon } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

import {
  cadastroCasoEntrada,
  lerRelatorio,
  normalizarDocumentoLido,
  novoCredorEntrada,
  papeisDaPessoa,
  type PapelDoDossie,
} from '@workspace/domain';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Separator } from '@workspace/ui/components/separator';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { toast } from '@workspace/ui/lib/toast';

import { CabecalhoDePagina } from '@/components/estado-da-consulta.tsx';
import { api, credoresQuery, exigir, fontesQuery, pode, type Canal, type UsuarioSessao } from '@/lib/api.ts';

import { faltaPapel, PreviaLeitura } from '../relatorio/previa-leitura.tsx';

const CANAIS_LEAD = ['Inbound Site', 'WhatsApp', 'Indicação', 'Parceria', 'Anúncio'] as const;
const NOVO_CREDOR = '__novo__';

type Campos = Record<string, string>;

/** Converte o texto do formulário no corpo da API (vazio vira ausente). */
const montar = (canal: Canal, v: Campos, credorId: string) => {
  const numero = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/\./g, '').replace(',', '.')));
  const opcional = (s: string | undefined) => (!s || s.trim() === '' ? undefined : s.trim());
  const bem = {
    placa: v.placa ?? '',
    chassi: opcional(v.chassi),
    renavam: opcional(v.renavam),
    modelo: v.modelo ?? '',
    ano: numero(v.ano ?? ''),
    cor: opcional(v.cor),
    cidade: opcional(v.cidade),
    uf: opcional(v.uf?.toUpperCase()),
    devedorNome: opcional(v.devedorNome),
    devedorDoc: opcional(v.devedorDoc),
    valorDivida: numero(v.valorDivida ?? ''),
  };
  return canal === 'a'
    ? { origem: 'plataforma_credor' as const, fonteId: v.fonteId ?? '', credorId, bem }
    : {
        origem: 'lead_proprio' as const,
        fonteId: v.fonteId ?? '',
        credorId: opcional(credorId),
        bem,
        canalLead: (v.canalLead ?? '') as (typeof CANAIS_LEAD)[number],
        evidenciaLead: v.evidenciaLead ?? '',
        saldoDevedor: numero(v.saldoDevedor ?? ''),
      };
};

/**
 * Cadastro de caso em tela cheia: o texto do fornecedor à esquerda preenche o
 * formulário, e a prévia à direita mostra tudo o que será gravado junto —
 * veículo, proprietário, contatos, endereços, radar e campos novos.
 */
export function PaginaNovoCaso({ canal, sessao }: { canal: Canal; sessao: UsuarioSessao }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fontes = useQuery(fontesQuery);
  const credores = useQuery(credoresQuery);
  const admin = pode.administrar(sessao);
  const finalidade = canal === 'a' ? 'recuperacao_para_credor' : 'aquisicao_com_quitacao';
  const fontesDoCanal = (fontes.data ?? []).filter((f) => f.finalidadePermitida === finalidade);

  const [v, setV] = useState<Campos>({});
  const [credorId, setCredorId] = useState('');
  const [novoCredor, setNovoCredor] = useState({ nome: '', cnpj: '' });
  const [texto, setTexto] = useState('');
  const [papel, setPapel] = useState<PapelDoDossie | undefined>();
  const [erros, setErros] = useState<Record<string, string>>({});
  const definir = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  const adiado = useDeferredValue(texto);
  const leitura = useMemo(() => (adiado.trim().length >= 10 ? lerRelatorio(adiado) : null), [adiado]);
  const devedorDoc = v.devedorDoc ? (normalizarDocumentoLido(v.devedorDoc).documento ?? null) : null;

  // O texto preenche o formulário: veículo sempre; devedor quando a pessoa é o devedor.
  const preencher = (lida: ReturnType<typeof lerRelatorio> | null, papelDoDossie: PapelDoDossie | undefined) => {
    if (!lida) return;
    const r = lida.veiculo;
    const novos: Campos = {};
    if (r) {
      if (r.placa) novos.placa = r.placa;
      if (r.modelo) novos.modelo = r.marca && !r.modelo.includes('/') ? `${r.marca}/${r.modelo}` : r.modelo;
      if (r.chassi) novos.chassi = r.chassi;
      if (r.renavam) novos.renavam = r.renavam;
      if (r.cor) novos.cor = r.cor;
      if (r.anoModelo) novos.ano = String(r.anoModelo);
      if (r.municipio) novos.cidade = r.municipio;
      if (r.uf) novos.uf = r.uf;
    }
    setV((atual) => {
      const devedor = lida.pessoas.find((p) => {
        const decidido = papeisDaPessoa(p, atual.devedorDoc);
        return decidido.papeis.includes('devedor') || (decidido.pergunta && papelDoDossie === 'devedor');
      });
      const daPessoa: Campos = {};
      if (devedor && !atual.devedorNome && devedor.nome) daPessoa.devedorNome = devedor.nome;
      if (devedor && !atual.devedorDoc && devedor.documento) daPessoa.devedorDoc = devedor.documento;
      // A cidade do endereço mais citado do devedor, quando o veículo não trouxe.
      const endereco = devedor?.enderecos[0];
      if (endereco && !novos.cidade && !atual.cidade && endereco.cidade) {
        daPessoa.cidade = endereco.cidade;
        if (endereco.uf) daPessoa.uf = endereco.uf;
      }
      return { ...atual, ...novos, ...daPessoa };
    });
  };
  const escolherPapel = (p: PapelDoDossie) => {
    setPapel(p);
    preencher(leitura, p);
  };

  // Uma fonte só no plano: escolhida sem perguntar.
  const fonteId = v.fonteId || (fontesDoCanal.length === 1 ? fontesDoCanal[0]!.id : '');

  const criar = useMutation({
    mutationFn: async (corpo: ReturnType<typeof cadastroCasoEntrada.parse>) => {
      let idDoCredor = corpo.credorId;
      if (credorId === NOVO_CREDOR) {
        const { id } = await exigir(
          api.POST('/api/credores', { body: { nome: novoCredor.nome.trim(), cnpj: novoCredor.cnpj.trim() || undefined } }),
        );
        idDoCredor = id;
        void queryClient.invalidateQueries({ queryKey: ['credores'] });
      }
      return exigir(api.POST('/api/casos/cadastro', { body: { ...corpo, credorId: idDoCredor } as typeof corpo }));
    },
    onSuccess: ({ id }) => {
      toast.success(texto.trim() ? 'Caso cadastrado com tudo o que veio no texto.' : 'Caso cadastrado.');
      void queryClient.invalidateQueries({ queryKey: ['casos'] });
      void queryClient.invalidateQueries({ queryKey: ['painel'] });
      void navigate({ to: canal === 'a' ? '/a/casos/$casoId' : '/b/casos/$casoId', params: { casoId: id } });
    },
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (credorId === NOVO_CREDOR) {
      const c = novoCredorEntrada.safeParse({ nome: novoCredor.nome, cnpj: novoCredor.cnpj.trim() || undefined });
      if (!c.success) for (const i of c.error.issues) novos[`credor.${String(i.path[0])}`] ??= i.message;
    }
    const corpo = montar(canal, { ...v, fonteId }, credorId === NOVO_CREDOR ? 'credor-novo' : credorId);
    const r = cadastroCasoEntrada.safeParse(texto.trim() ? { ...corpo, relatorio: { texto, papelPessoa: papel } } : corpo);
    if (!r.success) for (const i of r.error.issues) novos[String(i.path.at(-1))] ??= i.message;
    setErros(novos);
    if (Object.keys(novos).length || !r.success) {
      toast.error('Confira os campos destacados.');
      return;
    }
    criar.mutate(r.data);
  };

  const campo = (k: string, rotulo: string, props: React.ComponentProps<typeof Input> = {}, obrigatorio = false, dica?: string) => (
    <Field data-invalid={!!erros[k]}>
      <FieldLabel htmlFor={`novo-${k}`}>
        {rotulo}
        {obrigatorio ? <span className="text-red-300">*</span> : null}
      </FieldLabel>
      <Input id={`novo-${k}`} value={v[k] ?? ''} onChange={definir(k)} aria-invalid={!!erros[k]} {...props} />
      {dica ? <FieldDescription>{dica}</FieldDescription> : null}
      <FieldError>{erros[k]}</FieldError>
    </Field>
  );

  const semCredores = credores.isSuccess && credores.data.length === 0;
  const outraPlaca = !!leitura?.veiculo?.placa && !!v.placa && leitura.veiculo.placa !== v.placa.toUpperCase().replace(/[\s-]/g, '');
  const voltar = canal === 'a' ? '/a/casos' : '/b/casos';

  return (
    <form onSubmit={enviar} noValidate>
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
        <Link to={voltar}>
          <ArrowLeftIcon />
          {canal === 'a' ? 'Casos' : 'Negociações'}
        </Link>
      </Button>
      <CabecalhoDePagina
        titulo={canal === 'a' ? 'Novo caso de recuperação' : 'Novo lead de aquisição'}
        descricao={
          canal === 'a'
            ? 'Cole o relatório do fornecedor para preencher tudo de uma vez. O caso entra como Recebido; rito e prova vêm depois, na ficha.'
            : 'Veículo oferecido por lead próprio. A evidência de origem separa este caso de qualquer carteira de credor.'
        }
        acoes={
          <>
            <Button type="button" variant="outline" asChild>
              <Link to={voltar}>Cancelar</Link>
            </Button>
            <Button type="submit" disabled={criar.isPending || outraPlaca || faltaPapel(leitura, devedorDoc, papel)}>
              {criar.isPending ? <Spinner /> : <SaveIcon />}
              Cadastrar caso
            </Button>
          </>
        }
      />

      {criar.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{criar.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <ClipboardPasteIcon className="size-4 text-blue-400" aria-hidden />
                1. Cole o relatório
              </CardTitle>
              <CardDescription>
                Veículo, passagens de radar e dossiê da pessoa, juntos ou separados. Tudo é guardado: o que não tiver campo próprio fica
                no caso, e o texto original também.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                aria-label="Texto do relatório"
                autoFocus
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  preencher(e.target.value.trim().length >= 10 ? lerRelatorio(e.target.value) : null, papel);
                }}
                placeholder={'🚗 DADOS DO VEÍCULO 🚗\nPlaca: …\nChassi: …\n\n--- DADOS BÁSICOS ---\nNome: …\nCPF: …'}
                className="field-sizing-fixed h-[45vh] min-h-64 resize-y font-mono text-xs"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {texto.length ? `${texto.length.toLocaleString('pt-BR')} caracteres · os campos abaixo foram preenchidos; confira.` : 'Opcional: também dá para digitar.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-white">2. Confira o caso</CardTitle>
              <CardDescription>Campos com * são obrigatórios.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!erros.fonteId}>
                  <FieldLabel>Fonte</FieldLabel>
                  {fontesDoCanal.length === 1 ? (
                    <p className="flex h-9 items-center rounded-md bg-white/3 px-3 text-sm text-white ring-1 ring-white/10">{fontesDoCanal[0]!.nome}</p>
                  ) : (
                    <Select value={v.fonteId ?? ''} onValueChange={(x) => setV({ ...v, fonteId: x })}>
                      <SelectTrigger className="w-full" aria-invalid={!!erros.fonteId}>
                        <SelectValue placeholder={fontes.isPending ? 'Carregando…' : 'Escolha a fonte'} />
                      </SelectTrigger>
                      <SelectContent>
                        {fontesDoCanal.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FieldError>{erros.fonteId}</FieldError>
                </Field>
                <Field data-invalid={!!erros.credorId}>
                  <FieldLabel>
                    {canal === 'a' ? 'Credor' : 'Credor do financiamento (opcional)'}
                    {canal === 'a' ? <span className="text-red-300">*</span> : null}
                  </FieldLabel>
                  {semCredores && !admin ? (
                    <p className="text-sm text-amber-300">Nenhum credor cadastrado. Peça a um administrador para cadastrar.</p>
                  ) : (
                    <Select value={credorId} onValueChange={setCredorId}>
                      <SelectTrigger className="w-full" aria-invalid={!!erros.credorId}>
                        <SelectValue
                          placeholder={credores.isPending ? 'Carregando…' : semCredores ? 'Cadastre o primeiro credor' : 'Escolha o credor'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(credores.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                        {admin ? (
                          <>
                            {credores.data?.length ? <SelectSeparator /> : null}
                            <SelectItem value={NOVO_CREDOR}>+ Cadastrar novo credor</SelectItem>
                          </>
                        ) : null}
                      </SelectContent>
                    </Select>
                  )}
                  <FieldError>{erros.credorId}</FieldError>
                </Field>
              </div>

              {credorId === NOVO_CREDOR ? (
                <div className="grid gap-4 rounded-lg bg-white/3 p-4 ring-1 ring-white/10 sm:grid-cols-2">
                  <Field data-invalid={!!erros['credor.nome']}>
                    <FieldLabel htmlFor="novo-credor-nome">
                      Nome do credor<span className="text-red-300">*</span>
                    </FieldLabel>
                    <Input
                      id="novo-credor-nome"
                      value={novoCredor.nome}
                      onChange={(e) => setNovoCredor({ ...novoCredor, nome: e.target.value })}
                      placeholder="Banco ou financeira"
                    />
                    <FieldError>{erros['credor.nome']}</FieldError>
                  </Field>
                  <Field data-invalid={!!erros['credor.cnpj']}>
                    <FieldLabel htmlFor="novo-credor-cnpj">CNPJ do credor</FieldLabel>
                    <Input
                      id="novo-credor-cnpj"
                      value={novoCredor.cnpj}
                      onChange={(e) => setNovoCredor({ ...novoCredor, cnpj: e.target.value })}
                      placeholder="Opcional"
                    />
                    <FieldError>{erros['credor.cnpj']}</FieldError>
                  </Field>
                </div>
              ) : null}

              <Separator />
              <p className="text-sm font-semibold text-white">Veículo</p>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                {campo('placa', 'Placa', { placeholder: 'ABC1D23', className: 'uppercase' }, true)}
                <div className="sm:col-span-1 2xl:col-span-2">{campo('modelo', 'Modelo', { placeholder: 'Marca/Modelo versão' }, true)}</div>
                {campo('ano', 'Ano do modelo', { inputMode: 'numeric' })}
                <div className="2xl:col-span-2">{campo('chassi', 'Chassi', { className: 'uppercase font-mono' })}</div>
                {campo('renavam', 'Renavam', { inputMode: 'numeric', className: 'font-mono' })}
                {campo('cor', 'Cor')}
                <div className="sm:col-span-1 2xl:col-span-3">{campo('cidade', 'Cidade')}</div>
                {campo('uf', 'UF', { maxLength: 2, className: 'uppercase' })}
              </div>

              <Separator />
              <p className="text-sm font-semibold text-white">{canal === 'a' ? 'Devedor e dívida' : 'Vendedor e saldo'}</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {campo('devedorNome', canal === 'a' ? 'Nome do devedor' : 'Nome do vendedor')}
                {campo('devedorDoc', 'CPF ou CNPJ', {}, false, 'Conferido pelo dígito; fica oculto nas listas.')}
                {canal === 'a'
                  ? campo('valorDivida', 'Valor da dívida (R$)', { inputMode: 'decimal' })
                  : campo('saldoDevedor', 'Saldo devedor (R$)', { inputMode: 'decimal' })}
              </div>

              {canal === 'b' ? (
                <>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field data-invalid={!!erros.canalLead}>
                      <FieldLabel>
                        Como o lead chegou<span className="text-red-300">*</span>
                      </FieldLabel>
                      <Select value={v.canalLead ?? ''} onValueChange={(x) => setV({ ...v, canalLead: x })}>
                        <SelectTrigger className="w-full" aria-invalid={!!erros.canalLead}>
                          <SelectValue placeholder="Escolha" />
                        </SelectTrigger>
                        <SelectContent>
                          {CANAIS_LEAD.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError>{erros.canalLead}</FieldError>
                    </Field>
                    <div className="sm:col-span-2">
                      <Field data-invalid={!!erros.evidenciaLead}>
                        <FieldLabel htmlFor="novo-evidencia">
                          Evidência de origem<span className="text-red-300">*</span>
                        </FieldLabel>
                        <Textarea id="novo-evidencia" rows={2} value={v.evidenciaLead ?? ''} onChange={definir('evidenciaLead')} />
                        <FieldDescription>Prova de que o lead não veio do dado de uma plataforma de credor.</FieldDescription>
                        <FieldError>{erros.evidenciaLead}</FieldError>
                      </Field>
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="xl:sticky xl:top-0">
            <CardHeader>
              <CardTitle className="text-white">O que será gravado</CardTitle>
              <CardDescription>Lido do texto agora; o servidor lê de novo ao gravar.</CardDescription>
            </CardHeader>
            <CardContent>
              {leitura ? (
                <PreviaLeitura
                  leitura={leitura}
                  devedorDoc={devedorDoc}
                  papelEscolhido={papel}
                  aoEscolherPapel={escolherPapel}
                  sensivelVisivel={pode.verSensivel(sessao)}
                  placaDoCaso={v.placa ? v.placa.toUpperCase().replace(/[\s-]/g, '') : undefined}
                  planoA={canal === 'a'}
                />
              ) : (
                <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 p-8 text-center">
                  <ClipboardPasteIcon className="size-8 text-slate-600" aria-hidden />
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Cole o relatório à esquerda. Aqui aparecem o veículo, o proprietário, os telefones e endereços (sem repetição), as
                    passagens de radar no mapa e os campos que o sistema ainda não conhece.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
