/**
 * Foto de campo: arquivo original no volume, hash para a cadeia de custódia,
 * metadados lidos no servidor e leitura da placa.
 *
 * O EXIF é lido do arquivo aqui, não do que o navegador declarou: é o que
 * vale como prova. A coordenada do aparelho entra só quando a foto não tem
 * GPS (o iPhone costuma tirar) e fica marcada como tal.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { GoogleGenAI } from '@google/genai';
import { sql, type SQL } from 'drizzle-orm';
import exifr from 'exifr';

import type { Tx } from '@workspace/db';

import { lerPlacaNaFoto, type LeituraDePlaca } from '../integracoes/ocr-placa.ts';

const consultar = async <T>(tx: Tx, q: SQL): Promise<T[]> => ((await tx.execute(q)) as unknown as { rows: T[] }).rows;

const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export interface FotoPreparada {
  conteudo: Buffer;
  tipoMime: string;
  sha256: string;
  exif: Record<string, unknown>;
  tiradaEm: Date | null;
  gps: { latitude: number; longitude: number } | null;
  ocr: LeituraDePlaca | null;
  ocrStatus: 'lida' | 'ilegivel' | 'sem_modelo' | 'erro';
}

/** Só os metadados que importam para a prova e para achar o veículo (sem miniatura nem binário). */
const METADADOS = ['Make', 'Model', 'Software', 'DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'latitude', 'longitude',
  'GPSAltitude', 'GPSHPositioningError', 'GPSImgDirection', 'GPSSpeed', 'ExifImageWidth', 'ExifImageHeight', 'Orientation', 'LensModel'];

export const prepararFoto = async (
  base64: string,
  tipoMime: string,
  ia: GoogleGenAI | null,
  modelo: string,
): Promise<FotoPreparada> => {
  const conteudo = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  const sha256 = createHash('sha256').update(conteudo).digest('hex');

  let exif: Record<string, unknown> = {};
  try {
    const bruto = ((await exifr.parse(conteudo, { gps: true, tiff: true, exif: true })) ?? {}) as Record<string, unknown>;
    exif = Object.fromEntries(
      Object.entries(bruto).filter(([k, v]) => METADADOS.includes(k) && (v instanceof Date || (v !== undefined && typeof v !== 'object'))),
    );
  } catch {
    // Foto sem EXIF (print, imagem editada): segue sem metadados.
  }
  const lat = Number(exif.latitude);
  const lon = Number(exif.longitude);
  const gps = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0) ? { latitude: lat, longitude: lon } : null;
  const data = exif.DateTimeOriginal ?? exif.CreateDate;
  const tiradaEm = data instanceof Date && !Number.isNaN(data.getTime()) ? data : null;

  let ocr: LeituraDePlaca | null = null;
  let ocrStatus: FotoPreparada['ocrStatus'] = 'sem_modelo';
  if (ia) {
    try {
      ocr = await lerPlacaNaFoto(ia, modelo, conteudo, tipoMime);
      ocrStatus = ocr.legivel ? 'lida' : 'ilegivel';
    } catch {
      ocrStatus = 'erro';
    }
  }
  return { conteudo, tipoMime, sha256, exif, tiradaEm, gps, ocr, ocrStatus };
};

export interface ResultadoDaFoto {
  id: number;
  repetida: boolean;
  placaLida: string | null;
  placaConfere: boolean | null;
  /** Placa lida que pertence a outro caso da carteira (que a sessão enxerga). */
  outroCaso: { id: string; placa: string } | null;
  origemCoordenada: 'exif' | 'aparelho' | null;
  avistamentoId: string | null;
  ocrStatus: FotoPreparada['ocrStatus'];
}

/**
 * Grava arquivo, foto e — com coordenada, no Plano A — o avistamento com
 * fonte "foto". Roda dentro da transação da requisição (ou do link).
 */
