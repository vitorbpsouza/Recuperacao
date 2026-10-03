/**
 * Ficha do caso, distribuição e pagamento de repasse.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ambienteDeTeste, type Ambiente, type Sessao } from './apoio.ts';

let amb: Ambiente;
let admin: Sessao;
let opA: Sessao;
let opB: Sessao;
let auditor: Sessao;

beforeAll(async () => {
  amb = await ambienteDeTeste();
  admin = await amb.entrar('admin@teste.local');
  opA = await amb.entrar('opa@teste.local');
  opB = await amb.entrar('opb@teste.local');
  auditor = await amb.entrar('auditor@teste.local');
});

afterAll(() => amb.fechar());

describe('ficha do caso', () => {
  it('traz caso, ativo e fonte, sem o dado pessoal do devedor', async () => {
    const r = await amb.chamar(opA, 'GET', '/api/casos/caso-a-001');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      id: 'caso-a-001',
      placa: 'SEED001',
      recuperadorNome: 'Carlos Pereira',
      ativo: { chassi: 'SEEDCHASSI00000001', ano: 2021, credorNome: 'Banco Alfa', valorDivida: 38500 },
      fonte: { nome: 'Carteira do credor', tipo: 'Credor Direto' },
    });
    expect(r.body).not.toContain('Devedor Sintético');
    expect(r.body).not.toContain('00000000011');
  });

  it('caso de outro canal responde como inexistente', async () => {
    expect((await amb.chamar(opB, 'GET', '/api/casos/caso-a-001')).statusCode).toBe(404);
    expect((await amb.chamar(opA, 'GET', '/api/casos/caso-b-001')).statusCode).toBe(404);
  });

  it('linha do tempo começa na criação do caso', async () => {
    const r = await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/eventos');
    expect(r.statusCode).toBe(200);
    expect(r.json()[0]).toMatchObject({ tipo: 'criado', statusPara: 'Em Campo' });
  });
});

describe('dado pessoal sob demanda', () => {
  it('exige finalidade declarada', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/devedor', { finalidade: 'ver' });
    expect(r.statusCode).toBe(400);
  });

  it('revela e grava quem viu, com a finalidade', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/devedor', {
      finalidade: 'confirmar identidade antes da abordagem em campo',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ devedorNome: 'Devedor Sintético Um', devedorDoc: '00000000011' });

    expect((await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/acessos')).statusCode).toBe(403);
    const acessos = await amb.chamar(auditor, 'GET', '/api/casos/caso-a-001/acessos');
    expect(acessos.json()).toEqual([
      expect.objectContaining({
        usuarioNome: 'opa',
        campos: ['devedor_nome', 'devedor_doc'],
        finalidade: 'confirmar identidade antes da abordagem em campo',
      }),
    ]);
  });

  it('não revela devedor de outro canal', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/casos/caso-a-001/devedor', {
      finalidade: 'tentativa de ver outro canal',
    });
    expect(r.statusCode).toBe(404);
  });
});

describe('distribuição', () => {
  it('envia caso em preparo a recuperador ativo, com prazos, e registra na linha do tempo', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-004/distribuir', {
      recuperadorId: 'rec-004',
      horasParaAceite: 12,
      diasDePrazo: 7,
    });
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo).toMatchObject({ id: 'caso-a-004', status: 'Distribuído', recuperadorId: 'rec-004' });
    const horas = (new Date(corpo.prazoVinculo).getTime() - Date.now()) / 3_600_000;
    expect(Math.round(horas)).toBe(12);

    const eventos = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-004/eventos')).json();
    expect(eventos.map((e: { tipo: string }) => e.tipo)).toEqual(['criado', 'distribuido', 'status_alterado']);
    expect(eventos[1].dados).toMatchObject({ recuperador: 'Fernanda Dias', anterior: null });
    expect(eventos[1].usuarioNome).toBe('opa');
  });

  it('redistribuir deixa rastro mesmo sem mudar o status', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-004/distribuir', { recuperadorId: 'rec-001' });
    expect(r.statusCode).toBe(200);
    const eventos = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-004/eventos')).json();
    expect(eventos.at(-1)).toMatchObject({ tipo: 'distribuido', dados: { recuperador: 'Carlos Pereira', anterior: 'Fernanda Dias' } });
  });

  it('recusa caso já recuperado, caso de aquisição e recuperador fora de atividade', async () => {
    expect((await amb.chamar(opA, 'POST', '/api/casos/caso-a-003/distribuir', { recuperadorId: 'rec-001' })).statusCode).toBe(409);
    expect((await amb.chamar(admin, 'POST', '/api/casos/caso-b-001/distribuir', { recuperadorId: 'rec-001' })).statusCode).toBe(409);

    const novo = await amb.chamar(admin, 'POST', '/api/recuperadores', { nome: 'Suspenso', status: 'Suspenso' });
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/distribuir', { recuperadorId: novo.json().id });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toContain('suspenso');
  });

  it('operador do Plano B não distribui caso do Plano A', async () => {
    expect((await amb.chamar(opB, 'POST', '/api/casos/caso-a-002/distribuir', { recuperadorId: 'rec-001' })).statusCode).toBe(404);
  });
});

describe('repasses', () => {
  it('só admin paga, uma vez só', async () => {
    expect((await amb.chamar(opA, 'POST', '/api/repasses/rep-001/pagar')).statusCode).toBe(403);
    const pago = await amb.chamar(admin, 'POST', '/api/repasses/rep-001/pagar');
    expect(pago.statusCode).toBe(200);
    expect(pago.json()).toEqual({ id: 'rep-001', status: 'Pago' });
    const repetido = await amb.chamar(admin, 'POST', '/api/repasses/rep-001/pagar');
    expect(repetido.statusCode).toBe(409);
    expect((await amb.chamar(admin, 'POST', '/api/repasses/nao-existe/pagar')).statusCode).toBe(404);
  });
});
