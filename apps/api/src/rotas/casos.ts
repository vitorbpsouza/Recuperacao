import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { schema } from '@workspace/db';
import {
  finalidadeDe,
  finalidadePermitida,
  mudarStatusEntrada,
  novoCasoEntrada,
  podeTransferir,
  statusPertenceA,
  statusValidos,
  type CasoAquisicao,
  type OrigemCaso,
} from '@workspace/domain';

import * as c from '../contratos.ts';

const { ativo, caso, recuperador } = schema;

/** Colunas de caso devolvidas pela API, mais o mínimo do ativo para identificar o caso. */
export const colunasCaso = {
  id: caso.id,
  ativoId: caso.ativoId,
  fonteId: caso.fonteId,
  origem: caso.origem,
  finalidade: caso.finalidade,
  status: caso.status,
  recuperadorId: caso.recuperadorId,
  // Nulo também quando o RLS esconde a rede de campo (Plano B).
  recuperadorNome: recuperador.nome,
  prazoVinculo: caso.prazoVinculo,
  prazoMaximo: caso.prazoMaximo,
  canalLead: caso.canalLead,
  evidenciaLead: caso.evidenciaLead,
  saldoDevedor: caso.saldoDevedor,
  valorQuitacaoNegociado: caso.valorQuitacaoNegociado,
  valorPagoAoDevedor: caso.valorPagoAoDevedor,
  anuenciaCredor: caso.anuenciaCredor,
  renajudAtivo: caso.renajudAtivo,
  gravameBaixado: caso.gravameBaixado,
  criadoEm: caso.criadoEm,
  atualizadoEm: caso.atualizadoEm,
  placa: ativo.placa,
  modelo: ativo.modelo,
  cidade: ativo.cidade,
  uf: ativo.uf,
};

const ORIGENS: readonly OrigemCaso[] = ['plataforma_credor', 'lead_proprio'];