export const gravarFoto = async (
  tx: Tx,
  pasta: string,
  f: FotoPreparada,
  o: {
    tenantId: string;
    casoId: string;
    linkId?: string | null;
    aparelho?: { latitude: number; longitude: number; precisao?: number } | null;
    descricao?: string | null;
  },
): Promise<ResultadoDaFoto | null> => {
  const [caso] = await consultar<{ placa: string; finalidade: string }>(
    tx,
    sql`select a.placa, k.finalidade from caso k join ativo a on a.id = k.ativo_id where k.id = ${o.casoId}`,
  );
  if (!caso) return null;

  const [repetida] = await consultar<{ id: number; placaLida: string | null; placaConfere: boolean | null; origem: 'exif' | 'aparelho' | null; ocrStatus: FotoPreparada['ocrStatus'] }>(
    tx,
    sql`select id::int as id, placa_lida as "placaLida", placa_confere as "placaConfere", origem_coordenada as origem, ocr_status as "ocrStatus"
          from foto where caso_id = ${o.casoId} and sha256 = ${f.sha256}`,
  );
  if (repetida) {
    return { id: repetida.id, repetida: true, placaLida: repetida.placaLida, placaConfere: repetida.placaConfere, outroCaso: null, origemCoordenada: repetida.origem, avistamentoId: null, ocrStatus: repetida.ocrStatus };
  }

  const relativo = join(o.tenantId, o.casoId, `${f.sha256}.${EXTENSAO[f.tipoMime] ?? 'img'}`);
  await mkdir(join(pasta, o.tenantId, o.casoId), { recursive: true });
  await writeFile(join(pasta, relativo), f.conteudo);

  const coordenada = f.gps
    ? { ...f.gps, precisao: Number(f.exif.GPSHPositioningError) || null, origem: 'exif' as const }
    : o.aparelho
      ? { latitude: o.aparelho.latitude, longitude: o.aparelho.longitude, precisao: o.aparelho.precisao ?? null, origem: 'aparelho' as const }
      : null;
  const placaLida = f.ocr?.placa ?? null;
  const placaConfere = placaLida ? placaLida === caso.placa : null;

  const [foto] = await consultar<{ id: number }>(
    tx,
    sql`insert into foto (caso_id, arquivo, sha256, tipo_mime, tamanho_bytes, exif, tirada_em, latitude, longitude, precisao_m,
                          origem_coordenada, placa_lida, placa_confere, ocr, ocr_status, descricao, link_id)
        values (${o.casoId}, ${relativo.replace(/\\/g, '/')}, ${f.sha256}, ${f.tipoMime}, ${f.conteudo.length}, ${JSON.stringify(f.exif)}::jsonb,
                ${f.tiradaEm?.toISOString() ?? null}::timestamptz, ${coordenada?.latitude ?? null}, ${coordenada?.longitude ?? null},
                ${coordenada?.precisao ?? null}, ${coordenada?.origem ?? null}, ${placaLida}, ${placaConfere},
                ${f.ocr ? JSON.stringify(f.ocr) : null}::jsonb, ${f.ocrStatus}, ${o.descricao ?? null}, ${o.linkId ?? null})
        returning id::int as id`,
  );

  let outroCaso: ResultadoDaFoto['outroCaso'] = null;
  if (placaLida && !placaConfere) {
    const [outro] = await consultar<{ id: string; placa: string }>(
      tx,
      sql`select k.id, a.placa from caso k join ativo a on a.id = k.ativo_id where a.placa = ${placaLida} and k.id <> ${o.casoId} limit 1`,
    );
    outroCaso = outro ?? null;
  }

  // Avistamento só com coordenada, só no Plano A e só se a placa não for de outro carro.
  let avistamentoId: string | null = null;
  if (coordenada && caso.finalidade === 'recuperacao_para_credor' && placaConfere !== false) {
    const quando = f.tiradaEm && f.tiradaEm.getTime() <= Date.now() + 5 * 60_000 ? f.tiradaEm : new Date();
    const [a] = await consultar<{ id: string }>(
      tx,
      sql`insert into avistamento (caso_id, observado_em, latitude, longitude, descricao, fonte, origem_coordenada, precisao_m, foto_id, link_id)
          values (${o.casoId}, ${quando.toISOString()}::timestamptz, ${coordenada.latitude.toFixed(6)}::numeric, ${coordenada.longitude.toFixed(6)}::numeric,
                  ${o.descricao && o.descricao.length >= 5 ? o.descricao : `Foto de campo${placaLida ? ` · placa ${placaLida}` : ''}`}, 'foto',
                  ${coordenada.origem}, ${coordenada.precisao}, ${foto!.id}, ${o.linkId ?? null})
          returning id::text as id`,
    );
    avistamentoId = a?.id ?? null;
  }

  return { id: foto!.id, repetida: false, placaLida, placaConfere, outroCaso, origemCoordenada: coordenada?.origem ?? null, avistamentoId, ocrStatus: f.ocrStatus };
};
