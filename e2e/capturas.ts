/**
 * Capturas de tela das telas principais, para revisar a identidade visual.
 *
 *   E2E_EMAIL=… E2E_SENHA=… pnpm --filter @workspace/e2e capturas
 *
 * Usa a central em http://localhost:3000 (API + Vite no ar). Salva PNGs em
 * e2e/capturas/ (fora do git). No Windows usa o Edge instalado; em outros
 * sistemas, o Chromium do Playwright. Só abre diálogos — não confirma nada,
 * exceto a revelação do devedor, que é o fluxo sob teste.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const email = process.env.E2E_EMAIL;
const senha = process.env.E2E_SENHA;
if (!email || !senha) {
  console.error('defina E2E_EMAIL e E2E_SENHA');
  process.exit(1);
}

const pasta = fileURLToPath(new URL('./capturas/', import.meta.url));
await mkdir(pasta, { recursive: true });

const navegador = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
// Movimento reduzido: gráficos sem animação, capturas determinísticas.
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'pt-BR',
  reducedMotion: 'reduce',
});
const pagina = await contexto.newPage();
const erros: string[] = [];
// O 401 da checagem de sessão na tela de login é esperado (sem sessão ainda);
// o 503 da CAMILA sem credencial de modelo também — a tela o explica.
pagina.on('console', (m) => m.type() === 'error' && !/status of (401|503)/.test(m.text()) && erros.push(m.text()));
pagina.on('pageerror', (e) => erros.push(e.message));

/** `inteira: false` para estados com menu ou diálogo aberto: a captura de página inteira redimensiona e fecha o overlay. */
const capturar = async (p: Page, nome: string, inteira = true) => {
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${pasta}${nome}.png`, fullPage: inteira });
  console.log(`capturada: ${nome}`);
};

const ir = async (caminho: string, esperar: string) => {
  await pagina.goto(`${BASE}${caminho}`);
  await pagina.getByText(esperar, { exact: false }).first().waitFor();
};

// Login
await pagina.goto(`${BASE}/login`);
await capturar(pagina, '01-login');
await pagina.getByLabel('E-mail').fill('errado@teste.local');
await pagina.getByLabel('Senha').fill('senha-errada-aqui');
await pagina.getByRole('button', { name: 'Entrar' }).click();
await pagina.getByText('E-mail ou senha incorretos.').waitFor();
await capturar(pagina, '02-login-erro');
await pagina.getByLabel('E-mail').fill(email);
await pagina.getByLabel('Senha').fill(senha);
await pagina.getByRole('button', { name: 'Entrar' }).click();
await pagina.waitForURL(`${BASE}/a`);

// Plano A
await ir('/a', 'Na carteira');
await capturar(pagina, '03-painel-a');
await ir('/a/casos', 'Ativo / placa');
await capturar(pagina, '04-casos-a');
await ir('/a/casos/caso-a-001', 'Valor da dívida');
await capturar(pagina, '05-ficha-a');
await pagina.getByRole('tab', { name: 'Linha do tempo' }).click();
await pagina.getByText('Caso recebido').waitFor();
await capturar(pagina, '06-ficha-a-linha-do-tempo');
await pagina.getByRole('tab', { name: 'Devedor' }).click();
await pagina.getByRole('button', { name: 'Revelar dados' }).click();
await pagina.getByLabel('Finalidade').fill('confirmar identidade antes da abordagem em campo');
await capturar(pagina, '07-ficha-a-revelar', false);
await pagina.getByRole('button', { name: 'Revelar e registrar' }).click();
await pagina.getByText('Este acesso foi registrado').waitFor();
await capturar(pagina, '08-ficha-a-revelado');
await pagina.getByRole('tab', { name: 'Acessos' }).click();
await pagina.getByText('Quem revelou nome e documento').waitFor();
await capturar(pagina, '09-ficha-a-acessos');

await ir('/a/distribuicao', 'Fila de distribuição');
await capturar(pagina, '10-distribuicao');
const distribuir = pagina.getByRole('button', { name: 'Distribuir', exact: true });
if (await distribuir.count()) {
  await distribuir.first().click();
  await pagina.getByText('Distribuir para campo').waitFor();
  await capturar(pagina, '11-distribuir-dialogo', false);
  await pagina.keyboard.press('Escape');
}
await ir('/a/rede', 'Rede de campo');
await capturar(pagina, '12-rede');
await ir('/a/repasses', 'Ticket médio');
await pagina.getByRole('button', { name: 'Priorizar com a CAMILA' }).click();
await pagina.getByText('CAMILA indisponível').or(pagina.getByText('Crítica')).first().waitFor();
await capturar(pagina, '13-repasses');

// Plano B
await ir('/b', 'Saldo em negociação');
await capturar(pagina, '14-painel-b');
await ir('/b/casos', 'Ativo / placa');
await capturar(pagina, '15-casos-b');
await ir('/b/casos/caso-b-001', 'Para transferir');
await capturar(pagina, '16-ficha-b');

// Gestão
await ir('/gestao/dados', 'Custo por consulta');
await capturar(pagina, '17-dados');
await pagina.getByRole('tab', { name: 'Trilha de consultas' }).click();
await pagina.getByText('Append-only').waitFor();
await capturar(pagina, '18-trilha');
await ir('/gestao/fontes', 'Ingestão');
await capturar(pagina, '19-fontes');
await ir('/gestao/colisoes', 'Colisões de origem');
await capturar(pagina, '20-colisoes');
await ir('/gestao/usuarios', 'Situação');
await capturar(pagina, '21-usuarios');
await pagina.getByRole('button', { name: 'Novo usuário' }).click();
await pagina.getByLabel('Senha inicial').waitFor();
await capturar(pagina, '22-novo-usuario', false);
await pagina.keyboard.press('Escape');

// Busca e seletor
await pagina.keyboard.press('Control+k');
await pagina.getByPlaceholder('Placa, modelo, cidade ou tela…').waitFor();
await pagina.keyboard.type('corolla');
await capturar(pagina, '23-busca', false);
await pagina.keyboard.press('Escape');
await ir('/a', 'Na carteira');
await pagina.getByRole('button', { name: 'Trocar de plano' }).click();
await capturar(pagina, '24-seletor-de-plano', false);
await pagina.keyboard.press('Escape');

// Celular
await pagina.setViewportSize({ width: 390, height: 844 });
await ir('/a/casos/caso-a-001', 'Valor da dívida');
await capturar(pagina, '25-ficha-celular');

await navegador.close();
if (erros.length) {
  console.error(`\nerros no console:\n${erros.join('\n')}`);
  process.exit(1);
}
