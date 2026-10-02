import { Ativo, Recuperador, Banco, CamilaInsight, Bureau, EnrichmentFlow, Repasse } from './types';
import { addHours, subDays, subMonths } from 'date-fns';

export const MOCK_BANCOS: Banco[] = [
  { id: '1', nome: 'Banco Bradesco', cnpj: '60.746.948/0001-12', contato: 'Marcos Silva', canal: 'API', slaAcordado: 15, volumeMensal: 450, taxaRecuperacao: 68, casosAtivos: 124 },
  { id: '2', nome: 'Santander', cnpj: '90.400.888/0001-42', contato: 'Ana Paula', canal: 'E-mail', slaAcordado: 12, volumeMensal: 380, taxaRecuperacao: 72, casosAtivos: 98 },
  { id: '3', nome: 'Itaú Unibanco', cnpj: '60.872.504/0001-23', contato: 'Ricardo Oliveira', canal: 'API', slaAcordado: 10, volumeMensal: 520, taxaRecuperacao: 75, casosAtivos: 156 },
  { id: '4', nome: 'Banco Pan', cnpj: '59.285.411/0001-13', contato: 'Carla Souza', canal: 'API', slaAcordado: 20, volumeMensal: 210, taxaRecuperacao: 55, casosAtivos: 45 },
  { id: '5', nome: 'Portocred', cnpj: '01.825.446/0001-34', contato: 'Felipe Melo', canal: 'E-mail', slaAcordado: 30, volumeMensal: 120, taxaRecuperacao: 48, casosAtivos: 32 },
];

export const MOCK_RECUPERADORES: Recuperador[] = [
  { id: 'r1', nome: 'Carlos Silva', documento: '123.456.789-00', registro: 'CREA-BH 12345', telefone: '(31) 98888-7777', whatsapp: '(31) 98888-7777', cidades: ['Belo Horizonte', 'Contagem', 'Betim'], tiposVeiculo: ['Passeio', 'Moto'], status: 'Ativo', dataCadastro: subMonths(new Date(), 24).toISOString(), score: 94, taxaRecuperacao: 82, tempoMedioAceite: 18, tempoMedioConclusao: 4, naoRespostas: 2, casosExpirados: 0 },
  { id: 'r2', nome: 'João Mendes', documento: '234.567.890-11', registro: 'CREA-SP 54321', telefone: '(11) 97777-6666', whatsapp: '(11) 97777-6666', cidades: ['São Paulo', 'Guarulhos', 'Osasco'], status: 'Ativo', dataCadastro: subMonths(new Date(), 12).toISOString(), score: 72, taxaRecuperacao: 65, tempoMedioAceite: 45, tempoMedioConclusao: 7, naoRespostas: 8, casosExpirados: 3, tiposVeiculo: ['Passeio', 'Pesado'] },
  { id: 'r3', nome: 'Ricardo Santos', documento: '345.678.901-22', registro: 'CREA-RJ 98765', telefone: '(21) 96666-5555', whatsapp: '(21) 96666-5555', cidades: ['Rio de Janeiro', 'Niterói'], status: 'Ativo', dataCadastro: subMonths(new Date(), 18).toISOString(), score: 88, taxaRecuperacao: 78, tempoMedioAceite: 25, tempoMedioConclusao: 5, naoRespostas: 1, casosExpirados: 1, tiposVeiculo: ['Passeio'] },
  { id: 'r4', nome: 'Fernanda Lima', documento: '456.789.012-33', registro: 'CREA-PR 11223', telefone: '(41) 95555-4444', whatsapp: '(41) 95555-4444', cidades: ['Curitiba', 'São José dos Pinhais'], status: 'Ativo', dataCadastro: subMonths(new Date(), 6).toISOString(), score: 91, taxaRecuperacao: 80, tempoMedioAceite: 15, tempoMedioConclusao: 3, naoRespostas: 0, casosExpirados: 0, tiposVeiculo: ['Passeio', 'Moto'] },
];

