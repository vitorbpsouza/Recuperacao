import { describe, expect, it } from 'vitest';

import {
  dataCivilEm,
  diasSemExpediente,
  ehDiaUtil,
  fimDoDia,
  pascoa,
  prazoDePurga,
  prazoNotificacaoExtrajudicial,
  somarDiasUteis,
} from '../src/prazos.ts';

describe('calendário', () => {
  it('calcula a Páscoa', () => {
    expect(pascoa(2024)).toBe('2024-03-31');
    expect(pascoa(2025)).toBe('2025-04-20');
    expect(pascoa(2026)).toBe('2026-04-05');
    expect(pascoa(2027)).toBe('2027-03-28');
  });

  it('deriva os feriados móveis da Páscoa', () => {
    const dias = diasSemExpediente(2026);
    expect(dias.get('2026-02-16')).toBe('Carnaval');
    expect(dias.get('2026-02-17')).toBe('Carnaval');
    expect(dias.get('2026-04-03')).toBe('Sexta-feira Santa');
    expect(dias.get('2026-06-04')).toBe('Corpus Christi');
  });

  it('Consciência Negra é feriado nacional a partir de 2024', () => {
    expect(ehDiaUtil('2023-11-20')).toBe(true); // segunda-feira, antes da Lei 14.759/2023
    expect(ehDiaUtil('2024-11-20')).toBe(false);
  });

  it('fim de semana e feriado não são dias úteis', () => {
    expect(ehDiaUtil('2026-10-10')).toBe(false); // sábado
    expect(ehDiaUtil('2026-10-12')).toBe(false); // Nossa Senhora Aparecida
    expect(ehDiaUtil('2026-10-13')).toBe(true);
  });

  it('soma dias úteis sem contar o dia do começo', () => {
    // 05/10/2026 é segunda; 12/10 é feriado.
    expect(somarDiasUteis('2026-10-05', 5)).toBe('2026-10-13');
  });

  it('a data do prazo é a de São Paulo, não a do UTC', () => {
    // 23h de 04/10 em São Paulo já é 05/10 em UTC.
    expect(dataCivilEm(new Date('2026-10-05T02:00:00Z'))).toBe('2026-10-04');
  });

  it('o fim do dia é 23:59:59.999 em São Paulo', () => {
    expect(fimDoDia('2026-10-13').toISOString()).toBe('2026-10-14T02:59:59.999Z');
  });
});

describe('purga da mora', () => {
  const apreensao = new Date('2026-10-05T13:00:00-03:00'); // segunda-feira

  it('judicial: 5 dias corridos, prorrogando o vencimento em dia sem expediente', () => {
    // 05/10 + 5 = sábado 10/10 → segunda 12/10 é feriado → terça 13/10.
    const prazo = prazoDePurga('apreensao_judicial', apreensao);
    expect(prazo?.ultimoDia).toBe('2026-10-13');
    expect(prazo?.ate.toISOString()).toBe('2026-10-14T02:59:59.999Z');
    expect(prazo?.fundamento).toContain('art. 3º');
  });

  it('judicial: vencimento em dia útil não prorroga', () => {
    // Quarta 07/10 + 5 = segunda 12/10 (feriado) → terça 13/10; quinta 08/10 + 5 = terça 13/10.
    expect(prazoDePurga('apreensao_judicial', new Date('2026-10-08T10:00:00-03:00'))?.ultimoDia).toBe('2026-10-13');
    expect(prazoDePurga('apreensao_judicial', new Date('2026-10-14T10:00:00-03:00'))?.ultimoDia).toBe('2026-10-19');
  });

  it('extrajudicial: 5 dias úteis após a apreensão', () => {
    const prazo = prazoDePurga('apreensao_extrajudicial', apreensao);
    expect(prazo?.ultimoDia).toBe('2026-10-13');
    expect(prazo?.fundamento).toContain('art. 8º-C');
  });

  it('extrajudicial conta dias úteis mesmo sem feriado no meio', () => {
    // Quarta 14/10: 15, 16, 19, 20, 21.
    expect(prazoDePurga('apreensao_extrajudicial', new Date('2026-10-14T10:00:00-03:00'))?.ultimoDia).toBe('2026-10-21');
  });

  it('entrega voluntária não abre prazo de purga', () => {
    expect(prazoDePurga('entrega_voluntaria', apreensao)).toBeNull();
  });
});

describe('notificação extrajudicial', () => {
  it('20 dias para pagar, contados do dia seguinte', () => {
    expect(prazoNotificacaoExtrajudicial('2026-10-01').ultimoDia).toBe('2026-10-21');
  });

  it('prorroga quando o vigésimo dia não tem expediente', () => {
    // 31/10/2026 + 20 = 20/11, Consciência Negra (sexta) → segunda 23/11.
    expect(prazoNotificacaoExtrajudicial('2026-10-31').ultimoDia).toBe('2026-11-23');
  });
});
