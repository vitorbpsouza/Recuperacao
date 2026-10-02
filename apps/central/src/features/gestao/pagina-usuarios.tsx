import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, UserRoundPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { CanalBadge } from '@workspace/ui/brand/canal-badge';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Checkbox } from '@workspace/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { toast } from '@workspace/ui/lib/toast';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, CANAL_DA_ORIGEM, exigir, usuariosQuery } from '@/lib/api.ts';

const PAPEL = { admin: 'Administrador', operador: 'Operador', auditor: 'Auditor' } as const;

/**
 * Contas de acesso. Não há auto-cadastro: só o admin cria conta, e um
 * operador sempre nasce restrito a pelo menos um plano.
 */
export function PaginaUsuarios() {
  const consulta = useQuery(usuariosQuery);
  const [criando, setCriando] = useState(false);
  return (
    <>
      <CabecalhoDePagina
        titulo="Usuários"
        descricao="Quem acessa a plataforma, com que papel e em quais planos."
        acoes={
          <Button onClick={() => setCriando(true)}>
            <UserRoundPlusIcon />
            Novo usuário
          </Button>
        }
      />
      {consulta.isError ? (
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      ) : (
        <div className="custom-scrollbar overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="bg-white/3 hover:bg-white/3">
                {['Nome', 'E-mail', 'Papel', 'Planos', 'Situação'].map((t) => (
                  <TableHead key={t} className="px-4 text-[11px] font-semibold tracking-widest uppercase">
                    {t}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.isPending ? (
                <TableRow>
                  <TableCell colSpan={5} className="px-4 py-4">
                    <Skeleton className="h-20" />
                  </TableCell>
                </TableRow>
              ) : (
                consulta.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="px-4 font-medium text-white">{u.nome}</TableCell>
                    <TableCell className="px-4 text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="px-4">{PAPEL[u.papel]}</TableCell>
                    <TableCell className="px-4">
                      {u.papel === 'operador' ? (
                        <div className="flex flex-wrap gap-1">
                          {u.canais.map((o) => (
                            <CanalBadge key={o} canal={CANAL_DA_ORIGEM[o]} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">os dois (papel sem restrição)</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4">
                      <StatusBadge status={u.ativo ? 'Ativo' : 'Inativo'} tom={u.ativo ? 'sucesso' : 'encerrado'} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <DialogoNovoUsuario aberto={criando} aoMudar={setCriando} />
    </>
  );
}

const formulario = z
  .object({
    nome: z.string().trim().min(3, 'informe o nome'),
    email: z.string().trim().email('e-mail inválido'),
    senha: z.string().min(12, 'mínimo de 12 caracteres'),
    papel: z.enum(['admin', 'operador', 'auditor']),
    canais: z.array(z.enum(['plataforma_credor', 'lead_proprio'])),
  })
  .refine((v) => v.papel !== 'operador' || v.canais.length > 0, {
    path: ['canais'],
    message: 'operador precisa de ao menos um plano',
  });

type Formulario = z.infer<typeof formulario>;

function DialogoNovoUsuario({ aberto, aoMudar }: { aberto: boolean; aoMudar: (a: boolean) => void }) {
  const queryClient = useQueryClient();
  const form = useForm<Formulario>({
    resolver: zodResolver(formulario),
    defaultValues: { nome: '', email: '', senha: '', papel: 'operador', canais: [] },
  });
  const papel = form.watch('papel');
  const criar = useMutation({
    mutationFn: (v: Formulario) =>
      exigir(api.POST('/api/usuarios', { body: { ...v, canais: v.papel === 'operador' ? v.canais : [] } })),
    onSuccess: (u) => {
      toast.success(`Conta de ${u.nome} criada.`);
      form.reset();
      aoMudar(false);
      void queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>Entregue a senha inicial à pessoa por um canal seguro.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => criar.mutate(v))} noValidate className="space-y-4">
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.nome}>
              <FieldLabel htmlFor="u-nome">Nome</FieldLabel>
              <Input id="u-nome" aria-invalid={!!form.formState.errors.nome} {...form.register('nome')} />
              <FieldError errors={[form.formState.errors.nome]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.email}>
              <FieldLabel htmlFor="u-email">E-mail</FieldLabel>
              <Input id="u-email" type="email" aria-invalid={!!form.formState.errors.email} {...form.register('email')} />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.senha}>
              <FieldLabel htmlFor="u-senha">Senha inicial</FieldLabel>
              <Input id="u-senha" type="password" autoComplete="new-password" aria-invalid={!!form.formState.errors.senha} {...form.register('senha')} />
              <FieldDescription>Mínimo de 12 caracteres.</FieldDescription>
              <FieldError errors={[form.formState.errors.senha]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-papel">Papel</FieldLabel>
              <Controller
                control={form.control}
                name="papel"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="u-papel" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operador">Operador — trabalha nos planos escolhidos</SelectItem>
                      <SelectItem value="auditor">Auditor — vê tudo, não altera nada</SelectItem>
                      <SelectItem value="admin">Administrador — acesso total</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            {papel === 'operador' ? (
              <FieldSet data-invalid={!!form.formState.errors.canais}>
                <FieldLegend variant="label">Planos</FieldLegend>
                <FieldDescription>Um operador de um plano não enxerga o outro.</FieldDescription>
                <Controller
                  control={form.control}
                  name="canais"
                  render={({ field }) => (
                    <FieldGroup data-slot="checkbox-group" className="gap-3">
                      {(
                        [
                          ['plataforma_credor', 'Plano A · Recuperação'],
                          ['lead_proprio', 'Plano B · Aquisição'],
                        ] as const
                      ).map(([origem, rotulo]) => (
                        <Field key={origem} orientation="horizontal">
                          <Checkbox
                            id={`canal-${origem}`}
                            checked={field.value.includes(origem)}
                            onCheckedChange={(marcado) =>
                              field.onChange(marcado ? [...field.value, origem] : field.value.filter((c) => c !== origem))
                            }
                          />
                          <FieldLabel htmlFor={`canal-${origem}`} className="font-normal">
                            {rotulo}
                          </FieldLabel>
                        </Field>
                      ))}
                    </FieldGroup>
                  )}
                />
                <FieldError errors={[form.formState.errors.canais]} />
              </FieldSet>
            ) : null}
          </FieldGroup>
          {criar.error ? (
            <Alert variant="destructive">
              <AlertDescription>{criar.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => aoMudar(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? <Spinner /> : <PlusIcon />}
              Criar conta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
