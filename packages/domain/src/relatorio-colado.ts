/**
 * Leitura do texto colado de um relatório de consulta: veículo, proprietário,
 * radar e o dossiê de uma pessoa (dados básicos, telefones, endereços,
 * parentes, perfil e crédito).
 *
 * Regra principal: nada se perde. O que o leitor reconhece vai para o campo
 * certo; o que não reconhece sai como `DadoExtra`, com a seção e o rótulo de
 * origem. Rótulo desconhecido numa seção estruturada (veículo, dados básicos)
 * sai marcado como `novo`: é o sinal de que o fornecedor passou a mandar um
 * campo que o sistema ainda não tem, e que deve virar coluna num próximo
 * deploy (ver `CAMPOS_VEICULO` e `CAMPOS_PESSOA`).
 *
 * O texto original é guardado inteiro pela API; este leitor só organiza.
 */
import { cnpjValido, cpfValido } from './documentos.ts';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type EntidadeExtra = 'veiculo' | 'pessoa' | 'caso';

/** Dado sem campo próprio: guardado com a seção e o rótulo de onde veio. */
export interface DadoExtra {
  entidade: EntidadeExtra;
  /** Título da seção como veio no texto ("CREDIT ANALYTICS"). */
  secao: string;
  /** Chave estável para agrupar: seção e rótulo normalizados ("credit analytics > todos flags > fintech"). */
  chave: string;
  /** Rótulo legível ("TODOS FLAGS › Fintech"). */
  rotulo: string;
  valor: string;
  /** Perfil, renda, crédito, IRPF: só admin e gestor veem. */
  sensivel: boolean;
  /** Campo que o sistema ainda não conhece numa seção estruturada. */
  novo: boolean;
}

export interface VeiculoLido {
  placa?: string;
  chassi?: string;
  renavam?: string;
  marca?: string;
  modelo?: string;
  cor?: string;
  anoFabricacao?: number;
  anoModelo?: number;
  situacao?: string;
  tipo?: string;
  especie?: string;
  categoria?: string;
  carroceria?: string;
  combustivel?: string;
  potencia?: string;
  cilindradas?: string;
  motor?: string;
  procedencia?: string;
  municipio?: string;
  uf?: string;
  anoLicenciamento?: number;
  restricoes: string[];
  renajud?: boolean;
  rouboFurto?: boolean;
  leilao?: boolean;
  alienacaoFiduciaria?: boolean;
}

export interface FonteDoContato {
  /** Base que citou o número ("ANATEL 2026", "Vivo", "DATAB"). */
  fonte: string;
  data?: string;
  ranking?: number;
  titular?: string;
}

export interface ContatoLido {
  tipo: 'celular' | 'fixo' | 'email' | 'invalido';
  /** Só dígitos (DDD + número) ou o e-mail em minúsculas. */
  valor: string;
  /** Como apareceu da primeira vez, para conferência. */
  original: string;
  valido: boolean;
  fontes: FonteDoContato[];
}

export interface EnderecoLido {
  /** Logradouro sem tipo + número + cidade, normalizados: agrupa as variações do mesmo endereço. */
  chave: string;
  logradouro: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  /** Cada grafia que apareceu no texto. */
  variantes: string[];
  fontes: string[];
}

export interface ParenteLido {
  vinculo: string;
  nome: string;
  documento?: string;
}

export interface PessoaLida {
  documento?: string;
  tipoPessoa?: 'PF' | 'PJ';
  nome?: string;
  nomeCivil?: string;
  nomeMae?: string;
  nomePai?: string;
  /** AAAA-MM-DD */
  nascimento?: string;
  sexo?: string;
  estadoCivil?: string;
  rg?: string;
  rgOrgao?: string;
  rgUf?: string;
  tituloEleitor?: string;
  profissao?: string;
  nacionalidade?: string;
  situacaoCadastral?: string;
  obito?: boolean;
  contatos: ContatoLido[];
  enderecos: EnderecoLido[];
  parentes: ParenteLido[];
  extras: DadoExtra[];
  /** De onde a pessoa veio no texto. */
  origem: 'proprietario_do_veiculo' | 'dossie';
}

export interface RadarLido {
  /** ISO 8601 com o fuso de Brasília. */
  observadoEm: string;
  placa?: string;
  local: string;
  latitude?: number;
  longitude?: number;
}

export interface LeituraDeRelatorio {
  veiculo: (VeiculoLido & { extras: DadoExtra[] }) | null;
  pessoas: PessoaLida[];
  radares: RadarLido[];
  /** Seções que não pertencem a veículo nem a pessoa. */
  outros: DadoExtra[];
  /** Títulos das seções encontradas, na ordem. */
  secoes: string[];
  /** O que o leitor não conseguiu interpretar e quer que alguém confira. */
  avisos: string[];
}

// ---------------------------------------------------------------------------
// Catálogos: o que já tem campo próprio
// ---------------------------------------------------------------------------

