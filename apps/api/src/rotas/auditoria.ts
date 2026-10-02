import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { novaConsultaEntrada } from '@workspace/domain';

import { exigirPapel } from '../auth/plugin.ts';
import * as c from '../contratos.ts';
import {
  CasoNaoEncontrado,
  custoPorBureau,
  listarAuditoria,
  registrarConsulta,
} from '../servicos/auditoria.ts';

export const rotasAuditoria: FastifyPluginAsyncZod = async (app) => {
  /** Consulta a bureau — sempre com procedência. */
  app.post(
    '/consultas',
    {
      schema: {
        tags: ['auditoria'],
        body: novaConsultaEntrada,
        response: { 201: c.consultaAuditoria, 404: c.erro, 409: c.erro },
      },
    },
    async (req, reply) => {
      try {
        // Nunca do corpo da requisição: a trilha só vale se o ato for
        // atribuído a quem a sessão autenticou.
        const linha = await req.banco((tx) => registrarConsulta(tx, req.usuario!.id, req.body));
        return reply.code(201).send(linha);
      } catch (e) {
        // Caso de outro canal é invisível pelo RLS — mesma resposta de inexistente.
        if (e instanceof CasoNaoEncontrado) return reply.code(404).send({ erro: 'caso não encontrado' });
        throw e;
      }
    },
  );

  app.get(
    '/auditoria',
    {
      preHandler: exigirPapel('admin', 'auditor'),
      schema: { tags: ['auditoria'], response: { 200: z.array(c.linhaAuditoria) } },
    },
    async (req) => req.banco(listarAuditoria),
  );

  app.get(
    '/custos/bureau',
    {
      preHandler: exigirPapel('admin', 'auditor'),
      schema: { tags: ['auditoria'], response: { 200: z.array(c.custoBureau) } },
    },
    async (req) => req.banco(custoPorBureau),
  );
};
