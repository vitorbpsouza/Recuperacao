/**
 * Leitura do relatório de consulta veicular de um fornecedor contratado.
 *
 * Só sai daqui o que é do VEÍCULO, por lista explícita de campos. Dono,
 * documento, nome e localização por radar são descartados de propósito: o
 * dado pessoal do devedor chega pela carteira do credor (com finalidade
 * travada), e localização legítima é a do avistamento da equipe de campo.
 * Um relatório com esses dados é sinal para conferir de onde o fornecedor os
 * tira.
 */
import { normalizarPlaca } from './schemas.ts';

export interface RelatorioVeicular {
  placa?: string;
  chassi?: string;
  renavam?: string;
  modelo?: string;
  cor?: string;
  anoFabricacao?: number;
  anoModelo?: number;
  situacao?: string;
  restricoes: string[];
  renajud?: boolean;
  rouboFurto?: boolean;
  leilao?: boolean;
  alienacaoFiduciaria?: boolean;
  anoLicenciamento?: number;
  /** O que havia no texto e foi descartado (rótulos, nunca os valores). */
  descartados: string[];
}

/** Rótulos cujo valor nunca é lido: dado pessoal ou localização sem procedência. */
const PROIBIDOS = /propriet|documento|nome|cpf|cnpj|radar|latitude|longitude|local|endere|telefone|importador|doc import/i;

const sem = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const simNao = (v: string): boolean | undefined => {
  const x = sem(v);
  if (x.startsWith('sim')) return true;
  if (x.startsWith('nao')) return false;
  return undefined;
};

const vazio = (v: string) => v === '' || v === '-' || sem(v) === 'inexistente';

export const lerRelatorioVeicular = (texto: string): RelatorioVeicular => {
  const r: RelatorioVeicular = { restricoes: [], descartados: [] };
  const descartados = new Set<string>();

  for (const linhaBruta of texto.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (/^-+\s*radar/i.test(linha) || /^-+.*radar.*-+$/i.test(linha)) {
      descartados.add('localização por radar');
      continue;
    }
    // Linhas com vários "rótulo: valor" separados por vírgula (o formato do radar).
    if (/latitude|longitude/i.test(linha)) {
      descartados.add('localização por radar');
      continue;
    }
    const m = /^([^:]{2,40}):\s*(.*)$/.exec(linha);
    if (!m) continue;
    const rotulo = m[1]!.trim();
    const valor = m[2]!.trim();
    const chave = sem(rotulo);

    if (PROIBIDOS.test(rotulo) && !/^placa$|^chassi$|^renavam$/.test(chave)) {
      if (/propriet|documento|nome|cpf|cnpj|tipo pessoa/i.test(rotulo)) descartados.add('dados do proprietário');
      else if (/radar|latitude|longitude|local/i.test(rotulo)) descartados.add('localização por radar');
      else descartados.add(rotulo.toLowerCase());
      continue;
    }
    if (chave === 'tipo pessoa') {
      descartados.add('dados do proprietário');
      continue;
    }

    if (vazio(valor)) continue;
    if (chave === 'placa') r.placa = normalizarPlaca(valor);
    else if (chave === 'chassi') r.chassi = valor.toUpperCase().replace(/\s/g, '');
    else if (chave === 'renavam') r.renavam = valor.replace(/\D/g, '').padStart(11, '0');
    else if (chave === 'modelo') r.modelo = valor;
    else if (chave === 'cor') r.cor = valor;
    else if (chave === 'situacao') r.situacao = valor;
    else if (chave.startsWith('ano fab')) {
      const [fab, mod] = valor.split('/').map((x) => Number(x.trim()));
      if (fab) r.anoFabricacao = fab;
      if (mod) r.anoModelo = mod;
    } else if (/^restricao \d+$/.test(chave)) {
      if (sem(valor) !== 'sem restricao') r.restricoes.push(valor);
    } else if (chave === 'renajud') r.renajud = simNao(valor);
    else if (chave === 'roubo/furto') r.rouboFurto = simNao(valor);
    else if (chave === 'leilao') r.leilao = simNao(valor);
    else if (chave === 'ano licenciamento') {
      const ano = Number(valor);
      if (ano) r.anoLicenciamento = ano;
    }
  }

  // Alienação fiduciária aparece como restrição; vira indicador próprio.
  if (r.restricoes.length) r.alienacaoFiduciaria = r.restricoes.some((x) => /aliena/i.test(x));
  if (r.renajud === undefined && r.restricoes.some((x) => /renajud/i.test(x))) r.renajud = true;
  r.descartados = [...descartados];
  return r;
};