/** Rótulo normalizado → campo do veículo. Rótulo fora daqui, em seção de veículo, é campo novo. */
export const CAMPOS_VEICULO: Record<string, keyof VeiculoLido | 'anoFabMod' | 'restricao' | 'emplacamento' | 'conhecido'> = {
  placa: 'placa',
  chassi: 'chassi',
  renavam: 'renavam',
  marca: 'marca',
  modelo: 'modelo',
  'marca/modelo': 'modelo',
  'marca modelo': 'modelo',
  cor: 'cor',
  'ano fab/mod': 'anoFabMod',
  'ano fabricacao/modelo': 'anoFabMod',
  'ano fab/modelo': 'anoFabMod',
  'ano fabricacao': 'anoFabricacao',
  'ano modelo': 'anoModelo',
  situacao: 'situacao',
  'situacao do veiculo': 'situacao',
  tipo: 'tipo',
  'tipo de veiculo': 'tipo',
  'tipo veiculo': 'tipo',
  especie: 'especie',
  categoria: 'categoria',
  carroceria: 'carroceria',
  combustivel: 'combustivel',
  potencia: 'potencia',
  cilindrada: 'cilindradas',
  cilindradas: 'cilindradas',
  motor: 'motor',
  'numero do motor': 'motor',
  procedencia: 'procedencia',
  municipio: 'municipio',
  'municipio de emplacamento': 'municipio',
  cidade: 'municipio',
  uf: 'uf',
  'uf de emplacamento': 'uf',
  emplacamento: 'emplacamento',
  'local de emplacamento': 'emplacamento',
  'ano licenciamento': 'anoLicenciamento',
  'ano de licenciamento': 'anoLicenciamento',
  'ultimo licenciamento': 'anoLicenciamento',
  renajud: 'renajud',
  'roubo/furto': 'rouboFurto',
  'roubo e furto': 'rouboFurto',
  leilao: 'leilao',
  'alienacao fiduciaria': 'alienacaoFiduciaria',
  // Conhecidos, sem coluna própria: guardados como extra, sem alerta de campo novo.
  importador: 'conhecido',
  'doc importador': 'conhecido',
  'documento importador': 'conhecido',
};

/** Rótulo normalizado → campo da pessoa. */
export const CAMPOS_PESSOA: Record<string, keyof PessoaLida | 'email' | 'conhecido' | 'sensivel'> = {
  nome: 'nome',
  'nome completo': 'nome',
  'nome civil': 'nomeCivil',
  'nome da mae': 'nomeMae',
  mae: 'nomeMae',
  'nome do pai': 'nomePai',
  pai: 'nomePai',
  cpf: 'documento',
  cnpj: 'documento',
  'cpf/cnpj': 'documento',
  documento: 'documento',
  'data de nascimento': 'nascimento',
  nascimento: 'nascimento',
  sexo: 'sexo',
  'estado civil': 'estadoCivil',
  rg: 'rg',
  'orgao emissor': 'rgOrgao',
  'uf emissao rg': 'rgUf',
  'titulo de eleitor': 'tituloEleitor',
  'profissao (cbo)': 'profissao',
  profissao: 'profissao',
  nacionalidade: 'nacionalidade',
  'situacao cadastral': 'situacaoCadastral',
  obito: 'obito',
  email: 'email',
  'e-mail': 'email',
  'tipo pessoa': 'conhecido',
  'tipo de pessoa': 'conhecido',
  'data atualizacao': 'conhecido',
  'data inclusao': 'conhecido',
  'codigo controle': 'conhecido',
  pis: 'conhecido',
  nis: 'conhecido',
  renda: 'sensivel',
  'faixa de renda': 'sensivel',
  'renda estimada': 'sensivel',
};

// ---------------------------------------------------------------------------
// Utilitários de texto
// ---------------------------------------------------------------------------

/** Minúsculas, sem acento e com espaços simples: a forma de comparar rótulos. */
export const semAcento = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const VAZIOS = new Set(['', '-', '--', 'nao informado', 'nao informada', 'n/i', 'n/a', 'ni', 'null', 'none', 'undefined', 'nao consta']);
const vazio = (v: string | undefined) => v === undefined || VAZIOS.has(semAcento(v));

const simNao = (v: string): boolean | undefined => {
  const x = semAcento(v);
  if (['sim', 's', 'true', 'verdadeiro', 'consta', 'yes'].some((p) => x === p || x.startsWith(`${p} `))) return true;
  if (['nao', 'n', 'false', 'falso', 'nada consta', 'no'].some((p) => x === p || x.startsWith(`${p} `))) return false;
  return undefined;
};

/** dd/mm/aaaa ou aaaa-mm-dd → aaaa-mm-dd. */
const dataIso = (v: string): string | undefined => {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim());
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : undefined;
};

/**
 * CPF/CNPJ só com dígitos. Alguns fornecedores cortam o zero à esquerda
 * ("7764440698"): completa e confere pelo dígito verificador.
 */
export const normalizarDocumentoLido = (v: string): { documento?: string; tipo?: 'PF' | 'PJ' } => {
  const d = v.replace(/\D/g, '');
  if (!d) return {};
  if (d.length <= 11 && cpfValido(d.padStart(11, '0'))) return { documento: d.padStart(11, '0'), tipo: 'PF' };
  if (d.length > 11 && d.length <= 14 && cnpjValido(d.padStart(14, '0'))) return { documento: d.padStart(14, '0'), tipo: 'PJ' };
  return {};
};

/** Placa como o banco guarda. */
const placaDe = (v: string) => v.toUpperCase().replace(/[\s-]/g, '');

// ---------------------------------------------------------------------------
// Telefones
// ---------------------------------------------------------------------------

const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54,
  55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98,
  99,
]);

/** Classifica um número pelos dígitos: celular (11, com 9), fixo (10, começando de 2 a 5) ou inválido. */
export const classificarTelefone = (bruto: string): Pick<ContatoLido, 'tipo' | 'valor' | 'valido'> => {
  let d = bruto.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1);
  const ddd = Number(d.slice(0, 2));
  const numero = d.slice(2);
  if (DDDS.has(ddd)) {
    if (d.length === 11 && numero.startsWith('9')) return { tipo: 'celular', valor: d, valido: true };
    if (d.length === 10 && /^[2-5]/.test(numero)) return { tipo: 'fixo', valor: d, valido: true };
  }
  return { tipo: 'invalido', valor: d, valido: false };
};

