import { LucideIcon } from 'lucide-react';

export type StatusAtivo = 
  | 'Recebido' 
  | 'Em Enriquecimento' 
  | 'Enriquecido'
  | 'Em Análise' 
  | 'Distribuído' 
  | 'Aceito' 
  | 'Em Campo' 
  | 'Localizado' 
  | 'Recuperado' 
  | 'Encerrado' 
  | 'Removido pelo Banco';

export interface EnrichmentData {
  telefones: string[];
  enderecos: string[];
  emails: string[];
  scoreCredito?: number;
  situacaoCadastral?: string;
  ultimaAtualizacao: string;
}

export interface Ativo {
  id: string;
  placa: string;
  chassi: string;
  modelo: string;
  ano: number;
  cor: string;
  devedor: string;
  documento: string;
  banco: string;
  valorDivida: number;
  cidade: string;
  dataRecebimento: string;
  status: StatusAtivo;
  prazoVinculo: string; // ISO string
  prazoMaximo: string; // ISO string
  recuperadorId?: string;
  scoreConfianca?: number;
  enrichmentData?: EnrichmentData;
}

export interface Recuperador {
  id: string;
  nome: string;
  documento: string;
  registro: string;
  telefone: string;
  whatsapp: string;
  cidades: string[];
  tiposVeiculo: string[];
  status: 'Ativo' | 'Inativo' | 'Suspenso';
  dataCadastro: string;
  score: number;
  taxaRecuperacao: number;
  tempoMedioAceite: number; // em minutos
  tempoMedioConclusao: number; // em dias
  naoRespostas: number;
  casosExpirados: number;
  rankingCidade?: number;
}

export interface Banco {
  id: string;
  nome: string;
  cnpj: string;
  contato: string;
  canal: 'E-mail' | 'API';
  slaAcordado: number; // dias
  volumeMensal: number;
  taxaRecuperacao: number;
  casosAtivos: number;
}

export interface CamilaInsight {
  id: string;
  tipo: 'alerta' | 'info' | 'sucesso' | 'critico';
  mensagem: string;
  data: string;
}

export interface Bureau {
  id: string;
  nome: string;
  tipo: 'Crédito' | 'Veicular' | 'Localização' | 'Judicial';
  status: 'Ativo' | 'Inativo' | 'Manutenção';
  apiKey: string;
  custoConsulta: number;
  consultasMes: number;
  tempoRespostaMedio?: number; // em ms
  taxaSucesso?: number; // 0-100
}

export interface EnrichmentFlow {
  id: string;
  nome: string;
  tipo: 'Automático' | 'Manual';
  gatilho: string;
  bureaus: string[]; // IDs dos bureaus
  status: 'Ativo' | 'Inativo';
  prioridade?: 'Custo' | 'Velocidade' | 'Qualidade';
  ultimaExecucao?: string;
}

export interface EnrichmentTask {
  id: string;
  ativoId: string;
  flowId: string;
  status: 'Pendente' | 'Processando' | 'Concluído' | 'Erro';
  progresso: number;
  dataInicio: string;
  tempoEstimado?: number;
}

export interface Notification {
  id: string;
  titulo: string;
  mensagem: string;
  data: string;
  lida: boolean;
  tipo: 'pagamento' | 'ativo' | 'sistema' | 'alerta';
  prioridade: 'baixa' | 'media' | 'alta';
}

export interface CamilaFinancialRecommendation {
  repasseId: string;
  prioridade: 'Baixa' | 'Média' | 'Alta' | 'Crítica';
  justificativa: string;
  riscoCancelamento: number; // 0-100
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface Repasse {
  id: string;
  recuperadorId: string;
  ativoId: string;
  valor: number;
  data: string;
  status: 'Pendente' | 'Pago' | 'Cancelado';
  tipo: 'Comissão' | 'Ajuda de Custo' | 'Bônus';
  observacao?: string;
}
