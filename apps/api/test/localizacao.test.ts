/** Onde procurar, fotos de campo (EXIF, hash, OCR) e o link para o terceiro. */
import { createHash } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ambienteDeTeste, externo, iaFalsa, type Ambiente, type Sessao } from './apoio.ts';

let amb: Ambiente & { fotosDir: string };
let opA: Sessao;
let opB: Sessao;
beforeAll(async () => {
  amb = await ambienteDeTeste({ comIa: true });
  opA = await amb.entrar('opa@teste.local');
  opB = await amb.entrar('opb@teste.local');
});
afterAll(() => amb.fechar());
beforeEach(() => {
  externo.chamadas.length = 0;
  externo.responder = () => [];
});

/**
 * JPEG com bloco EXIF de GPS (TIFF little-endian, IFD0 → GPS IFD), montado
 * byte a byte: 19°51'55.8"S 44°36'51.12"W ≈ (-19.8655, -44.6142).
 */
const jpegComGps = (variante = 0) => {
  const tiff = Buffer.alloc(128 + 1);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  // IFD0: uma entrada, o ponteiro para o GPS IFD (26).
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  // GPS IFD: referência e valor da latitude e da longitude.
  const entrada = (i: number, tag: number, tipo: number, n: number, valor: number | string) => {
    const o = 28 + i * 12;
    tiff.writeUInt16LE(tag, o);
    tiff.writeUInt16LE(tipo, o + 2);
    tiff.writeUInt32LE(n, o + 4);
    if (typeof valor === 'string') tiff.write(valor, o + 8, 'ascii');
    else tiff.writeUInt32LE(valor, o + 8);
  };
  tiff.writeUInt16LE(4, 26);
  entrada(0, 0x0001, 2, 2, 'S\0');
  entrada(1, 0x0002, 5, 3, 80);
  entrada(2, 0x0003, 2, 2, 'W\0');
  entrada(3, 0x0004, 5, 3, 104);
  tiff.writeUInt32LE(0, 76);
  [19, 1, 51, 1, 5580, 100, 44, 1, 36, 1, 5112, 100].forEach((v, i) => tiff.writeUInt32LE(v, 80 + i * 4));
  tiff.writeUInt8(variante, 128);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(exif.length + 2) >> 8, (exif.length + 2) & 0xff]), exif]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.alloc(64, 0), Buffer.from([0xff, 0xd9])]);
};

const SEM_EXIF = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(200, 7), Buffer.from([0xff, 0xd9])]);

describe('foto de campo', () => {
  it('lê o GPS do EXIF no servidor, guarda o original com hash e vira avistamento', async () => {
    iaFalsa.resposta = { legivel: true, placa: 'SEED-001', cor: 'BRANCA', modelo: 'FIAT ARGO', confianca: 0.93 };
    const imagem = jpegComGps();
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/fotos', {
      imagem: imagem.toString('base64'),
      tipoMime: 'image/jpeg',
      // Coordenada do aparelho diferente: a do EXIF vence.
      latitude: -10,
      longitude: -40,
      descricao: 'estacionado em frente ao portão',
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ repetida: false, placaLida: 'SEED001', placaConfere: true, origemCoordenada: 'exif', ocrStatus: 'lida' });

    const [foto] = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/fotos')).json();
    expect(foto).toMatchObject({ sha256: createHash('sha256').update(imagem).digest('hex'), autor: 'opa', peloLink: false, origemCoordenada: 'exif' });
    expect(foto.latitude).toBeCloseTo(-19.8655, 4);
    expect(foto.longitude).toBeCloseTo(-44.6142, 4);

    const arquivo = await amb.chamar(opA, 'GET', `/api/fotos/${foto.id}/arquivo`);
    expect(arquivo.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.from(arquivo.rawPayload).equals(imagem)).toBe(true);

    const avistamentos = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/avistamentos')).json();
    expect(avistamentos.find((a: { fonte: string }) => a.fonte === 'foto')).toMatchObject({ descricao: 'estacionado em frente ao portão' });
  });

  it('a mesma foto de novo não duplica', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/fotos', { imagem: jpegComGps().toString('base64'), tipoMime: 'image/jpeg' });
    expect(r.json()).toMatchObject({ repetida: true });
  });

  it('placa de outro caso: avisa e não cria avistamento neste caso', async () => {
    iaFalsa.resposta = { legivel: true, placa: 'SEED002', confianca: 0.9 };
    const r = (await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/fotos', { imagem: jpegComGps(1).toString('base64'), tipoMime: 'image/jpeg' })).json();
    expect(r).toMatchObject({ placaLida: 'SEED002', placaConfere: false, outroCaso: { id: 'caso-a-002', placa: 'SEED002' }, avistamentoId: null });
  });

  it('sem EXIF, usa a localização do aparelho e marca a origem', async () => {
    iaFalsa.resposta = { legivel: false, placa: null };
    const r = (
      await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/fotos', {
        imagem: SEM_EXIF.toString('base64'),
        tipoMime: 'image/jpeg',
        latitude: -19.9,
        longitude: -43.9,
        precisao: 12,
      })
    ).json();
    expect(r).toMatchObject({ origemCoordenada: 'aparelho', ocrStatus: 'ilegivel', placaLida: null });
    expect(r.avistamentoId).not.toBeNull();
  });

  it('foto não se apaga', async () => {
    const [{ id }] = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/fotos')).json();
    expect(id).toBeGreaterThan(0);
    expect((await amb.chamar(opB, 'GET', '/api/casos/caso-a-001/fotos')).json()).toEqual([]);
    expect((await amb.chamar(opB, 'GET', `/api/fotos/${id}/arquivo`)).statusCode).toBe(404);
  });
});

