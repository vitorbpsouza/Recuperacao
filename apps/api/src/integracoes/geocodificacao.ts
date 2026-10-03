/**
 * Endereço → coordenada, sem custo:
 *
 *   1. OpenStreetMap (Nominatim), busca estruturada por rua e número, cidade,
 *      UF e CEP. Política de uso: no máximo uma consulta por segundo e
 *      identificação no User-Agent — a fila abaixo garante as duas;
 *   2. sem resultado, a coordenada do CEP pela BrasilAPI (v2), com precisão
 *      de CEP.
 *
 * A precisão vai junto ('numero', 'rua', 'cep'): a inteligência de
 * localização e a equipe sabem quanto confiar no ponto.
 */
export interface EnderecoParaGeocodificar {
  logradouro: string;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

export interface Coordenada {
  latitude: number;
  longitude: number;
  precisao: 'numero' | 'rua' | 'cep';
  fonte: 'openstreetmap' | 'brasilapi';
}

const AGENTE = 'ReCredita/1.0 (+https://github.com/vitorbpsouza/Recuperacao)';
// Nos testes a internet é falsa: sem espera.
const INTERVALO_MS = process.env.NODE_ENV === 'test' ? 0 : 1_100;
let fila: Promise<unknown> = Promise.resolve();

/** Uma consulta ao Nominatim por vez, com 1,1 s entre elas (política do OSM). */
const naFila = <T>(fn: () => Promise<T>): Promise<T> => {
  const proxima = fila.then(fn, fn);
  fila = proxima.then(
    () => new Promise((r) => setTimeout(r, INTERVALO_MS)),
    () => new Promise((r) => setTimeout(r, INTERVALO_MS)),
  );
  return proxima;
};

const TIPOS = /^(r|rua|av|avenida|pc|pca|praca|al|alameda|tv|travessa|rod|rodovia|est|estrada)\.?\s+/i;
const EXPANDIR: Record<string, string> = { r: 'Rua', av: 'Avenida', pc: 'Praça', pca: 'Praça', al: 'Alameda', tv: 'Travessa', rod: 'Rodovia', est: 'Estrada' };

/** "R MARINGA" → "Rua MARINGA": o Nominatim entende melhor o tipo por extenso. */
export const logradouroPorExtenso = (l: string) => {
  const m = TIPOS.exec(l);
  if (!m) return l;
  const tipo = m[1]!.toLowerCase();
  return `${EXPANDIR[tipo] ?? m[1]} ${l.slice(m[0].length)}`;
};

export const geocodificar = async (e: EnderecoParaGeocodificar, executar: typeof fetch = fetch): Promise<Coordenada | null> => {
  const rua = logradouroPorExtenso(e.logradouro.trim());
  if (e.cidade) {
    const q = new URLSearchParams({
      street: [e.numero, rua].filter(Boolean).join(' '),
      city: e.cidade,
      ...(e.uf ? { state: e.uf } : {}),
      ...(e.cep ? { postalcode: e.cep } : {}),
      country: 'Brasil',
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
    });
    try {
      const r = await naFila(() =>
        executar(`https://nominatim.openstreetmap.org/search?${q}`, {
          headers: { 'user-agent': AGENTE, 'accept-language': 'pt-BR' },
          signal: AbortSignal.timeout(15_000),
        }),
      );
      if (r.ok) {
        const [primeiro] = (await r.json()) as { lat: string; lon: string; address?: { house_number?: string } }[];
        if (primeiro) {
          return {
            latitude: Number(primeiro.lat),
            longitude: Number(primeiro.lon),
            precisao: primeiro.address?.house_number ? 'numero' : 'rua',
            fonte: 'openstreetmap',
          };
        }
      }
    } catch {
      // Sem OSM, tenta o CEP.
    }
  }
  const cep = e.cep?.replace(/\D/g, '');
  if (cep?.length === 8) {
    try {
      const r = await executar(`https://brasilapi.com.br/api/cep/v2/${cep}`, { signal: AbortSignal.timeout(15_000) });
      if (r.ok) {
        const c = (await r.json()) as { location?: { coordinates?: { latitude?: string; longitude?: string } } };
        const lat = Number(c.location?.coordinates?.latitude);
        const lon = Number(c.location?.coordinates?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0) return { latitude: lat, longitude: lon, precisao: 'cep', fonte: 'brasilapi' };
      }
    } catch {
      // Sem coordenada: o endereço fica marcado como não localizado.
    }
  }
  return null;
};
