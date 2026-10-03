import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { novoBureauEntrada } from '@workspace/domain';
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
import { Spinner } from '@workspace/ui/components/spinner';
import { toast } from '@workspace/ui/lib/toast';

import { api, exigir } from '@/lib/api.ts';

const TIPOS = ['Veicular', 'Crédito', 'Localização', 'Judicial'] as const;

/**
 * Fornecedor contratado de consulta. O contrato é obrigatório: é ele que dá
 * procedência a cada consulta (LGPD, art. 37). Sem fornecedor cadastrado, o
 * relatório colado na ficha não tem como ser registrado.
 */
export function DialogoFornecedor({ aoFechar }: { aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState({ nome: '', tipo: 'Veicular' as (typeof TIPOS)[number], contrato: '', custo: '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const criar = useMutation({
    mutationFn: (corpo: ReturnType<typeof novoBureauEntrada.parse>) => exigir(api.POST('/api/bureaus', { body: corpo })),
    onSuccess: () => {
      toast.success('Fornecedor cadastrado.');
      void queryClient.invalidateQueries({ queryKey: ['bureaus'] });
      aoFechar();
    },
  });
  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo fornecedor de consulta</DialogTitle>
          <DialogDescription>Empresa contratada que entrega dado de veículo, crédito, localização ou processos.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = novoBureauEntrada.safeParse({
              nome: v.nome,
              tipo: v.tipo,
              contratoFornecedorId: v.contrato,
              custoConsulta: v.custo.trim() ? Number(v.custo.replace(',', '.')) : 0,
            });
            if (!r.success) return setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
            setErros({});
            criar.mutate(r.data);
          }}
        >
          <Field data-invalid={!!erros.nome}>
            <FieldLabel htmlFor="forn-nome">
              Nome<span className="text-red-300">*</span>
            </FieldLabel>
            <Input id="forn-nome" value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} />
            <FieldError>{erros.nome}</FieldError>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Tipo de dado</FieldLabel>
              <Select value={v.tipo} onValueChange={(t) => setV({ ...v, tipo: t as (typeof TIPOS)[number] })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={!!erros.custoConsulta}>
              <FieldLabel htmlFor="forn-custo">Custo por consulta (R$)</FieldLabel>
              <Input id="forn-custo" inputMode="decimal" value={v.custo} onChange={(e) => setV({ ...v, custo: e.target.value })} />
              <FieldError>{erros.custoConsulta}</FieldError>
            </Field>
          </div>
          <Field data-invalid={!!erros.contratoFornecedorId}>
            <FieldLabel htmlFor="forn-contrato">
              Contrato<span className="text-red-300">*</span>
            </FieldLabel>
            <Input
              id="forn-contrato"
              value={v.contrato}
              onChange={(e) => setV({ ...v, contrato: e.target.value })}
              placeholder="Número ou referência do contrato assinado"
            />
            <FieldDescription>Sem contrato não há procedência: a consulta não é registrada.</FieldDescription>
            <FieldError>{erros.contratoFornecedorId}</FieldError>
          </Field>
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
