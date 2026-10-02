import type { Tom } from '@workspace/ui/brand/status-badge';

/**
 * Tom de cada status, no mesmo desenho da interface anterior: cinza na
 * entrada, azul no preparo, âmbar aguardando terceiro, verde no êxito,
 * vermelho na perda. Status desconhecido cai em neutro — nunca em sucesso.
 */
const TOM: Record<string, Tom> = {
  // Plano A — recuperação
  Recebido: 'neutro',
  'Em Enriquecimento': 'info',
  Enriquecido: 'sucesso',
  'Em Análise': 'destaque',
  Distribuído: 'alerta',
  Aceito: 'sucesso',
  'Em Campo': 'progresso',
  Localizado: 'sucesso',
  'Pronto para Campo': 'info',
  Retomado: 'sucesso',
  'Em Custódia': 'progresso',
  'Entregue ao Credor': 'concluido',
  Curado: 'concluido',
  'Não Localizado': 'encerrado',
  Suspenso: 'alerta',
  'Removido pelo Banco': 'perigo',
  // Plano B — aquisição
  'Lead Recebido': 'neutro',
  'Em Contato': 'info',
  'Proposta Enviada': 'alerta',
  'Negociando com Credor': 'progresso',
  'Quitação Aprovada': 'sucesso',
  Quitado: 'sucesso',
  Transferido: 'concluido',
  Desistiu: 'perigo',
  // Comum
  Encerrado: 'encerrado',
};

export const tomDoStatus = (status: string): Tom => TOM[status] ?? 'neutro';
