/**
 * Cria um usuário pela linha de comando.
 *
 *   SENHA_INICIAL='…' pnpm --filter @workspace/api criar-usuario <email> <nome> <papel> [canal...]
 *
 * A senha vem de SENHA_INICIAL para não ficar no histórico do shell.
 * O tenant é TENANT_ID (padrão: recredita). Com PGlite, pare a API antes.
 */
import { abrirBancoDoAmbiente, comoDono, migrar, TENANT_RECREDITA } from '@workspace/db';
import { origemCaso, papelUsuario } from '@workspace/domain';

import { criarUsuario } from '../servicos/usuarios.ts';

const [email, nome, papelInformado, ...canaisInformados] = process.argv.slice(2);
const senha = process.env.SENHA_INICIAL;

if (!email || !nome || !papelInformado || !senha) {
  console.error('uso: SENHA_INICIAL=… criar-usuario <email> <nome> <papel> [canal...]');
  console.error('  papel: admin | operador | auditor');
  console.error('  canal: plataforma_credor | lead_proprio  (obrigatório para operador)');
  process.exit(1);
}

const papel = papelUsuario.parse(papelInformado);
const canais = canaisInformados.map((c) => origemCaso.parse(c));

const banco = await abrirBancoDoAmbiente();
try {
  if (banco.tipo === 'pglite') await migrar(banco.bruta);
  const u = await comoDono(banco.db, process.env.TENANT_ID ?? TENANT_RECREDITA.id, (tx) =>
    criarUsuario(tx, { email, nome, senha, papel, canais }),
  );
  console.log(`usuário criado: ${u.email} (${u.papel})`);
  console.log(u.papel === 'operador' ? `canais: ${u.canais.join(', ')}` : 'canais: todos (papel sem restrição de canal)');
} finally {
  await banco.bruta.fechar();
}
