import { describe, expect, it } from 'vitest';

import { distanciaMetros, horaDeBrasilia, localizarVeiculo, pesoDoSinal, type Sinal } from '../src/localizacao.ts';

const AGORA = new Date('2026-10-03T12:00:00-03:00');
const CASA = { latitude: -19.8655, longitude: -44.6142 };
const TRABALHO = { latitude: -19.9381, longitude: -43.9927 };
// ~100 m da casa.
const PERTO_DA_CASA = { latitude: -19.8664, longitude: -44.6142 };

const radar = (p: { latitude: number; longitude: number }, quando: string, descricao = 'radar'): Sinal => ({ tipo: 'radar', ...p, quando, descricao });

describe('peças', () => {
  it('mede distância e hora de Brasília', () => {
    expect(Math.round(distanciaMetros(CASA, PERTO_DA_CASA))).toBe(100);
    expect(horaDeBrasilia('2026-10-01T02:30:00Z')).toBe(23);
  });

  it('sinal perde metade do peso a cada 14 dias; endereço não envelhece', () => {
    const novo = pesoDoSinal(radar(CASA, '2026-10-03T12:00:00-03:00'), AGORA);
    const velho = pesoDoSinal(radar(CASA, '2026-09-19T12:00:00-03:00'), AGORA);
    expect(velho / novo).toBeCloseTo(0.5, 5);
    expect(pesoDoSinal({ tipo: 'endereco', ...CASA, descricao: 'casa' }, AGORA)).toBe(0.45);
    expect(pesoDoSinal({ tipo: 'endereco', ...CASA, descricao: 'casa', fontes: 3 }, AGORA)).toBeCloseTo(0.55, 5);
  });
});

describe('onde procurar', () => {
  const sinais: Sinal[] = [
    { tipo: 'endereco', ...CASA, descricao: 'R MARINGA, 195 · PARA DE MINAS/MG', fontes: 4 },
    radar(PERTO_DA_CASA, '2026-10-01T22:10:00-03:00'),
    radar(PERTO_DA_CASA, '2026-10-02T06:20:00-03:00'),
    radar(CASA, '2026-10-02T23:40:00-03:00'),
    radar(TRABALHO, '2026-10-02T14:00:00-03:00', 'AV AMAZONAS 5000'),
    { tipo: 'endereco_parente', latitude: -19.95, longitude: -44.2, descricao: 'casa da mãe' },
  ];
  const lugares = localizarVeiculo(sinais, AGORA);

  it('junta endereço e radares próximos num lugar só, confirmado, no topo', () => {
    expect(lugares).toHaveLength(3);
    const [primeiro] = lugares;
    expect(primeiro).toMatchObject({
      descricao: 'R MARINGA, 195 · PARA DE MINAS/MG',
      sinais: 4,
      porTipo: { endereco: 1, radar: 3 },
      confirmadoPorAvistamento: true,
      perfil: 'pernoite',
      ultimo: '2026-10-02T23:40:00-03:00',
    });
    expect(primeiro!.confianca).toBeGreaterThan(lugares[1]!.confianca);
    expect(primeiro!.raioMetros).toBeLessThan(300);
    expect(primeiro!.explicacao.join(' ')).toMatch(/pernoita/);
  });

  it('acha a janela de horário com mais passagens', () => {
    // 22h, 23h e 6h: a janela de 2 horas com mais sinais é 22h–00h.
    expect(lugares[0]!.janela).toEqual({ inicio: 22, fim: 0, sinais: 2 });
    expect(lugares[0]!.horas[6]).toBe(1);
  });

  it('o trabalho fica abaixo; o endereço só declarado pede confirmação', () => {
    const trabalho = lugares.find((l) => l.descricao === 'AV AMAZONAS 5000')!;
    expect(trabalho.perfil).toBe('diurno');
    const mae = lugares.find((l) => l.descricao === 'casa da mãe')!;
    expect(mae.confirmadoPorAvistamento).toBe(false);
    expect(mae.explicacao.join(' ')).toMatch(/confirme antes/);
    expect(lugares.at(-1)).toBe(mae);
  });

  it('a mesma entrada dá a mesma saída', () => {
    expect(localizarVeiculo(sinais, AGORA)).toEqual(lugares);
  });

  it('sem sinais, sem lugar', () => {
    expect(localizarVeiculo([], AGORA)).toEqual([]);
  });
});
