/**
 * Onde procurar o veículo: junta endereços cadastrados e avistamentos (radar,
 * câmera, equipe de campo, foto) e devolve lugares ranqueados, cada um com o
 * porquê.
 *
 * É regra calculável, não caixa-preta: cada lugar mostra os sinais que o
 * formam, o peso de cada fonte e a janela de horário. A mesma entrada dá a
 * mesma saída — dá para auditar e explicar ao credor por que a equipe foi ali.
 *
 *   1. Pesos por fonte: foto de humano > equipe de campo > câmera > radar >
 *      informação de terceiro > endereço declarado > endereço de parente.
 *   2. Recência: sinal com hora perde metade do peso a cada 14 dias.
 *   3. Agrupamento: sinais a menos de 300 m formam um lugar.
 *   4. Endereço cadastrado confirmado por avistamento recebe bônus.
 *   5. Horário: a janela de 2 horas com mais sinais; pernoite quando a maioria
 *      cai entre 19h e 7h (onde o carro dorme: o alvo da diligência).
 */

export type TipoSinal = 'foto' | 'equipe_campo' | 'camera' | 'radar' | 'credor' | 'devedor' | 'outro' | 'endereco' | 'endereco_parente';

export interface Sinal {
  tipo: TipoSinal;
  latitude: number;
  longitude: number;
  /** ISO 8601. Endereço não tem hora. */
  quando?: string;
  descricao: string;
  /** Endereço citado por várias bases vale mais: número de fontes. */
  fontes?: number;
}

export interface LugarProvavel {
  latitude: number;
  longitude: number;
  /** Maior distância de um sinal ao centro, em metros. */
  raioMetros: number;
  /** 0 a 100, relativa ao melhor lugar e à quantidade de sinais. */
  confianca: number;
  pontuacao: number;
  descricao: string;
  sinais: number;
  porTipo: Partial<Record<TipoSinal, number>>;
  primeiro?: string;
  ultimo?: string;
  /** Endereço cadastrado dentro do lugar. */
  endereco?: string;
  confirmadoPorAvistamento: boolean;
  /** Janela de 2 horas com mais sinais (hora local de Brasília). */
  janela?: { inicio: number; fim: number; sinais: number };
  perfil: 'pernoite' | 'diurno' | 'misto' | 'sem_horario';
  /** Sinais por hora do dia (0–23), para o gráfico. */
  horas: number[];
  explicacao: string[];
}

export const PESO_DO_SINAL: Record<TipoSinal, number> = {
  foto: 1,
  equipe_campo: 0.9,
  camera: 0.8,
  radar: 0.7,
  credor: 0.5,
  devedor: 0.5,
  outro: 0.4,
  endereco: 0.45,
  endereco_parente: 0.25,
};

export const ROTULO_SINAL: Record<TipoSinal, string> = {
  foto: 'foto',
  equipe_campo: 'equipe de campo',
  camera: 'câmera',
  radar: 'radar',
  credor: 'credor',
  devedor: 'devedor',
  outro: 'outro',
  endereco: 'endereço cadastrado',
  endereco_parente: 'endereço de parente',
};

const PLURAL_SINAL: Record<TipoSinal, string> = {
  foto: 'fotos',
  equipe_campo: 'avistamentos da equipe',
  camera: 'câmeras',
  radar: 'passagens de radar',
  credor: 'informações do credor',
  devedor: 'informações do devedor',
  outro: 'outros',
  endereco: 'endereços cadastrados',
  endereco_parente: 'endereços de parente',
};

const MEIA_VIDA_DIAS = 14;
const RAIO_DO_LUGAR = 300;
const BONUS_CONFIRMADO = 0.6;

/** Distância em metros entre dois pontos (haversine). */
export const distanciaMetros = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const r = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
};

/** Hora local de Brasília (UTC−3), sem depender do fuso de quem roda. */
export const horaDeBrasilia = (iso: string) => (new Date(iso).getUTCHours() + 21) % 24;

const ehEndereco = (t: TipoSinal) => t === 'endereco' || t === 'endereco_parente';

