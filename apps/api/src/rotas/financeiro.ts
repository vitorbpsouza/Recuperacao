import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { schema } from '@workspace/db';

import { exigirPapel } from '../auth/plugin.ts';
import * as c from '../contratos.ts';

const { ativo, caso, recuperador, repasse } = schema;

/** Repasses à rede de campo. O RLS limita ao Plano A: só ele tem trabalho de campo. */
export const rotasFinanceiro: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/repasses',
    { schema: { tags: ['financeiro'], response: { 200: z.array(c.repasse) } } },
    async (req) =>
      req.banco((tx) =>
        tx
          .select({
            id: repasse.id,
            recuperadorId: repasse.recuperadorId,
            recuperadorNome: recuperador.nome,
            casoId: repasse.casoId,
            placa: ativo.placa,
            valor: repasse.valor,
            data: repasse.data,
            status: repasse.status,
            tipo: repasse.tipo,
            observacao: repasse.observacao,
          })
          .from(repasse)
          .innerJoin(recuperador, eq(recuperador.id, repasse.recuperadorId))
          .innerJoin(caso, eq(caso.id, repasse.casoId))
          .innerJoin(ativo, eq(ativo.id, caso.ativoId))
          .orderBy(desc(repasse.data)),
      ),
  );

  /**
   * Marca um repasse pendente como pago. Só admin, por ora: o papel
   * "financeiro" (com aprovação em duas etapas e PIX) chega na Fase 2b.
   */
  app.post(
    '/repasses/:id/pagar',
    {
      preHandler: exigirPapel('admin'),
      schema: {
        tags: ['financeiro'],
        params: z.object({ id: z.string() }),
        response: { 200: z.object({ id: z.string(), status: z.literal('Pago') }), 404: c.erro, 409: c.erro },
      },
    },
    async (req, reply) =>
      req.banco(async (tx) => {
        // Condição no próprio UPDATE: dois cliques simultâneos não pagam duas vezes.
        const [pago] = await tx
          .update(repasse)
          .set({ status: 'Pago' })
          .where(and(eq(repasse.id, req.params.id), eq(repasse.status, 'Pendente')))
          .returning({ id: repasse.id });
        if (pago) return { id: pago.id, status: 'Pago' as const };
        const [existe] = await tx.select({ status: repasse.status }).from(repasse).where(eq(repasse.id, req.params.id));
        if (!existe) return reply.code(404).send({ erro: 'repasse não encontrado' });
        return reply.code(409).send({ erro: `repasse já está ${existe.status.toLowerCase()}` });
      }),
  );
};
