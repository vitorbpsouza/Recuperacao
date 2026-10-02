/** Cadastro de caso com o bem, pela tela de casos. */
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

const bem = { placa: 'RCA-1B23', chassi: '9BWZZZ377VT004251', modelo: 'VW/GOL 1.0', ano: 2020, devedorDoc: '529.982.247-25', valorDivida: 25000 };

describe('cadastro de caso com o bem', () => {
  it('Plano A: nasce Recebido, com credor, e já aparece na lista', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/cadastro', {
      origem: 'plataforma_credor', fonteId: 'fonte-plataforma', credorId: 'cred-alfa', bem,
    });
    expect(r.statusCode).toBe(201);
    const ficha = (await amb.chamar(opA, 'GET', `/api/casos/${r.json().id}`)).json();
    expect(ficha).toMatchObject({ status: 'Recebido', placa: 'RCA1B23', ativo: { credorNome: 'Banco Alfa S.A.' } });
    const j = (await amb.chamar(opA, 'GET', `/api/casos/${r.json().id}/juridico`)).json();
    expect(j).toMatchObject({ credor: { id: 'cred-alfa' }, devedorTipo: 'PF', rito: null });
  });

  it('recusa segunda placa aberta no mesmo plano', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/cadastro', {
      origem: 'plataforma_credor', fonteId: 'fonte-plataforma', credorId: 'cred-alfa', bem,
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toContain('já tem caso aberto');
  });

  it('valida placa, chassi e documento', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/cadastro', {
      origem: 'plataforma_credor', fonteId: 'fonte-plataforma', credorId: 'cred-alfa',
      bem: { ...bem, placa: 'AB12345', chassi: '9BWZZZ377VT00425I', devedorDoc: '111.111.111-11' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('operador do Plano B não cadastra no Plano A', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/casos/cadastro', {
      origem: 'plataforma_credor', fonteId: 'fonte-plataforma', credorId: 'cred-alfa', bem: { ...bem, placa: 'RCB2C34' },
    });
    expect([403, 404]).toContain(r.statusCode);
  });

  it('Plano B: nasce Lead Recebido, com RENAJUD presumido até verificar', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/casos/cadastro', {
      origem: 'lead_proprio', fonteId: 'fonte-inbound', bem: { ...bem, placa: 'RCD3E45' },
      canalLead: 'WhatsApp', evidenciaLead: 'mensagem recebida no WhatsApp comercial em 02/10',
    });
    expect(r.statusCode).toBe(201);
    const t = (await amb.chamar(opB, 'GET', `/api/casos/${r.json().id}/pode-transferir`)).json();
    expect(t.podeTransferir).toBe(false);
  });
});
