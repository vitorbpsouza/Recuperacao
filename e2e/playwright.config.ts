import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

/**
 * E2E com servidores próprios: API em 3101 sobre um PGlite novo (pasta
 * temporária, migrado e semeado na subida) e central em 3100. Não toca nos
 * servidores de desenvolvimento (3000/3001) nem no banco de dev.
 *
 * Com E2E_BASE_URL, roda contra um servidor já no ar — por exemplo a imagem
 * de produção (docs/infra.md). O banco dele precisa do seed sintético e do
 * ADMIN_E2E, e de um seed novo a cada rodada: as jornadas alteram dados.
 */
const PORTA_API = 3101;
const PORTA_WEB = 3100;
const URL_EXTERNA = process.env.E2E_BASE_URL;

export const ADMIN_E2E = { email: 'admin@e2e.local', senha: 'senha-de-e2e-bem-longa' };

/**
 * Sessão do admin, aberta uma vez pelo projeto de autenticação e reaproveitada
 * pelos testes. Entrar em todo teste esbarra no limite de logins por minuto da
 * API — que é para valer, inclusive aqui.
 */
export const ESTADO_ADMIN = fileURLToPath(new URL('./.auth/admin.json', import.meta.url));

const SERVIDORES_LOCAIS: PlaywrightTestConfig['webServer'] = [
  {
    command: 'pnpm --dir ../apps/api exec tsx src/principal.ts',
    url: `http://localhost:${PORTA_API}/api/saude`,
    env: {
      NODE_ENV: 'development',
      PORT: String(PORTA_API),
      PGLITE_DIR: join(tmpdir(), `recredita-e2e-${Date.now()}`),
      ADMIN_EMAIL: ADMIN_E2E.email,
      ADMIN_SENHA: ADMIN_E2E.senha,
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  {
    command: `pnpm --dir ../apps/central exec vite --port ${PORTA_WEB} --strictPort`,
    url: `http://localhost:${PORTA_WEB}`,
    env: { API_PORT: String(PORTA_API) },
    reuseExistingServer: false,
    timeout: 120_000,
  },
];

export default defineConfig({
  testDir: './testes',
  // As jornadas mudam o mesmo banco: em sequência, numa ordem conhecida.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: URL_EXTERNA ?? `http://localhost:${PORTA_WEB}`,
    locale: 'pt-BR',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    // No Windows, o Edge instalado; no CI (Linux), o Chromium do Playwright.
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  },
  projects: [
    { name: 'autenticacao', testMatch: /\.setup\.ts$/ },
    { name: 'central', dependencies: ['autenticacao'], use: { storageState: ESTADO_ADMIN } },
  ],
  webServer: URL_EXTERNA ? [] : SERVIDORES_LOCAIS,
});
