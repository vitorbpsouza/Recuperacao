/**
 * Migra e popula o tenant ReCredita com dados sintéticos.
 *
 *   pnpm --filter @workspace/db seed
 *
 * O PGlite só aceita um processo por vez: pare a API antes de rodar.
 *
 * Com NODE_ENV=production (a imagem de staging e produção) exige
 * SEMEAR_DADOS_SINTETICOS=sim: dado inventado não entra em produção por engano.
 */
import { abrirBancoDoAmbiente } from '../cliente.ts';
import { migrar } from '../migrar.ts';
import { semear } from '../seed.ts';

if (process.env.NODE_ENV === 'production' && process.env.SEMEAR_DADOS_SINTETICOS !== 'sim') {
  console.error('seed sintético recusado: NODE_ENV=production sem SEMEAR_DADOS_SINTETICOS=sim');
  process.exit(1);
}

const banco = await abrirBancoDoAmbiente();
try {
  await migrar(banco.bruta);
  await semear(banco.db);
  for (const tabela of ['tenant', 'fonte_ativo', 'bureau', 'recuperador', 'ativo', 'caso', 'repasse', 'usuario']) {
    const [linha] = await banco.bruta.query<{ n: number }>(`select count(*)::int as n from ${tabela}`);
    console.log(`  ${tabela.padEnd(14)} ${linha?.n ?? 0}`);
  }
  console.log('\nseed aplicado (dados sintéticos).');
} finally {
  await banco.bruta.fechar();
}
