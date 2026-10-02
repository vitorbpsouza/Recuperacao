/**
 * Cria um usuário pela linha de comando.
 *
 * Existe porque `POST /api/usuarios` exige um admin autenticado — sem um
 * caminho fora da API, o primeiro admin seria impossível de criar. Deliberadamente
 * não há auto-cadastro na API.
 *
 *   npx tsx server/criar-usuario.ts admin@exemplo.com "Nome" admin
 *   npx tsx server/criar-usuario.ts op@exemplo.com "Nome" operador plataforma_credor
 *
 * A senha é lida de SENHA_INICIAL para não ficar no histórico do shell.
 */
import 'dotenv/config';

import type { OrigemCaso } from '../src/domain/casos.js';
import type { Papel } from './auth.js';
import { criarUsuario } from './auth.js';
import { abrirBanco } from './db.js';

const [email, nome, papel, ...canais] = process.argv.slice(2);

if (!email || !nome || !papel) {
  console.error('uso: tsx server/criar-usuario.ts <email> <nome> <papel> [canal...]');
  console.error('  papel: admin | operador | auditor');
  console.error('  canal: plataforma_credor | lead_proprio  (obrigatório para operador)');
  console.error('  senha: definida em SENHA_INICIAL no ambiente');
  process.exit(1);
}

const senha = process.env.SENHA_INICIAL;
if (!senha) {
  console.error('defina SENHA_INICIAL no ambiente (mínimo 12 caracteres)');
  process.exit(1);
}

const papeisValidos: Papel[] = ['admin', 'operador', 'auditor'];
if (!papeisValidos.includes(papel as Papel)) {
  console.error(`papel inválido: ${papel}. Use: ${papeisValidos.join(' | ')}`);
  process.exit(1);
}

const canaisValidos: OrigemCaso[] = ['plataforma_credor', 'lead_proprio'];
const invalido = canais.find((c) => !canaisValidos.includes(c as OrigemCaso));
if (invalido) {
  console.error(`canal inválido: ${invalido}. Use: ${canaisValidos.join(' | ')}`);
  process.exit(1);
}

const db = abrirBanco();

try {
  const u = await criarUsuario(db, {
    email,
    nome,
    senha,
    papel: papel as Papel,
    canais: canais as OrigemCaso[],
  });
  console.log(`criado: ${u.email} (${u.papel})`);
  if (u.canais.length > 0) console.log(`canais: ${u.canais.join(', ')}`);
  else if (u.papel !== 'operador') console.log('canais: todos (papel sem restrição de canal)');
} catch (e) {
  console.error(`falha: ${(e as Error).message}`);
  process.exit(1);
}
