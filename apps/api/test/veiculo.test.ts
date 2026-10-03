/** FIPE e avistamentos. A verificação veicular vem do texto colado (relatorios.test.ts). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ambienteDeTeste, type Ambiente, type Sessao } from './apoio.ts';

let amb: Ambiente;
let opA: Sessao;
let opB: Sessao;
beforeAll(async () => {
  amb = await ambienteDeTeste();
  opA = await amb.entrar('opa@teste.local');
  opB = await amb.entrar('opb@teste.local');
});
afterAll(() => amb.fechar());

describe('FIPE', () => {
  it('guarda valor, código e mês no veículo do caso', async () => {
    expect((await amb.chamar(opA, 'GET', '/api/fipe/carros/marcas')).json()[0]).toMatchObject({ nome: 'Hyundai' });
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/fipe', { tipo: 'carros', marca: '26', modelo: '1286', ano: '2016-1' });
    expect(r.json()).toMatchObject({ valor: 48900, codigoFipe: '015032-0' });
    const ficha = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001')).json();
    expect(ficha.ativo).toMatchObject({ valorFipe: 48900, fipeCodigo: '015032-0', fipeReferencia: 'outubro de 2026' });
  });
});

describe('avistamentos', () => {
  it('registra com hora do servidor e autor da sessão', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/avistamentos', {
      observadoEm: new Date().toISOString(), latitude: -19.92, longitude: -43.94, descricao: 'estacionado na Av. Afonso Pena', fonte: 'equipe_campo',
    });
    expect(r.statusCode).toBe(201);
    const [a] = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/avistamentos')).json();
    expect(a).toMatchObject({ latitude: -19.92, longitude: -43.94, fonte: 'equipe_campo', usuarioNome: 'opa' });
  });

  it('não existe no Plano B nem no futuro', async () => {
    expect(
      (await amb.chamar(opB, 'POST', '/api/casos/caso-b-001/avistamentos', { observadoEm: new Date().toISOString(), descricao: 'qualquer lugar', fonte: 'outro' })).statusCode,
    ).toBeGreaterThanOrEqual(400);
    const futuro = new Date(Date.now() + 3_600_000).toISOString();
    expect(
      (await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/avistamentos', { observadoEm: futuro, descricao: 'daqui a uma hora', fonte: 'outro' })).statusCode,
    ).toBe(409);
  });
});
