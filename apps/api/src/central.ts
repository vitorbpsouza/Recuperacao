import { extname, sep } from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Serve o build da central na mesma origem da API (staging e produção).
 *
 * Mesma origem é o que sustenta o cookie `__Host-sessao` com SameSite=Strict e
 * dispensa CORS. Arquivos de `assets/` têm hash no nome: cache permanente. O
 * index.html revalida a cada carga, para um deploy novo valer na hora.
 */
export const servirCentral = async (app: FastifyInstance, pasta: string) => {
  await app.register(fastifyStatic, {
    root: pasta,
    // Rotas para os arquivos que existem no build; o resto cai no not-found.
    wildcard: false,
    setHeaders: (reply, caminho) => {
      reply.header(
        'cache-control',
        caminho.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
};

/**
 * Navegação da central que não é arquivo (/a/casos/caso-a-001): a rota é do
 * roteador do navegador, então a resposta é o index.html.
 *
 * Arquivo inexistente (um /assets/… de um deploy anterior) continua 404: se
 * voltasse HTML, o navegador tentaria executá-lo como script.
 */
export const ehNavegacaoDaCentral = (req: FastifyRequest) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const caminho = req.url.split('?')[0] ?? '';
  if (caminho === '/api' || caminho.startsWith('/api/')) return false;
  return extname(caminho) === '' && (req.headers.accept ?? '').includes('text/html');
};
