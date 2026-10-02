import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { GoogleGenAI } from '@google/genai';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import type { Db } from '@workspace/db';

import type { Ambiente } from './ambiente.ts';
import { autenticacao } from './auth/plugin.ts';
import { servirCentral } from './central.ts';
import { registrarTratamentoDeErros } from './erros.ts';
import { rotasAuditoria } from './rotas/auditoria.ts';
import { rotasAuth } from './rotas/auth.ts';
import { rotasCadastros } from './rotas/cadastros.ts';
import { rotasCamila } from './rotas/camila.ts';
import { rotasCasos } from './rotas/casos.ts';
import { rotasColisoes } from './rotas/colisoes.ts';
import { rotasFicha } from './rotas/ficha.ts';
import { rotasFinanceiro } from './rotas/financeiro.ts';
import { rotasJuridico } from './rotas/juridico.ts';
import { rotasCadastroCaso } from './rotas/cadastro-caso.ts';
import { rotasVeiculo } from './rotas/veiculo.ts';
import { criarClienteFipe, type ClienteFipe } from './integracoes/fipe.ts';
import { rotasUsuarios } from './rotas/usuarios.ts';

export interface OpcoesServidor {
  db: Db;
  ambiente: Ambiente;
  ia?: GoogleGenAI | null;
  logger?: FastifyServerOptions['logger'];
  /** Tabela FIPE. Os testes passam uma falsa, para não depender da internet. */
  fipe?: ClienteFipe;
}

/** Níveis do pino na escala do Cloud Logging, que lê `severity` (e não `level`). */
const SEVERIDADE: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/**
 * Log em JSON no formato que o Cloud Logging entende: `severity`, `message` e
 * `time` em ISO. Sem isso, um erro 500 chega como linha comum e não aparece no
 * filtro de erros nem no Error Reporting.
 */
const LOG_DE_PRODUCAO = {
  level: 'info',
  messageKey: 'message',
  formatters: { level: (rotulo: string) => ({ severity: SEVERIDADE[rotulo] ?? 'DEFAULT' }) },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
};

export const criarServidor = async ({ db, ambiente, ia = null, logger, fipe = criarClienteFipe() }: OpcoesServidor) => {
  const producao = ambiente.NODE_ENV === 'production';
  const app = Fastify({
    logger: logger ?? (ambiente.NODE_ENV === 'test' ? false : producao ? LOG_DE_PRODUCAO : { level: 'debug' }),
    // Cloud Run fica atrás de proxy: o IP real do cliente (para rate limit) vem no X-Forwarded-For.
    trustProxy: producao,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ReCredita API',
        description: 'Recuperação (Plano A) e aquisição (Plano B) de veículos.',
        version: '0.1.0',
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  if (!producao) await app.register(swaggerUi, { routePrefix: '/docs' });

  // `__Host-` exige Secure (HTTPS) e proíbe Domain: o cookie fica preso à origem exata.
  const nomeCookie = producao ? '__Host-sessao' : 'sessao';
  await app.register(autenticacao, { db, segredo: ambiente.SEGREDO_SESSAO, nomeCookie });
  registrarTratamentoDeErros(app, { servirCentral: Boolean(ambiente.CENTRAL_DIR) });
  if (ambiente.CENTRAL_DIR) await servirCentral(app, ambiente.CENTRAL_DIR);

  await app.register(
    async (api) => {
      // Health check responde sem credencial: é o que o balanceador consulta.
      api.get('/saude', { config: { publica: true }, schema: { hide: true } }, async () => ({
        ok: true,
        em: new Date().toISOString(),
      }));
      await api.register(rotasAuth, { db, segredo: ambiente.SEGREDO_SESSAO, nomeCookie, cookieSeguro: producao });
      await api.register(rotasUsuarios);
      await api.register(rotasCasos);
      await api.register(rotasFicha);
      await api.register(rotasColisoes);
      await api.register(rotasCadastros);
      await api.register(rotasFinanceiro);
      await api.register(rotasJuridico);
      await api.register(rotasCadastroCaso);
      await api.register(rotasVeiculo, { fipe });
      await api.register(rotasAuditoria);
      await api.register(rotasCamila, { ia, modelo: ambiente.CAMILA_MODELO });
    },
    { prefix: '/api' },
  );

  return app;
};

export type Servidor = Awaited<ReturnType<typeof criarServidor>>;