export const MOCK_ATIVOS: Ativo[] = [
  { 
    id: 'a1', 
    placa: 'BRA2E19', 
    chassi: '9BWZZZ31ZLW000001', 
    modelo: 'VW Gol 1.0', 
    ano: 2021, 
    cor: 'Branco', 
    devedor: 'José da Silva', 
    documento: '111.222.333-44', 
    banco: 'Itaú Unibanco', 
    valorDivida: 45000, 
    cidade: 'Belo Horizonte', 
    dataRecebimento: subDays(new Date(), 1).toISOString(), 
    status: 'Em Campo', 
    prazoVinculo: addHours(new Date(), 1).toISOString(), 
    prazoMaximo: addHours(new Date(), 5).toISOString(), 
    recuperadorId: 'r1', 
    scoreConfianca: 87,
    enrichmentData: {
      telefones: ['(31) 99999-8888', '(31) 3333-4444'],
      enderecos: ['Rua das Flores, 123, Centro, BH', 'Av. Amazonas, 456, Prado, BH'],
      emails: ['jose.silva@email.com'],
      scoreCredito: 450,
      situacaoCadastral: 'Regular',
      ultimaAtualizacao: subDays(new Date(), 1).toISOString()
    }
  },
  { 
    id: 'a2', 
    placa: 'RJX4H88', 
    chassi: '8ADZZZ42ZLW000002', 
    modelo: 'Fiat Strada', 
    ano: 2022, 
    cor: 'Prata', 
    devedor: 'Maria Oliveira', 
    documento: '222.333.444-55', 
    banco: 'Banco Bradesco', 
    valorDivida: 62000, 
    cidade: 'São Paulo', 
    dataRecebimento: new Date().toISOString(), 
    status: 'Recebido', 
    prazoVinculo: addHours(new Date(), 2).toISOString(), 
    prazoMaximo: addHours(new Date(), 6).toISOString() 
  },
  { 
    id: 'a3', 
    placa: 'KJH4A55', 
    chassi: '7TRZZZ53ZLW000003', 
    modelo: 'Toyota Corolla', 
    ano: 2020, 
    cor: 'Preto', 
    devedor: 'Roberto Carlos', 
    documento: '333.444.555-66', 
    banco: 'Santander', 
    valorDivida: 98000, 
    cidade: 'Rio de Janeiro', 
    dataRecebimento: subDays(new Date(), 2).toISOString(), 
    status: 'Localizado', 
    prazoVinculo: subDays(new Date(), 2).toISOString(), 
    prazoMaximo: subDays(new Date(), 2).toISOString(), 
    recuperadorId: 'r3', 
    scoreConfianca: 92 
  },
  { 
    id: 'a4', 
    placa: 'PLM0B99', 
    chassi: '6YUZZZ64ZLW000004', 
    modelo: 'Honda Civic', 
    ano: 2019, 
    cor: 'Cinza', 
    devedor: 'Luciana Pereira', 
    documento: '444.555.666-77', 
    banco: 'Banco Pan', 
    valorDivida: 85000, 
    cidade: 'Curitiba', 
    dataRecebimento: subDays(new Date(), 3).toISOString(), 
    status: 'Recuperado', 
    prazoVinculo: subDays(new Date(), 3).toISOString(), 
    prazoMaximo: subDays(new Date(), 3).toISOString(), 
    recuperadorId: 'r4' 
  },
];

