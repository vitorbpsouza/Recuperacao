import { desc } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { schema } from '@workspace/db';
import { normalizarPlaca, novaColisaoEntrada } from '@workspace/domain';

import { exigirPapel } from '../auth/plugin.ts';
import * as c from '../contratos.ts';

const { colisaoOrigem } = schema;

export const rotasColisoes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Registra uma colisão. O trigger do banco exige esta linha, com evidência
   * independente, antes de permitir abrir aquisição numa placa que já é caso
   * de plataforma — então esta rota é o único caminho legítimo para esse cenário.
   */
  app.post(
    '/colisoes',
    {
      preHandler: exigirPapel('admin'),
      schema: { tags: ['colisões'], body: novaColisaoEntrada, response: { 201: c.criado, 409: c.erro } },
    },
    async (req, reply) => {
      const corpo = req.body;
      const [nova] = await req.banco((tx) =>
        tx
          .insert(colisaoOrigem)
          .values({
            placa: normalizarPlaca(corpo.placa),
            casoPlataformaId: corpo.casoPlataformaId,
            leadProprioRef: corpo.leadProprioRef,
            resolucao: corpo.resolucao,
            justificativa: corpo.justificativa,
            evidenciaIndependente: corpo.evidenciaIndependente,
            // Nunca do corpo: o trigger também força o operador da sessão.
            operadorId: req.usuario!.id,
          })
          .returning({ id: colisaoOrigem.id }),
      );
      return reply.code(201).send({ id: nova!.id });
    },
  );

  // Colisão cruza os dois canais: o RLS só a mostra a quem enxerga os dois.
  app.get(
    '/colisoes',
    { schema: { tags: ['colisões'], response: { 200: z.array(c.colisao) } } },
    async (req) =>
      req.banco((tx) =>
        tx
          .select({
            id: colisaoOrigem.id,
            placa: colisaoOrigem.placa,
            casoPlataformaId: colisaoOrigem.casoPlataformaId,
            leadProprioRef: colisaoOrigem.leadProprioRef,
            detectadoEm: colisaoOrigem.detectadoEm,
            resolucao: colisaoOrigem.resolucao,
            justificativa: colisaoOrigem.justificativa,
            evidenciaIndependente: colisaoOrigem.evidenciaIndependente,
            operadorId: colisaoOrigem.operadorId,
          })
          .from(colisaoOrigem)
          .orderBy(desc(colisaoOrigem.detectadoEm)),
      ),
  );
};
