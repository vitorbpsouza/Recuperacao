import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, ShieldCheckIcon, UserRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { revelarDevedorEntrada } from '@workspace/domain';
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
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';

import { api, exigir } from '@/lib/api.ts';

type Revelacao = z.infer<typeof revelarDevedorEntrada>;

/**
 * Dado pessoal do devedor sob demanda. A tela começa sem ele; revelar exige
 * declarar a finalidade, e o servidor grava quem viu, quando e por quê.
 */
export function PainelDevedor({ casoId, rotulo }: { casoId: string; rotulo: string }) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const form = useForm<Revelacao>({ resolver: zodResolver(revelarDevedorEntrada), defaultValues: { finalidade: '' } });

  const revelar = useMutation({
    mutationFn: (corpo: Revelacao) =>
      exigir(api.POST('/api/casos/{id}/devedor', { params: { path: { id: casoId } }, body: corpo })),
    onSuccess: () => {
      setAberto(false);
      void queryClient.invalidateQueries({ queryKey: ['caso', casoId, 'acessos'] });
    },
  });

  if (revelar.data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-white/3 p-4 ring-1 ring-white/5">
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="mt-1 font-semibold text-white">{revelar.data.devedorNome ?? '—'}</p>
          </div>
          <div className="rounded-lg bg-white/3 p-4 ring-1 ring-white/5">
            <p className="text-xs text-muted-foreground">CPF/CNPJ</p>
            <p className="mt-1 font-semibold text-white tabular-nums">{revelar.data.devedorDoc ?? '—'}</p>
          </div>
        </div>
        <Alert>
          <ShieldCheckIcon />
          <AlertDescription>Este acesso foi registrado na trilha do caso, com a finalidade informada.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-slate-500/10 text-slate-400">
          <UserRoundIcon className="size-5" aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-white">{rotulo} oculto</p>
          <p className="text-sm text-muted-foreground">Nome e documento só aparecem com finalidade declarada.</p>
        </div>
      </div>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <EyeIcon />
        Revelar dados
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revelar dado pessoal</DialogTitle>
            <DialogDescription>
              O acesso fica registrado com seu usuário, a data e a finalidade abaixo (LGPD art. 37).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => revelar.mutate(v))} className="space-y-4" noValidate>
            <Field data-invalid={!!form.formState.errors.finalidade}>
              <FieldLabel htmlFor="finalidade">Finalidade</FieldLabel>
              <Textarea
                id="finalidade"
                rows={3}
                placeholder="Ex.: confirmar identidade antes da abordagem em campo"
                aria-invalid={!!form.formState.errors.finalidade}
                {...form.register('finalidade')}
              />
              <FieldDescription>Seja específico: o texto é auditável.</FieldDescription>
              <FieldError errors={[form.formState.errors.finalidade]} />
            </Field>
            {revelar.error ? (
              <Alert variant="destructive">
                <AlertDescription>{revelar.error.message}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={revelar.isPending}>
                {revelar.isPending ? <Spinner /> : <EyeIcon />}
                Revelar e registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
