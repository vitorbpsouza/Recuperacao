import type { Tx } from '@workspace/db';
import { schema } from '@workspace/db';
import type { OrigemCaso } from '@workspace/domain';

import { gerarHash, TAMANHO_MINIMO_SENHA } from '../auth/senha.ts';

export interface NovoUsuario {
  email: string;
  nome: string;
  senha: string;
  papel: 'admin' | 'gestor' | 'operador' | 'auditor';
  canais: OrigemCaso[];
}

/** Recusa de regra de cadastro: vira 409, como no sistema anterior. */
export class CadastroRecusado extends Error {
  readonly statusCode = 409;
}

/**
 * Cria um usuário no tenant da transação.
 *
 * Senha curta e operador sem canal falham alto aqui: uma conta inerte ou
 * fácil de adivinhar é pior que um cadastro recusado.
 */
export const criarUsuario = async (tx: Tx, novo: NovoUsuario) => {
  if (novo.senha.length < TAMANHO_MINIMO_SENHA) {
    throw new CadastroRecusado(`senha deve ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres`);
  }
  // O banco também recusa (constraint operador_com_canal); a mensagem daqui é mais clara.
  if (novo.papel === 'operador' && novo.canais.length === 0) {
    throw new CadastroRecusado('operador precisa de ao menos um canal');
  }
  const [criado] = await tx
    .insert(schema.usuario)
    .values({
      email: novo.email.toLowerCase().trim(),
      nome: novo.nome,
      senhaHash: await gerarHash(novo.senha),
      papel: novo.papel,
      canais: novo.canais,
    })
    .returning({
      id: schema.usuario.id,
      email: schema.usuario.email,
      nome: schema.usuario.nome,
      papel: schema.usuario.papel,
      canais: schema.usuario.canais,
    });
  return criado!;
};
