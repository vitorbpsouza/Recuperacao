import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardPasteIcon, SaveIcon } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

import { colarRelatorioEntrada, lerRelatorio, type PapelDoDossie } from '@workspace/domain';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@workspace/ui/components/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Spinner } from '@workspace/ui/components/spinner';
import { Textarea } from '@workspace/ui/components/textarea';
import { toast } from '@workspace/ui/lib/toast';

import { api, bureausQuery, exigir, pode, type ResumoImportacao, type UsuarioSessao } from '@/lib/api.ts';

import { faltaPapel, PreviaLeitura } from './previa-leitura.tsx';

export const BASES_LEGAIS = {
  execucao_contrato: 'Execução de contrato',
  legitimo_interesse: 'Legítimo interesse',
  obrigacao_legal: 'Obrigação legal',
  consentimento: 'Consentimento',
} as const;

const SEM_FORNECEDOR = '__nenhum__';

/** "12 campos do veículo, 9 contatos, 6 endereços, 3 passagens de radar." */
export const descreverResumo = (r: ResumoImportacao) =>
  [
    r.veiculo ? `${r.veiculo.campos.length} campo(s) do veículo` : null,
    r.pessoas.length ? `${r.pessoas.length} pessoa(s)` : null,
    r.contatos ? `${r.contatos} contato(s)` : null,
    r.enderecos ? `${r.enderecos} endereço(s)` : null,
    r.parentes ? `${r.parentes} parente(s)` : null,
    r.radares ? `${r.radares} passagem(ns) de radar no mapa` : null,
    r.extras ? `${r.extras} dado(s) extra(s)` : null,
    r.novos.length ? `${r.novos.length} campo(s) novo(s)` : null,
  ]
    .filter(Boolean)
    .join(', ');

/** Invalida tudo o que um texto colado pode ter mudado no caso. */
export const useAtualizarDepoisDeColar = () => {
  const queryClient = useQueryClient();
  return (casoId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['caso', casoId] });
    void queryClient.invalidateQueries({ queryKey: ['casos'] });
    void queryClient.invalidateQueries({ queryKey: ['painel'] });
    void queryClient.invalidateQueries({ queryKey: ['campos-novos'] });
  };
};

/**
 * Colar na ficha: o texto do fornecedor (veículo, radar ou dossiê) é lido aqui
 * para a prévia e lido de novo no servidor, que grava tudo.
 */
