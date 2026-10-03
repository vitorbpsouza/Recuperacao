/**
 * Mídia do WhatsApp no volume (FOTOS_DIR/whatsapp/<tenant>/<AAAA-MM>/<sha256>.<ext>).
 *
 * O nome do arquivo é o SHA-256 do conteúdo: o mesmo arquivo mandado duas
 * vezes ocupa um lugar só, e o hash gravado na mensagem confere o arquivo.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Limite de uma mídia (o WhatsApp manda documento de até 2 GB; a operação não precisa disso). */
export const LIMITE_MIDIA = 32 * 1024 * 1024;

const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

export interface MidiaGuardada {
  arquivo: string;
  sha256: string;
  tamanho: number;
}

export class MidiaGrandeDemais extends Error {}

/** Tira o prefixo `data:...;base64,` e decodifica. */
export const conteudoDoBase64 = (base64: string) => Buffer.from(base64.replace(/^data:[^,]*,/, ''), 'base64');

export const guardarMidia = async (dir: string, tenantId: string, conteudo: Buffer, mime: string | null): Promise<MidiaGuardada> => {
  if (conteudo.length === 0) throw new Error('mídia vazia');
  if (conteudo.length > LIMITE_MIDIA) throw new MidiaGrandeDemais(`mídia grande demais (máximo de ${LIMITE_MIDIA / 1024 / 1024} MB)`);
  const sha256 = createHash('sha256').update(conteudo).digest('hex');
  const mes = new Date().toISOString().slice(0, 7);
  const relativo = join('whatsapp', tenantId.replace(/[^\w-]/g, '_'), mes);
  await mkdir(join(dir, relativo), { recursive: true });
  const arquivo = join(relativo, `${sha256}.${(mime && EXTENSAO[mime]) ?? 'bin'}`).replaceAll('\\', '/');
  await writeFile(join(dir, arquivo), conteudo);
  return { arquivo, sha256, tamanho: conteudo.length };
};
