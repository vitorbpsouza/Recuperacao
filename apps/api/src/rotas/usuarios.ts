import { asc } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { schema } from '@workspace/db';
import { novoUsuarioEntrada } from '@workspace/domain';

import { exigirPapel } from '../auth/plugin.ts';
import * as c from '../contratos.ts';
import { criarUsuario } from '../servicos/usuarios.ts';

export const rotasUsuarios: FastifyPluginAsyncZod = async (app) => {
  /** Criação de conta é privilégio de admin — não há auto-cadastro. */
  app.post(
    '/usuarios',
    {
      preHandler: exigirPapel('admin'),
      schema: {
        tags: ['usuários'],
        body: novoUsuarioEntrada,
        response: { 201: c.usuarioCriado, 409: c.erro },
      },
    },
    async (req, reply) => reply.code(201).send(await req.banco((tx) => criarUsuario(tx, req.body))),
  );

  app.get(
    '/usuarios',
    {
      preHandler: exigirPapel('admin'),
      schema: { tags: ['usuários'], response: { 200: z.array(c.usuarioCriado.extend({ ativo: z.boolean() })) } },
    },
    async (req) =>
      req.banco((tx) =>
        tx
          .select({
            id: schema.usuario.id,
            email: schema.usuario.email,
            nome: schema.usuario.nome,
            papel: schema.usuario.papel,
            canais: schema.usuario.canais,
            ativo: schema.usuario.ativo,
          })
          .from(schema.usuario)
          .orderBy(asc(schema.usuario.nome)),
      ),
  );
};
