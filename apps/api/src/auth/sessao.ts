/**
 * Sessão opaca guardada no banco.
 *
 * Token opaco em tabela, não JWT: um JWT não se revoga sem lista negra, e aqui
 * revogação imediata importa porque a trilha de auditoria atribui atos a
 * pessoas. O banco guarda o SHA-256 do token — vazar o banco não concede acesso.
 *
 * Todo acesso a `usuario` e `sessao` antes de existir sessão passa pelas
 * funções auth_* do banco: o papel da aplicação não lê essas tabelas direto.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { sql, type SQL } from 'drizzle-orm';

import { comContexto, type Contexto, type Db } from '@workspace/db';
import type { OrigemCaso } from '@workspace/domain';

import { conferirSenha, gerarHash } from './senha.ts';

export type Papel = 'admin' | 'gestor' | 'operador' | 'auditor';

export interface UsuarioSessao {
  id: string;
  tenantId: string;
  email: string;
  nome: string;
  papel: Papel;
  canais: OrigemCaso[];
}

export interface SessaoAberta {
  token: string;
  sessaoId: string;
  expiraEm: Date;
  usuario: UsuarioSessao;
}

export const DURACAO_SESSAO_HORAS = 12;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Contexto vazio: com ele o papel da aplicação só alcança as funções auth_*. */
const SEM_CONTEXTO: Contexto = { tenantId: '', usuarioId: null, canais: [] };

const consultar = <T>(db: Db, consulta: SQL): Promise<T[]> =>
  comContexto(db, SEM_CONTEXTO, async (tx) => ((await tx.execute(consulta)) as unknown as { rows: T[] }).rows);

interface LinhaUsuario {
  id: string;
  tenant_id: string;
  email: string;
  nome: string;
  senha_hash: string;
  papel: Papel;
  canais: OrigemCaso[];
  ativo: boolean;
}

// Hash de uma senha que ninguém tem: conferir contra ele gasta o mesmo tempo
// de uma senha errada, e o tempo de resposta não revela quais e-mails existem.
const HASH_FALSO = gerarHash(randomBytes(16).toString('hex'));

export const autenticar = async (db: Db, email: string, senha: string): Promise<SessaoAberta | null> => {
  const [u] = await consultar<LinhaUsuario>(db, sql`select * from auth_usuario_por_email(${email})`);

  // Mesma resposta — e mesmo tempo — para usuário inexistente, inativo e
  // senha errada: distinguir os casos entrega ao atacante quais e-mails existem.
  if (!u || !u.ativo) {
    await conferirSenha(senha, await HASH_FALSO);
    return null;
  }
  if (!(await conferirSenha(senha, u.senha_hash))) return null;

  const token = randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_HORAS * 3600_000);
  const [s] = await consultar<{ sessao_id: string }>(
    db,
    sql`select auth_abrir_sessao(${u.id}, ${hashToken(token)}, ${expiraEm.toISOString()}::timestamptz) as sessao_id`,
  );
  if (!s) return null;

  return {
    token,
    sessaoId: s.sessao_id,
    expiraEm,
    usuario: {
      id: u.id,
      tenantId: u.tenant_id,
      email: u.email,
      nome: u.nome,
      papel: u.papel,
      canais: u.canais,
    },
  };
};

/** Resolve o token num usuário, ou null se ausente, expirado ou revogado. */
export const resolverSessao = async (
  db: Db,
  token: string,
): Promise<{ sessaoId: string; usuario: UsuarioSessao } | null> => {
  const [l] = await consultar<{
    sessao_id: string;
    id: string;
    tenant_id: string;
    email: string;
    nome: string;
    papel: Papel;
    canais: OrigemCaso[];
  }>(db, sql`select * from auth_resolver_sessao(${hashToken(token)})`);
  if (!l) return null;
  return {
    sessaoId: l.sessao_id,
    usuario: { id: l.id, tenantId: l.tenant_id, email: l.email, nome: l.nome, papel: l.papel, canais: l.canais },
  };
};

export const revogarSessao = async (db: Db, token: string): Promise<void> => {
  await consultar(db, sql`select auth_revogar_sessao(${hashToken(token)})`);
};

/** Canais que o usuário pode ver. admin, gestor e auditor veem os dois. */
export const canaisVisiveis = (u: Pick<UsuarioSessao, 'papel' | 'canais'>): OrigemCaso[] =>
  u.papel === 'admin' || u.papel === 'gestor' || u.papel === 'auditor' ? ['plataforma_credor', 'lead_proprio'] : u.canais;

/**
 * Token CSRF derivado da sessão.
 *
 * O cookie de sessão é httpOnly, então o script da página não o lê; o token
 * CSRF chega no corpo do login e de /auth/eu e volta no cabeçalho
 * X-CSRF-Token. Um site de terceiros consegue fazer o navegador enviar o
 * cookie, mas não consegue ler o token.
 */
export const tokenCsrf = (segredo: string, sessaoId: string): string =>
  createHmac('sha256', segredo).update(sessaoId).digest('base64url');

export const conferirCsrf = (segredo: string, sessaoId: string, recebido: string | undefined): boolean => {
  if (!recebido) return false;
  const esperado = Buffer.from(tokenCsrf(segredo, sessaoId));
  const obtido = Buffer.from(recebido);
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
};
