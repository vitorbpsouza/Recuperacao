import { describe, expect, it } from 'vitest';

import { cnpjValido, cpfValido, digitoCnj, formatarCnj, numeroCnjValido, tipoDePessoa } from '../src/documentos.ts';

describe('CPF', () => {
  it('aceita com e sem máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
  });

  it('recusa dígito errado, tamanho errado e sequência repetida', () => {
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('5299822472')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
});

describe('CNPJ', () => {
  it('aceita o numérico', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
  });

  it('aceita o alfanumérico (exemplo da Receita Federal)', () => {
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true);
    expect(cnpjValido('12abc34501de35')).toBe(true);
  });

  it('recusa dígito errado e letra nos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('12.ABC.345/01DE-3A')).toBe(false);
    expect(cnpjValido('00.000.000/0000-00')).toBe(false);
  });
});

describe('tipo de pessoa', () => {
  it('distingue pelo documento', () => {
    expect(tipoDePessoa('529.982.247-25')).toBe('PF');
    expect(tipoDePessoa('11.222.333/0001-81')).toBe('PJ');
    expect(tipoDePessoa('123')).toBeNull();
    expect(tipoDePessoa(null)).toBeNull();
  });
});

describe('número CNJ', () => {
  it('calcula o dígito pelo módulo 97 do Anexo VIII da Res. CNJ 65/2008', () => {
    const dd = digitoCnj('0001234', '2026', '8', '13', '0024');
    const numero = `0001234-${dd}.2026.8.13.0024`;
    expect(numeroCnjValido(numero)).toBe(true);
    // Pela própria definição: o número com o DD no fim, módulo 97, dá 1.
    expect(BigInt(`0001234202681300 24${dd}`.replace(/\s/g, '')) % 97n).toBe(1n);
  });

  it('recusa dígito errado e formato errado', () => {
    const dd = digitoCnj('0001234', '2026', '8', '13', '0024');
    const errado = String((Number(dd) + 1) % 100).padStart(2, '0');
    expect(numeroCnjValido(`0001234-${errado}.2026.8.13.0024`)).toBe(false);
    expect(numeroCnjValido('1234-56.2026.8.13.0024')).toBe(false);
  });

  it('o exemplo do texto da resolução ilustra o formato, mas não passa no cálculo', () => {
    expect(numeroCnjValido('0123456-75.2008.8.26.0100')).toBe(false);
  });

  it('formata 20 dígitos com a máscara', () => {
    expect(formatarCnj('00012343620268130024')).toBe('0001234-36.2026.8.13.0024');
  });
});
