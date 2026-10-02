/**
 * Autenticação e autorização de toda rota sob /api.
 *
 * Rota pública declara `config: { publica: true }`; todas as outras exigem
 * sessão. Cada requisição autenticada ganha `req.banco(fn)`, que abre uma
 * transação com o contexto da sessão: o RLS do banco aplica tenant e canal
 * mesmo que a rota esqueça de filtrar.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { comContexto, type Contexto, type Db, type Tx } from '@workspace/db';

import { canaisVisiveis, conferirCsrf, resolverSessao, type Papel, type UsuarioSessao } from './sessao.ts';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Dispensa sessão (saúde, login, documentação). */
    publica?: boolean;
  }
  interface FastifyRequest {
    usuario: UsuarioSessao | null;
    sessaoId: string | null;
    contexto: Contexto | null;
    /** Executa `fn` numa transação com o contexto da sessão (RLS ativo). */
    banco: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  }
}

export interface OpcoesAuth {
  db: Db;
  segredo: string;
  nomeCookie: string;
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const autenticacao = fp(async (app: FastifyInstance, opcoes: OpcoesAuth) => {
  app.decorateRequest('usuario', null);
  app.decorateRequest('sessaoId', null);
  app.decorateRequest('contexto', null);
  app.decorateRequest('banco', async () => {
    throw new Error('requisição sem sessão não acessa o banco');
  });

  app.addHook('onRequest', async (req, reply) => {
    if (req.routeOptions.config?.publica || !req.url.startsWith('/api')) return;

    const token = req.cookies[opcoes.nomeCookie];
    if (!token) return reply.code(401).send({ erro: 'autenticação obrigatória' });

    const sessao = await resolverSessao(opcoes.db, token);
    if (!sessao) return reply.code(401).send({ erro: 'sessão inválida ou expirada' });

    // Auditor é somente-leitura: pode ver tudo, não pode alterar nada.
    if (sessao.usuario.papel === 'auditor' && !METODOS_SEGUROS.has(req.method)) {
      return reply.code(403).send({ erro: 'auditor tem acesso somente de leitura' });
    }

    if (!METODOS_SEGUROS.has(req.method)) {
      const recebido = req.headers['x-csrf-token'];
      if (!conferirCsrf(opcoes.segredo, sessao.sessaoId, Array.isArray(recebido) ? recebido[0] : recebido)) {
        return reply.code(403).send({ erro: 'token CSRF ausente ou inválido' });
      }
    }

    const contexto: Contexto = {
      tenantId: sessao.usuario.tenantId,
      usuarioId: sessao.usuario.id,
      canais: canaisVisiveis(sessao.usuario),
    };
    req.usuario = sessao.usuario;
    req.sessaoId = sessao.sessaoId;
    req.contexto = contexto;
    req.banco = (fn) => comContexto(opcoes.db, contexto, fn);
  });
});

/** Exige um dos papéis. Usar como `preHandler` da rota. */
export const exigirPapel =
  (...papeis: Papel[]) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.usuario) return reply.code(401).send({ erro: 'autenticação obrigatória' });
    if (!papeis.includes(req.usuario.papel)) {
      return reply.code(403).send({ erro: `requer papel: ${papeis.join(' ou ')}` });
    }
  };

/** O usuário da requisição — só chamar em rota não pública, onde o hook garante sessão. */
export const usuarioDe = (req: FastifyRequest): UsuarioSessao => {
  if (!req.usuario) throw new Error('rota sem sessão');
  return req.usuario;
};