/** (37) 99993-3446 · (37) 3236-1169 */
export const formatarTelefone = (digitos: string): string => {
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return digitos;
};

const TELEFONE = /\(\s*\d{2}\s*\)\s*[\d.\s-]{6,12}\d|\b\d{2}\s?9\d{4}-?\d{4}\b/g;

// ---------------------------------------------------------------------------
// Endereços
// ---------------------------------------------------------------------------

const TIPOS_LOGRADOURO = new Set([
  'r', 'rua', 'av', 'ave', 'avenida', 'pc', 'pca', 'praca', 'al', 'alameda', 'tv', 'trav', 'travessa', 'rod', 'rodovia', 'est',
  'estrada', 'via', 'lg', 'largo', 'bc', 'beco', 'vl', 'vila', 'q', 'qd', 'quadra', 'pq', 'parque', 'ld', 'ladeira', 'cond',
]);

const cepDe = (s: string): string | undefined => {
  const m = /(\d{5})-?(\d{3})/.exec(s);
  return m ? `${m[1]}-${m[2]}` : undefined;
};

/** Separa "R MARINGA 195 C - C" em logradouro, número e complemento. */
const quebrarLogradouro = (texto: string): { logradouro: string; numero?: string; complemento?: string } => {
  const [principal = '', ...resto] = texto.split(/\s+-\s+/);
  let complemento = resto.join(' - ').trim() || undefined;
  const palavrasDoTexto = principal.trim().replace(/\bN[º°]\.?\s*/gi, '').split(/\s+/);
  // O número é o primeiro token numérico depois de um nome: em "R 7 DE SETEMBRO 100", o 7 é nome da rua.
  const iNumero = palavrasDoTexto.findIndex(
    (p, i) => /^\d+[A-Z]?$/i.test(p) && palavrasDoTexto.slice(0, i).some((x) => !TIPOS_LOGRADOURO.has(semAcento(x).replace('.', ''))),
  );
  if (iNumero < 0) return { logradouro: principal.trim(), complemento };
  let logradouro = palavrasDoTexto.slice(0, iNumero).join(' ');
  const depois = palavrasDoTexto.slice(iNumero + 1).join(' ').trim();
  if (!complemento && depois) complemento = depois;
  const numero = palavrasDoTexto[iNumero]!.toUpperCase();
  // "R MARINGA RES 195 MG - RES 195 MG": o que se repete no complemento não é do logradouro.
  if (complemento) {
    const doComplemento = new Set(complemento.split(/\s+/).map(semAcento));
    const palavras = logradouro.split(/\s+/);
    while (palavras.length > 1 && doComplemento.has(semAcento(palavras.at(-1)!))) palavras.pop();
    logradouro = palavras.join(' ');
  }
  return { logradouro, numero, complemento };
};

const chaveDoEndereco = (logradouro: string, numero: string | undefined, cidade: string | undefined) => {
  const palavras = semAcento(logradouro).replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  while (palavras.length > 1 && TIPOS_LOGRADOURO.has(palavras[0]!)) palavras.shift();
  return [palavras.join(' '), numero ?? 's/n', semAcento(cidade ?? '')].join('|');
};

/** Uma linha de endereço, nos formatos com vírgulas ou "LOGRADOURO - CIDADE/UF CEP 00000000". */
export const lerEndereco = (linha: string): Omit<EnderecoLido, 'variantes' | 'fontes'> | null => {
  const texto = linha.trim();
  const compacto = /^(.*?)\s+-\s+([^,]+?)\/([A-Z]{2})(?:\s+CEP\s*([\d-]{8,9}))?$/i.exec(texto);
  if (compacto && !texto.includes(',')) {
    const l = quebrarLogradouro(compacto[1]!);
    return {
      ...l,
      cidade: compacto[2]!.trim(),
      uf: compacto[3]!.toUpperCase(),
      cep: compacto[4] ? cepDe(compacto[4]) : undefined,
      chave: chaveDoEndereco(l.logradouro, l.numero, compacto[2]),
    };
  }
  const partes = texto.split(/\s*,\s*/).filter(Boolean);
  if (partes.length < 2) return null;
  let cep: string | undefined;
  if (/^\d{5}-?\d{3}$/.test(partes.at(-1)!)) cep = cepDe(partes.pop()!);
  let cidade: string | undefined;
  let uf: string | undefined;
  const iCidade = partes.findIndex((p, i) => i > 0 && /^[^/]+\/[A-Z]{2}$/i.test(p));
  if (iCidade > 0) {
    const [c, u] = partes[iCidade]!.split('/');
    cidade = c!.trim();
    uf = u!.trim().toUpperCase();
    partes.splice(iCidade, 1);
  }
  let logradouroTexto = partes.shift()!;
  // "R MARINGA, Nº 195, ..." — o número em parte própria.
  if (partes[0] && /^(N[º°O]\.?\s*)?\d+[A-Z]?$/i.test(partes[0])) {
    logradouroTexto = `${logradouroTexto} ${partes.shift()!.replace(/^N[º°O]\.?\s*/i, '')}`;
  }
  const bairro = iCidade > 0 ? partes.pop() : undefined;
  const l = quebrarLogradouro(logradouroTexto);
  const complemento = [l.complemento, ...partes].filter(Boolean).join(', ') || undefined;
  return { ...l, complemento, bairro, cidade, uf, cep, chave: chaveDoEndereco(l.logradouro, l.numero, cidade) };
};

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

