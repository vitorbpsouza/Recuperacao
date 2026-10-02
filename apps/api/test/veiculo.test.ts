/** FIPE, verificação veicular de fornecedor e avistamentos. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ambienteDeTeste, type Ambiente, type Sessao } from './apoio.ts';

let amb: Ambiente;
let admin: Sessao;
let opA: Sessao;
let opB: Sessao;
beforeAll(async () => {
  amb = await ambienteDeTeste();
  admin = await amb.entrar('admin@teste.local');
  opA = await amb.entrar('opa@teste.local');
  opB = await amb.entrar('opb@teste.local');
});
afterAll(() => amb.fechar());

const verificacao = (placa: string) => ({
  bureauId: 'bureau-sng',
  baseLegal: 'execucao_contrato',
  justificativa: 'conferir restrições antes da negociação',
  veiculo: { placa, chassi: '9BWZZZ377VT004251', renavam: '01234567890', modelo: 'HYUNDAI/HB20S VISION' },
  restricoes: ['RENAJUD'],
  renajud: true,
  alienacaoFiduciaria: false,
});

describe('FIPE', () => {
  it('guarda valor, código e mês no veículo do caso', async () => {
    expect((await amb.chamar(opA, 'GET', '/api/fipe/carros/marcas')).json()[0]).toMatchObject({ nome: 'Hyundai' });
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/fipe', { tipo: 'carros', marca: '26', modelo: '1286', ano: '2016-1' });
    expect(r.json()).toMatchObject({ valor: 48900, codigoFipe: '015032-0' });
    const ficha = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001')).json();
    expect(ficha.ativo).toMatchObject({ valorFipe: 48900, fipeCodigo: '015032-0', fipeReferencia: 'outubro de 2026' });
  });
});

describe('verificação veicular', () => {
  it('recusa relatório de outra placa', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/casos/caso-b-001/verificacao-veicular', verificacao('ZZZ9Z99'));
    expect(r.statusCode).toBe(409);
  });

  it('fica na trilha de auditoria e atualiza RENAJUD e gravame no Plano B', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/casos/caso-b-001/verificacao-veicular', verificacao('SEED004'));
    expect(r.statusCode).toBe(201);
    const lista = (await amb.chamar(opB, 'GET', '/api/casos/caso-b-001/verificacoes-veiculares')).json();
    expect(lista[0]).toMatchObject({ fornecedor: 'B3 / SNG (Gravames)', renajud: true, restricoes: ['RENAJUD'] });
    const t = (await amb.chamar(opB, 'GET', '/api/casos/caso-b-001/pode-transferir')).json();
    expect(t.pendencias.join(' ')).toMatch(/RENAJUD/i);
    expect(t.pendencias.join(' ')).not.toMatch(/gravame/i);
    const auditoria = (await amb.chamar(admin, 'GET', '/api/auditoria')).json();
    expect(JSON.stringify(auditoria)).toContain('conferir restrições antes da negociação');
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
