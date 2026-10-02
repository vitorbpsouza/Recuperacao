/** Formatação pt-BR usada em toda a interface. Um lugar só, para nada divergir. */

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR');
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatarMoeda = (valor: number | null | undefined) => (valor == null ? '—' : moeda.format(valor));
export const formatarNumero = (valor: number | null | undefined) => (valor == null ? '—' : numero.format(valor));
/** `fracao` entre 0 e 1. */
export const formatarPercentual = (fracao: number | null | undefined) =>
  fracao == null || Number.isNaN(fracao) ? '—' : percentual.format(fracao);
export const formatarData = (iso: string | Date | null | undefined) =>
  iso == null ? '—' : dataCurta.format(typeof iso === 'string' ? new Date(iso) : iso);
export const formatarDataHora = (iso: string | Date | null | undefined) =>
  iso == null ? '—' : dataHora.format(typeof iso === 'string' ? new Date(iso) : iso);

/** Placa no padrão de exibição: AAA-0A00 (Mercosul) ou AAA-0000 (antiga). */
export const formatarPlaca = (placa: string) => {
  const limpa = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return limpa.length === 7 ? `${limpa.slice(0, 3)}-${limpa.slice(3)}` : limpa;
};

/** CPF/CNPJ mascarado: só os dígitos necessários para conferência visual. */
export const mascararDocumento = (doc: string | null | undefined) => {
  if (!doc) return '—';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`;
  return '•••';
};

/** Iniciais para avatar: primeira e última palavra. */
export const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .map((p) => p[0]!.toUpperCase())
    .join('')
    .slice(0, 2);