type TipoSecao =
  | 'veiculo'
  | 'proprietario'
  | 'radar'
  | 'pessoa'
  | 'telefones'
  | 'enderecos'
  | 'parentes'
  | 'profissao'
  | 'documentos'
  | 'perfil'
  | 'desconhecida'
  | 'nenhuma';

/** Seções de perfil e crédito: guardadas por rótulo, só admin e gestor veem. */
const SECOES_SENSIVEIS = [
  'perfil',
  'compliance',
  'classe social',
  'credito',
  'poder aquisitivo',
  'target',
  'risco',
  'mosaic',
  'imposto de renda',
  'irpf',
  'credit analytics',
  'score',
  'renda',
];

const classificarSecao = (titulo: string): TipoSecao => {
  const t = semAcento(titulo);
  if (/radar|passagem|ocr|cerco/.test(t)) return 'radar';
  if (/propriet/.test(t)) return 'proprietario';
  if (/veiculo|restric|indicador|gravame|debito|multa|licenc|importa|emplacamento|caracteristic|especificac/.test(t)) return 'veiculo';
  if (/telefone|operadora|celular|contato/.test(t)) return 'telefones';
  if (/endereco/.test(t)) return 'enderecos';
  if (/parente|vinculo|familia/.test(t)) return 'parentes';
  if (/profiss|ocupac/.test(t)) return 'profissao';
  if (/^documentos?$/.test(t)) return 'documentos';
  if (/dados basicos|dados cadastrais|dados pessoais|identificacao/.test(t)) return 'pessoa';
  if (SECOES_SENSIVEIS.some((s) => t.includes(s))) return 'perfil';
  return 'desconhecida';
};

/** Cabeçalho "--- TÍTULO ---", "--- TÍTULO: ---" ou "🚗 TÍTULO 🚗". `''` é separador. */
const lerCabecalho = (linha: string): string | null => {
  const tracos = /^-{2,}\s*(.*?)\s*:?\s*-{2,}$/.exec(linha);
  if (tracos) return tracos[1]!.replace(/:$/, '').trim();
  if (/^-{3,}$/.test(linha)) return '';
  if (!linha.includes(':') && /^\p{Extended_Pictographic}/u.test(linha)) {
    const titulo = linha
      .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
      .replace(/[^\p{L}\p{N}\s&/()-]/gu, '')
      .trim();
    return titulo || null;
  }
  return null;
};

/**
 * Pares "RÓTULO: valor" numa linha. Aceita vários separados por vírgula ou
 * barra vertical ("VINCULO: MAE, NOME: X, CPF: Y"; "Ano: 2020 | Situação: Z").
 */
export const lerPares = (linha: string): [string, string][] => {
  const porBarra = linha.split(/\s+\|\s+/);
  const pedacos =
    porBarra.length > 1 && porBarra.filter((p) => /^[^:]{1,40}:/.test(p)).length > 1
      ? porBarra
      : linha.split(/,\s*(?=[A-ZÀ-Ü][A-ZÀ-Ü0-9 ./()-]{0,30}:)/);
  const pares: [string, string][] = [];
  for (const p of pedacos) {
    const m = /^([^:]{1,60}?):\s*(.*)$/.exec(p.trim());
    if (m) pares.push([m[1]!.trim(), m[2]!.trim()]);
    else if (pares.length) pares[pares.length - 1]![1] += `, ${p.trim()}`;
  }
  return pares;
};

// ---------------------------------------------------------------------------
// Leitor
// ---------------------------------------------------------------------------

const novaPessoa = (origem: PessoaLida['origem']): PessoaLida => ({
  contatos: [],
  enderecos: [],
  parentes: [],
  extras: [],
  origem,
});

