import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BanIcon, FileSignatureIcon, Landmark, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { novoCredorEntrada, novoMandatoEntrada } from '@workspace/domain';
import { InfoTooltip } from '@workspace/ui/brand/info-tooltip';
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
import { Field, FieldDescription, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { toast } from '@workspace/ui/lib/toast';

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, credoresQuery, exigir, pode, type Credor, type UsuarioSessao } from '@/lib/api.ts';

const dia = (d: string) => d.split('-').reverse().join('/');

/**
 * Credores e os mandatos que autorizam a ReCredita a localizar e retomar em
 * nome deles. Sem mandato vigente, caso extrajudicial ou amigável não vai a
 * campo — o banco recusa.
 */
export function SecaoCredores({ sessao }: { sessao: UsuarioSessao }) {
  const consulta = useQuery(credoresQuery);
  const [novoCredor, setNovoCredor] = useState(false);
  const [mandatoPara, setMandatoPara] = useState<Credor | null>(null);
  const admin = pode.administrar(sessao);

  return (
    <section className="mt-10 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            Credores e mandatos
            <InfoTooltip text="O mandato é o instrumento pelo qual o credor autoriza a ReCredita a agir em nome dele (DL 911/69, art. 8º-C). Exigido no rito extrajudicial e no amigável." />
          </h2>
          <p className="text-sm text-muted-foreground">Quem é dono dos bens e até quando a ReCredita pode agir por ele.</p>
        </div>
        {admin ? (
          <Button size="sm" onClick={() => setNovoCredor(true)}>
            <PlusIcon />
            Novo credor
          </Button>
        ) : null}
      </div>

      {consulta.isError ? (
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      ) : consulta.isPending ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {consulta.data.map((c) => (
            <Card key={c.id} className="gap-3 px-6 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                    <Landmark className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-white">{c.nome}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{c.cnpj ?? 'CNPJ não informado'}</p>
                  </div>
                </div>
                {admin ? (
                  <Button variant="outline" size="sm" onClick={() => setMandatoPara(c)}>
                    <FileSignatureIcon />
                    Mandato
                  </Button>
                ) : null}
              </div>
              {c.mandatos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem mandato registrado.</p>
              ) : (
                <ul className="space-y-2">
                  {c.mandatos.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={m.vigente ? 'secondary' : 'outline'}>{m.vigente ? 'vigente' : m.revogadoEm ? 'revogado' : 'fora da vigência'}</Badge>
                      <span className="text-white tabular-nums">
                        {dia(m.inicio)} a {dia(m.fim)}
                      </span>
                      <span className="text-muted-foreground">· {m.referencia}</span>
                      {admin && m.vigente ? <Revogar mandatoId={m.id} /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {novoCredor ? <DialogoCredor aoFechar={() => setNovoCredor(false)} /> : null}
      {mandatoPara ? <DialogoMandato credor={mandatoPara} aoFechar={() => setMandatoPara(null)} /> : null}
    </section>
  );
}

const useRecarregarCredores = () => {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['credores'] });
};

function Revogar({ mandatoId }: { mandatoId: string }) {
  const recarregar = useRecarregarCredores();
  const revogar = useMutation({
    mutationFn: () => exigir(api.POST('/api/mandatos/{id}/revogar', { params: { path: { id: mandatoId } } })),
    onSuccess: () => {
      toast.success('Mandato revogado.');
      recarregar();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button variant="ghost" size="xs" className="text-red-300" disabled={revogar.isPending} onClick={() => revogar.mutate()}>
      <BanIcon />
      Revogar
    </Button>
  );
}

function DialogoCredor({ aoFechar }: { aoFechar: () => void }) {
  const recarregar = useRecarregarCredores();
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const criar = useMutation({
    mutationFn: (corpo: { nome: string; cnpj?: string }) => exigir(api.POST('/api/credores', { body: corpo })),
    onSuccess: () => {
      toast.success('Credor cadastrado.');
      recarregar();
      aoFechar();
    },
  });
  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo credor</DialogTitle>
          <DialogDescription>Banco ou financeira dono dos contratos.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = novoCredorEntrada.safeParse({ nome, cnpj: cnpj || undefined });
            if (!r.success) return setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
            setErros({});
            criar.mutate(r.data);
          }}
        >
          <Field data-invalid={!!erros.nome}>
            <FieldLabel htmlFor="credor-nome">Nome</FieldLabel>
            <Input id="credor-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <FieldError>{erros.nome}</FieldError>
          </Field>
          <Field data-invalid={!!erros.cnpj}>
            <FieldLabel htmlFor="credor-cnpj">CNPJ</FieldLabel>
            <Input id="credor-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="Numérico ou alfanumérico" />
            <FieldDescription>Conferido pelo dígito verificador.</FieldDescription>
            <FieldError>{erros.cnpj}</FieldError>
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

function DialogoMandato({ credor, aoFechar }: { credor: Credor; aoFechar: () => void }) {
  const recarregar = useRecarregarCredores();
  const [v, setV] = useState({ inicio: '', fim: '', referencia: '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const criar = useMutation({
    mutationFn: (corpo: typeof v) => exigir(api.POST('/api/credores/{id}/mandatos', { params: { path: { id: credor.id } }, body: corpo })),
    onSuccess: () => {
      toast.success('Mandato registrado.');
      recarregar();
      aoFechar();
    },
  });
  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mandato de {credor.nome}</DialogTitle>
          <DialogDescription>Período em que a ReCredita pode localizar e retomar em nome do credor.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = novoMandatoEntrada.safeParse(v);
            if (!r.success) return setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
            setErros({});
            criar.mutate(r.data);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!erros.inicio}>
              <FieldLabel htmlFor="mandato-inicio">Início</FieldLabel>
              <Input id="mandato-inicio" type="date" value={v.inicio} onChange={(e) => setV({ ...v, inicio: e.target.value })} />
              <FieldError>{erros.inicio}</FieldError>
            </Field>
            <Field data-invalid={!!erros.fim}>
              <FieldLabel htmlFor="mandato-fim">Fim</FieldLabel>
              <Input id="mandato-fim" type="date" value={v.fim} onChange={(e) => setV({ ...v, fim: e.target.value })} />
              <FieldError>{erros.fim}</FieldError>
            </Field>
          </div>
          <Field data-invalid={!!erros.referencia}>
            <FieldLabel htmlFor="mandato-ref">Instrumento</FieldLabel>
            <Input
              id="mandato-ref"
              value={v.referencia}
              onChange={(e) => setV({ ...v, referencia: e.target.value })}
              placeholder="Número da procuração, cartório ou arquivo"
            />
            <FieldError>{erros.referencia}</FieldError>
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
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
