import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudDownloadIcon, CopyIcon, FileTextIcon, LockIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { formatarDataHora } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';

import { ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, exigir, pode, relatoriosColadosQuery, type RelatorioColado, type UsuarioSessao } from '@/lib/api.ts';

import { DialogoFinalidade } from './aba-pessoas.tsx';

const ROTULOS_RESUMO: Record<string, string> = {
  veiculo: 'veículo',
  pessoas: 'pessoa(s)',
  contatos: 'contato(s)',
  enderecos: 'endereço(s)',
  radares: 'radar',
  camposNovos: 'campo(s) novo(s)',
};

/** Cada texto colado ou consultado, como chegou. O original tem dado sensível: admin e gestor, com finalidade. */
export function AbaTextos({ casoId, sessao }: { casoId: string; sessao: UsuarioSessao }) {
  const queryClient = useQueryClient();
  const consulta = useQuery(relatoriosColadosQuery(casoId));
  const [escolhido, setEscolhido] = useState<RelatorioColado | null>(null);
  const [texto, setTexto] = useState<string | null>(null);

  const abrir = useMutation({
    mutationFn: (finalidade: string) =>
      exigir(
        api.POST('/api/casos/{id}/relatorios/{relatorioId}/texto', {
          params: { path: { id: casoId, relatorioId: escolhido!.id } },
          body: { finalidade },
        }),
      ),
    onSuccess: (r) => {
      setTexto(r.texto);
      void queryClient.invalidateQueries({ queryKey: ['caso', casoId, 'acessos'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-white">Textos colados e consultas</CardTitle>
        <CardDescription>O original de cada relatório fica guardado como chegou, sem alteração. Nada se apaga.</CardDescription>
      </CardHeader>
      <CardContent>
        {consulta.isPending ? (
          <Skeleton className="h-24" />
        ) : consulta.isError ? (
          <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
        ) : consulta.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum texto colado neste caso.</p>
        ) : (
          <ol className="space-y-2">
            {consulta.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                  {r.via === 'integracao' ? <CloudDownloadIcon className="size-4" aria-hidden /> : <FileTextIcon className="size-4" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">
                    {r.via === 'integracao' ? `Consulta ${r.fornecedor ?? ''}` : r.fornecedor ? `Relatório de ${r.fornecedor}` : 'Texto colado'}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {formatarDataHora(r.coladoEm)} · {r.usuarioNome ?? '—'} · {r.tamanho.toLocaleString('pt-BR')} caracteres
                    </span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.secoes.map((s, i) => (
                      <Badge key={`${s}${i}`} variant="outline" className="text-[11px] text-slate-300">
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {Object.entries(r.resumo)
                      .filter(([, v]) => typeof v === 'number' && v > 0)
                      .map(([k, v]) => (k === 'veiculo' ? 'veículo' : `${v} ${ROTULOS_RESUMO[k] ?? k}`))
                      .join(' · ') || 'nada reconhecido'}
                  </p>
                </div>
                {pode.verSensivel(sessao) ? (
                  <Button variant="outline" size="sm" onClick={() => setEscolhido(r)}>
                    <LockIcon />
                    Ver original
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <DialogoFinalidade
        aberto={!!escolhido && texto === null}
        aoFechar={() => setEscolhido(null)}
        aoConfirmar={(f) => abrir.mutate(f)}
        enviando={abrir.isPending}
        erro={abrir.error?.message}
        sensivel
        titulo="Ver o texto original"
      />
      <Dialog
        open={texto !== null}
        onOpenChange={(a) => {
          if (!a) {
            setTexto(null);
            setEscolhido(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[min(1100px,94vw)]">
          <DialogHeader>
            <DialogTitle>Texto original</DialogTitle>
            <DialogDescription>Como chegou, sem alteração. O acesso foi registrado.</DialogDescription>
          </DialogHeader>
          <pre className="custom-scrollbar min-h-0 flex-1 overflow-auto rounded-lg bg-black/40 p-4 font-mono text-xs whitespace-pre-wrap text-slate-200">
            {texto}
          </pre>
          <Button
            variant="outline"
            className="self-end"
            onClick={() => void navigator.clipboard.writeText(texto ?? '').then(() => toast.success('Copiado.'))}
          >
            <CopyIcon />
            Copiar
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
