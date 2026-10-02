import type { GoogleGenAI } from '@google/genai';
import { Type } from '@google/genai';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { schema } from '@workspace/db';

import * as c from '../contratos.ts';

const { caso, recuperador, repasse } = schema;

export interface OpcoesCamila {
  /** Cliente do modelo. `null` quando não há credencial configurada. */
  ia: GoogleGenAI | null;
  modelo: string;
}

const resposta = z.array(c.recomendacaoCamila);

export const rotasCamila: FastifyPluginAsyncZod<OpcoesCamila> = async (app, o) => {
  app.post(
    '/camila/prioridades',
    {
      schema: {
        tags: ['camila'],
        response: {
          200: resposta,
          502: c.erro,
          503: z.object({ erro: z.string(), pendentes: z.number().int() }),
        },
      },
    },
    async (req, reply) => {
      // Só o necessário para priorizar: sem nome de recuperador, sem placa.
      // O que vai ao modelo é tratamento de dado por terceiro (LGPD) — o mínimo.
      const pendentes = await req.banco((tx) =>
        tx
          .select({
            id: repasse.id,
            valor: repasse.valor,
            data: repasse.data,
            tipo: repasse.tipo,
            scoreRecuperador: recuperador.score,
            statusCaso: caso.status,
          })
          .from(repasse)
          .innerJoin(recuperador, eq(recuperador.id, repasse.recuperadorId))
          .innerJoin(caso, eq(caso.id, repasse.casoId))
          .where(eq(repasse.status, 'Pendente')),
      );

      if (pendentes.length === 0) return [];
      if (!o.ia) {
        // Sem fallback simulado: um número inventado numa tela financeira é
        // pior que a ausência dele.
        return reply.code(503).send({ erro: 'CAMILA sem credencial de modelo configurada', pendentes: pendentes.length });
      }

      try {
        const r = await o.ia.models.generateContent({
          model: o.modelo,
          contents: `Analise os repasses pendentes e sugira prioridade de pagamento.
Considere valor, tempo de atraso, risco de cancelamento e score do recuperador.
Dados: ${JSON.stringify(pendentes)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  repasseId: { type: Type.STRING },
                  prioridade: { type: Type.STRING },
                  justificativa: { type: Type.STRING },
                  riscoCancelamento: { type: Type.NUMBER },
                },
                required: ['repasseId', 'prioridade', 'justificativa', 'riscoCancelamento'],
              },
            },
          },
        });
        // O modelo pode errar o formato ou citar repasse que não existe: validar
        // e filtrar pelo que foi enviado.
        const ids = new Set(pendentes.map((p) => p.id));
        return resposta.parse(JSON.parse(r.text || '[]')).filter((rec) => ids.has(rec.repasseId));
      } catch (e) {
        req.log.error(e, 'falha na análise da CAMILA');
        return reply.code(502).send({ erro: `falha na análise: ${(e as Error).message}` });
      }
    },
  );
};
