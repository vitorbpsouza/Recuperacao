import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { comContexto, schema, type Db } from '@workspace/db';
import { loginEntrada } from '@workspace/domain';

import { autenticar, canaisVisiveis, revogarSessao, tokenCsrf, type UsuarioSessao } from '../auth/sessao.ts';
import * as c from '../contratos.ts';

export interface OpcoesRotasAuth {
  db: Db;
  segredo: string;
  nomeCookie: string;
  /** `Secure` no cookie: obrigatório em produção (HTTPS). */
  cookieSeguro: boolean;
}

export const rotasAuth: FastifyPluginAsyncZod<OpcoesRotasAuth> = async (app, o) => {
  /** O usuário como a tela precisa: com o tenant (marca) e o token CSRF da sessão. */
  const descrever = async (u: UsuarioSessao, sessaoId: string) => {
    const canais = canaisVisiveis(u);
    const [t] = await comContexto(o.db, { tenantId: u.tenantId, usuarioId: u.id, canais }, (tx) =>
      tx
        .select({
          id: schema.tenant.id,
          nome: schema.tenant.nome,
          sigla: schema.tenant.sigla,
          logoUrl: schema.tenant.logoUrl,
        })
        .from(schema.tenant)
        .where(eq(schema.tenant.id, u.tenantId)),
    );
    if (!t) throw new Error(`tenant ${u.tenantId} não encontrado`);
    return {
      id: u.id,
      email: u.email,
      nome: u.nome,
      papel: u.papel,
      canais: u.canais,
      canaisVisiveis: canais,
      tenant: t,
      csrfToken: tokenCsrf(o.segredo, sessaoId),
    };
  };

  app.post(
    '/auth/login',
    {
      config: { publica: true, rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['autenticação'],
        body: loginEntrada,
        response: { 200: c.sessaoAberta, 401: c.erro },
      },
    },
    async (req, reply) => {
      const sessao = await autenticar(o.db, req.body.email, req.body.senha);
      // Credencial inválida e usuário inexistente dão a mesma resposta.
      if (!sessao) return reply.code(401).send({ erro: 'credenciais inválidas' });

      // httpOnly: o script da página não lê o token, então um XSS não o rouba.
      // SameSite=Strict: o navegador não o envia em requisição vinda de outro site.
      reply.setCookie(o.nomeCookie, sessao.token, {
        httpOnly: true,
        secure: o.cookieSeguro,
        sameSite: 'strict',
        path: '/',
        expires: sessao.expiraEm,
      });
      return { usuario: await descrever(sessao.usuario, sessao.sessaoId), expiraEm: sessao.expiraEm };
    },
  );

  app.get(
    '/auth/eu',
    { schema: { tags: ['autenticação'], response: { 200: c.usuarioSessao } } },
    async (req) => descrever(req.usuario!, req.sessaoId!),
  );

  app.post('/auth/logout', { schema: { tags: ['autenticação'] } }, async (req, reply) => {
    const token = req.cookies[o.nomeCookie];
    if (token) await revogarSessao(o.db, token);
    // Os mesmos atributos do login: o navegador recusa apagar um `__Host-` sem Secure.
    reply.clearCookie(o.nomeCookie, { httpOnly: true, secure: o.cookieSeguro, sameSite: 'strict', path: '/' });
    return reply.code(204).send();
  });
};