export const pesoDoSinal = (s: Sinal, agora: Date) => {
  let peso = PESO_DO_SINAL[s.tipo];
  if (ehEndereco(s.tipo) && s.fontes && s.fontes > 1) peso += Math.min(0.15, 0.05 * (s.fontes - 1));
  if (s.quando) {
    const dias = Math.max(0, (agora.getTime() - new Date(s.quando).getTime()) / 86_400_000);
    peso *= 0.5 ** (dias / MEIA_VIDA_DIAS);
  }
  return peso;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const dataCurta = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const localizarVeiculo = (sinais: Sinal[], agora: Date = new Date()): LugarProvavel[] => {
  const pesados = sinais
    .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .map((s) => ({ ...s, peso: pesoDoSinal(s, agora) }))
    .sort((a, b) => b.peso - a.peso);

  // Agrupamento guloso: o sinal mais forte abre o lugar; os próximos a menos de 300 m entram nele.
  const grupos: { lat: number; lon: number; pesoTotal: number; itens: typeof pesados }[] = [];
  for (const s of pesados) {
    const alvo = grupos.find((g) => distanciaMetros({ latitude: g.lat, longitude: g.lon }, s) <= RAIO_DO_LUGAR);
    if (alvo) {
      const novoPeso = alvo.pesoTotal + s.peso;
      alvo.lat = (alvo.lat * alvo.pesoTotal + s.latitude * s.peso) / novoPeso;
      alvo.lon = (alvo.lon * alvo.pesoTotal + s.longitude * s.peso) / novoPeso;
      alvo.pesoTotal = novoPeso;
      alvo.itens.push(s);
    } else {
      grupos.push({ lat: s.latitude, lon: s.longitude, pesoTotal: s.peso, itens: [s] });
    }
  }

  const lugares = grupos.map((g) => {
    const avistamentos = g.itens.filter((s) => !ehEndereco(s.tipo));
    const enderecos = g.itens.filter((s) => ehEndereco(s.tipo));
    const confirmado = avistamentos.length > 0 && enderecos.length > 0;
    const pontuacao = g.pesoTotal + (confirmado ? BONUS_CONFIRMADO : 0);

    const porTipo: Partial<Record<TipoSinal, number>> = {};
    for (const s of g.itens) porTipo[s.tipo] = (porTipo[s.tipo] ?? 0) + 1;

    const datados = avistamentos.filter((s) => s.quando).sort((a, b) => a.quando!.localeCompare(b.quando!));
    const horas = Array.from({ length: 24 }, () => 0);
    for (const s of datados) horas[horaDeBrasilia(s.quando!)]!++;

    let janela: LugarProvavel['janela'];
    if (datados.length) {
      let melhor = 0;
      for (let h = 0; h < 24; h++) {
        const soma = horas[h]! + horas[(h + 1) % 24]!;
        if (soma > (janela?.sinais ?? 0) || (soma === janela?.sinais && horas[h]! > melhor)) {
          janela = { inicio: h, fim: (h + 2) % 24, sinais: soma };
          melhor = horas[h]!;
        }
      }
    }
    const noite = datados.filter((s) => {
      const h = horaDeBrasilia(s.quando!);
      return h >= 19 || h < 7;
    }).length;
    const perfil: LugarProvavel['perfil'] = !datados.length
      ? 'sem_horario'
      : noite / datados.length >= 0.6
        ? 'pernoite'
        : (datados.length - noite) / datados.length >= 0.6
          ? 'diurno'
          : 'misto';

    const explicacao: string[] = [];
    const contagem = Object.entries(porTipo)
      .map(([t, n]) => plural(n!, ROTULO_SINAL[t as TipoSinal], PLURAL_SINAL[t as TipoSinal]))
      .join(', ');
    explicacao.push(`${plural(g.itens.length, 'sinal', 'sinais')}: ${contagem}.`);
    if (confirmado) explicacao.push('Endereço cadastrado confirmado por avistamento no mesmo lugar.');
    if (datados.length) explicacao.push(`Último sinal em ${dataCurta(datados.at(-1)!.quando!)}.`);
    if (perfil === 'pernoite') explicacao.push('A maioria dos sinais é à noite ou de madrugada: provável lugar onde o veículo pernoita.');
    if (perfil === 'diurno') explicacao.push('Sinais em horário comercial: provável rotina de trabalho.');
    if (janela && janela.sinais > 1) {
      explicacao.push(`Melhor janela: ${String(janela.inicio).padStart(2, '0')}h–${String(janela.fim).padStart(2, '0')}h (${janela.sinais} sinais).`);
    }
    if (!avistamentos.length) explicacao.push('Só endereço declarado, sem avistamento: confirme antes de mobilizar a equipe.');

    const principal = [...g.itens].sort((a, b) => b.peso - a.peso)[0]!;
    return {
      latitude: Number(g.lat.toFixed(6)),
      longitude: Number(g.lon.toFixed(6)),
      raioMetros: Math.round(Math.max(0, ...g.itens.map((s) => distanciaMetros({ latitude: g.lat, longitude: g.lon }, s)))),
      confianca: 0,
      pontuacao: Number(pontuacao.toFixed(3)),
      descricao: enderecos[0]?.descricao ?? principal.descricao,
      sinais: g.itens.length,
      porTipo,
      primeiro: datados[0]?.quando,
      ultimo: datados.at(-1)?.quando,
      endereco: enderecos[0]?.descricao,
      confirmadoPorAvistamento: confirmado,
      janela,
      perfil,
      horas,
      explicacao,
    } satisfies LugarProvavel;
  });

  lugares.sort((a, b) => b.pontuacao - a.pontuacao);
  const maximo = lugares[0]?.pontuacao ?? 1;
  // Confiança: posição relativa ao melhor lugar, temperada pela quantidade de evidência.
  for (const l of lugares) {
    const relativa = l.pontuacao / maximo;
    const evidencia = Math.min(1, l.pontuacao / 2.5);
    l.confianca = Math.round(100 * relativa * (0.4 + 0.6 * evidencia));
  }
  return lugares;
};
