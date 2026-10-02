/**
 * Autenticação por sessão opaca.
 *
 * Duas decisões que valem registro:
 *
 * 1. `scrypt` do core do Node, não bcrypt/argon2. Evita dependência nativa a
 *    mais num projeto que já sofre com build nativo, e scrypt é adequado para
 *    senha (memory-hard, com custo configurável).
 * 2. Token opaco em tabela, não JWT. Um JWT não se revoga sem lista negra — e
 *    aqui revogação imediata importa, porque a trilha de auditoria atribui atos
 *    a pessoas. Guardamos o SHA-256 do token: vazar o banco não concede acesso.
 */
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

import type { NextFunction, Request, Response } from 'express';

import type { OrigemCaso } from '../src/domain/casos.js';
import type { Banco } from './db.js';

const scrypt = promisify(scryptCb) as (
  senha: string,
  salt: Buffer,
  tamanho: number,
) => Promise<Buffer>;

const TAMANHO_HASH = 64;
const DURACAO_SESSAO_HORAS = 12;

export type Papel = 'admin' | 'operador' | 'auditor';

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  canais: OrigemCaso[];
}

// Express não conhece `req.usuario`; declarar aqui evita `as any` nas rotas.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: Usuario;
      sessaoId?: string;
    }
  }
}

// --- senha ------------------------------------------------------------------

const gerarHash = async (senha: string): Promise<string> => {
  const salt = randomBytes(16);
  const hash = await scrypt(senha, salt, TAMANHO_HASH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
};

const conferirSenha = async (senha: string, guardado: string): Promise<boolean> => {
  const [saltHex, hashHex] = guardado.split(':');
  if (!saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const obtido = await scrypt(senha, Buffer.from(saltHex, 'hex'), esperado.length);
  // Comparação em tempo constante: `===` vaza o tamanho do prefixo correto.
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
};

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

// --- usuários ---------------------------------------------------------------

export interface NovoUsuario {
  email: string;
  nome: string;
  senha: string;
  papel: Papel;
  canais: OrigemCaso[];
}

export const criarUsuario = async (db: Banco, novo: NovoUsuario): Promise<Usuario> => {
  if (novo.senha.length < 12) {
    throw new Error('senha deve ter ao menos 12 caracteres');
  }
  // Um operador sem canal não consegue fazer nada: provavelmente é erro de
  // cadastro, e falhar alto aqui é melhor que criar uma conta inerte.
  if (novo.papel === 'operador' && novo.canais.length === 0) {
    throw new Error('operador precisa de ao menos um canal');
  }
  const email = novo.email.toLowerCase().trim();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO usuario (id, email, nome, senha_hash, papel, canais)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, email, novo.nome, await gerarHash(novo.senha), novo.papel, JSON.stringify(novo.canais));
  return { id, email, nome: novo.nome, papel: novo.papel, canais: novo.canais };
};

// --- sessão -----------------------------------------------------------------

export interface SessaoAberta {
  token: string;
  expiraEm: string;
  usuario: Usuario;
}

export const autenticar = async (
  db: Banco,
  email: string,
  senha: string,
): Promise<SessaoAberta | null> => {
  const linha = db
    .prepare('SELECT id, email, nome, senha_hash, papel, canais, ativo FROM usuario WHERE email = ?')
    .get(email.toLowerCase().trim()) as
    | {
        id: string;
        email: string;
        nome: string;
        senha_hash: string;
        papel: Papel;
        canais: string;
        ativo: number;
      }
    | undefined;

  // Mesma resposta para usuário inexistente, inativo e senha errada: distinguir
  // os casos entrega ao atacante quais e-mails existem.
  if (!linha || !linha.ativo) return null;
  if (!(await conferirSenha(senha, linha.senha_hash))) return null;

  const token = randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_HORAS * 3600_000).toISOString();

  db.prepare('INSERT INTO sessao (id, usuario_id, token_hash, expira_em) VALUES (?, ?, ?, ?)').run(
    randomUUID(),
    linha.id,
    hashToken(token),
    expiraEm,
  );

  return {
    token,
    expiraEm,
    usuario: {
      id: linha.id,
      email: linha.email,
      nome: linha.nome,
      papel: linha.papel,
      canais: JSON.parse(linha.canais) as OrigemCaso[],
    },
  };
};

export const revogarSessao = (db: Banco, token: string): void => {
  db.prepare('UPDATE sessao SET revogada_em = ? WHERE token_hash = ? AND revogada_em IS NULL').run(
    new Date().toISOString(),
    hashToken(token),
  );
};

/** Resolve o token num usuário, ou null se ausente, expirado ou revogado. */
export const usuarioDoToken = (
  db: Banco,
  token: string,
): (Usuario & { sessaoId: string }) | null => {
  const linha = db
    .prepare(
      `SELECT s.id AS sessao_id, u.id, u.email, u.nome, u.papel, u.canais
         FROM sessao s JOIN usuario u ON u.id = s.usuario_id
        WHERE s.token_hash = ?
          AND s.revogada_em IS NULL
          AND s.expira_em > ?
          AND u.ativo = 1`,
    )
    .get(hashToken(token), new Date().toISOString()) as
    | { sessao_id: string; id: string; email: string; nome: string; papel: Papel; canais: string }
    | undefined;

  if (!linha) return null;
  return {
    sessaoId: linha.sessao_id,
    id: linha.id,
    email: linha.email,
    nome: linha.nome,
    papel: linha.papel,
    canais: JSON.parse(linha.canais) as OrigemCaso[],
  };
};

// --- middleware -------------------------------------------------------------

const lerToken = (req: Request): string | null => {
  const h = req.header('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t.length > 0 ? t : null;
};

export const exigirAutenticacao =
  (db: Banco) => (req: Request, res: Response, next: NextFunction) => {
    const token = lerToken(req);
    if (!token) return res.status(401).json({ erro: 'autenticação obrigatória' });

    const usuario = usuarioDoToken(db, token);
    if (!usuario) return res.status(401).json({ erro: 'sessão inválida ou expirada' });

    req.usuario = usuario;
    req.sessaoId = usuario.sessaoId;
    next();
  };

/**
 * Autorização por canal. Um operador de recuperação não enxerga a carteira de
 * aquisição e vice-versa — a separação de finalidade também vale entre pessoas.
 * `auditor` lê os dois para poder auditar; `admin` não tem restrição.
 */
export const exigirCanal =
  (origem: OrigemCaso) => (req: Request, res: Response, next: NextFunction) => {
    const u = req.usuario;
    if (!u) return res.status(401).json({ erro: 'autenticação obrigatória' });
    if (u.papel === 'admin' || u.papel === 'auditor') return next();
    if (!u.canais.includes(origem)) {
      return res.status(403).json({ erro: `sem permissão para o canal ${origem}` });
    }
    next();
  };

export const exigirPapel =
  (...papeis: Papel[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const u = req.usuario;
    if (!u) return res.status(401).json({ erro: 'autenticação obrigatória' });
    if (!papeis.includes(u.papel)) {
      return res.status(403).json({ erro: `requer papel: ${papeis.join(' ou ')}` });
    }
    next();
  };

/** Auditor é somente-leitura: pode ver tudo, não pode alterar nada. */
export const bloquearAuditorEmEscrita = (req: Request, res: Response, next: NextFunction) => {
  if (req.usuario?.papel === 'auditor' && req.method !== 'GET') {
    return res.status(403).json({ erro: 'auditor tem acesso somente de leitura' });
  }
  next();
};
