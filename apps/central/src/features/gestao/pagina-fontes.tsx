import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon, InboxIcon } from 'lucide-react';

import { CanalBadge } from '@workspace/ui/brand/canal-badge';
import { InfoTooltip } from '@workspace/ui/brand/info-tooltip';
import { Rotulo } from '@workspace/ui/brand/rotulo';
import { Card } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { fontesQuery } from '@/lib/api.ts';

const INGESTAO: Record<string, string> = {
  Manual: 'Cadastro manual',
  Exportação: 'Arquivo exportado pela fonte',
  API: 'Integração por API oferecida pela fonte',
};

/**
 * De onde cada caso vem e o limite de finalidade que a fonte impõe. Os
 * contratos por credor (honorários, SLA, ritos) chegam na Fase 2b.
 */
export function PaginaFontes() {
  const consulta = useQuery(fontesQuery);
  return (
    <>
      <CabecalhoDePagina
        titulo="Fontes e credores"
        descricao="Origem de cada carteira e o que se pode fazer com o dado que ela entrega."
      />
      {consulta.isError ? (
        <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {consulta.isPending
            ? Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)
            : consulta.data.map((f) => (
                <Card key={f.id} className="gap-4 px-6 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-white/5 text-blue-300 ring-1 ring-white/5">
                        <InboxIcon className="size-5" aria-hidden />
                      </span>
                      <div>
                        <p className="font-bold text-white">{f.nome}</p>
                        <p className="text-xs text-muted-foreground">{f.tipo}</p>
                      </div>
                    </div>
                    <CanalBadge canal={f.finalidadePermitida === 'recuperacao_para_credor' ? 'a' : 'b'} />
                  </div>
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Rotulo>Ingestão</Rotulo>
                        <InfoTooltip text="Manual e exportação respeitam qualquer termo de uso; API só quando a fonte oferece." />
                      </div>
                      <p className="text-white">{INGESTAO[f.ingestao] ?? f.ingestao}</p>
                    </div>
                    <div className="space-y-1">
                      <Rotulo>Finalidade permitida</Rotulo>
                      <p className="text-white">
                        {f.finalidadePermitida === 'recuperacao_para_credor' ? 'Recuperação para o credor' : 'Aquisição com quitação'}
                      </p>
                    </div>
                  </div>
                  {f.termoDeUsoUrl ? (
                    <a
                      href={f.termoDeUsoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-300 hover:underline"
                    >
                      Termo de uso da fonte
                      <ExternalLinkIcon className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </Card>
              ))}
        </div>
      )}
    </>
  );
}
