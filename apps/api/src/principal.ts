/**
 * Ponto de entrada da API.
 *
 *   pnpm --filter @workspace/api dev
 *
 * Na subida, a API prepara o banco:
 *
 *   - aplica as migrações pendentes (desligue com MIGRAR_NA_SUBIDA=nao quando
 *     a API conecta com um papel sem permissão de DDL e as migrações rodam em
 *     passo separado, como no Cloud Run — ver docs/infra.md);
 *   - com LOGIN_DA_API, concede a esse papel o papel da aplicação;
 *   - com ADMIN_EMAIL e ADMIN_SENHA, cria o admin se ele ainda não existir;
 *   - semeia dados sintéticos só no PGlite de desenvolvimento ou com
 *     SEMEAR_DADOS_SINTETICOS=sim (nunca em produção de verdade).
 *
 * Várias instâncias podem subir juntas: um advisory lock do Postgres faz uma
 * migrar de cada vez.
 */
import { eq } from 'drizzle-orm';

import { abrirBancoDoAmbiente, comoDono, migrar, schema, semear, TENANT_RECREDITA, type Banco } from '@workspace/db';

import { lerAmbiente } from './ambiente.ts';
import { criarClienteIa } from './ia.ts';
import { iniciarVarreduraDePrazos } from './jobs/prazos.ts';
import { criarServidor } from './servidor.ts';
import { criarUsuario } from './servicos/usuarios.ts';
import { criarBarramento } from './tempo-real.ts';

/** Chave do advisory lock da preparação do banco (qualquer inteiro fixo). */
const TRAVA_DE_PREPARO = 2_026_100_2;

const prepararBanco = async (banco: Banco) => {
  const migrarNaSubida = process.env.MIGRAR_NA_SUBIDA !== 'nao';
  const semearSintetico = banco.tipo === 'pglite' || process.env.SEMEAR_DADOS_SINTETICOS === 'sim';
  const loginDaApi = process.env.LOGIN_DA_API;
  if (loginDaApi !== undefined && !/^[a-z_][a-z0-9_]{0,62}$/.test(loginDaApi)) {
    throw new Error(`LOGIN_DA_API inválido: ${JSON.stringify(loginDaApi)}`);
  }

  await banco.bruta.exclusiva(async (c) => {
    await c.query('select pg_advisory_lock($1)', [TRAVA_DE_PREPARO]);
    try {
      if (migrarNaSubida) {
        const novas = await migrar(banco.bruta);
        console.log(novas.length ? `migrações aplicadas: ${novas.join(', ')}` : 'banco em dia: nenhuma migração pendente');
        if (loginDaApi) {
          await banco.bruta.exec(`grant recredita_app to ${loginDaApi}`);
          console.log(`${loginDaApi} conecta como recredita_app`);
        }
      }
      if (semearSintetico) {
        await semear(banco.db);
        console.log('dados sintéticos de demonstração aplicados');
      }
      await criarAdmin(banco);
    } finally {
      await c.query('select pg_advisory_unlock($1)', [TRAVA_DE_PREPARO]);
    }
  });
};

const criarAdmin = async (banco: Banco) => {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const senha = process.env.ADMIN_SENHA;
  if (!email || !senha) {
    console.log('ADMIN_EMAIL e ADMIN_SENHA não definidos: nenhum admin criado na subida');
    return;
  }
  await comoDono(banco.db, TENANT_RECREDITA.id, async (tx) => {
    const [existe] = await tx.select({ id: schema.usuario.id }).from(schema.usuario).where(eq(schema.usuario.email, email));
    if (existe) return;
    await criarUsuario(tx, { email, nome: 'Administrador', senha, papel: 'admin', canais: [] });
    console.log(`admin criado: ${email}`);
  });
};

const ambiente = lerAmbiente();
const banco = await abrirBancoDoAmbiente();
await prepararBanco(banco);

const barramento = await criarBarramento(banco.bruta, (erro) => console.error('evento ao vivo inválido', erro));
const app = await criarServidor({ db: banco.db, ambiente, ia: criarClienteIa(ambiente), barramento });
await app.listen({ port: ambiente.PORT, host: '0.0.0.0' });

const pararVarredura =
  ambiente.VARREDURA_PRAZOS_SEGUNDOS > 0
    ? iniciarVarreduraDePrazos(banco.bruta, ambiente.VARREDURA_PRAZOS_SEGUNDOS * 1000, app.log)
    : () => undefined;

const encerrar = async () => {
  pararVarredura();
  await app.close();
  await barramento.fechar();
  await banco.bruta.fechar();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
