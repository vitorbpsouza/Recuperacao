/**
 * Documentos que identificam as partes e o processo.
 *
 * Validar o dígito verificador na entrada evita o erro mais caro desta
 * operação: agir sobre a pessoa ou o processo errado.
 */

/** Só letras e dígitos, em maiúsculas: aceita o número com ou sem máscara. */
export const normalizarDocumento = (valor: string): string => valor.toUpperCase().replace(/[^0-9A-Z]/g, '');

const todosIguais = (s: string) => [...s].every((c) => c === s[0]);

/** CPF: 11 dígitos, módulo 11. */
export const cpfValido = (valor: string): boolean => {
  const cpf = normalizarDocumento(valor);
  if (!/^\d{11}$/.test(cpf) || todosIguais(cpf)) return false;
  const digito = (base: string) => {
    const soma = [...base].reduce((total, c, i) => total + Number(c) * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(cpf.slice(0, 9));
  const d2 = digito(cpf.slice(0, 9) + d1);
  return cpf.endsWith(`${d1}${d2}`);
};

/**
 * CNPJ, inclusive o alfanumérico emitido desde julho de 2026 (IN RFB
 * 2.229/2024): 12 posições com letras ou dígitos e 2 dígitos verificadores.
 * O cálculo é o mesmo módulo 11, com cada caractere valendo o código ASCII
 * menos 48 (dígitos valem eles mesmos; A vale 17).
 */
export const cnpjValido = (valor: string): boolean => {
  const cnpj = normalizarDocumento(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || todosIguais(cnpj)) return false;
  const digito = (base: string, pesos: readonly number[]) => {
    const resto = [...base].reduce((total, c, i) => total + (c.charCodeAt(0) - 48) * pesos[i]!, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(cnpj.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${d1}${d2}`);
};

/** Pessoa física ou jurídica pelo documento; `null` se não for nenhum dos dois. */
export const tipoDePessoa = (documento: string | null | undefined): 'PF' | 'PJ' | null => {
  if (!documento) return null;
  if (cpfValido(documento)) return 'PF';
  if (cnpjValido(documento)) return 'PJ';
  return null;
};

/**
 * Número único de processo (Res. CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO.
 * Dígito verificador pelo módulo 97 base 10 (ISO 7064), conforme o Anexo VIII:
 * os campos na ordem, com o DD movido para o fim como "00".
 */
const PARTES_CNJ = /^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/;

export const digitoCnj = (sequencial: string, ano: string, justica: string, tribunal: string, origem: string): string =>
  String(98 - Number(BigInt(`${sequencial}${ano}${justica}${tribunal}${origem}00`) % 97n)).padStart(2, '0');

export const numeroCnjValido = (valor: string): boolean => {
  const partes = PARTES_CNJ.exec(valor.replace(/\D/g, ''));
  if (!partes) return false;
  const [, n, dd, a, j, tr, o] = partes;
  return digitoCnj(n!, a!, j!, tr!, o!) === dd;
};

/** Formata 20 dígitos como NNNNNNN-DD.AAAA.J.TR.OOOO. */
export const formatarCnj = (valor: string): string => {
  const partes = PARTES_CNJ.exec(valor.replace(/\D/g, ''));
  if (!partes) return valor;
  const [, n, dd, a, j, tr, o] = partes;
  return `${n}-${dd}.${a}.${j}.${tr}.${o}`;
};
