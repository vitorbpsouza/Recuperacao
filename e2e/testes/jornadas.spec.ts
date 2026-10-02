/**
 * Jornadas da central de ponta a ponta: navegador → central → API → banco.
 *
 * Os testes partem da sessão do admin (projeto de autenticação); os que
 * testam o próprio login ou outro usuário começam sem sessão.
 */
import { expect, test } from '@playwright/test';

import { ADMIN_E2E, entrar, SEM_SESSAO } from './apoio.ts';

test.describe.configure({ mode: 'serial' });

test.describe('sem sessão', () => {
  test.use({ storageState: SEM_SESSAO });

  test('login recusa credencial errada sem dizer qual parte errou', async ({ page }) => {
    await entrar(page, ADMIN_E2E.email, 'senha-errada-mesmo', false);
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test('admin entra no painel do Plano A com dado real', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/a$/);
  await expect(page.getByRole('heading', { name: 'Painel · Recuperação' })).toBeVisible();
  // Seed: quatro casos no Plano A.
  await expect(page.getByText('Na carteira').locator('xpath=ancestor::*[@data-slot="card"]')).toContainText('4');
});

test('ficha do caso: dado pessoal só com finalidade, e o acesso fica registrado', async ({ page }) => {
  await page.goto('/a/casos');
  await page.getByRole('link', { name: 'FIAT/ARGO DRIVE' }).click();
  await expect(page.getByRole('heading', { name: 'FIAT/ARGO DRIVE' })).toBeVisible();
  await expect(page.getByText('Devedor Sintético Um')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Devedor' }).click();
  await page.getByRole('button', { name: 'Revelar dados' }).click();
  await page.getByLabel('Finalidade').fill('curto');
  await page.getByRole('button', { name: 'Revelar e registrar' }).click();
  await expect(page.getByText('descreva a finalidade em ao menos 10 caracteres')).toBeVisible();

  await page.getByLabel('Finalidade').fill('confirmar identidade antes da abordagem em campo');
  await page.getByRole('button', { name: 'Revelar e registrar' }).click();
  await expect(page.getByText('Devedor Sintético Um')).toBeVisible();

  await page.getByRole('tab', { name: 'Acessos' }).click();
  await expect(page.getByRole('cell', { name: 'confirmar identidade antes da abordagem em campo' })).toBeVisible();
});

test('distribuição envia o caso a campo e a linha do tempo registra', async ({ page }) => {
  await page.goto('/a/distribuicao');
  await expect(page.getByText('TOYOTA/COROLLA XEI')).toBeVisible();
  await page.getByRole('button', { name: 'Distribuir', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Distribuir' }).click();
  await expect(page.getByText('Fila limpa')).toBeVisible();

  await page.goto('/a/casos');
  await page.getByRole('link', { name: 'TOYOTA/COROLLA XEI' }).click();
  await page.getByRole('tab', { name: 'Linha do tempo' }).click();
  await expect(page.getByText('Distribuído para Carlos Pereira')).toBeVisible();
});

test('Plano B mostra as pendências jurídicas da transferência', async ({ page }) => {
  await page.goto('/b/casos');
  await page.getByRole('link', { name: 'HYUNDAI/HB20S VISION' }).click();
  await expect(page.getByText('anuência do credor não obtida')).toBeVisible();
  await expect(page.getByText('gravame não baixado')).toBeVisible();
});

test('busca global abre a ficha pela placa', async ({ page }) => {
  await page.goto('/a');
  // O atalho é registrado quando o layout monta: esperar a tela, não só a URL.
  await expect(page.getByRole('heading', { name: 'Painel · Recuperação' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Placa, modelo, cidade ou tela…').fill('corolla');
  await page.getByRole('option', { name: /COROLLA/ }).click();
  await expect(page.getByRole('heading', { name: 'TOYOTA/COROLLA XEI' })).toBeVisible();
});

test('Plano A: retomada pelo painel de próximos passos, e a entrega espera a purga', async ({ page }) => {
  await page.goto('/a/casos/caso-a-001');
  await page.getByRole('tab', { name: 'Jurídico' }).click();
  await expect(page.getByText('0000001-16.2026.8.13.9999')).toBeVisible();
  await expect(page.getByText('Basta o envio ao endereço do contrato')).toBeVisible();

  await page.getByRole('button', { name: 'Registrar retomada' }).click();
  await page.getByLabel('Comprovante').fill('Auto de busca e apreensão 123');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Caso em "Retomado".')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Entregar ao credor' })).toBeDisabled();
  await expect(page.getByText(/o devedor ainda pode purgar a mora até/)).toBeVisible();
});

test('cadastra um bem no Plano A e cai na ficha do caso novo', async ({ page }) => {
  await page.goto('/a/casos');
  await page.getByRole('button', { name: 'Novo caso' }).click();
  const dialogo = page.getByRole('dialog');

  await dialogo.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Plataforma de Bens (app do credor)' }).click();
  await dialogo.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'Banco Alfa S.A.' }).click();

  await dialogo.getByLabel('Placa').fill('ABC1234X');
  await dialogo.getByLabel('Modelo').fill('CHEVROLET/ONIX LT');
  await dialogo.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(dialogo.getByText('placa inválida')).toBeVisible();

  await dialogo.getByLabel('Placa').fill('RCE4F56');
  await dialogo.getByLabel('CPF ou CNPJ').fill('529.982.247-25');
  await dialogo.getByRole('button', { name: 'Cadastrar' }).click();

  await expect(page.getByRole('heading', { name: 'CHEVROLET/ONIX LT' })).toBeVisible();
  await expect(page).toHaveURL(/\/a\/casos\/.+/);
  await expect(page.getByText('Recebido', { exact: true }).first()).toBeVisible();
});

test.describe('sem sessão', () => {
  test.use({ storageState: SEM_SESSAO });

  test('operador do Plano B não alcança o Plano A nem pela URL', async ({ page, request }) => {
    // Cria o operador pela API, como um admin faria pela tela de usuários.
    const login = await request.post('/api/auth/login', { data: ADMIN_E2E });
    const { usuario } = await login.json();
    const criado = await request.post('/api/usuarios', {
      data: { email: 'opb@e2e.local', nome: 'Operador B', senha: 'senha-do-operador-b', papel: 'operador', canais: ['lead_proprio'] },
      headers: { 'x-csrf-token': usuario.csrfToken },
    });
    expect(criado.status()).toBe(201);

    await entrar(page, 'opb@e2e.local', 'senha-do-operador-b');
    await expect(page).toHaveURL(/\/b$/);
    await expect(page.getByRole('link', { name: 'Casos' })).toHaveCount(0);

    await page.goto('/a/casos');
    await expect(page).toHaveURL(/\/b$/);

    // A ficha de um caso do Plano A responde como inexistente.
    await page.goto('/b/casos/caso-a-001');
    await expect(page.getByText('caso não encontrado')).toBeVisible();
  });
});