/** "21/07/2026:17:25" ou "21/07/2026 17:25:00" → ISO com fuso de Brasília. */
const dataHoraRadar = (v: string): string | undefined => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})[\s:T-]+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(v);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}-03:00`;
};

const numeroOuNada = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

export const lerRelatorio = (textoOriginal: string): LeituraDeRelatorio => {
  // Alguns fornecedores mandam a quebra de linha escapada ("\n" literal).
  const texto = textoOriginal.replace(/\\n/g, '\n');
  const veiculo: VeiculoLido & { extras: DadoExtra[] } = { restricoes: [], extras: [] };
  let temVeiculo = false;
  const proprietario = novaPessoa('proprietario_do_veiculo');
  const dossie = novaPessoa('dossie');
  const radares: RadarLido[] = [];
  const outros: DadoExtra[] = [];
  const secoes: string[] = [];
  const avisos: string[] = [];

  const contatos = new Map<string, ContatoLido>();
  const enderecos = new Map<string, EnderecoLido>();

  let titulo = '';
  let tipo: TipoSecao = 'nenhuma';
  /** "[ANATEL 2026]" e "[SIPNI]": sub-bloco dentro da seção. */
  let subBloco: string | undefined;
  /** De quem são as seções em volta: decide o dono de uma seção desconhecida. */
  let contexto: 'veiculo' | 'pessoa' | null = null;
  /** Grupos aninhados de perfil ("TODOS FLAGS" › "Financeiro"). */
  let grupo: { nome: string; pai?: string; itens: number } | undefined;

  const extra = (
    entidade: EntidadeExtra,
    rotuloBruto: string,
    valor: string,
    opcoes: { sensivel?: boolean; novo?: boolean; secao?: string } = {},
  ): DadoExtra => {
    const secao = opcoes.secao ?? (subBloco ? `${titulo || 'Sem seção'} › ${subBloco}` : titulo || 'Sem seção');
    const caminho = [grupo?.pai, grupo?.nome, rotuloBruto].filter(Boolean) as string[];
    return {
      entidade,
      secao,
      chave: [secao, ...caminho].map(semAcento).join(' > '),
      rotulo: caminho.join(' › '),
      valor,
      sensivel: opcoes.sensivel ?? false,
      novo: opcoes.novo ?? false,
    };
  };

  const somarContato = (bruto: string, fonte: FonteDoContato) => {
    const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(bruto);
    const c = email
      ? { tipo: 'email' as const, valor: email[0].toLowerCase(), valido: true }
      : classificarTelefone(bruto);
    if (!c.valor) return;
    const chave = `${c.tipo === 'email' ? 'email' : 'tel'}:${c.valor}`;
    const atual = contatos.get(chave);
    if (atual) {
      const repetida = atual.fontes.some((f) => f.fonte === fonte.fonte && f.data === fonte.data && f.ranking === fonte.ranking);
      if (!repetida) atual.fontes.push(fonte);
    } else {
      contatos.set(chave, { ...c, original: bruto.trim(), fontes: [fonte] });
    }
  };

  const somarEndereco = (linha: string, fonte: string) => {
    const e = lerEndereco(linha);
    if (!e) {
      dossie.extras.push(extra('pessoa', 'Endereço não interpretado', linha));
      avisos.push(`endereço não interpretado: ${linha}`);
      return;
    }
    const atual = enderecos.get(e.chave);
    if (!atual) {
      enderecos.set(e.chave, { ...e, variantes: [linha.trim()], fontes: [fonte] });
      return;
    }
    if (!atual.variantes.includes(linha.trim())) atual.variantes.push(linha.trim());
    if (!atual.fontes.includes(fonte)) atual.fontes.push(fonte);
    // Completa o que faltava; a grafia com mais informação vence.
    atual.bairro ??= e.bairro;
    atual.uf ??= e.uf;
    atual.cep ??= e.cep;
    if (e.logradouro.length > atual.logradouro.length) atual.logradouro = e.logradouro;
  };

  /** Campo da pessoa pelo rótulo; o que não tem campo vira extra. */
  const campoDaPessoa = (p: PessoaLida, rotulo: string, valor: string, estruturada: boolean) => {
    const chave = semAcento(rotulo);
    const campo = CAMPOS_PESSOA[chave];
    if (vazio(valor)) return;
    if (campo === 'email') return somarContato(valor, { fonte: titulo || 'dados básicos' });
    if (campo === 'sensivel') return p.extras.push(extra('pessoa', rotulo, valor, { sensivel: true }));
    if (campo === 'conhecido') return p.extras.push(extra('pessoa', rotulo, valor));
    if (!campo) return p.extras.push(extra('pessoa', rotulo, valor, { novo: estruturada, sensivel: tipo === 'perfil' }));
    if (campo === 'documento') {
      const d = normalizarDocumentoLido(valor);
      if (!d.documento) {
        avisos.push(`documento não confere pelo dígito: ${valor}`);
        return p.extras.push(extra('pessoa', rotulo, valor));
      }
      if (p.documento && p.documento !== d.documento) return p.extras.push(extra('pessoa', rotulo, valor));
      p.documento = d.documento;
      p.tipoPessoa = d.tipo;
      return;
    }
    if (campo === 'nascimento') {
      const d = dataIso(valor);
      if (d) p.nascimento ??= d;
      else p.extras.push(extra('pessoa', rotulo, valor));
      return;
    }
    if (campo === 'obito') {
      const o = simNao(valor);
      if (o !== undefined) p.obito = o;
      return;
    }
    if (campo === 'profissao') {
      const [nome, ...resto] = valor.split(/\s+-\s+FONTE:/i);
      p.profissao ??= nome!.trim();
      if (resto.length) p.extras.push(extra('pessoa', rotulo, valor));
      return;
    }
    const k = campo as 'nome' | 'nomeCivil' | 'nomeMae' | 'nomePai' | 'sexo' | 'estadoCivil' | 'rg' | 'rgOrgao' | 'rgUf' | 'tituloEleitor' | 'nacionalidade' | 'situacaoCadastral';
    if (p[k] === undefined) p[k] = valor.replace(/\s+/g, ' ').trim();
    else if (semAcento(p[k]!) !== semAcento(valor)) p.extras.push(extra('pessoa', rotulo, valor));
  };

  const campoDoVeiculo = (rotulo: string, valor: string) => {
    const chave = semAcento(rotulo);
    const restricao = /^restricao( \d+)?$/.test(chave);
    const campo = restricao ? 'restricao' : CAMPOS_VEICULO[chave];
    if (vazio(valor)) return;
    temVeiculo = true;
    if (!campo) return veiculo.extras.push(extra('veiculo', rotulo, valor, { novo: true }));
    if (campo === 'conhecido') return veiculo.extras.push(extra('veiculo', rotulo, valor));
    if (campo === 'restricao') {
      if (!/sem restric/.test(semAcento(valor))) veiculo.restricoes.push(valor);
      return;
    }
    if (campo === 'placa') veiculo.placa = placaDe(valor);
    else if (campo === 'chassi') veiculo.chassi = valor.toUpperCase().replace(/\s/g, '');
    else if (campo === 'renavam') {
      const d = valor.replace(/\D/g, '');
      if (d) veiculo.renavam = d.padStart(11, '0');
    } else if (campo === 'anoFabMod') {
      const [fab, mod] = valor.split('/').map((x) => Number(x.trim()));
      if (fab) veiculo.anoFabricacao = fab;
      if (mod) veiculo.anoModelo = mod;
    } else if (campo === 'anoFabricacao' || campo === 'anoModelo' || campo === 'anoLicenciamento') {
      const ano = Number(valor.replace(/\D/g, '').slice(0, 4));
      if (ano) veiculo[campo] = ano;
    } else if (campo === 'renajud' || campo === 'rouboFurto' || campo === 'leilao' || campo === 'alienacaoFiduciaria') {
      const b = simNao(valor);
      if (b === undefined) veiculo.extras.push(extra('veiculo', rotulo, valor));
      else veiculo[campo] = b;
    } else if (campo === 'uf') {
      veiculo.uf = valor.trim().toUpperCase().slice(0, 2);
    } else if (campo === 'emplacamento') {
      const [cidade, uf] = valor.split('/').map((x) => x.trim());
      if (cidade) veiculo.municipio = cidade;
      if (uf && /^[A-Z]{2}$/i.test(uf)) veiculo.uf = uf.toUpperCase();
    } else if (campo !== 'restricoes') {
      (veiculo as unknown as Record<string, string>)[campo] = valor.replace(/\s+/g, ' ').trim();
    }
  };

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const recuo = bruta.length - bruta.trimStart().length;

    const cabecalho = lerCabecalho(linha);
    if (cabecalho !== null) {
      titulo = cabecalho;
      tipo = cabecalho ? classificarSecao(cabecalho) : 'nenhuma';
      // Seção que o leitor não conhece é do mesmo dono das vizinhas: logo depois
      // do veículo ("ℹ OUTROS ℹ" com a financeira do gravame), é do veículo.
      if (tipo === 'desconhecida' && contexto === 'veiculo') tipo = 'veiculo';
      if (tipo === 'veiculo' || tipo === 'proprietario' || tipo === 'radar') contexto = 'veiculo';
      else if (tipo !== 'desconhecida' && tipo !== 'nenhuma' && tipo !== 'documentos') contexto = 'pessoa';
      subBloco = undefined;
      grupo = undefined;
      if (cabecalho) secoes.push(cabecalho);
      continue;
    }

    // "[SIPNI]" sozinho abre um sub-bloco; "[DATAB - TEL] (37) ..." é uma linha marcada.
    const marcada = /^\[([^\]]+)\]\s*\|?\s*(.*)$/.exec(linha);
    if (marcada) {
      const marca = marcada[1]!.trim();
      const resto = marcada[2]!.replace(/^\|\s*/, '').trim();
      const m = semAcento(marca);
      if (!resto) {
        subBloco = marca;
        grupo = undefined;
        continue;
      }
      if (/email|e-mail/.test(m)) {
        const [valor = '', ...info] = resto.split(/\s*\|\s*/);
        const ranking = info.map((i) => /ranking\s*(\d+)/i.exec(i)?.[1]).find(Boolean);
        const data = info.map((i) => /rec[eê]ncia\s*(\S+)/i.exec(i)?.[1]).find(Boolean);
        somarContato(valor, { fonte: marca.split('-')[0]!.trim(), ranking: ranking ? Number(ranking) : undefined, data });
        continue;
      }
      if (/endere/.test(m)) {
        somarEndereco(resto, marca.split('-')[0]!.trim());
        continue;
      }
      if (/tel|fone|cel/.test(m)) {
        const ranking = /ranking\s*(\d+)/i.exec(resto)?.[1];
        const numeros = resto.replace(/ranking\s*\d+/i, '').trim();
        somarContato(numeros, { fonte: marca.split('-')[0]!.trim(), ranking: ranking ? Number(ranking) : undefined });
        continue;
      }
      dossie.extras.push(extra('pessoa', marca, resto, { secao: titulo || marca, sensivel: tipo === 'perfil' }));
      continue;
    }

    // Sub-bloco cadastral ([SIPNI], [RECEITA]) vale em qualquer seção: "Nome:", "Óbito:" são da pessoa.
    if (subBloco && /sipni|receita|cadastr/i.test(subBloco) && linha.includes(':')) {
      for (const [rotulo, valor] of lerPares(linha)) campoDaPessoa(dossie, rotulo, valor, false);
      continue;
    }

    const pares = lerPares(linha);
    // Linha sem rótulo em seção estruturada: não se perde, vira texto da seção.
    if (!pares.length && ['veiculo', 'documentos', 'proprietario', 'pessoa', 'profissao'].includes(tipo)) {
      if (tipo === 'veiculo') veiculo.extras.push(extra('veiculo', 'Texto', linha));
      else (tipo === 'proprietario' ? proprietario : dossie).extras.push(extra('pessoa', 'Texto', linha));
      continue;
    }

    switch (tipo) {
      case 'radar': {
        const campos = Object.fromEntries(pares.map(([k, v]) => [semAcento(k), v]));
        const quando = dataHoraRadar(campos['data - hora'] ?? campos['data/hora'] ?? campos['data hora'] ?? campos.data ?? linha);
        const local = campos.local ?? campos.endereco ?? campos.localizacao;
        if (quando && local) {
          const latitude = campos.latitude ? numeroOuNada(campos.latitude) : undefined;
          const longitude = campos.longitude ? numeroOuNada(campos.longitude) : undefined;
          const coordenadas =
            latitude !== undefined && longitude !== undefined && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
              ? { latitude, longitude }
              : {};
          radares.push({ observadoEm: quando, placa: campos.placa ? placaDe(campos.placa) : undefined, local, ...coordenadas });
        } else {
          outros.push(extra('caso', 'Linha de radar não interpretada', linha));
          avisos.push(`linha de radar não interpretada: ${linha}`);
        }
        break;
      }

      case 'veiculo':
      case 'documentos': {
        if (pares.length === 1 && pares[0]![1] === '') {
          grupo = { nome: pares[0]![0], pai: recuo > 0 ? grupo?.nome : undefined, itens: 0 };
          break;
        }
        // Linha sem recuo fecha o grupo aberto.
        if (recuo === 0) grupo = undefined;
        else if (grupo) grupo.itens++;
        for (const [rotulo, valor] of pares) {
          const k = semAcento(rotulo);
          // "DOCUMENTOS" existe nos dois relatórios: PIS e RG são da pessoa; licenciamento, do veículo.
          if (tipo === 'documentos' && !CAMPOS_VEICULO[k]) campoDaPessoa(dossie, rotulo, valor, false);
          else campoDoVeiculo(rotulo, valor);
        }
        break;
      }

      case 'proprietario': {
        for (const [rotulo, valor] of pares) {
          const k = semAcento(rotulo);
          if (k === 'tipo pessoa' || k === 'tipo de pessoa') {
            if (!vazio(valor)) proprietario.extras.push(extra('pessoa', rotulo, valor));
            continue;
          }
          campoDaPessoa(proprietario, rotulo, valor, true);
        }
        break;
      }

      case 'pessoa': {
        for (const [rotulo, valor] of pares) campoDaPessoa(dossie, rotulo, valor, true);
        break;
      }

      case 'telefones': {
        const porRotulo = Object.fromEntries(pares.map(([k, v]) => [semAcento(k), v]));
        // "• ANATEL: NOME | CPF 000 | (37) 99999-9999" — fonte antes dos dois pontos, titular logo depois.
        const bullet = /^[•*·-]\s*([^:]+):\s*(.*)$/.exec(linha);
        const fonte =
          porRotulo.operadora ?? (bullet ? bullet[1]!.trim() : undefined) ?? subBloco ?? (titulo || 'telefones');
        const titular = bullet ? bullet[2]!.split('|')[0]!.trim() : undefined;
        const dataBruta = porRotulo.data ?? /\|\s*(\d{2}\/\d{2}\/\d{4}|N\/I)\s*$/i.exec(linha)?.[1];
        const data = dataBruta && !vazio(dataBruta) ? dataBruta : undefined;
        const alvo = bullet ? bullet[2]! : (porRotulo.telefone ?? linha);
        const numeros = alvo.match(TELEFONE) ?? [];
        if (!numeros.length) {
          dossie.extras.push(extra('pessoa', 'Linha de telefone não interpretada', linha));
          break;
        }
        for (const n of numeros) {
          somarContato(n, {
            fonte,
            data,
            titular: titular && !/titular n\/i/i.test(titular) && !vazio(titular) ? titular.replace(/\s+/g, ' ') : undefined,
          });
        }
        break;
      }

      case 'enderecos': {
        somarEndereco(linha, titulo || 'endereços');
        break;
      }

      case 'parentes': {
        const p = Object.fromEntries(pares.map(([k, v]) => [semAcento(k), v]));
        if (p.nome) {
          const doc = p.cpf ?? p.documento ?? p.cnpj;
          dossie.parentes.push({
            vinculo: p.vinculo ?? p.parentesco ?? 'parente',
            nome: p.nome.replace(/\s+/g, ' '),
            documento: doc ? normalizarDocumentoLido(doc).documento : undefined,
          });
        } else {
          dossie.extras.push(extra('pessoa', 'Parente não interpretado', linha, { sensivel: true }));
        }
        break;
      }

      case 'profissao': {
        for (const [rotulo, valor] of pares) campoDaPessoa(dossie, rotulo, valor, false);
        break;
      }

      case 'perfil':
      case 'desconhecida':
      case 'nenhuma': {
        const sensivel = tipo === 'perfil';
        const novo = tipo === 'desconhecida';
        if (!pares.length) {
          const e = extra(tipo === 'nenhuma' ? 'caso' : 'pessoa', 'Texto', linha, { sensivel, novo });
          (tipo === 'nenhuma' ? outros : dossie.extras).push(e);
          break;
        }
        // "Grupo:" sem valor abre um grupo. Logo depois de outro grupo ainda vazio, aninha
        // ("TODOS FLAGS:" › "Financeiro:"); depois de um grupo com itens, é irmão dele.
        if (pares.length === 1 && pares[0]![1] === '') {
          const nome = pares[0]![0];
          if (recuo > 0 || (grupo && grupo.itens === 0)) grupo = { nome, pai: grupo?.nome, itens: 0 };
          else grupo = { nome, pai: grupo?.pai, itens: 0 };
          break;
        }
        if (grupo) grupo.itens++;
        if (pares.length > 1 && tipo !== 'nenhuma') {
          // "Ano: 2020 | Situação: ... | Banco: ..." — uma linha, um registro.
          const [[k, v], ...resto] = pares as [[string, string], ...[string, string][]];
          dossie.extras.push(extra('pessoa', `${k} ${v}`, resto.map(([a, b]) => `${a}: ${b}`).join(' | '), { sensivel, novo }));
          break;
        }
        for (const [rotulo, valor] of pares) {
          if (vazio(valor)) continue;
          const k = semAcento(rotulo);
          if (tipo === 'nenhuma') {
            // Fora de seção: o rótulo decide se é do veículo ou da pessoa.
            if (CAMPOS_VEICULO[k] || /^restricao/.test(k)) campoDoVeiculo(rotulo, valor);
            else if (CAMPOS_PESSOA[k]) campoDaPessoa(dossie, rotulo, valor, false);
            else outros.push(extra('caso', rotulo, valor, { novo: true }));
            continue;
          }
          // "Situacao Cadastral" na seção de compliance é cadastro; "RENDA" numa seção de crédito é perfil.
          const campo = CAMPOS_PESSOA[k];
          if (sensivel && !grupo && campo && !['sensivel', 'conhecido', 'email'].includes(campo)) {
            campoDaPessoa(dossie, rotulo, valor, false);
            continue;
          }
          dossie.extras.push(extra('pessoa', rotulo, valor, { sensivel, novo }));
        }
        break;
      }
    }
  }

  // Contatos e endereços são do dossiê; sem dossiê, do proprietário do veículo.
  const temDossie =
    !!dossie.documento || !!dossie.nome || dossie.extras.length > 0 || dossie.parentes.length > 0 || contatos.size + enderecos.size > 0;
  const donoDosContatos = temDossie ? dossie : proprietario;
  donoDosContatos.contatos = [...contatos.values()].sort(
    (a, b) => Number(b.valido) - Number(a.valido) || b.fontes.length - a.fontes.length,
  );
  donoDosContatos.enderecos = [...enderecos.values()]
    .map((e) => {
      // CEP: o que mais aparece entre as variantes ("03566-079" é erro de digitação de "35660-179").
      const ceps = e.variantes.map((v) => cepDe(v)).filter(Boolean) as string[];
      const contagem = new Map<string, number>();
      for (const c of ceps) contagem.set(c, (contagem.get(c) ?? 0) + 1);
      const cep = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? e.cep;
      return { ...e, cep };
    })
    .sort((a, b) => b.variantes.length + b.fontes.length - (a.variantes.length + a.fontes.length));

  // O mesmo documento no relatório do veículo e no dossiê: uma pessoa só.
  const pessoas: PessoaLida[] = [];
  const temProprietario = !!proprietario.documento || !!proprietario.nome;
  if (temDossie && temProprietario && proprietario.documento && proprietario.documento === dossie.documento) {
    dossie.extras.push(...proprietario.extras);
    dossie.nome ??= proprietario.nome;
    pessoas.push({ ...dossie, origem: 'proprietario_do_veiculo' });
  } else {
    if (temProprietario) pessoas.push(proprietario);
    if (temDossie) pessoas.push(dossie);
  }

  return {
    veiculo: temVeiculo ? veiculo : null,
    pessoas,
    radares,
    outros,
    secoes,
    avisos,
  };
};

/** Quantos campos novos o texto trouxe: o que precisa de atenção numa próxima versão. */
export const camposNovos = (l: LeituraDeRelatorio): DadoExtra[] => [
  ...(l.veiculo?.extras ?? []).filter((e) => e.novo),
  ...l.pessoas.flatMap((p) => p.extras.filter((e) => e.novo)),
  ...l.outros.filter((e) => e.novo),
];

// ---------------------------------------------------------------------------
// Papel da pessoa no caso
// ---------------------------------------------------------------------------

export const PAPEIS_PESSOA = ['devedor', 'proprietario', 'terceiro_possuidor', 'parente', 'avalista', 'outro'] as const;
export type PapelPessoa = (typeof PAPEIS_PESSOA)[number];

/** Papéis que o usuário escolhe para o dossiê colado (parente vem da seção de parentes). */
export const PAPEIS_DO_DOSSIE = ['devedor', 'proprietario', 'terceiro_possuidor', 'avalista', 'outro'] as const;
export type PapelDoDossie = (typeof PAPEIS_DO_DOSSIE)[number];

export const ROTULO_PAPEL: Record<PapelPessoa, string> = {
  devedor: 'Devedor',
  proprietario: 'Proprietário atual',
  terceiro_possuidor: 'Terceiro possuidor',
  parente: 'Parente',
  avalista: 'Avalista',
  outro: 'Outro',
};

/**
 * Papéis de uma pessoa lida, comparando com o devedor do caso.
 *
 * - Mesmo documento do devedor: é o devedor (e, se veio do bloco do veículo,
 *   também o proprietário).
 * - Bloco "proprietário" do relatório do veículo: proprietário atual, pelo
 *   DETRAN.
 * - Dossiê de outro documento (ou sem devedor no caso): não dá para saber —
 *   `pergunta` fica verdadeiro e a tela pergunta o papel.
 */
export const papeisDaPessoa = (
  pessoa: Pick<PessoaLida, 'documento' | 'origem'>,
  devedorDoc: string | null | undefined,
): { papeis: PapelPessoa[]; pergunta: boolean } => {
  const devedor = devedorDoc ? normalizarDocumentoLido(devedorDoc).documento : undefined;
  const ehDevedor = !!pessoa.documento && !!devedor && pessoa.documento === devedor;
  if (pessoa.origem === 'proprietario_do_veiculo') {
    return { papeis: ehDevedor ? ['devedor', 'proprietario'] : ['proprietario'], pergunta: false };
  }
  if (ehDevedor) return { papeis: ['devedor'], pergunta: false };
  return { papeis: [], pergunta: true };
};
