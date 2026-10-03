/**
 * API Brasil (gateway.apibrasil.io): consulta veicular paga, pela placa.
 *
 *   - `dados`: POST /vehicles/dados { placa }, com Bearer e DeviceToken;
 *   - `consulta`: POST /consulta/veiculos/credits { placa }, debitando créditos
 *     da conta (sem DeviceToken).
 *
 * A resposta é JSON. Ela vira texto "Rótulo: valor" e passa pelo mesmo leitor
 * do texto colado: o que tem campo vai para o campo, o que não tem vira dado
 * extra — e um campo que a API passar a mandar aparece como campo novo.
 */
export interface CredenciaisApiBrasil {
  bearerToken: string;
  deviceToken?: string;
}

export type ServicoApiBrasil = 'dados' | 'consulta';

export class ErroDeIntegracao extends Error {
  readonly statusCode = 502;
}

const rotuloDe = (chave: string) =>
  chave
    .replace(/[_-]+/g, ' ')
    .replace(/([a-zà-ú])([A-Z])/g, '$1 $2')
    .trim();

/**
 * JSON → linhas "Rótulo: valor". Objetos aninhados prefixam o rótulo com o
 * pai só quando a chave se repete ("proprietario nome" × "nome").
 */
export const jsonParaTexto = (dados: unknown, secao = 'DADOS DO VEÍCULO'): string => {
  const linhas: string[] = [];
  const vistos = new Set<string>();
  const restricoes: string[] = [];

  const visitar = (valor: unknown, caminho: string[]) => {
    if (valor === null || valor === undefined || valor === '') return;
    if (Array.isArray(valor)) {
      const chave = caminho.at(-1) ?? '';
      if (valor.every((v) => typeof v !== 'object' || v === null)) {
        if (/restric/i.test(chave)) restricoes.push(...valor.map(String));
        else linhas.push(`${rotuloDe(chave)}: ${valor.join(', ')}`);
        return;
      }
      valor.forEach((v, i) => visitar(v, [...caminho.slice(0, -1), `${chave} ${i + 1}`]));
      return;
    }
    if (typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor as Record<string, unknown>)) visitar(v, [...caminho, k]);
      return;
    }
    const chave = caminho.at(-1) ?? 'valor';
    const rotulo = vistos.has(chave.toLowerCase()) && caminho.length > 1 ? `${caminho.at(-2)} ${chave}` : chave;
    vistos.add(chave.toLowerCase());
    const texto = typeof valor === 'boolean' ? (valor ? 'Sim' : 'Não') : String(valor);
    if (/^restric/i.test(chave)) restricoes.push(texto);
    else linhas.push(`${rotuloDe(rotulo)}: ${texto.replace(/\r?\n/g, ' ')}`);
  };

  // A API Brasil embrulha a resposta em { error, message, response | data }.
  const corpo = (dados as { response?: unknown; data?: unknown })?.response ?? (dados as { data?: unknown })?.data ?? dados;
  visitar(corpo, []);
  restricoes.forEach((r, i) => linhas.push(`Restrição ${i + 1}: ${r}`));
  return [`--- ${secao} ---`, ...linhas].join('\n');
};

export const criarClienteApiBrasil = (
  baseUrl: string,
  credenciais: CredenciaisApiBrasil,
  executar: typeof fetch = fetch,
) => {
  const chamar = async (caminho: string, corpo: unknown) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${credenciais.bearerToken}`,
    };
    if (credenciais.deviceToken) headers.DeviceToken = credenciais.deviceToken;
    let resposta: Response;
    try {
      resposta = await executar(`${baseUrl.replace(/\/+$/, '')}${caminho}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ErroDeIntegracao(`API Brasil fora do ar ou inacessível: ${(e as Error).message}`);
    }
    const texto = await resposta.text();
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new ErroDeIntegracao(`API Brasil respondeu ${resposta.status} sem JSON`);
    }
    const erro = (json as { error?: boolean; message?: string }).error;
    if (!resposta.ok || erro === true) {
      throw new ErroDeIntegracao(`API Brasil recusou (${resposta.status}): ${(json as { message?: string }).message ?? 'sem detalhe'}`);
    }
    return json;
  };

  return {
    /** Consulta a placa e devolve o JSON original e o texto para o leitor. */
    consultarPlaca: async (placa: string, servico: ServicoApiBrasil = 'dados') => {
      const json =
        servico === 'consulta' ? await chamar('/consulta/veiculos/credits', { placa }) : await chamar('/vehicles/dados', { placa });
      return { json, texto: jsonParaTexto(json) };
    },
    /** Testa as credenciais no ambiente de homologação (sem cobrança). */
    testar: async () => chamar('/consulta/veiculos/credits', { placa: 'ABC1234', homolog: true }),
  };
};
