/**
 * CSV no formato que o Excel em português abre direto: separador ";", BOM
 * UTF-8 (acentos corretos) e números com vírgula decimal.
 */
type Valor = string | number | boolean | null | undefined | Date;

const celula = (v: Valor): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return String(v).replace('.', ',');
  const texto = String(v);
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

export const gerarCsv = <T,>(linhas: T[], colunas: Array<[titulo: string, valor: (l: T) => Valor]>): string =>
  [colunas.map(([t]) => celula(t)).join(';'), ...linhas.map((l) => colunas.map(([, f]) => celula(f(l))).join(';'))].join(
    '\r\n',
  );

export const baixarCsv = (nome: string, conteudo: string) => {
  const url = URL.createObjectURL(new Blob(['\uFEFF', conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
};