export function DialogoColar({
  casoId,
  placa,
  planoA,
  sessao,
  aoFechar,
  titulo = 'Colar dados do relatório',
}: {
  casoId: string;
  placa: string;
  planoA: boolean;
  sessao: UsuarioSessao;
  aoFechar: () => void;
  titulo?: string;
}) {
  const atualizar = useAtualizarDepoisDeColar();
  const bureaus = useQuery(bureausQuery);
  const [texto, setTexto] = useState('');
  const [papel, setPapel] = useState<PapelDoDossie | undefined>();
  const [bureauId, setBureauId] = useState(SEM_FORNECEDOR);
  const [baseLegal, setBaseLegal] = useState<keyof typeof BASES_LEGAIS>('execucao_contrato');
  const [justificativa, setJustificativa] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const adiado = useDeferredValue(texto);
  const leitura = useMemo(() => (adiado.trim().length >= 10 ? lerRelatorio(adiado) : null), [adiado]);
  const comFornecedor = bureauId !== SEM_FORNECEDOR;

  // O documento colado é o do devedor? O servidor responde sim ou não, sem revelar o do caso.
  const documentos = useMemo(() => (leitura?.pessoas ?? []).map((p) => p.documento).filter((d): d is string => !!d), [leitura]);
  const conferencia = useQuery({
    queryKey: ['caso', casoId, 'conferir-devedor', documentos],
    queryFn: () => exigir(api.POST('/api/casos/{id}/conferir-devedor', { params: { path: { id: casoId } }, body: { documentos } })),
    enabled: documentos.length > 0,
    staleTime: Infinity,
  });
  const devedorDoc = documentos.find((_, i) => conferencia.data?.iguais[i]) ?? null;

  const gravar = useMutation({
    mutationFn: (corpo: ReturnType<typeof colarRelatorioEntrada.parse>) =>
      exigir(api.POST('/api/casos/{id}/relatorios', { params: { path: { id: casoId } }, body: corpo })),
    onSuccess: (r) => {
      toast.success('Tudo guardado no caso.', { description: descreverResumo(r) });
      atualizar(casoId);
      aoFechar();
    },
  });

  const enviar = () => {
    const r = colarRelatorioEntrada.safeParse({
      texto,
      papelPessoa: papel,
      ...(comFornecedor ? { bureauId, baseLegal, justificativa } : {}),
    });
    if (!r.success) return setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path.at(-1)), i.message])));
    setErros({});
    gravar.mutate(r.data);
  };

  const outraPlaca = !!leitura?.veiculo?.placa && leitura.veiculo.placa !== placa;
  const bloqueado = !leitura || outraPlaca || faltaPapel(leitura, devedorDoc, papel) || gravar.isPending;

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="flex max-h-[94vh] flex-col gap-0 p-0 sm:max-w-[min(1500px,96vw)]">
        <DialogHeader className="border-b border-white/10 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPasteIcon className="size-5 text-blue-400" aria-hidden />
            {titulo}
          </DialogTitle>
          <DialogDescription>
            Cole o texto como veio: relatório do veículo, passagens de radar, dossiê da pessoa, ou tudo junto. Nada é descartado: o que
            não tiver campo próprio fica guardado no caso.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-white/10 p-6 lg:border-r">
            <Field data-invalid={!!erros.texto} className="flex min-h-0 flex-1 flex-col">
              <FieldLabel htmlFor="colar-texto">Texto do relatório</FieldLabel>
              <Textarea
                id="colar-texto"
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={'--- DADOS BÁSICOS ---\nNome: …\nCPF: …\n\n🚗 DADOS DO VEÍCULO 🚗\nPlaca: …'}
                className="field-sizing-fixed min-h-72 flex-1 resize-none font-mono text-xs lg:min-h-[50vh]"
              />
              <FieldDescription>{texto.length ? `${texto.length.toLocaleString('pt-BR')} caracteres` : 'Ctrl+V aqui.'}</FieldDescription>
              <FieldError>{erros.texto}</FieldError>
            </Field>

            <div className="space-y-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
              <Field>
                <FieldLabel>De onde veio</FieldLabel>
                <Select value={bureauId} onValueChange={setBureauId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_FORNECEDOR}>Texto colado (sem fornecedor informado)</SelectItem>
                    {(bureaus.data ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.nome} · {b.tipo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Com fornecedor contratado, a consulta entra na trilha de auditoria com custo, base legal e justificativa.
                </FieldDescription>
              </Field>
              {comFornecedor ? (
                <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                  <Field>
                    <FieldLabel>Base legal</FieldLabel>
                    <Select value={baseLegal} onValueChange={(b) => setBaseLegal(b as keyof typeof BASES_LEGAIS)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(BASES_LEGAIS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field data-invalid={!!erros.justificativa}>
                    <FieldLabel htmlFor="colar-just">Justificativa</FieldLabel>
                    <Textarea id="colar-just" rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
                    <FieldError>{erros.justificativa}</FieldError>
                  </Field>
                </div>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto p-6">
            <p className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">O que será gravado</p>
            {leitura ? (
              <PreviaLeitura
                leitura={leitura}
                devedorDoc={devedorDoc}
                papelEscolhido={papel}
                aoEscolherPapel={setPapel}
                sensivelVisivel={pode.verSensivel(sessao)}
                placaDoCaso={placa}
                planoA={planoA}
              />
            ) : (
              <p className="text-sm text-muted-foreground">A prévia aparece assim que você colar o texto.</p>
            )}
          </div>
        </div>
        <DialogFooter className="items-center border-t border-white/10 px-6 py-4">
          {gravar.error ? (
            <Alert variant="destructive" className="mr-auto py-2">
              <AlertDescription>{gravar.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={bloqueado}>
            {gravar.isPending ? <Spinner /> : <SaveIcon />}
            Gravar no caso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
