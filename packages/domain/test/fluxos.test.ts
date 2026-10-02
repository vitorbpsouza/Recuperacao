import { describe, expect, it } from 'vitest';

import { STATUS_RECUPERACAO, type StatusRecuperacao } from '../src/casos.ts';
import { ehFinal, STATUS_DISTRIBUIVEIS, TRANSICOES_RECUPERACAO } from '../src/fluxos.ts';
import { transicaoEntrada } from '../src/schemas.ts';

const alcancaveisDe = (inicio: StatusRecuperacao) => {
  const vistos = new Set<StatusRecuperacao>([inicio]);
  const fila = [inicio];
  while (fila.length) {
    for (const proximo of TRANSICOES_RECUPERACAO[fila.shift()!]) {
      if (!vistos.has(proximo)) {
        vistos.add(proximo);
        fila.push(proximo);
      }
    }
  }
  return vistos;
};

describe('máquina de estados do Plano A', () => {
  it('cobre exatamente o vocabulário', () => {
    expect(Object.keys(TRANSICOES_RECUPERACAO).sort()).toEqual([...STATUS_RECUPERACAO].sort());
    for (const destinos of Object.values(TRANSICOES_RECUPERACAO)) {
      for (const d of destinos) expect(STATUS_RECUPERACAO).toContain(d);
    }
  });

  it('todo status é alcançável a partir de Recebido', () => {
    expect([...alcancaveisDe('Recebido')].sort()).toEqual([...STATUS_RECUPERACAO].sort());
  });

  it('recall, cura e entrega encerram o caso para sempre', () => {
    for (const s of ['Removido pelo Banco', 'Curado', 'Entregue ao Credor', 'Não Localizado', 'Encerrado'] as const) {
      expect(ehFinal(s)).toBe(true);
    }
  });

  it('só se retoma o bem a partir do campo', () => {
    const origens = STATUS_RECUPERACAO.filter((s) => TRANSICOES_RECUPERACAO[s].includes('Retomado'));
    expect(origens.sort()).toEqual(['Em Campo', 'Localizado']);
  });

  it('só se vai a campo depois de habilitado', () => {
    const origens = STATUS_RECUPERACAO.filter((s) => TRANSICOES_RECUPERACAO[s].includes('Distribuído'));
    expect(origens).not.toContain('Recebido');
    expect(origens).not.toContain('Em Análise');
    expect(STATUS_DISTRIBUIVEIS).toEqual(['Pronto para Campo', 'Distribuído', 'Aceito', 'Em Campo', 'Localizado']);
  });

  it('depois da retomada o caso não volta para trás', () => {
    for (const s of ['Retomado', 'Em Custódia'] as const) {
      for (const d of TRANSICOES_RECUPERACAO[s]) {
        expect(['Em Custódia', 'Entregue ao Credor', 'Curado', 'Removido pelo Banco', 'Encerrado']).toContain(d);
      }
    }
  });
});

describe('entrada de transição', () => {
  it('retomada exige data, modalidade e comprovante', () => {
    expect(
      transicaoEntrada.safeParse({
        para: 'Retomado',
        em: '2026-10-05T13:00:00-03:00',
        modalidade: 'apreensao_judicial',
        comprovante: 'Auto 123',
      }).success,
    ).toBe(true);
    expect(transicaoEntrada.safeParse({ para: 'Retomado', modalidade: 'apreensao_judicial' }).success).toBe(false);
  });

  it('encerramentos exigem motivo', () => {
    expect(transicaoEntrada.safeParse({ para: 'Removido pelo Banco', motivo: 'curto' }).success).toBe(false);
    expect(transicaoEntrada.safeParse({ para: 'Removido pelo Banco', motivo: 'credor informou acordo' }).success).toBe(true);
  });

  it('distribuir não passa por aqui', () => {
    expect(transicaoEntrada.safeParse({ para: 'Distribuído' }).success).toBe(false);
  });
});
