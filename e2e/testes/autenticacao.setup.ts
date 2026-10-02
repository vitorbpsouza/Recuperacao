/**
 * Abre a sessão do admin uma vez e a guarda para os testes (ESTADO_ADMIN).
 */
import { test as preparar } from '@playwright/test';

import { ADMIN_E2E, entrar, ESTADO_ADMIN } from './apoio.ts';

preparar('sessão do admin', async ({ page }) => {
  await entrar(page, ADMIN_E2E.email, ADMIN_E2E.senha);
  await page.context().storageState({ path: ESTADO_ADMIN });
});
