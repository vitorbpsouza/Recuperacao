import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { cadastroCasoEntrada } from '@workspace/domain';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Separator } from '@workspace/ui/components/separator';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { toast } from '@workspace/ui/lib/toast';

import { api, credoresQuery, exigir, fontesQuery, type Canal } from '@/lib/api.ts';

const CANAIS_LEAD = ['Inbound Site', 'WhatsApp', 'Indicação', 'Parceria', 'Anúncio'] as const;

type Campos = Record<string, string>;

/** Converte o texto do formulário no corpo da API (vazio vira ausente). */
const montar = (canal: Canal, v: Campos) => {
  const numero = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/\./g, '').replace(',', '.')));
  const opcional = (s: string) => (s.trim() === '' ? undefined : s.trim());
  const bem = {
    placa: v.placa ?? '',
    chassi: opcional(v.chassi ?? ''),
    modelo: v.modelo ?? '',
    ano: numero(v.ano ?? ''),
    cor: opcional(v.cor ?? ''),
    cidade: opcional(v.cidade ?? ''),
    uf: opcional((v.uf ?? '').toUpperCase()),
    devedorNome: opcional(v.devedorNome ?? ''),
    devedorDoc: opcional(v.devedorDoc ?? ''),
    valorDivida: numero(v.valorDivida ?? ''),
  };
  return canal === 'a'
    ? { origem: 'plataforma_credor' as const, fonteId: v.fonteId ?? '', credorId: v.credorId ?? '', bem }
    : {
        origem: 'lead_proprio' as const,
        fonteId: v.fonteId ?? '',
        credorId: opcional(v.credorId ?? ''),
        bem,
        canalLead: (v.canalLead ?? '') as (typeof CANAIS_LEAD)[number],
        evidenciaLead: v.evidenciaLead ?? '',
        saldoDevedor: numero(v.saldoDevedor ?? ''),
      };
};

/**
 * Cadastro de um caso com o veículo. No Plano A o caso nasce "Recebido" e
 * segue pelo ciclo (enriquecimento, rito, campo); no Plano B nasce "Lead
 * Recebido", com a evidência de que o lead tem origem própria.
 */
export function DialogoNovoCaso({ canal, aoFechar }: { canal: Canal; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fontes = useQuery(fontesQuery);
  const credores = useQuery(credoresQuery);
  const finalidade = canal === 'a' ? 'recuperacao_para_credor' : 'aquisicao_com_quitacao';
  const fontesDoCanal = (fontes.data ?? []).filter((f) => f.finalidadePermitida === finalidade);

  const [v, setV] = useState<Campos>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const definir = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  const criar = useMutation({
    mutationFn: (corpo: ReturnType<typeof cadastroCasoEntrada.parse>) => exigir(api.POST('/api/casos/cadastro', { body: corpo })),
    onSuccess: ({ id }) => {
      toast.success('Caso cadastrado.');
      void queryClient.invalidateQueries({ queryKey: ['casos'] });
      aoFechar();
      void navigate({ to: canal === 'a' ? '/a/casos/$casoId' : '/b/casos/$casoId', params: { casoId: id } });
    },
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = cadastroCasoEntrada.safeParse(montar(canal, v));
    if (!r.success) {
      // Erros do bem vêm com o caminho "bem.campo": a chave é o último pedaço.
      setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path.at(-1)), i.message])));
      return;
    }
    setErros({});
    criar.mutate(r.data);
  };

  const texto = (k: string, rotulo: string, props: React.ComponentProps<typeof Input> = {}, dica?: string) => (
    <Field data-invalid={!!erros[k]}>
      <FieldLabel htmlFor={`novo-${k}`}>{rotulo}</FieldLabel>
      <Input id={`novo-${k}`} value={v[k] ?? ''} onChange={definir(k)} aria-invalid={!!erros[k]} {...props} />
      {dica ? <FieldDescription>{dica}</FieldDescription> : null}
      <FieldError>{erros[k]}</FieldError>
    </Field>
  );

  const escolha = (k: string, rotulo: string, opcoes: { valor: string; rotulo: string }[], vazio: string) => (
    <Field data-invalid={!!erros[k]}>
      <FieldLabel>{rotulo}</FieldLabel>
      <Select value={v[k] ?? ''} onValueChange={(x) => setV({ ...v, [k]: x })}>
        <SelectTrigger className="w-full" aria-invalid={!!erros[k]}>
          <SelectValue placeholder={vazio} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError>{erros[k]}</FieldError>
    </Field>
  );

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{canal === 'a' ? 'Novo caso de recuperação' : 'Novo lead de aquisição'}</DialogTitle>
          <DialogDescription>
            {canal === 'a'
              ? 'Veículo da carteira de um credor. O caso entra como Recebido; rito e prova vêm depois, na ficha.'
              : 'Veículo oferecido por lead próprio. A evidência de origem separa este caso de qualquer carteira de credor.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {escolha(
              'fonteId',
              'Fonte',
              fontesDoCanal.map((f) => ({ valor: f.id, rotulo: f.nome })),
              fontes.isPending ? 'Carregando…' : 'Escolha a fonte',
            )}
            {escolha(
              'credorId',
              canal === 'a' ? 'Credor' : 'Credor do financiamento (opcional)',
              (credores.data ?? []).map((c) => ({ valor: c.id, rotulo: c.nome })),
              credores.isPending ? 'Carregando…' : 'Escolha o credor',
            )}
          </div>

          <Separator />
          <p className="text-sm font-semibold text-white">Veículo</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {texto('placa', 'Placa', { placeholder: 'ABC1D23', className: 'uppercase' })}
            {texto('modelo', 'Modelo', { placeholder: 'Marca/Modelo versão' })}
            {texto('ano', 'Ano', { inputMode: 'numeric' })}
            {texto('chassi', 'Chassi', { className: 'uppercase font-mono' })}
            {texto('cor', 'Cor')}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">{texto('cidade', 'Cidade')}</div>
              {texto('uf', 'UF', { maxLength: 2, className: 'uppercase' })}
            </div>
          </div>

          <Separator />
          <p className="text-sm font-semibold text-white">{canal === 'a' ? 'Devedor e dívida' : 'Vendedor e saldo'}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {texto('devedorNome', canal === 'a' ? 'Nome do devedor' : 'Nome do vendedor')}
            {texto('devedorDoc', 'CPF ou CNPJ', {}, 'Conferido pelo dígito; fica oculto nas listas.')}
            {canal === 'a'
              ? texto('valorDivida', 'Valor da dívida (R$)', { inputMode: 'decimal' })
              : texto('saldoDevedor', 'Saldo devedor (R$)', { inputMode: 'decimal' })}
          </div>

          {canal === 'b' ? (
            <>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-3">
                {escolha(
                  'canalLead',
                  'Como o lead chegou',
                  CANAIS_LEAD.map((c) => ({ valor: c, rotulo: c })),
                  'Escolha',
                )}
                <div className="sm:col-span-2">
                  <Field data-invalid={!!erros.evidenciaLead}>
                    <FieldLabel htmlFor="novo-evidencia">Evidência de origem</FieldLabel>
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
