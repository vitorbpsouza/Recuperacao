/**
 * Eventos ao vivo da API (SSE em /api/eventos). Cada evento recarrega o que
 * ele muda — a ficha do caso, a lista do plano e os painéis — e os que pedem
 * ação viram aviso: recall do credor, volta à fila, prazo vencido.
 *
 * Quem fez a mudança não recebe aviso dela (já viu na tela); os outros sim.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import type { EventoAoVivo } from '@workspace/domain';
import { toast } from '@workspace/ui/lib/toast';

import { CANAL_DA_ORIGEM, type UsuarioSessao } from './api.ts';

interface Aviso {
  tipo: 'error' | 'warning' | 'info' | 'success';
  titulo: string;
  descricao: string;
}

const PRAZO: Record<string, Omit<Aviso, 'titulo'> & { titulo: (placa: string) => string }> = {
  maximo: {
    tipo: 'warning',
    titulo: (p) => `${p}: prazo máximo vencido`,
    descricao: 'O caso segue em campo além do prazo do recuperador. Redistribua ou renove o prazo.',
  },
  purga: {
    tipo: 'info',
    titulo: (p) => `${p}: purga da mora encerrada`,
    descricao: 'O bem já pode ser entregue ao credor.',
  },
  notificacao_extrajudicial: {
    tipo: 'info',
    titulo: (p) => `${p}: 20 dias da notificação`,
    descricao: 'Confira se houve pagamento e peça a averbação da consolidação.',
  },
};

/** O aviso que o evento merece, ou nenhum. */
export const avisoDoEvento = (e: EventoAoVivo): Aviso | null => {
  if (e.tipo === 'prazo_vencido') {
    const p = e.prazo ? PRAZO[e.prazo] : undefined;
    return p ? { tipo: p.tipo, titulo: p.titulo(e.placa), descricao: p.descricao } : null;
  }
  if (e.tipo !== 'status_alterado') return null;
  if (e.statusPara === 'Removido pelo Banco') {
    return {
      tipo: 'error',
      titulo: `Recall do credor: ${e.placa}`,
      descricao: 'O caso saiu da operação e os links de campo foram revogados. Não retome o bem.',
    };
  }
  if (e.statusPara === 'Curado') {
    return { tipo: 'success', titulo: `${e.placa} curado`, descricao: 'Pagamento ou acordo: o caso saiu de campo.' };
  }
  if (e.automatico && e.prazo === 'aceite') {
    return {
      tipo: 'warning',
      titulo: `${e.placa} voltou para ${e.statusPara === 'Pronto para Campo' ? 'a fila' : 'análise'}`,
      descricao: 'O recuperador não aceitou no prazo.',
    };
  }
  return null;
};

export function useEventosAoVivo(sessao: UsuarioSessao) {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    let fonte: EventSource | null = null;
    let religar: ReturnType<typeof setTimeout> | undefined;

    const aoEvento = (msg: MessageEvent<string>) => {
      let e: EventoAoVivo;
      try {
        e = JSON.parse(msg.data) as EventoAoVivo;
      } catch {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['caso', e.casoId] });
      void queryClient.invalidateQueries({ queryKey: ['casos', e.origem] });
      void queryClient.invalidateQueries({ queryKey: ['painel'] });

      if (e.usuarioId === sessao.id) return;
      const aviso = avisoDoEvento(e);
      if (!aviso) return;
      const canal = CANAL_DA_ORIGEM[e.origem];
      toast[aviso.tipo](aviso.titulo, {
        description: aviso.descricao,
        duration: aviso.tipo === 'error' ? Number.POSITIVE_INFINITY : 10_000,
        action: {
          label: 'Abrir caso',
          onClick: () =>
            void router.navigate(
              canal === 'a'
                ? { to: '/a/casos/$casoId', params: { casoId: e.casoId } }
                : { to: '/b/casos/$casoId', params: { casoId: e.casoId } },
            ),
        },
      });
    };

    const conectar = () => {
      fonte = new EventSource('/api/eventos');
      fonte.addEventListener('caso', aoEvento);
      // Erro de rede: o navegador religa sozinho. Fechada (401, 503): tenta
      // de novo mais tarde — sessão expirada as outras chamadas já tratam.
      fonte.onerror = () => {
        if (fonte?.readyState !== EventSource.CLOSED) return;
        fonte.close();
        religar = setTimeout(conectar, 30_000);
      };
    };
    conectar();

    return () => {
      clearTimeout(religar);
      fonte?.close();
    };
  }, [queryClient, router, sessao.id]);
}
