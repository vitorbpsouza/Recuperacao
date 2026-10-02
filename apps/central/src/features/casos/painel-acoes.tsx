import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlertIcon, ShieldAlertIcon } from 'lucide-react';
import { useState } from 'react';

import {
  EXIGEM_MOTIVO,
  MODALIDADES_DO_RITO,
  ROTULO_MODALIDADE,
  resistenciaEntrada,
  transicaoEntrada,
  type ModalidadeRetomada,
  type Rito,
} from '@workspace/domain';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Checkbox } from '@workspace/ui/components/checkbox';
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
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { toast } from '@workspace/ui/lib/toast';

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { acoesQuery, api, exigir, pode, type CasoDetalhe, type UsuarioSessao } from '@/lib/api.ts';

/** Depois de mudar o caso, tudo que depende dele se refaz. */
export const useAtualizarCaso = (casoId: string) => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['caso', casoId] });
    void queryClient.invalidateQueries({ queryKey: ['casos'] });
  };
};

/**
 * Próximos passos do caso do Plano A. A lista e os motivos de bloqueio vêm do
 * banco — a mesma função que recusa a mudança —, então a tela nunca oferece o
 * que o servidor negaria.
 */
export function PainelAcoes({
  caso,
  rito,
  sessao,
  aoDistribuir,
}: {
  caso: CasoDetalhe;
  rito: Rito | null;
  sessao: UsuarioSessao;
  aoDistribuir: () => void;
}) {
  const consulta = useQuery(acoesQuery(caso.id));
  const [destino, setDestino] = useState<string | null>(null);
  const [resistencia, setResistencia] = useState(false);
  const escreve = pode.escrever(sessao);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-white">Próximos passos</CardTitle>
        <CardDescription>O que o caso pode fazer agora e, se não pode, o que falta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {consulta.isPending ? (
          <Skeleton className="h-32" />
        ) : consulta.isError ? (
          <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
        ) : consulta.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Caso encerrado: não há mais passos.</p>
        ) : (
          consulta.data.map((a) => (
            <div key={a.para} className="space-y-1.5">
              <Button
                variant={a.pendencias.length ? 'outline' : 'secondary'}
                size="sm"
                className="w-full justify-start"
                disabled={!escreve || a.pendencias.length > 0}
                onClick={() => (a.para === 'Distribuído' ? aoDistribuir() : setDestino(a.para))}
              >
                {a.rotulo}
              </Button>
              {a.pendencias.length ? (
                <ul className="space-y-1 pl-1">
                  {a.pendencias.map((p) => (
                    <li key={p} className="flex gap-1.5 text-xs text-amber-300">
                      <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
        {escreve && caso.status === 'Localizado' ? (
          <Button variant="outline" size="sm" className="w-full justify-start text-red-300" onClick={() => setResistencia(true)}>
            <ShieldAlertIcon />
            Registrar resistência
          </Button>
        ) : null}
      </CardContent>
      {destino ? (
        <DialogoTransicao casoId={caso.id} para={destino} rito={rito} aoFechar={() => setDestino(null)} />
      ) : null}
      {resistencia ? <DialogoResistencia casoId={caso.id} rito={rito} aoFechar={() => setResistencia(false)} /> : null}
    </Card>
  );
}

/** Data e hora local para o campo datetime-local. */
const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function DialogoTransicao({
  casoId,
  para,
  rito,
  aoFechar,
}: {
  casoId: string;
  para: string;
  rito: Rito | null;
  aoFechar: () => void;
}) {
  const atualizar = useAtualizarCaso(casoId);
  const modalidades = rito ? MODALIDADES_DO_RITO[rito] : (['entrega_voluntaria'] as const);
  const [em, setEm] = useState(agoraLocal());
  const [modalidade, setModalidade] = useState<ModalidadeRetomada>(modalidades[0]!);
  const [comprovante, setComprovante] = useState('');
  const [conduta, setConduta] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [local, setLocal] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});

  const exigeMotivo = (EXIGEM_MOTIVO as readonly string[]).includes(para);

  const corpo = () => {
    if (para === 'Retomado') {
      return { para, em: new Date(em).toISOString(), modalidade, comprovante, condutaConforme: conduta || undefined };
    }
    if (para === 'Em Custódia') return { para, local };
    if (exigeMotivo) return { para, motivo };
    return { para };
  };

  const mudar = useMutation({
    mutationFn: (b: ReturnType<typeof transicaoEntrada.parse>) =>
      exigir(api.POST('/api/casos/{id}/transicao', { params: { path: { id: casoId } }, body: b })),
    onSuccess: ({ status }) => {
      toast.success(`Caso em "${status}".`);
      atualizar();
      aoFechar();
    },
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = transicaoEntrada.safeParse(corpo());
    if (!r.success) {
      setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    if (para === 'Retomado' && modalidade === 'apreensao_extrajudicial' && !conduta) {
      setErros({ condutaConforme: 'obrigatório na apreensão extrajudicial' });
      return;
    }
    setErros({});
    mudar.mutate(r.data);
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Levar o caso a "{para}"</DialogTitle>
          <DialogDescription>Fica na linha do tempo, com seu usuário e a hora do servidor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          {para === 'Retomado' ? (
            <>
              <Field data-invalid={!!erros.em}>
                <FieldLabel htmlFor="em">Quando</FieldLabel>
                <Input id="em" type="datetime-local" value={em} onChange={(e) => setEm(e.target.value)} />
                <FieldDescription>Hora da apreensão ou da entrega: é dela que corre o prazo de purga.</FieldDescription>
                <FieldError>{erros.em}</FieldError>
              </Field>
              <Field>
                <FieldLabel>Modalidade</FieldLabel>
                <Select value={modalidade} onValueChange={(v) => setModalidade(v as ModalidadeRetomada)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modalidades.map((m) => (
                      <SelectItem key={m} value={m}>
                        {ROTULO_MODALIDADE[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={!!erros.comprovante}>
                <FieldLabel htmlFor="comprovante">Comprovante</FieldLabel>
                <Input
                  id="comprovante"
                  value={comprovante}
                  onChange={(e) => setComprovante(e.target.value)}
                  placeholder="Auto de busca e apreensão, certidão ou termo de entrega"
                />
                <FieldError>{erros.comprovante}</FieldError>
              </Field>
              {modalidade === 'apreensao_extrajudicial' ? (
                <Field orientation="horizontal" data-invalid={!!erros.condutaConforme}>
                  <Checkbox id="conduta" checked={conduta} onCheckedChange={(v) => setConduta(v === true)} />
                  <FieldLabel htmlFor="conduta" className="font-normal">
                    Declaro que a apreensão foi feita sem violência, sem ingresso em domicílio e sem expor o devedor (STF, ADIs 7600, 7601 e 7608).
                  </FieldLabel>
                  <FieldError>{erros.condutaConforme}</FieldError>
                </Field>
              ) : null}
            </>
          ) : para === 'Em Custódia' ? (
            <Field data-invalid={!!erros.local}>
              <FieldLabel htmlFor="local">Pátio</FieldLabel>
              <Input id="local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Nome e cidade do pátio" />
              <FieldError>{erros.local}</FieldError>
            </Field>
          ) : exigeMotivo ? (
            <Field data-invalid={!!erros.motivo}>
              <FieldLabel htmlFor="motivo">Motivo</FieldLabel>
              <Textarea id="motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <FieldDescription>Vai para a linha do tempo do caso. Seja específico: o texto é auditável.</FieldDescription>
              <FieldError>{erros.motivo}</FieldError>
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">Confirma a mudança?</p>
          )}
          {mudar.error ? (
            <Alert variant="destructive">
              <AlertDescription>{mudar.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mudar.isPending}>
              {mudar.isPending ? <Spinner /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoResistencia({ casoId, rito, aoFechar }: { casoId: string; rito: Rito | null; aoFechar: () => void }) {
  const atualizar = useAtualizarCaso(casoId);
  const [relato, setRelato] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const registrar = useMutation({
    mutationFn: () => exigir(api.POST('/api/casos/{id}/resistencia', { params: { path: { id: casoId } }, body: { relato } })),
    onSuccess: ({ status }) => {
      toast.success(`Resistência registrada. Caso em "${status}".`);
      atualizar();
      aoFechar();
    },
  });
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resistência na abordagem</DialogTitle>
          <DialogDescription>
            {rito === 'judicial'
              ? 'A retomada é abortada e o caso volta a campo, para o oficial de justiça agir.'
              : 'A retomada é abortada e o caso converte para o rito judicial: sem violência e sem ingresso em domicílio, só com ordem do juiz.'}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = resistenciaEntrada.safeParse({ relato });
            if (!r.success) return setErro(r.error.issues[0]?.message ?? 'relato inválido');
            setErro(null);
            registrar.mutate();
          }}
        >
          <Field data-invalid={!!erro}>
            <FieldLabel htmlFor="relato">O que aconteceu</FieldLabel>
            <Textarea id="relato" rows={4} value={relato} onChange={(e) => setRelato(e.target.value)} />
            <FieldError>{erro}</FieldError>
          </Field>
          {registrar.error ? (
            <Alert variant="destructive">
              <AlertDescription>{registrar.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={registrar.isPending}>
              {registrar.isPending ? <Spinner /> : null}
              Registrar resistência
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