export const rotasCasos: FastifyPluginAsyncZod = async (app) => {
  const enxerga = (canais: readonly OrigemCaso[] | undefined, origem: OrigemCaso) =>
    canais?.includes(origem) ?? false;

  app.get(
    '/casos',
    {
      schema: {
        tags: ['casos'],
        querystring: z.object({ origem: z.string().optional() }),
        response: { 200: c.listaCasos, 400: c.erro, 403: c.erro },
      },
    },
    async (req, reply) => {
      const origem = req.query.origem as OrigemCaso | undefined;
      // Listar sempre por canal: uma tela que mistura os dois convida ao erro
      // que o schema existe para impedir.
      if (!origem || !ORIGENS.includes(origem)) {
        return reply.code(400).send({ erro: 'informe origem=plataforma_credor ou origem=lead_proprio' });
      }
      if (!enxerga(req.contexto?.canais, origem)) {
        return reply.code(403).send({ erro: `sem permissão para o canal ${origem}` });
      }
      const casos = await req.banco((tx) =>
        tx
          .select(colunasCaso)
          .from(caso)
          .innerJoin(ativo, eq(ativo.id, caso.ativoId))
          .leftJoin(recuperador, eq(recuperador.id, caso.recuperadorId))
          .where(eq(caso.origem, origem))
          .orderBy(desc(caso.criadoEm)),
      );
      return { origem, finalidade: finalidadeDe(origem), total: casos.length, casos };
    },
  );

  app.post(
    '/casos',
    {
      schema: {
        tags: ['casos'],
        body: novoCasoEntrada,
        response: { 201: c.casoCriado, 403: c.erro, 409: c.erro, 422: c.statusInvalido },
      },
    },
    async (req, reply) => {
      const corpo = req.body;
      if (!enxerga(req.contexto?.canais, corpo.origem)) {
        return reply.code(403).send({ erro: `sem permissão para o canal ${corpo.origem}` });
      }
      // A finalidade nunca vem do cliente — é derivada da origem.
      const finalidade = finalidadeDe(corpo.origem);
      if (!statusPertenceA(finalidade, corpo.status)) {
        return reply.code(422).send({
          erro: `status "${corpo.status}" não pertence ao canal ${finalidade}`,
          validos: [...statusValidos(finalidade)],
        });
      }
      const valores =
        corpo.origem === 'plataforma_credor'
          ? {
              id: corpo.id,
              ativoId: corpo.ativoId,
              fonteId: corpo.fonteId,
              origem: corpo.origem,
              finalidade,
              status: corpo.status,
              recuperadorId: corpo.recuperadorId,
              prazoVinculo: corpo.prazoVinculo,
              prazoMaximo: corpo.prazoMaximo,
            }
          : {
              id: corpo.id,
              ativoId: corpo.ativoId,
              fonteId: corpo.fonteId,
              origem: corpo.origem,
              finalidade,
              status: corpo.status,
              canalLead: corpo.canalLead,
              evidenciaLead: corpo.evidenciaLead,
              saldoDevedor: corpo.saldoDevedor,
              valorQuitacaoNegociado: corpo.valorQuitacaoNegociado,
              valorPagoAoDevedor: corpo.valorPagoAoDevedor,
              anuenciaCredor: corpo.anuenciaCredor,
              renajudAtivo: corpo.renajudAtivo,
              gravameBaixado: corpo.gravameBaixado,
            };
      // CHECKs e triggers da fronteira respondem aqui; o tratador de erros
      // repassa a mensagem do banco com 409.
      const [novo] = await req.banco((tx) => tx.insert(caso).values(valores).returning({ id: caso.id }));
      return reply.code(201).send({ id: novo!.id, origem: corpo.origem, finalidade });
    },
  );

  /** Pré-condições jurídicas da transferência, avaliadas sobre o dado gravado. */
  app.get(
    '/casos/:id/pode-transferir',
    {
      schema: {
        tags: ['casos'],
        params: z.object({ id: z.string() }),
        response: { 200: c.podeTransferir, 404: c.erro, 409: c.erro },
      },
    },
    async (req, reply) => {
      // Caso de outro canal é invisível pelo RLS: responde como inexistente,
      // sem revelar que existe.
      const [l] = await req.banco((tx) =>
        tx
          .select({
            origem: caso.origem,
            anuenciaCredor: caso.anuenciaCredor,
            renajudAtivo: caso.renajudAtivo,
            gravameBaixado: caso.gravameBaixado,
          })
          .from(caso)
          .where(eq(caso.id, req.params.id)),
      );
      if (!l) return reply.code(404).send({ erro: 'caso não encontrado' });
      if (l.origem !== 'lead_proprio') {
        return reply.code(409).send({
          erro: 'caso de plataforma não tem finalidade de aquisição; transferência não se aplica',
        });
      }
      const aquisicao = {
        anuenciaCredor: l.anuenciaCredor ?? 'Pendente',
        renajudAtivo: Boolean(l.renajudAtivo),
        gravameBaixado: Boolean(l.gravameBaixado),
      } as CasoAquisicao;
      return {
        podeTransferir: podeTransferir(aquisicao),
        pendencias: [
          aquisicao.anuenciaCredor !== 'Obtida' && 'anuência do credor não obtida',
          aquisicao.renajudAtivo && 'RENAJUD ativo',
          !aquisicao.gravameBaixado && 'gravame não baixado',
        ].filter((p): p is string => typeof p === 'string'),
      };
    },
  );

  /** Avança o status, validando contra o vocabulário do canal do caso. */
  app.post(
    '/casos/:id/status',
    {
      schema: {
        tags: ['casos'],
        params: z.object({ id: z.string() }),
        body: mudarStatusEntrada,
        response: { 200: c.statusAlterado, 404: c.erro, 422: c.statusInvalido },
      },
    },
    async (req, reply) =>
      req.banco(async (tx) => {
        const [l] = await tx
          .select({ finalidade: caso.finalidade })
          .from(caso)
          .where(eq(caso.id, req.params.id));
        if (!l) return reply.code(404).send({ erro: 'caso não encontrado' });
        // Um status do outro canal não é erro de digitação: é sinal de que a
        // tela está oferecendo opções que não existem nesse ciclo de vida.
        if (!statusPertenceA(l.finalidade, req.body.status)) {
          return reply.code(422).send({
            erro: `status "${req.body.status}" não pertence ao canal ${l.finalidade}`,
            validos: [...statusValidos(l.finalidade)],
          });
        }
        await tx.update(caso).set({ status: req.body.status }).where(eq(caso.id, req.params.id));
        return { id: req.params.id, status: req.body.status };
      }),
  );

  /** Vocabulário de status de um canal, para a tela não inventar as opções. */
  app.get(
    '/status',
    {
      schema: {
        tags: ['casos'],
        querystring: z.object({ finalidade: z.string().optional() }),
        response: { 200: z.array(z.string()), 400: c.erro },
      },
    },
    async (req, reply) => {
      const f = finalidadePermitida.safeParse(req.query.finalidade);
      if (!f.success) {
        return reply
          .code(400)
          .send({ erro: 'informe finalidade=recuperacao_para_credor|aquisicao_com_quitacao' });
      }
      return [...statusValidos(f.data)];
    },
  );
};
