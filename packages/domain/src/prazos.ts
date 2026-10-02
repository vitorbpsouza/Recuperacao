/**
 * Prazos legais do Plano A.
 *
 * Contagem (Código Civil, art. 132): exclui o dia do começo e inclui o do
 * vencimento; vencimento em dia sem expediente prorroga para o próximo dia
 * útil.
 *
 * "Dia útil" aqui é conservador: além de fins de semana e feriados nacionais,
 * exclui Carnaval, Sexta-feira Santa e Corpus Christi, dias sem expediente
 * forense nem bancário na maior parte do país. Quando a pergunta é "o devedor
 * ainda pode purgar a mora?", errar a favor dele é o que protege o credor de
 * entregar o bem antes da hora. Feriados estaduais e municipais não entram: o
 * jurídico confirma o prazo da comarca.
 */
import type { ModalidadeRetomada } from './fluxos.ts';

/** Fuso em que os prazos correm. */
export const FUSO_OPERACAO = 'America/Sao_Paulo';

/** Data do calendário, sem hora: 'AAAA-MM-DD'. */
export type DataCivil = string;

const comoUtc = (data: DataCivil) => new Date(`${data}T00:00:00Z`);
const deUtc = (d: Date): DataCivil => d.toISOString().slice(0, 10);

export const somarDias = (data: DataCivil, dias: number): DataCivil => {
  const d = comoUtc(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return deUtc(d);
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export const pascoa = (ano: number): DataCivil => {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};

const porAno = new Map<number, ReadonlyMap<DataCivil, string>>();

/** Dias sem expediente de um ano, com o nome de cada um. */
export const diasSemExpediente = (ano: number): ReadonlyMap<DataCivil, string> => {
  const pronto = porAno.get(ano);
  if (pronto) return pronto;
  const p = pascoa(ano);
  const dias = new Map<DataCivil, string>([
    [`${ano}-01-01`, 'Confraternização Universal'],
    [somarDias(p, -48), 'Carnaval'],
    [somarDias(p, -47), 'Carnaval'],
    [somarDias(p, -2), 'Sexta-feira Santa'],
    [`${ano}-04-21`, 'Tiradentes'],
    [`${ano}-05-01`, 'Dia do Trabalho'],
    [somarDias(p, 60), 'Corpus Christi'],
    [`${ano}-09-07`, 'Independência'],
    [`${ano}-10-12`, 'Nossa Senhora Aparecida'],
    [`${ano}-11-02`, 'Finados'],
    [`${ano}-11-15`, 'Proclamação da República'],
    [`${ano}-12-25`, 'Natal'],
  ]);
  // Feriado nacional desde 2024 (Lei 14.759/2023).
  if (ano >= 2024) dias.set(`${ano}-11-20`, 'Consciência Negra');
  porAno.set(ano, dias);
  return dias;
};

export const ehDiaUtil = (data: DataCivil): boolean => {
  const semana = comoUtc(data).getUTCDay();
  return semana !== 0 && semana !== 6 && !diasSemExpediente(Number(data.slice(0, 4))).has(data);
};

export const proximoDiaUtil = (data: DataCivil): DataCivil => {
  let d = data;
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return d;
};

/** N dias úteis depois de `data` (o próprio dia não conta). */
export const somarDiasUteis = (data: DataCivil, dias: number): DataCivil => {
  let d = data;
  for (let faltam = dias; faltam > 0; ) {
    d = somarDias(d, 1);
    if (ehDiaUtil(d)) faltam--;
  }
  return d;
};

/** Data civil de um instante no fuso da operação. */
export const dataCivilEm = (instante: Date, fuso = FUSO_OPERACAO): DataCivil =>
  new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);

/** Deslocamento do fuso em relação ao UTC, em minutos, num instante (−180 em São Paulo). */
const deslocamentoMinutos = (instante: Date, fuso: string): number => {
  const nome =
    new Intl.DateTimeFormat('en-US', { timeZone: fuso, timeZoneName: 'longOffset' })
      .formatToParts(instante)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nome);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
};

/**
 * Último instante de uma data civil no fuso da operação. O deslocamento vem
 * do próprio fuso, então continua certo se o horário de verão voltar.
 */
export const fimDoDia = (data: DataCivil, fuso = FUSO_OPERACAO): Date => {
  const meiaNoiteUtc = comoUtc(somarDias(data, 1));
  return new Date(meiaNoiteUtc.getTime() - deslocamentoMinutos(meiaNoiteUtc, fuso) * 60_000 - 1);
};

export interface PrazoLegal {
  /** Último dia do prazo (já prorrogado, se cair em dia sem expediente). */
  ultimoDia: DataCivil;
  /** Fim do último dia: antes disso o prazo ainda corre. */
  ate: Date;
  regra: string;
  fundamento: string;
}

/**
 * Prazo para o devedor purgar a mora depois da retomada. Antes dele, o bem não
 * pode ser entregue ao credor nem ir a leilão: se o devedor pagar, o bem volta
 * para ele.
 *
 * Entrega voluntária não abre esse prazo — não há apreensão.
 */
export const prazoDePurga = (modalidade: ModalidadeRetomada, retomadoEm: Date): PrazoLegal | null => {
  const inicio = dataCivilEm(retomadoEm);
  if (modalidade === 'apreensao_judicial') {
    const ultimoDia = proximoDiaUtil(somarDias(inicio, 5));
    return {
      ultimoDia,
      ate: fimDoDia(ultimoDia),
      regra: '5 dias corridos após a execução da liminar',
      fundamento: 'DL 911/69, art. 3º, §§ 1º e 2º — o STJ conta em dias corridos (prazo de direito material)',
    };
  }
  if (modalidade === 'apreensao_extrajudicial') {
    const ultimoDia = somarDiasUteis(inicio, 5);
    return {
      ultimoDia,
      ate: fimDoDia(ultimoDia),
      regra: '5 dias úteis após a apreensão',
      fundamento: 'DL 911/69, art. 8º-C, incluído pela Lei 14.711/2023',
    };
  }
  return null;
};

/** Prazo da notificação do cartório (ou do Detran) para o devedor pagar antes da consolidação. */
export const prazoNotificacaoExtrajudicial = (notificadoEm: DataCivil): PrazoLegal => {
  const ultimoDia = proximoDiaUtil(somarDias(notificadoEm, 20));
  return {
    ultimoDia,
    ate: fimDoDia(ultimoDia),
    regra: '20 dias para pagar a dívida, sob pena de consolidação da propriedade',
    fundamento: 'DL 911/69, art. 8º-B, incluído pela Lei 14.711/2023',
  };
};

/**
 * Por quanto tempo uma verificação de recuperação judicial ou falência vale
 * para autorizar a retomada de bem de devedor pessoa jurídica. A situação muda
 * a qualquer dia; 30 dias é a janela padrão até o jurídico definir outra.
 */
export const VALIDADE_VERIFICACAO_RJ_DIAS = 30;
