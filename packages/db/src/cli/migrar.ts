/**
 * Aplica as migrações pendentes no banco do ambiente.
 *
 *   pnpm --filter @workspace/db migrar
 *
 * Sem DATABASE_URL, usa o PGlite de desenvolvimento. O PGlite só aceita um
 * processo por vez: pare a API antes de rodar.
 *
 * Em staging e produção roda com a credencial do dono das tabelas, e
 * LOGIN_DA_API nomeia o papel com que a API conecta: ele recebe aqui o papel
 * da aplicação (recredita_app). Só quem criou esse papel — o dono, na primeira
 * migração — pode concedê-lo; fazer isso no mesmo passo dispensa uma sessão
 * manual com a senha do dono.
 */
import { abrirBancoDoAmbiente } from '../cliente.ts';
import { migrar } from '../migrar.ts';

const loginDaApi = process.env.LOGIN_DA_API;
if (loginDaApi !== undefined && !/^[a-z_][a-z0-9_]{0,62}$/.test(loginDaApi)) {
  console.error(`LOGIN_DA_API inválido: ${JSON.stringify(loginDaApi)} (use um nome de papel simples, como recredita_api)`);
  process.exit(1);
}

const banco = await abrirBancoDoAmbiente();
try {
  const novas = await migrar(banco.bruta);
  console.log(novas.length ? `aplicadas: ${novas.join(', ')}` : 'nenhuma migração pendente');
  if (loginDaApi) {
    // Idempotente: conceder de novo só gera um aviso do Postgres.
    await banco.bruta.exec(`grant recredita_app to ${loginDaApi}`);
    console.log(`${loginDaApi} conecta como recredita_app`);
  }
} finally {
  await banco.bruta.fechar();
}
