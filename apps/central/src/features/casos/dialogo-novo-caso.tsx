import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ClipboardPasteIcon, ShieldAlertIcon } from 'lucide-react';
import { useState } from 'react';

import { cadastroCasoEntrada, lerRelatorioVeicular, novoCredorEntrada } from '@workspace/domain';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Separator } from '@workspace/ui/components/separator';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { toast } from '@workspace/ui/lib/toast';

import { api, credoresQuery, exigir, fontesQuery, pode, sessaoQuery, type Canal } from '@/lib/api.ts';

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
 * Cadastro de um caso com o veículo.
 *
 * Os dados do veículo podem ser digitados ou colados do relatório do
 * fornecedor: a tela lê só o que é do veículo (placa, chassi, Renavam, modelo,
 * cor, ano) e descarta dono, documento e localização por radar. A fonte é a
 * do plano; o credor pode ser cadastrado aqui mesmo.
 */
export function DialogoNovoCaso({ canal, aoFechar }: { canal: Canal; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sessao = useQuery(sessaoQuery).data;
  const fontes = useQuery(fontesQuery);
  const credores = useQuery(credoresQuery);
  const admin = !!sessao && pode.administrar(sessao);
  const finalidade = canal === 'a' ? 'recuperacao_para_credor' : 'aquisicao_com_quitacao';
  const fontesDoCanal = (fontes.data ?? []).filter((f) => f.finalidadePermitida === finalidade);

  const [v, setV] = useState<Campos>({});
  const [credorId, setCredorId] = useState('');
  const [novoCredor, setNovoCredor] = useState({ nome: '', cnpj: '' });
  const [colado, setColado] = useState('');
  const [aviso, setAviso] = useState<{ preenchidos: string[]; descartados: string[] } | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const definir = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  // Uma fonte só no plano: escolhida sem perguntar.
  const fonteId = v.fonteId || (fontesDoCanal.length === 1 ? fontesDoCanal[0]!.id : '');

  const colar = (texto: string) => {
    setColado(texto);
    if (!texto.trim()) return setAviso(null);
    const r = lerRelatorioVeicular(texto);
    const novos: Campos = {
      ...(r.placa ? { placa: r.placa } : {}),
      ...(r.chassi ? { chassi: r.chassi } : {}),
      ...(r.renavam ? { renavam: r.renavam } : {}),
      ...(r.modelo ? { modelo: r.modelo } : {}),
      ...(r.cor ? { cor: r.cor } : {}),
      ...(r.anoModelo ? { ano: String(r.anoModelo) } : {}),
    };
    setV((atual) => ({ ...atual, ...novos }));
    setAviso({ preenchidos: Object.keys(novos), descartados: r.descartados });
  };

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
      toast.success('Caso cadastrado.');
      void queryClient.invalidateQueries({ queryKey: ['casos'] });
      aoFechar();
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
    // O credor novo ainda não tem id: um marcador passa pela validação e é trocado no envio.
    const r = cadastroCasoEntrada.safeParse(
      montar(canal, { ...v, fonteId }, credorId === NOVO_CREDOR ? 'credor-novo' : credorId),
    );
    // Primeiro erro de cada campo: "informe a placa" diz mais que "placa inválida" num campo vazio.
    if (!r.success) for (const i of r.error.issues) novos[String(i.path.at(-1))] ??= i.message;
    setErros(novos);
    if (Object.keys(novos).length || !r.success) return;
    criar.mutate(r.data);
  };

  const texto = (k: string, rotulo: string, props: React.ComponentProps<typeof Input> = {}, obrigatorio = false, dica?: string) => (
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

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{canal === 'a' ? 'Novo caso de recuperação' : 'Novo lead de aquisição'}</DialogTitle>
          <DialogDescription>
            {canal === 'a'
              ? 'Veículo da carteira de um credor. O caso entra como Recebido; rito e prova vêm depois, na ficha.'
              : 'Veículo oferecido por lead próprio. A evidência de origem separa este caso de qualquer carteira de credor.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-5" noValidate>
          <Field>
            <FieldLabel htmlFor="novo-colar" className="flex items-center gap-2">
              <ClipboardPasteIcon className="size-4" aria-hidden />
              Colar dados do veículo (opcional)
            </FieldLabel>
            <Textarea
              id="novo-colar"
              rows={3}
              value={colado}
              onChange={(e) => colar(e.target.value)}
              placeholder="Cole aqui o relatório do fornecedor: placa, chassi, Renavam, modelo, cor e ano preenchem os campos abaixo."
              className="font-mono text-xs"
            />
            {aviso ? (
              <FieldDescription>
                {aviso.preenchidos.length
                  ? `Preenchido: ${aviso.preenchidos.join(', ')}. Confira abaixo.`
                  : 'Nenhum dado do veículo reconhecido no texto.'}
              </FieldDescription>
            ) : null}
          </Field>
          {aviso?.descartados.length ? (
            <Alert>
              <ShieldAlertIcon />
              <AlertTitle>Descartado: {aviso.descartados.join(', ')}</AlertTitle>
              <AlertDescription>
                Dono e localização por radar não entram. O dado do devedor vem da carteira do credor; a localização, dos avistamentos da
                equipe de campo.
              </AlertDescription>
            </Alert>
          ) : null}

          <Separator />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!erros.fonteId}>
              <FieldLabel>Fonte</FieldLabel>
              {fontesDoCanal.length === 1 ? (
                <p className="flex h-9 items-center rounded-md bg-white/3 px-3 text-sm text-white ring-1 ring-white/10">
                  {fontesDoCanal[0]!.nome}
                </p>
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
                    <SelectValue placeholder={credores.isPending ? 'Carregando…' : semCredores ? 'Cadastre o primeiro credor' : 'Escolha o credor'} />
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
          <div className="grid gap-4 sm:grid-cols-3">
            {texto('placa', 'Placa', { placeholder: 'ABC1D23', className: 'uppercase' }, true)}
            {texto('modelo', 'Modelo', { placeholder: 'Marca/Modelo versão' }, true)}
            {texto('ano', 'Ano', { inputMode: 'numeric' })}
            {texto('chassi', 'Chassi', { className: 'uppercase font-mono' })}
            {texto('renavam', 'Renavam', { inputMode: 'numeric', className: 'font-mono' })}
            {texto('cor', 'Cor')}
            <div className="sm:col-span-2">{texto('cidade', 'Cidade')}</div>
            {texto('uf', 'UF', { maxLength: 2, className: 'uppercase' })}
          </div>

          <Separator />
          <p className="text-sm font-semibold text-white">{canal === 'a' ? 'Devedor e dívida' : 'Vendedor e saldo'}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {texto('devedorNome', canal === 'a' ? 'Nome do devedor' : 'Nome do vendedor')}
            {texto('devedorDoc', 'CPF ou CNPJ', {}, false, 'Conferido pelo dígito; fica oculto nas listas.')}
            {canal === 'a'
              ? texto('valorDivida', 'Valor da dívida (R$)', { inputMode: 'decimal' })
              : texto('saldoDevedor', 'Saldo devedor (R$)', { inputMode: 'decimal' })}
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
              {criar.isPending ? <Spinner /> : null}
              Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
