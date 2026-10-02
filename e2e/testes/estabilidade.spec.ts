/**
 * Tela parada não renderiza.
 *
 * Um laço de renderização passa por qualquer teste funcional: a tela funciona,
 * só queima CPU. Até o laço cair dentro de um clique — aí o React trata a
 * atualização como síncrona e a página congela. Foi o que aconteceu com a
 * lista de casos (estado da tabela com identidade nova a cada render).
 *
 * A contagem usa o gancho que o React DevTools usa: o React chama
 * `onCommitFiberRoot` a cada commit, também no build de produção.
 */
import { expect, test, type Page } from '@playwright/test';

interface JanelaComContador {
  __commits: number;
  __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown;
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const w = window as unknown as JanelaComContador;
    w.__commits = 0;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onScheduleFiberRoot: () => {},
      onCommitFiberRoot: () => {
        w.__commits++;
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    };
  });
});

const commits = (page: Page) => page.evaluate(() => (window as unknown as JanelaComContador).__commits);

/**
 * Commits num segundo sem nenhuma interação, depois de a tela carregar. Medir
 * tempo é o objetivo aqui. O laço que este teste pega dá milhares de commits
 * por segundo; a folga cobre o que assenta atrasado (dado, fonte, gráfico
 * medindo o próprio tamanho).
 */
const LIMITE = 10;
const commitsParado = async (page: Page) => {
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await page.waitForTimeout(500);
  const antes = await commits(page);
  await page.waitForTimeout(1_000);
  return (await commits(page)) - antes;
};

const TELAS = [
  '/a',
  '/a/casos',
  '/a/distribuicao',
  '/a/rede',
  '/a/repasses',
  '/b',
  '/b/casos',
  '/gestao/dados',
  '/gestao/fontes',
  '/gestao/relatorios',
  '/gestao/colisoes',
  '/gestao/usuarios',
];

test('nenhuma tela fica renderizando parada', async ({ page }) => {
  test.setTimeout(90_000);
  for (const tela of TELAS) {
    await page.goto(tela);
    expect(await commitsParado(page), `commits com ${tela} parada`).toBeLessThanOrEqual(LIMITE);
  }
});

test('lista de casos assenta depois de buscar e limpar', async ({ page }) => {
  for (const lista of ['/a/casos', '/b/casos']) {
    await page.goto(lista);
    // Um segundo render depois da carga é o que dispara um laço latente.
    const busca = page.getByRole('textbox', { name: 'Buscar casos' });
    await busca.fill('seed');
    await busca.fill('');
    expect(await commitsParado(page), `commits com ${lista} parada`).toBeLessThanOrEqual(LIMITE);
  }
});
