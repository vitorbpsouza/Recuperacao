import { describe, expect, it } from 'vitest';

import { bemEntrada, cadastroCasoEntrada } from '../src/schemas.ts';

const bem = { placa: 'RCE4F56', modelo: 'CHEVROLET/ONIX LT' };

describe('cadastro do bem', () => {
  it('aceita placa antiga e Mercosul, chassi e Renavam válidos', () => {
    expect(bemEntrada.safeParse({ ...bem, placa: 'ABC-1234', chassi: '9BWZZZ377VT004251', renavam: '01234567890' }).success).toBe(true);
  });

  it('recusa Renavam, chassi e placa inválidos', () => {
    expect(bemEntrada.safeParse({ ...bem, renavam: '123' }).success).toBe(false);
    expect(bemEntrada.safeParse({ ...bem, chassi: '9BWZZZ377VT00425I' }).success).toBe(false);
    expect(bemEntrada.safeParse({ ...bem, placa: 'AB12345' }).success).toBe(false);
  });

  it('fala português no campo vazio', () => {
    const r = cadastroCasoEntrada.safeParse({ origem: 'plataforma_credor', fonteId: '', credorId: '', bem: { placa: '', modelo: '' } });
    const mensagens = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(mensagens).toEqual(expect.arrayContaining(['escolha a fonte', 'informe a placa', 'informe o modelo']));
    expect(mensagens.join(' ')).not.toMatch(/expected|too small/i);
  });
});
