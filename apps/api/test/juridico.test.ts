/**
 * Plano A pela API: credor e mandato, registros do rito, ações com pendências
 * e o ciclo até a entrega. As guardas são do banco; aqui se confere que a API
 * as expõe e respeita.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { digitoCnj } from '@workspace/domain';

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

const acoes = async (s: Sessao, id: string) =>
  (await amb.chamar(s, 'GET', `/api/casos/${id}/acoes`)).json() as Array<{ para: string; pendencias: string[] }>;

describe('credores e mandatos', () => {
  it('lista credores com mandatos; o Plano B não vê mandato', async () => {
    const a = (await amb.chamar(opA, 'GET', '/api/credores')).json();
    expect(a.find((c: { id: string }) => c.id === 'cred-alfa').mandatos[0]).toMatchObject({ vigente: true });
    const b = (await amb.chamar(opB, 'GET', '/api/credores')).json();
    expect(b.find((c: { id: string }) => c.id === 'cred-alfa').mandatos).toEqual([]);
  });

  it('só admin cadastra; CNPJ alfanumérico é aceito e o inválido recusado', async () => {
    expect((await amb.chamar(opA, 'POST', '/api/credores', { nome: 'X' })).statusCode).toBe(403);
    expect((await amb.chamar(admin, 'POST', '/api/credores', { nome: 'Banco Novo', cnpj: '12.ABC.345/01DE-35' })).statusCode).toBe(201);
    expect((await amb.chamar(admin, 'POST', '/api/credores', { nome: 'Errado', cnpj: '12.ABC.345/01DE-36' })).statusCode).toBe(400);
  });
});

describe('ficha jurídica e ações', () => {
  it('mostra rito, prova e o que falta para cada passo', async () => {
    const j = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/juridico')).json();
    expect(j).toMatchObject({ rito: 'judicial', credor: { nome: 'Banco Alfa S.A.' }, processo: { liminar: 'deferida' } });
    expect(j.mora).toMatchObject({ meio: 'carta_ar', enderecoDoContrato: true });

    const lista = await acoes(opA, 'caso-a-001');
    expect(lista.find((a) => a.para === 'Retomado')?.pendencias).toEqual([]);
    expect(lista.find((a) => a.para === 'Entregue ao Credor')).toBeUndefined();
  });

  it('caso do outro canal é 404; caso do Plano B não tem rito', async () => {
    expect((await amb.chamar(opB, 'GET', '/api/casos/caso-a-001/juridico')).statusCode).toBe(404);
    expect((await amb.chamar(admin, 'GET', '/api/casos/caso-b-001/juridico')).statusCode).toBe(409);
  });

  it('recusa número CNJ com dígito errado', async () => {
    const r = await amb.chamar(opA, 'PUT', '/api/casos/caso-a-001/processo', {
      numeroCnj: '0000001-17.2026.8.13.9999', comarca: 'Belo Horizonte', uf: 'MG', liminar: 'pendente',
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('ciclo pela API', () => {
  it('retomada judicial calcula a purga e a entrega ao credor espera ela vencer', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/transicao', {
      para: 'Retomado', em: new Date().toISOString(), modalidade: 'apreensao_judicial', comprovante: 'Auto 77',
    });
    expect(r.statusCode).toBe(200);
    const j = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/juridico')).json();
    expect(new Date(j.retomada.purgaAte).getTime()).toBeGreaterThan(Date.now() + 5 * 86_400_000 - 86_400_000);

    expect((await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/transicao', { para: 'Em Custódia', local: 'Pátio BH' })).statusCode).toBe(200);
    const entrega = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/transicao', { para: 'Entregue ao Credor' });
    expect(entrega.statusCode).toBe(409);
    expect(entrega.json().erro).toContain('ainda pode purgar a mora');
  });

  it('apreensão extrajudicial exige a declaração de conduta', async () => {
    // caso-a-002 está Distribuído; põe em campo antes.
    for (const para of ['Aceito', 'Em Campo', 'Localizado']) {
      expect((await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/transicao', { para })).statusCode).toBe(200);
    }
    const sem = await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/transicao', {
      para: 'Retomado', em: new Date().toISOString(), modalidade: 'apreensao_extrajudicial', comprovante: 'Certidão 9',
    });
    expect(sem.statusCode).toBe(409);
  });

  it('resistência no extrajudicial converte para o rito judicial', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/resistencia', { relato: 'devedor trancou o veículo na garagem' });
    expect(r.json()).toEqual({ id: 'caso-a-002', status: 'Em Análise' });
    const j = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-002/juridico')).json();
    expect(j.rito).toBe('judicial');
    // Agora precisa de processo judicial para voltar a campo.
    const habilitar = (await acoes(opA, 'caso-a-002')).find((a) => a.para === 'Pronto para Campo');
    expect(habilitar?.pendencias).toContain('processo judicial não registrado');
  });

  it('registra processo e habilita de novo', async () => {
    const numero = `0000009-${digitoCnj('0000009', '2026', '8', '26', '9999')}.2026.8.26.9999`;
    expect(
      (await amb.chamar(opA, 'PUT', '/api/casos/caso-a-002/processo', {
        numeroCnj: numero, comarca: 'São Paulo', uf: 'SP', liminar: 'deferida', liminarEm: '2026-09-01',
      })).statusCode,
    ).toBe(200);
    expect((await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/transicao', { para: 'Pronto para Campo' })).statusCode).toBe(200);
  });

  it('recall exige motivo e encerra', async () => {
    expect((await amb.chamar(opA, 'POST', '/api/casos/caso-a-004/transicao', { para: 'Removido pelo Banco', motivo: 'curto' })).statusCode).toBe(400);
    expect(
      (await amb.chamar(opA, 'POST', '/api/casos/caso-a-004/transicao', { para: 'Removido pelo Banco', motivo: 'credor retirou a carteira' })).statusCode,
    ).toBe(200);
    expect(await acoes(opA, 'caso-a-004')).toEqual([]);
  });
});