describe('onde procurar', () => {
  it('põe os endereços no mapa e junta com os avistamentos', async () => {
    await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/relatorios', {
      texto: `--- DADOS BÁSICOS ---\nNome: PESSOA FICTICIA\nCPF: 012.345.678-90\n--- ENDERECOS ---\nR MARINGA, Nº 195, CENTRO, PARA DE MINAS/MG, 35660-179\nAV DISTANTE 10, CENTRO, MONTES CLAROS/MG, 39400-001`,
      papelPessoa: 'devedor',
    });
    externo.responder = (url) =>
      url.includes('nominatim') && url.includes('MARINGA')
        ? [{ lat: '-19.8656', lon: '-44.6141', address: { house_number: '195' } }]
        : url.includes('brasilapi')
          ? { location: { coordinates: { latitude: '-16.73', longitude: '-43.86' } } }
          : [];
    const g = (await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/geocodificar')).json();
    expect(g).toEqual({ localizados: 2, falharam: 0, restantes: 0 });
    expect(externo.chamadas.find((c) => c.url.includes('nominatim'))!.headers).toMatchObject({ 'user-agent': expect.stringContaining('ReCredita') });

    const l = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/localizacao')).json();
    expect(l.enderecosSemCoordenada).toBe(0);
    const [primeiro] = l.lugares;
    // O endereço da Maringá e as fotos tiradas ali formam o primeiro lugar, confirmado.
    expect(primeiro).toMatchObject({ confirmadoPorAvistamento: true, porTipo: expect.objectContaining({ endereco: 1, foto: 1 }) });
    expect(primeiro.descricao).toContain('MARINGA');
    expect(l.lugares.at(-1).explicacao.join(' ')).toMatch(/confirme antes/);
  });
});

describe('link de campo', () => {
  let url = '';
  let token = '';

  it('só existe no Plano A', async () => {
    expect((await amb.chamar(opB, 'POST', '/api/casos/caso-b-001/links-campo', { destinatario: 'Parceiro', horas: 24 })).statusCode).toBe(409);
  });

  it('gera o link uma vez; o terceiro vê só o bem, sem login', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/links-campo', { destinatario: 'Recuperador parceiro', horas: 24 });
    expect(r.statusCode).toBe(201);
    url = r.json().url;
    token = url.split('/campo/')[1]!;
    const caso = await amb.app.inject({ method: 'GET', url: `/api/campo/${token}` });
    expect(caso.statusCode).toBe(200);
    expect(caso.json()).toMatchObject({ placa: 'SEED002', destinatario: 'Recuperador parceiro' });
    expect(caso.body).not.toMatch(/Devedor Sintético|72300|valor/i);
  });

  it('o terceiro envia avistamento e foto pelo link; ficam com o link como autor', async () => {
    const a = await amb.app.inject({
      method: 'POST',
      url: `/api/campo/${token}/avistamentos`,
      payload: { descricao: 'na garagem aberta do prédio da esquina', latitude: -23.55, longitude: -46.63, precisao: 8 },
    });
    expect(a.statusCode).toBe(201);
    iaFalsa.resposta = { legivel: true, placa: 'SEED002' };
    const f = await amb.app.inject({ method: 'POST', url: `/api/campo/${token}/fotos`, payload: { imagem: jpegComGps(2).toString('base64'), tipoMime: 'image/jpeg' } });
    expect(f.json()).toMatchObject({ placaConfere: true, outroCaso: null });

    const [link] = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-002/links-campo')).json();
    expect(link).toMatchObject({ destinatario: 'Recuperador parceiro', fotos: 1, avistamentos: 1, criadoPor: 'opa' });
    expect(link.usos).toBeGreaterThanOrEqual(3);
    const [foto] = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-002/fotos')).json();
    expect(foto).toMatchObject({ autor: 'Recuperador parceiro', peloLink: true });
  });

  it('revogado, o link para de funcionar', async () => {
    const [link] = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-002/links-campo')).json();
    expect((await amb.chamar(opA, 'POST', `/api/casos/caso-a-002/links-campo/${link.id}/revogar`)).statusCode).toBe(200);
    expect((await amb.app.inject({ method: 'GET', url: `/api/campo/${token}` })).statusCode).toBe(404);
    expect((await amb.app.inject({ method: 'GET', url: '/api/campo/token-que-nao-existe-mesmo-123' })).statusCode).toBe(404);
  });
});
