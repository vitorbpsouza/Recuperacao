import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPinIcon, SendIcon } from 'lucide-react';
import { useState } from 'react';

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Spinner } from '@workspace/ui/components/spinner';
import { toast } from '@workspace/ui/lib/toast';

import { api, exigir, recuperadoresQuery, type Recuperador } from '@/lib/api.ts';

interface CasoParaDistribuir {
  id: string;
  placa: string;
  cidade: string | null;
  recuperadorId: string | null;
}

/**
 * Ordem de sugestão: quem atua na cidade do caso primeiro, depois o score.
 * A regra é simples e visível na tela — o motivo da sugestão aparece ao lado
 * do nome. A distribuição v2 (distância real, capacidade) vem na Fase 2a.
 */
export const ordenarCandidatos = (recuperadores: Recuperador[], cidade: string | null) =>
  recuperadores
    .filter((r) => r.status === 'Ativo')
    .map((r) => ({ ...r, local: cidade ? r.cidades.includes(cidade) : false }))
    .sort((x, y) => Number(y.local) - Number(x.local) || y.score - x.score);

export function DialogoDistribuir({
  caso,
  aberto,
  aoMudar,
}: {
  caso: CasoParaDistribuir;
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const recuperadores = useQuery({ ...recuperadoresQuery, enabled: aberto });
  const candidatos = ordenarCandidatos(recuperadores.data ?? [], caso.cidade);
  const [escolhido, setEscolhido] = useState<string | undefined>(undefined);
  const [horas, setHoras] = useState(24);
  const [dias, setDias] = useState(10);
  const recuperadorId = escolhido ?? candidatos.find((c) => c.id !== caso.recuperadorId)?.id;

  const distribuir = useMutation({
    mutationFn: () =>
      exigir(
        api.POST('/api/casos/{id}/distribuir', {
          params: { path: { id: caso.id } },
          body: { recuperadorId: recuperadorId!, horasParaAceite: horas, diasDePrazo: dias },
        }),
      ),
    onSuccess: () => {
      toast.success(`Caso ${caso.placa} distribuído.`);
      aoMudar(false);
      void queryClient.invalidateQueries({ queryKey: ['caso', caso.id] });
      void queryClient.invalidateQueries({ queryKey: ['casos'] });
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Distribuir para campo</DialogTitle>
          <DialogDescription>
            O recuperador tem um prazo para aceitar; vencido, o caso volta para a fila. O prazo máximo é o da retomada.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="recuperador">Recuperador</FieldLabel>
            <Select value={recuperadorId} onValueChange={setEscolhido}>
              <SelectTrigger id="recuperador" className="w-full">
                <SelectValue placeholder={recuperadores.isPending ? 'Carregando…' : 'Escolha um recuperador'} />
              </SelectTrigger>
              <SelectContent>
                {candidatos.map((r) => (
                  <SelectItem key={r.id} value={r.id} disabled={r.id === caso.recuperadorId}>
                    <span className="font-medium">{r.nome}</span>
                    <span className="text-muted-foreground">
                      {r.local ? ' · atua em ' + caso.cidade : ''} · score {r.score}
                      {r.id === caso.recuperadorId ? ' · atual' : ''}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {caso.cidade ? (
              <FieldDescription className="flex items-center gap-1">
                <MapPinIcon className="size-3" aria-hidden />
                Sugestão: quem atua em {caso.cidade} primeiro, depois o maior score.
              </FieldDescription>
            ) : null}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="horas">Prazo de aceite (horas)</FieldLabel>
              <Input id="horas" type="number" min={1} max={168} value={horas} onChange={(e) => setHoras(Number(e.target.value))} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dias">Prazo máximo (dias)</FieldLabel>
              <Input id="dias" type="number" min={1} max={180} value={dias} onChange={(e) => setDias(Number(e.target.value))} />
            </Field>
          </div>
        </FieldGroup>
        {distribuir.error ? (
          <Alert variant="destructive">
            <AlertDescription>{distribuir.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => aoMudar(false)}>
            Cancelar
          </Button>
          <Button onClick={() => distribuir.mutate()} disabled={!recuperadorId || distribuir.isPending}>
            {distribuir.isPending ? <Spinner /> : <SendIcon />}
            Distribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
