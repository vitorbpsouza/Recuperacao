/**
 * Ponto de entrada da API.
 *
 *   pnpm --filter @workspace/api dev
 *
 * Em desenvolvimento (PGlite), migra e semeia o banco na subida e, se
 * ADMIN_EMAIL e ADMIN_SENHA estiverem no .env, cria o admin local. O PGlite só
 * aceita um processo por vez, então fazer isso aqui evita rodar CLI com a API
 * no ar. Em produção as migrações rodam em um passo separado, com a credencial
 * de dono das tabelas — a API conecta com um papel sem permissão de DDL.
 */
import { eq } from 'drizzle-orm';

import { abrirBancoDoAmbiente, comoDono, migrar, schema, semear, TENANT_RECREDITA, type Banco } from '@workspace/db';

import { lerAmbiente } from './ambiente.ts';
import { criarClienteIa } from './ia.ts';
import { criarServidor } from './servidor.ts';
import { criarUsuario } from './servicos/usuarios.ts';

const prepararDesenvolvimento = async (banco: Banco) => {
  const novas = await migrar(banco.bruta);
  if (novas.length) console.log(`migrações aplicadas: ${novas.join(', ')}`);
  await semear(banco.db);

  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const senha = process.env.ADMIN_SENHA;
  if (!email || !senha) {
    console.log('defina ADMIN_EMAIL e ADMIN_SENHA no .env para criar o admin local');
    return;
  }
  await comoDono(banco.db, TENANT_RECREDITA.id, async (tx) => {
    const [existe] = await tx.select({ id: schema.usuario.id }).from(schema.usuario).where(eq(schema.usuario.email, email));
    if (!existe) {
      await criarUsuario(tx, { email, nome: 'Administrador', senha, papel: 'admin', canais: [] });
      console.log(`admin local criado: ${email}`);
    }
  });
};

const ambiente = lerAmbiente();
const banco = await abrirBancoDoAmbiente();
if (banco.tipo === 'pglite') await prepararDesenvolvimento(banco);

const app = await criarServidor({ db: banco.db, ambiente, ia: criarClienteIa(ambiente) });
await app.listen({ port: ambiente.PORT, host: '0.0.0.0' });

const encerrar = async () => {
  await app.close();
  await banco.bruta.fechar();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
