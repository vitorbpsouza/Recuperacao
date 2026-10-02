import { cp } from 'node:fs/promises';

import { defineConfig } from 'tsup';

/**
 * Empacota a API e as CLIs de operação para o container.
 *
 * Os pacotes do workspace (@workspace/*) são TypeScript sem build próprio:
 * entram no bundle. Dependências de terceiros ficam externas e são instaladas
 * no container — por isso tudo que o bundle importa (pg, PGlite) é dependência
 * direta deste pacote. As migrações SQL vão junto: o migrador as lê do disco
 * (MIGRACOES_DIR).
 */
export default defineConfig({
  entry: {
    principal: 'src/principal.ts',
    migrar: '../../packages/db/src/cli/migrar.ts',
    seed: '../../packages/db/src/cli/seed.ts',
    'criar-usuario': 'src/cli/criar-usuario.ts',
  },
  format: 'esm',
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@workspace\//],
  async onSuccess() {
    await cp('../../packages/db/migrations', 'dist/migrations', { recursive: true });
  },
});
