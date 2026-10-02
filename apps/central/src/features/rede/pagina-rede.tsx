import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPinIcon, MedalIcon, PlusIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { InfoTooltip } from '@workspace/ui/brand/info-tooltip';
import { Rotulo } from '@workspace/ui/brand/rotulo';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
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
import { InputGroup, InputGroupAddon, InputGroupInput } from '@workspace/ui/components/input-group';
import { Progress } from '@workspace/ui/components/progress';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { formatarData, iniciais } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, exigir, pode, recuperadoresQuery, type UsuarioSessao } from '@/lib/api.ts';

const TOM_DO_STATUS = { Ativo: 'sucesso', Inativo: 'encerrado', Suspenso: 'perigo' } as const;

/**
 * Rede de campo do Plano A. Score e taxa vêm do cadastro; tempos de aceite e
 * conclusão aparecem quando a linha do tempo tiver eventos suficientes para
 * calculá-los (Fase 2a) — sem número de enfeite até lá.
 */
export function PaginaRede({ sessao }: { sessao: UsuarioSessao }) {
  const consulta = useQuery(recuperadoresQuery);
  const [busca, setBusca] = useState('');
  const [cadastrando, setCadastrando] = useState(false);
  const termo = busca.trim().toLowerCase();
  const lista = (consulta.data ?? []).filter(
    (r) => !termo || r.nome.toLowerCase().includes(termo) || r.cidades.some((c) => c.toLowerCase().includes(termo)),
  );
  const podio = (consulta.data ?? []).filter((r) => r.status === 'Ativo').slice(0, 3);

  return (
    <>
      <CabecalhoDePagina
        titulo="Rede de campo"
        descricao="Recuperadores credenciados, cobertura por cidade e desempenho."
        acoes={
          pode.administrar(sessao) ? (
            <Button onClick={() => setCadastrando(true)}>
              <PlusIcon />
              Novo recuperador
            </Button>
          ) : null
        }
      />
      {consulta.isError ? (
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {consulta.isPending
              ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)
              : podio.map((r, i) => (
                  <Card key={r.id} className="relative items-center gap-3 px-6 py-6 text-center">
                    <MedalIcon
                      className={['absolute top-4 right-4 size-7', ['text-amber-400', 'text-slate-300', 'text-amber-700'][i]].join(' ')}
                      aria-label={`${i + 1}º lugar`}
                    />
                    <span className="flex size-16 items-center justify-center rounded-2xl bg-slate-800 text-xl font-bold text-white ring-2 ring-info/30">
                      {iniciais(r.nome)}
                    </span>
                    <div>
                      <p className="font-bold text-white">{r.nome}</p>
                      <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <MapPinIcon className="size-3" aria-hidden />
                        {r.cidades[0] ?? 'sem cidade'}
                      </p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white/5 p-2">
                        <Rotulo>Score</Rotulo>
                        <p className="mt-1 text-lg font-bold text-blue-300 tabular-nums">{r.score}</p>
                      </div>
                      <div className="rounded-lg bg-white/5 p-2">
                        <Rotulo>Taxa</Rotulo>
                        <p className="mt-1 text-lg font-bold text-emerald-300 tabular-nums">{r.taxaRecuperacao}%</p>
                      </div>
                    </div>
                  </Card>
                ))}
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
            <InputGroup className="h-9 flex-1">
              <InputGroupAddon>
                <SearchIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou cidade…" aria-label="Buscar recuperador" />
            </InputGroup>
            <span className="text-xs text-muted-foreground tabular-nums">{lista.length} recuperador(es)</span>
          </div>

          <div className="custom-scrollbar overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-white/3 hover:bg-white/3">
                  <TableHead className="px-4 text-[11px] font-semibold tracking-widest uppercase">Recuperador</TableHead>
                  <TableHead className="px-4 text-[11px] font-semibold tracking-widest uppercase">Cidades</TableHead>
                  <TableHead className="px-4 text-[11px] font-semibold tracking-widest uppercase">
                    <span className="inline-flex items-center gap-1">
                      Score
                      <InfoTooltip text="Pontuação de 0 a 100 do cadastro do recuperador." />
                    </span>
                  </TableHead>
                  <TableHead className="px-4 text-[11px] font-semibold tracking-widest uppercase">Taxa de recuperação</TableHead>
                  <TableHead className="px-4 text-[11px] font-semibold tracking-widest uppercase">Status</TableHead>
                  <TableHead className="px-4 text-[11px] font-semibold tracking-widest uppercase">Desde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consulta.isPending
                  ? Array.from({ length: 4 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6} className="px-4 py-4">
                          <Skeleton className="h-6" />
                        </TableCell>
                      </TableRow>
                    ))
                  : lista.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="w-6 text-xs font-bold text-muted-foreground tabular-nums">#{i + 1}</span>
                            <div>
                              <p className="font-semibold text-white">{r.nome}</p>
                              <p className="text-xs text-muted-foreground">{r.telefone ?? 'sem telefone'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex flex-wrap gap-1">
                            {r.cidades.map((c) => (
                              <Badge key={c} variant="secondary">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center gap-2">
                            <span className="w-8 font-bold text-blue-300 tabular-nums">{r.score}</span>
                            <Progress value={r.score} className="h-1.5 w-20" aria-label={`Score ${r.score}`} />
                          </div>
                        </TableCell>
                        <TableCell className="px-4 font-semibold text-emerald-300 tabular-nums">{r.taxaRecuperacao}%</TableCell>
                        <TableCell className="px-4">
                          <StatusBadge status={r.status} tom={TOM_DO_STATUS[r.status]} />
                        </TableCell>
                        <TableCell className="px-4 text-muted-foreground tabular-nums">{formatarData(r.dataCadastro)}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
            {!consulta.isPending && lista.length === 0 ? (
              <Empty className="border-0 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon />
                  </EmptyMedia>
                  <EmptyTitle>Nenhum recuperador encontrado</EmptyTitle>
                  <EmptyDescription>Ajuste a busca ou cadastre um recuperador.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </div>
        </div>
      )}
      <DialogoNovoRecuperador aberto={cadastrando} aoMudar={setCadastrando} />
    </>
  );
}

const formulario = z.object({
  nome: z.string().trim().min(3, 'informe o nome completo'),
  documento: z.string().trim().optional(),
  telefone: z.string().trim().optional(),
  cidades: z.string().trim().min(2, 'informe ao menos uma cidade'),
});

function DialogoNovoRecuperador({ aberto, aoMudar }: { aberto: boolean; aoMudar: (a: boolean) => void }) {
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof formulario>>({
    resolver: zodResolver(formulario),
    defaultValues: { nome: '', documento: '', telefone: '', cidades: '' },
  });
  const criar = useMutation({
    mutationFn: (v: z.infer<typeof formulario>) =>
      exigir(
        api.POST('/api/recuperadores', {
          body: {
            nome: v.nome,
            documento: v.documento || undefined,
            telefone: v.telefone || undefined,
            cidades: v.cidades.split(',').map((c) => c.trim()).filter(Boolean),
            // Novo recuperador entra ativo e sem histórico: score e taxa começam em zero.
            status: 'Ativo',
            score: 0,
            taxaRecuperacao: 0,
          },
        }),
      ),
    onSuccess: () => {
      toast.success('Recuperador cadastrado.');
      form.reset();
      aoMudar(false);
      void queryClient.invalidateQueries({ queryKey: ['recuperadores'] });
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo recuperador</DialogTitle>
          <DialogDescription>Entra ativo, com score zero. Documentos e contrato chegam com o credenciamento (Fase 2a).</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => criar.mutate(v))} noValidate className="space-y-4">
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.nome}>
              <FieldLabel htmlFor="nome">Nome completo</FieldLabel>
              <Input id="nome" aria-invalid={!!form.formState.errors.nome} {...form.register('nome')} />
              <FieldError errors={[form.formState.errors.nome]} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="documento">CPF</FieldLabel>
                <Input id="documento" inputMode="numeric" {...form.register('documento')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="telefone">Telefone / WhatsApp</FieldLabel>
                <Input id="telefone" inputMode="tel" {...form.register('telefone')} />
              </Field>
            </div>
            <Field data-invalid={!!form.formState.errors.cidades}>
              <FieldLabel htmlFor="cidades">Cidades de atuação</FieldLabel>
              <Input id="cidades" placeholder="Belo Horizonte, Contagem" aria-invalid={!!form.formState.errors.cidades} {...form.register('cidades')} />
              <FieldDescription>Separadas por vírgula.</FieldDescription>
              <FieldError errors={[form.formState.errors.cidades]} />
            </Field>
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
              Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
