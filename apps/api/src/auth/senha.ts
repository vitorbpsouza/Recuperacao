/**
 * Hash de senha com `scrypt` do core do Node.
 *
 * scrypt é adequado para senha (memory-hard, custo configurável) e evita
 * dependência nativa. Formato `salt:hash`, ambos hex — o mesmo do sistema
 * anterior, então hashes antigos continuam válidos.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (senha: string, salt: Buffer, tamanho: number) => Promise<Buffer>;

const TAMANHO_HASH = 64;
export const TAMANHO_MINIMO_SENHA = 12;

export const gerarHash = async (senha: string): Promise<string> => {
  const salt = randomBytes(16);
  const hash = await scrypt(senha, salt, TAMANHO_HASH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
};

export const conferirSenha = async (senha: string, guardado: string): Promise<boolean> => {
  const [saltHex, hashHex] = guardado.split(':');
  if (!saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const obtido = await scrypt(senha, Buffer.from(saltHex, 'hex'), esperado.length);
  // Comparação em tempo constante: `===` vaza o tamanho do prefixo correto.
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
};
