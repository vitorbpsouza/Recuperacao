import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { schema } from '@workspace/db';
import { distribuirEntrada, podeDistribuir, revelarDevedorEntrada } from '@workspace/domain';

import { exigirPapel } from '../auth/plugin.ts';
import * as c from '../contratos.ts';
import { colunasCaso } from './casos.ts';

const { acessoDadoPessoal, ativo, caso, casoEvento, fonteAtivo, recuperador, usuario } = schema;

const params = z.object({ id: z.string() });

/**
 * Ficha do caso. Tudo passa pelo RLS: caso de outro canal responde como
 * inexistente (404), sem revelar que existe.
 */
export const rotasFicha: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/casos/:id',
    { schema: { tags: ['casos'], params, response: { 200: c.casoDetalhe, 404: c.erro } } },
    async (req, reply) => {
      const [l] = await req.banco((tx) =>
        tx
          .select({
            ...colunasCaso,
            ativo: {
              chassi: ativo.chassi,
              ano: ativo.ano,
              cor: ativo.cor,
              credorNome: ativo.credorNome,
              valorDivida: ativo.valorDivida,
              dataRecebimento: ativo.dataRecebimento,
            },
            fonte: { nome: fonteAtivo.nome, tipo: fonteAtivo.tipo, credorNome: fonteAtivo.credorNome },
          })
          .from(caso)
          .innerJoin(ativo, eq(ativo.id, caso.ativoId))
          .innerJoin(fonteAtivo, eq(fonteAtivo.id, caso.fonteId))
          .leftJoin(recuperador, eq(recuperador.id, caso.recuperadorId))
          .where(eq(caso.id, req.params.id)),
      );
      if (!l) return reply.code(404).send({ erro: 'caso não encontrado' });
      return l;
    },
  );

  /** Linha do tempo: escrita só pelos triggers do banco, com o usuário da sessão. */
  app.get(
    '/casos/:id/eventos',
    { schema: { tags: ['casos'], params, response: { 200: z.array(c.eventoCaso) } } },
    async (req) =>
      req.banco((tx) =>
        tx
          .select({
            id: casoEvento.id,
            tipo: casoEvento.tipo,
            statusDe: casoEvento.statusDe,
            statusPara: casoEvento.statusPara,
            usuarioNome: usuario.nome,
            ocorridoEm: casoEvento.ocorridoEm,
            dados: casoEvento.dados,
          })
          .from(casoEvento)
          .leftJoin(usuario, eq(usuario.id, casoEvento.usuarioId))
          .where(eq(casoEvento.casoId, req.params.id))
          .orderBy(asc(casoEvento.ocorridoEm), asc(casoEvento.id)),
      ),
  );

  /**
   * Revela nome e documento do devedor. POST, e não GET, porque tem efeito:
   * grava na trilha de acesso quem viu, quando e com que finalidade.
   */
  app.post(
    '/casos/:id/devedor',
    {
      schema: {
        tags: ['casos'],
        params,
        body: revelarDevedorEntrada,
        response: { 200: c.devedorRevelado, 404: c.erro },
      },
    },
    async (req, reply) =>
      req.banco(async (tx) => {
        const [l] = await tx
          .select({ devedorNome: ativo.devedorNome, devedorDoc: ativo.devedorDoc })
          .from(caso)
          .innerJoin(ativo, eq(ativo.id, caso.ativoId))
          .where(eq(caso.id, req.params.id));
        if (!l) return reply.code(404).send({ erro: 'caso não encontrado' });
        await tx.insert(acessoDadoPessoal).values({
          casoId: req.params.id,
          // O trigger grava o usuário da sessão de todo jeito; o valor aqui só satisfaz o tipo.
          usuarioId: req.usuario!.id,
          campos: ['devedor_nome', 'devedor_doc'],
          finalidade: req.body.finalidade,
        });
        return l;
      }),
  );

  app.get(
    '/casos/:id/acessos',
    {
      preHandler: exigirPapel('admin', 'auditor'),
      schema: { tags: ['casos'], params, response: { 200: z.array(c.acessoDadoPessoal) } },
    },
    async (req) =>
      req.banco((tx) =>
        tx
          .select({
            id: acessoDadoPessoal.id,
            usuarioNome: usuario.nome,
            campos: acessoDadoPessoal.campos,
            finalidade: acessoDadoPessoal.finalidade,
            acessadoEm: acessoDadoPessoal.acessadoEm,
          })
          .from(acessoDadoPessoal)
          .innerJoin(usuario, eq(usuario.id, acessoDadoPessoal.usuarioId))
          .where(eq(acessoDadoPessoal.casoId, req.params.id))
          .orderBy(desc(acessoDadoPessoal.acessadoEm)),
      ),
  );

  /**
   * Envia um caso do Plano A a um recuperador ativo, com prazo de aceite e
   * prazo máximo. Também serve para redistribuir antes de o caso estar em campo.
   */
  app.post(
    '/casos/:id/distribuir',
    {
      schema: {
        tags: ['casos'],
        params,
        body: distribuirEntrada,
        response: { 200: c.distribuicao, 404: c.erro, 409: c.erro },
      },
    },
    async (req, reply) =>
      req.banco(async (tx) => {
        const [l] = await tx
          .select({ status: caso.status, finalidade: caso.finalidade })
          .from(caso)
          .where(eq(caso.id, req.params.id));
        if (!l) return reply.code(404).send({ erro: 'caso não encontrado' });
        if (l.finalidade !== 'recuperacao_para_credor') {
          return reply.code(409).send({ erro: 'aquisição não é trabalho de campo: não se distribui a recuperador' });
        }
        if (!podeDistribuir(l.status)) {
          return reply.code(409).send({ erro: `caso em "${l.status}" não pode ser distribuído` });
        }
        const [r] = await tx
          .select({ status: recuperador.status })
          .from(recuperador)
          .where(eq(recuperador.id, req.body.recuperadorId));
        if (!r) return reply.code(404).send({ erro: 'recuperador não encontrado' });
        if (r.status !== 'Ativo') {
          return reply.code(409).send({ erro: `recuperador ${r.status.toLowerCase()} não recebe casos` });
        }

        const agora = Date.now();
        const prazoVinculo = new Date(agora + req.body.horasParaAceite * 3_600_000);
        const prazoMaximo = new Date(agora + req.body.diasDePrazo * 86_400_000);
        await tx
          .update(caso)
          .set({ recuperadorId: req.body.recuperadorId, prazoVinculo, prazoMaximo, status: 'Distribuído' })
          .where(eq(caso.id, req.params.id));
        return { id: req.params.id, status: 'Distribuído', recuperadorId: req.body.recuperadorId, prazoVinculo, prazoMaximo };
      }),
  );
};
