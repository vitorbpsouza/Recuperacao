/**
 * Eventos ao vivo (SSE). A central abre um EventSource em /api/eventos e
 * recebe cada evento da linha do tempo do tenant e dos canais da sessão:
 * recall, volta à fila por aceite vencido, purga encerrada, distribuição.
 *
 * A conexão fecha sozinha depois de alguns minutos e o navegador reabre:
 * assim a sessão é conferida de novo e uma sessão revogada para de receber.
 */
import type { FastifyPluginAsync } from 'fastify';

import { eventoVisivel, type EventoAoVivo } from '@workspace/domain';

import type { Barramento } from '../tempo-real.ts';

export interface OpcoesEventos {
  barramento: Barramento | null;
  /** Tempo máximo de uma conexão antes de forçar a reconexão. */
  duracaoMs?: number;
  /** Intervalo do comentário que mantém proxies sem fechar a conexão. */
  pulsoMs?: number;
}

export const rotasEventos: FastifyPluginAsync<OpcoesEventos> = async (
  app,
  { barramento, duracaoMs = 10 * 60_000, pulsoMs = 25_000 },
) => {
  const abertas = new Set<() => void>();
  // Sem isto, o app.close() esperaria cada conexão aberta terminar.
  app.addHook('preClose', async () => {
    for (const encerrar of abertas) encerrar();
  });

  app.get('/eventos', { schema: { hide: true } }, async (req, reply) => {
    if (!barramento) return reply.code(503).send({ erro: 'eventos ao vivo indisponíveis' });
    const ctx = req.contexto;
    if (!ctx) return reply.code(401).send({ erro: 'autenticação obrigatória' });

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // nginx (Easypanel) não segura o stream em buffer.
      'x-accel-buffering': 'no',
    });
    res.write('retry: 5000\n\n');

    const cancelar = barramento.assinar((evento) => {
      if (!eventoVisivel(evento, ctx)) return;
      const { tenantId: _tenant, ...visivel } = evento;
      const dados: EventoAoVivo = visivel;
      res.write(`id: ${dados.id}\nevent: caso\ndata: ${JSON.stringify(dados)}\n\n`);
    });
    const pulso = setInterval(() => res.write(': pulso\n\n'), pulsoMs);
    const limite = setTimeout(() => encerrar(), duracaoMs);

    let encerrada = false;
    const encerrar = () => {
      if (encerrada) return;
      encerrada = true;
      cancelar();
      clearInterval(pulso);
      clearTimeout(limite);
      abertas.delete(encerrar);
      res.end();
    };
    abertas.add(encerrar);
    req.raw.on('close', encerrar);
  });
};