export const MOCK_BUREAUS: Bureau[] = [
  { id: 'b1', nome: 'Serasa Experian', tipo: 'Crédito', status: 'Ativo', apiKey: '********-****-****-****-************', custoConsulta: 2.50, consultasMes: 1240, tempoRespostaMedio: 850, taxaSucesso: 98 },
  { id: 'b2', nome: 'Boa Vista SCPC', tipo: 'Crédito', status: 'Ativo', apiKey: '********-****-****-****-************', custoConsulta: 2.20, consultasMes: 850, tempoRespostaMedio: 1200, taxaSucesso: 94 },
  { id: 'b3', nome: 'CheckAuto', tipo: 'Veicular', status: 'Ativo', apiKey: '********-****-****-****-************', custoConsulta: 5.00, consultasMes: 320, tempoRespostaMedio: 2500, taxaSucesso: 99 },
  { id: 'b4', nome: 'Sinesp Cidadão', tipo: 'Veicular', status: 'Ativo', apiKey: '********-****-****-****-************', custoConsulta: 0.00, consultasMes: 4500, tempoRespostaMedio: 450, taxaSucesso: 85 },
  { id: 'b5', nome: 'Google Maps API', tipo: 'Localização', status: 'Ativo', apiKey: '********-****-****-****-************', custoConsulta: 0.05, consultasMes: 15600, tempoRespostaMedio: 120, taxaSucesso: 99.9 },
];

export const MOCK_ENRICHMENT_FLOWS: EnrichmentFlow[] = [
  { id: 'f1', nome: 'Enriquecimento Inicial', tipo: 'Automático', gatilho: 'Entrada de Ativo', bureaus: ['b1', 'b4'], status: 'Ativo', prioridade: 'Velocidade', ultimaExecucao: new Date().toISOString() },
  { id: 'f2', nome: 'Localização Avançada', tipo: 'Manual', gatilho: 'Ação do Operador', bureaus: ['b2', 'b3', 'b5'], status: 'Ativo', prioridade: 'Qualidade', ultimaExecucao: subDays(new Date(), 1).toISOString() },
];

export const MOCK_ENRICHMENT_TASKS: any[] = [
  { id: 't1', ativoId: 'a2', flowId: 'f1', status: 'Processando', progresso: 65, dataInicio: new Date().toISOString(), tempoEstimado: 15 },
  { id: 't2', ativoId: 'a1', flowId: 'f2', status: 'Concluído', progresso: 100, dataInicio: subDays(new Date(), 1).toISOString() },
  { id: 't3', ativoId: 'a3', flowId: 'f1', status: 'Erro', progresso: 30, dataInicio: subDays(new Date(), 2).toISOString() },
];

export const CAMILA_INSIGHTS: CamilaInsight[] = [
  { id: 'i1', tipo: 'critico', mensagem: '2 ativos entrarão em prazo crítico nas próximas 2 horas', data: new Date().toISOString() },
  { id: 'i2', tipo: 'alerta', mensagem: `Recuperador ${MOCK_RECUPERADORES[1].nome} em SP está com queda de 22% no score`, data: new Date().toISOString() },
  { id: 'i3', tipo: 'info', mensagem: 'BH apresenta gargalo de cobertura na zona norte', data: new Date().toISOString() },
  { id: 'i4', tipo: 'sucesso', mensagem: 'Taxa de recuperação desta semana está 8% acima da média', data: new Date().toISOString() },
];

export const MOCK_REPASSES: Repasse[] = [
  { id: 'rep1', recuperadorId: 'r1', ativoId: 'a1', valor: 1250.00, data: subDays(new Date(), 2).toISOString(), status: 'Pago', tipo: 'Comissão' },
  { id: 'rep2', recuperadorId: 'r3', ativoId: 'a3', valor: 2100.00, data: subDays(new Date(), 1).toISOString(), status: 'Pendente', tipo: 'Comissão' },
  { id: 'rep3', recuperadorId: 'r4', ativoId: 'a4', valor: 1850.00, data: subDays(new Date(), 5).toISOString(), status: 'Pago', tipo: 'Comissão' },
  { id: 'rep4', recuperadorId: 'r1', ativoId: 'a2', valor: 150.00, data: new Date().toISOString(), status: 'Pendente', tipo: 'Ajuda de Custo', observacao: 'Deslocamento para vistoria' },
];
