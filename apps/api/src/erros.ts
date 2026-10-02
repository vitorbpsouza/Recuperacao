import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';

import { erroDoBanco } from '@workspace/db';

import { ehNavegacaoDaCentral } from './central.ts';

/**
 * SQLSTATE que significam "o dado foi recusado por uma regra": CHECK, unique,
 * FK, not null e exceções levantadas pelos triggers da fronteira.
 */
const RECUSA_DE_REGRA = new Set(['23514', '23505', '23503', '23502', 'P0001']);

/**
 * Traduz erros em respostas HTTP.
 *
 * Quando o banco recusa um dado, a mensagem dele é a explicação mais precisa
 * disponível — diz qual constraint ou trigger recusou. Repassá-la é melhor que
 * traduzi-la. Erro inesperado vira 500 genérico: o detalhe vai para o log, não
 * para o cliente.
 */
export const registrarTratamentoDeErros = (app: FastifyInstance, { servirCentral = false } = {}) => {
  app.setErrorHandler((erro: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(erro)) {
      return reply.code(400).send({
        erro: 'dados inválidos',
        detalhes: erro.validation.map((v) => ({ campo: v.instancePath, mensagem: v.message })),
      });
    }

    const doBanco = erroDoBanco(erro);
    if (doBanco) {
      if (doBanco.code === '42501') {
        return reply.code(403).send({ erro: doBanco.message });
      }
      if (RECUSA_DE_REGRA.has(doBanco.code)) {
        return reply.code(409).send({ erro: doBanco.message });
      }
    }

    if (isResponseSerializationError(erro)) {
      req.log.error({ issues: erro.cause.issues }, 'resposta fora do contrato');
      return reply.code(500).send({ erro: 'erro interno' });
    }

    if (erro.statusCode && erro.statusCode < 500) {
      return reply.code(erro.statusCode).send({ erro: erro.message });
    }

    req.log.error(erro);
    return reply.code(500).send({ erro: 'erro interno' });
  });

  app.setNotFoundHandler((req, reply) => {
    if (servirCentral && ehNavegacaoDaCentral(req)) {
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ erro: 'rota não encontrada' });
  });
};
