/**
 * Credenciais de integração cifradas no banco (AES-256-GCM).
 *
 * O banco guarda `v1.iv.tag.cifrado` em base64url; sem a chave do ambiente o
 * conteúdo não se lê. A tela nunca recebe a credencial, só o final dela.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const chaveDe = (segredo: string) => createHash('sha256').update(segredo).digest();

export const cifrar = (segredo: string, valor: unknown): string => {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chaveDe(segredo), iv);
  const corpo = Buffer.concat([cifra.update(JSON.stringify(valor), 'utf8'), cifra.final()]);
  return ['v1', iv.toString('base64url'), cifra.getAuthTag().toString('base64url'), corpo.toString('base64url')].join('.');
};

export const decifrar = <T>(segredo: string, texto: string): T => {
  const [versao, iv, tag, corpo] = texto.split('.');
  if (versao !== 'v1' || !iv || !tag || !corpo) throw new Error('credencial em formato desconhecido');
  const decifra = createDecipheriv('aes-256-gcm', chaveDe(segredo), Buffer.from(iv, 'base64url'));
  decifra.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decifra.update(Buffer.from(corpo, 'base64url')), decifra.final()]).toString('utf8')) as T;
};

/** "••••a1b2": o bastante para reconhecer qual chave está em uso. */
export const finalDe = (...valores: (string | undefined)[]) =>
  valores
    .filter(Boolean)
    .map((v) => `••••${v!.slice(-4)}`)
    .join(' · ');
