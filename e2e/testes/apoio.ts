import { expect, type Page } from '@playwright/test';

export { ADMIN_E2E, ESTADO_ADMIN } from '../playwright.config.ts';

/** Sem sessão: para testar o login e entrar com outro usuário. */
export const SEM_SESSAO = { cookies: [], origins: [] };

export const entrar = async (page: Page, email: string, senha: string, esperarSaida = true) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Sem esperar, a próxima navegação cancela o login no meio.
  if (esperarSaida) await expect(page).not.toHaveURL(/\/login/);
};
