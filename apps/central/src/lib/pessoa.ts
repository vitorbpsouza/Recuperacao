/** Formatação de documento, telefone e rótulos de veículo e pessoa, iguais em toda a central. */
import { formatarTelefone, ROTULO_PAPEL, type PapelPessoa } from '@workspace/domain';

export { formatarTelefone, ROTULO_PAPEL };
export type { PapelPessoa };

/** 07764440698 → 077.644.406-98; 14 posições → 00.000.000/0000-00. */
export const formatarDocumento = (doc: string | null | undefined): string => {
  if (!doc) return '—';
  if (/^\d{11}$/.test(doc)) return `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`;
  if (/^[0-9A-Z]{14}$/.test(doc)) return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12)}`;
  return doc;
};

/** 1985-01-18 → 18/01/1985 (e a idade). */
export const formatarNascimento = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return iso;
  const hoje = new Date();
  let idade = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) idade--;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a} · ${idade} anos`;
};

/** Campos do veículo na ordem em que a ficha mostra. */
export const CAMPOS_DO_VEICULO = [
  ['placa', 'Placa'],
  ['marca', 'Marca'],
  ['modelo', 'Modelo'],
  ['anoFabricacao', 'Ano de fabricação'],
  ['anoModelo', 'Ano do modelo'],
  ['cor', 'Cor'],
  ['tipo', 'Tipo'],
  ['especie', 'Espécie'],
  ['categoria', 'Categoria'],
  ['carroceria', 'Carroceria'],
  ['combustivel', 'Combustível'],
  ['potencia', 'Potência'],
  ['cilindradas', 'Cilindradas'],
  ['motor', 'Motor'],
  ['procedencia', 'Procedência'],
  ['chassi', 'Chassi'],
  ['renavam', 'Renavam'],
  ['situacao', 'Situação'],
  ['municipio', 'Município de emplacamento'],
  ['uf', 'UF de emplacamento'],
  ['anoLicenciamento', 'Último licenciamento'],
] as const;

export const ROTULO_TIPO_CONTATO = { celular: 'Celular', fixo: 'Fixo', email: 'E-mail', invalido: 'Inválido' } as const;

/** Link do WhatsApp para um celular (abre o app ou o WhatsApp Web). */
export const linkWhatsapp = (digitos: string) => `https://wa.me/55${digitos}`;

/** Endereço numa linha, para busca no mapa. */
export const enderecoEmLinha = (e: {
  logradouro: string;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}) => [[e.logradouro, e.numero].filter(Boolean).join(', '), e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), e.cep].filter(Boolean).join(' · ');

export const linkMapaDoEndereco = (linha: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(linha)}`;
