import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMergeIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { PlacaMercosul } from '@workspace/ui/brand/placa-mercosul';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@workspace/ui/components/empty';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { RadioGroup, RadioGroupItem } from '@workspace/ui/components/radio-group';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { formatarDataHora } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, colisoesQuery, exigir, pode, type UsuarioSessao } from '@/lib/api.ts';

/**
 * Mesma placa nos dois planos. Sem registro, a situação é indistinguível de
 * desvio de finalidade; com registro e evidência independente, é defensável.
 * O banco recusa abrir aquisição numa placa de plataforma sem esta linha.
 */
export function PaginaColisoes({ sessao }: { sessao: UsuarioSessao }) {
  const consulta = useQuery(colisoesQuery);
  const [registrando, setRegistrando] = useState(false);
  return (
    <>
      <CabecalhoDePagina
        titulo="Colisões de origem"
        descricao="Placas presentes nos dois planos e como cada caso foi resolvido."
        acoes={
          pode.administrar(sessao) ? (
            <Button onClick={() => setRegistrando(true)}>
              <PlusIcon />
              Registrar colisão
            </Button>
          ) : null
        }
      />
      {consulta.isError ? (
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      ) : consulta.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : consulta.data.length === 0 ? (
        <Card>
          <Empty className="border-0 py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitMergeIcon />
              </EmptyMedia>
              <EmptyTitle>Nenhuma colisão registrada</EmptyTitle>
              <EmptyDescription>Quando um lead próprio chegar com placa que já é caso de plataforma, registre aqui.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {consulta.data.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex-row items-center gap-3">
                <PlacaMercosul placa={c.placa} />
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-white">Caso de plataforma {c.casoPlataformaId}</CardTitle>
                  <CardDescription className="tabular-nums">{formatarDataHora(c.detectadoEm)}</CardDescription>
                </div>
                <StatusBadge
                  status={c.resolucao === 'lead_descartado' ? 'Lead descartado' : 'Prosseguiu'}
                  tom={c.resolucao === 'lead_descartado' ? 'encerrado' : 'alerta'}
                />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-white">{c.justificativa}</p>
                {c.evidenciaIndependente ? (
                  <p className="rounded-lg bg-white/3 p-3 text-muted-foreground ring-1 ring-white/5">
                    <span className="font-semibold text-white">Evidência independente: </span>
                    {c.evidenciaIndependente}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <DialogoColisao aberto={registrando} aoMudar={setRegistrando} />
    </>
  );
}

const formulario = z
  .object({
    placa: z.string().trim().min(7, 'placa incompleta'),
    casoPlataformaId: z.string().trim().min(1, 'informe o caso de plataforma'),
    leadProprioRef: z.string().trim().optional(),
    resolucao: z.enum(['lead_descartado', 'prosseguiu_com_origem_independente']),
    justificativa: z.string().trim().min(10, 'justifique em ao menos 10 caracteres'),
    evidenciaIndependente: z.string().trim().optional(),
  })
  .refine((v) => v.resolucao === 'lead_descartado' || (v.evidenciaIndependente?.length ?? 0) > 0, {
    path: ['evidenciaIndependente'],
    message: 'para prosseguir, a evidência independente é obrigatória',
  });

type Formulario = z.infer<typeof formulario>;

function DialogoColisao({ aberto, aoMudar }: { aberto: boolean; aoMudar: (a: boolean) => void }) {
  const queryClient = useQueryClient();
  const form = useForm<Formulario>({
    resolver: zodResolver(formulario),
    defaultValues: { placa: '', casoPlataformaId: '', leadProprioRef: '', resolucao: 'lead_descartado', justificativa: '', evidenciaIndependente: '' },
  });
  const resolucao = form.watch('resolucao');
  const registrar = useMutation({
    mutationFn: (v: Formulario) =>
      exigir(
        api.POST('/api/colisoes', {
          body: {
            ...v,
            leadProprioRef: v.leadProprioRef || undefined,
            evidenciaIndependente: v.evidenciaIndependente || undefined,
          },
        }),
      ),
    onSuccess: () => {
      toast.success('Colisão registrada.');
      form.reset();
      aoMudar(false);
      void queryClient.invalidateQueries({ queryKey: ['colisoes'] });
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar colisão de origem</DialogTitle>
          <DialogDescription>
            Prosseguir com a aquisição exige provar que o lead não nasceu do dado da plataforma.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => registrar.mutate(v))} noValidate className="space-y-4">
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Field data-invalid={!!form.formState.errors.placa}>
                <FieldLabel htmlFor="c-placa">Placa</FieldLabel>
                <Input id="c-placa" className="uppercase" aria-invalid={!!form.formState.errors.placa} {...form.register('placa')} />
                <FieldError errors={[form.formState.errors.placa]} />
              </Field>
              <Field data-invalid={!!form.formState.errors.casoPlataformaId}>
                <FieldLabel htmlFor="c-caso">Caso de plataforma</FieldLabel>
                <Input id="c-caso" aria-invalid={!!form.formState.errors.casoPlataformaId} {...form.register('casoPlataformaId')} />
                <FieldError errors={[form.formState.errors.casoPlataformaId]} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Resolução</FieldLabel>
              <Controller
                control={form.control}
                name="resolucao"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange}>
                    <Field orientation="horizontal">
                      <RadioGroupItem value="lead_descartado" id="r-descartado" />
                      <FieldLabel htmlFor="r-descartado" className="font-normal">
                        Descartar o lead
                      </FieldLabel>
                    </Field>
                    <Field orientation="horizontal">
                      <RadioGroupItem value="prosseguiu_com_origem_independente" id="r-prosseguir" />
                      <FieldLabel htmlFor="r-prosseguir" className="font-normal">
                        Prosseguir — a origem do lead é independente
                      </FieldLabel>
                    </Field>
                  </RadioGroup>
                )}
              />
            </Field>
            <Field data-invalid={!!form.formState.errors.justificativa}>
              <FieldLabel htmlFor="c-just">Justificativa</FieldLabel>
              <Textarea id="c-just" rows={2} aria-invalid={!!form.formState.errors.justificativa} {...form.register('justificativa')} />
              <FieldError errors={[form.formState.errors.justificativa]} />
            </Field>
            {resolucao === 'prosseguiu_com_origem_independente' ? (
              <Field data-invalid={!!form.formState.errors.evidenciaIndependente}>
                <FieldLabel htmlFor="c-ev">Evidência independente</FieldLabel>
                <Textarea
                  id="c-ev"
                  rows={2}
                  placeholder="Ex.: formulário #555 de 05/01, anterior ao recebimento na plataforma"
                  aria-invalid={!!form.formState.errors.evidenciaIndependente}
                  {...form.register('evidenciaIndependente')}
                />
                <FieldDescription>Data e identificador que provem a origem anterior e independente.</FieldDescription>
                <FieldError errors={[form.formState.errors.evidenciaIndependente]} />
              </Field>
            ) : null}
          </FieldGroup>
          {registrar.error ? (
            <Alert variant="destructive">
              <AlertDescription>{registrar.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => aoMudar(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={registrar.isPending}>
              {registrar.isPending ? <Spinner /> : null}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
