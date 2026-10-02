/**
 * Gera o documento OpenAPI da API em packages/api-client/openapi.json.
 *
 *   pnpm --filter @workspace/api openapi
 *
 * Sobe o servidor com um banco em memória (nenhuma rota é chamada) só para
 * coletar os schemas registrados.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { abrirBanco } from '@workspace/db';

import { lerAmbiente } from '../ambiente.ts';
import { criarServidor } from '../servidor.ts';

const destino = fileURLToPath(new URL('../../../../packages/api-client/openapi.json', import.meta.url));

const banco = await abrirBanco({ diretorio: null });
try {
  const app = await criarServidor({ db: banco.db, ambiente: lerAmbiente({ NODE_ENV: 'test' }) });
  await app.ready();
  await writeFile(destino, `${JSON.stringify(app.swagger(), null, 2)}\n`, 'utf8');
  await app.close();
  console.log(`OpenAPI escrito em ${destino}`);
} finally {
  await banco.bruta.fechar();
}
