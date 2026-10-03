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

test('cadastra um bem colando os dados do veículo e criando o credor na hora', async ({ page }) => {
  await page.goto('/a/casos');
  await page.getByRole('button', { name: 'Novo caso' }).click();
  const dialogo = page.getByRole('dialog');

  // Sem nada preenchido: mensagens em português, nos campos certos.
  await dialogo.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(dialogo.getByText('informe a placa')).toBeVisible();
  await expect(dialogo.getByText('informe o modelo')).toBeVisible();

  // A fonte do plano já vem escolhida; os dados do veículo vêm do relatório colado.
  await expect(dialogo.getByText('Carteira do credor')).toBeVisible();
  await dialogo.getByLabel('Colar dados do veículo').fill(
    [
      'Placa: RCE4F56',
      'Chassi: 9BWZZZ377VT004251',
      'Renavam: 01234567890',
      'Modelo: CHEVROLET/ONIX LT',
      'Cor: PRATA',
      'Ano Fab/Mod: 2020 / 2021',
      'Nome: PESSOA FICTICIA',
    ].join('\n'),
  );
  await expect(dialogo.getByLabel('Placa')).toHaveValue('RCE4F56');
  await expect(dialogo.getByLabel('Renavam')).toHaveValue('01234567890');
  await expect(dialogo.getByText(/Descartado: dados do proprietário/)).toBeVisible();

  await dialogo.getByRole('combobox').first().click();
  await page.getByRole('option', { name: '+ Cadastrar novo credor' }).click();
  await dialogo.getByLabel('Nome do credor').fill('Banco Teste E2E S.A.');
  await dialogo.getByLabel('CPF ou CNPJ').fill('529.982.247-25');
  await dialogo.getByRole('button', { name: 'Cadastrar' }).click();

  await expect(page.getByRole('heading', { name: 'CHEVROLET/ONIX LT' })).toBeVisible();
  await expect(page).toHaveURL(/\/a\/casos\/.+/);
});

test('relatório do fornecedor: guarda o veículo e descarta dono e radar', async ({ page }) => {
  await page.goto('/a/casos/caso-a-002');
  await page.getByRole('tab', { name: 'Veículo' }).click();
  await page.getByRole('button', { name: 'Colar relatório' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Relatório').fill(
    [
      'DATA - HORA: 01/10/2026:10:00, PLACA: SEED002, LOCAL: RUA FICTICIA, LATITUDE: -23.5, LONGITUDE: -46.6',
      'Placa: SEED002',
      'Renavam: 01234567890',
      'Situação: EM_CIRCULACAO',
      'Documento: 00000000000',
      'Nome: PESSOA FICTICIA',
      'Restrição 1: RENAJUD',
      'Renajud: Sim',
      'Roubo/Furto: Não',
    ].join('\n'),
  );
  await expect(dialogo.getByText(/Descartado: .*dados do proprietário/)).toBeVisible();
  await expect(dialogo.getByText('PESSOA FICTICIA', { exact: true })).toHaveCount(0);

  await dialogo.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'B3 / SNG (Gravames)' }).click();
  await dialogo.getByLabel('Por que esta consulta').fill('conferir restrições antes da abordagem em campo');
  await dialogo.getByRole('button', { name: 'Registrar verificação' }).click();
  await expect(page.getByText('Verificação registrada na trilha de auditoria.')).toBeVisible();
  await expect(page.getByText('01234567890')).toBeVisible();
});

test('avistamento fica registrado com autor e hora', async ({ page }) => {
  await page.goto('/a/casos/caso-a-002');
  await page.getByRole('tab', { name: 'Avistamentos' }).click();
  const aba = page.getByRole('tabpanel');
  await aba.getByRole('button', { name: 'Registrar', exact: true }).click();
  await aba.getByLabel('Onde').fill('estacionado na Rua Augusta, em frente ao número 900');
  await aba.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByText('Avistamento registrado.')).toBeVisible();
  await expect(page.getByText('estacionado na Rua Augusta, em frente ao número 900')).toBeVisible();
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
