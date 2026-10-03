/**
 * Tipos das tabelas para consultas tipadas com Drizzle.
 *
 * A fonte de verdade do schema é a migração SQL em `../migrations`: é lá que
 * estão as constraints, os triggers e as políticas de RLS que impõem a
 * fronteira. Este arquivo só descreve colunas e tipos. O teste
 * `test/schema.test.ts` compara as duas descrições e falha se divergirem.
 */
import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const instante = (nome: string) => timestamp(nome, { withTimezone: true, mode: 'date' });
const dinheiro = (nome: string) => numeric(nome, { precision: 14, scale: 2, mode: 'number' });

// Defaults espelham os da migração: o insert tipado pode omitir o que o banco preenche.
const id = () => text('id').primaryKey().default(sql`gen_random_uuid()::text`);
/** Preenchido pelo banco a partir da sessão (`app_tenant()`), nunca pelo cliente. */
const tenantId = () => text('tenant_id').notNull().default(sql`app_tenant()`);
const criadoEm = (nome = 'criado_em') => instante(nome).notNull().defaultNow();

export const tenant = pgTable('tenant', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  sigla: text('sigla').notNull(),
  logoUrl: text('logo_url'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: criadoEm(),
});

export const fonteAtivo = pgTable('fonte_ativo', {
  id: id(),
  tenantId: tenantId(),
  nome: text('nome').notNull(),
  tipo: text('tipo').$type<'Plataforma' | 'Credor Direto' | 'Lead Próprio'>().notNull(),
  ingestao: text('ingestao').$type<'Manual' | 'Exportação' | 'API'>().notNull(),
  finalidadePermitida: text('finalidade_permitida')
    .$type<'recuperacao_para_credor' | 'aquisicao_com_quitacao'>()
    .notNull(),
  termoDeUsoUrl: text('termo_de_uso_url'),
  credorNome: text('credor_nome'),
  ativa: boolean('ativa').notNull().default(true),
});

export const usuario = pgTable('usuario', {
  id: id(),
  tenantId: tenantId(),
  email: text('email').notNull(),
  nome: text('nome').notNull(),
  senhaHash: text('senha_hash').notNull(),
  papel: text('papel').$type<'admin' | 'gestor' | 'operador' | 'auditor'>().notNull(),
  canais: text('canais').array().$type<Array<'plataforma_credor' | 'lead_proprio'>>().notNull().default([]),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: criadoEm(),
});

export const sessao = pgTable('sessao', {
  id: id(),
  tenantId: tenantId(),
  usuarioId: text('usuario_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  criadaEm: criadoEm('criada_em'),
  expiraEm: instante('expira_em').notNull(),
  revogadaEm: instante('revogada_em'),
});

export const ativo = pgTable('ativo', {
  id: id(),
  tenantId: tenantId(),
  placa: text('placa').notNull(),
  chassi: text('chassi'),
  modelo: text('modelo'),
  ano: integer('ano'),
  cor: text('cor'),
  devedorNome: text('devedor_nome'),
  devedorDoc: text('devedor_doc'),
  credorNome: text('credor_nome'),
  valorDivida: dinheiro('valor_divida'),
  cidade: text('cidade'),
  uf: text('uf'),
  dataRecebimento: criadoEm('data_recebimento'),
  renavam: text('renavam'),
  valorFipe: dinheiro('valor_fipe'),
  fipeCodigo: text('fipe_codigo'),
  fipeReferencia: text('fipe_referencia'),
  fipeConsultadoEm: instante('fipe_consultado_em'),
  marca: text('marca'),
  situacao: text('situacao'),
  tipo: text('tipo'),
  especie: text('especie'),
  categoria: text('categoria'),
  carroceria: text('carroceria'),
  combustivel: text('combustivel'),
  potencia: text('potencia'),
  cilindradas: text('cilindradas'),
  motor: text('motor'),
  procedencia: text('procedencia'),
  municipioEmplacamento: text('municipio_emplacamento'),
  ufEmplacamento: text('uf_emplacamento'),
  anoFabricacao: integer('ano_fabricacao'),
  criadoEm: criadoEm(),
});

/** Dono do bem e do contrato (migração 0005). */
export const credor = pgTable('credor', {
  id: id(),
  tenantId: tenantId(),
  nome: text('nome').notNull(),
  cnpj: text('cnpj'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: criadoEm(),
});

export const recuperador = pgTable('recuperador', {
  id: id(),
  tenantId: tenantId(),
  nome: text('nome').notNull(),
  documento: text('documento'),
  telefone: text('telefone'),
  cidades: text('cidades').array().notNull().default([]),
  status: text('status').$type<'Ativo' | 'Inativo' | 'Suspenso'>().notNull(),
  score: numeric('score', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
  taxaRecuperacao: numeric('taxa_recuperacao', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
  dataCadastro: criadoEm('data_cadastro'),
});

export const caso = pgTable('caso', {
  id: id(),
  tenantId: tenantId(),
  ativoId: text('ativo_id').notNull(),
  fonteId: text('fonte_id').notNull(),
  origem: text('origem').$type<'plataforma_credor' | 'lead_proprio'>().notNull(),
  finalidade: text('finalidade')
    .$type<'recuperacao_para_credor' | 'aquisicao_com_quitacao'>()
    .notNull(),
  status: text('status').notNull(),
  recuperadorId: text('recuperador_id'),
  prazoVinculo: instante('prazo_vinculo'),
  prazoMaximo: instante('prazo_maximo'),
  credorId: text('credor_id'),
  rito: text('rito').$type<'judicial' | 'extrajudicial' | 'amigavel'>(),
  retomadoEm: instante('retomado_em'),
  modalidadeRetomada: text('modalidade_retomada').$type<'apreensao_judicial' | 'apreensao_extrajudicial' | 'entrega_voluntaria'>(),
  comprovanteRetomada: text('comprovante_retomada'),
  purgaAte: instante('purga_ate'),
  canalLead: text('canal_lead').$type<
    'Inbound Site' | 'WhatsApp' | 'Indicação' | 'Parceria' | 'Anúncio'
  >(),
  evidenciaLead: text('evidencia_lead'),
  saldoDevedor: dinheiro('saldo_devedor'),
  valorQuitacaoNegociado: dinheiro('valor_quitacao_negociado'),
  valorPagoAoDevedor: dinheiro('valor_pago_ao_devedor'),
  anuenciaCredor: text('anuencia_credor').$type<'Pendente' | 'Obtida' | 'Negada'>(),
  renajudAtivo: boolean('renajud_ativo'),
  gravameBaixado: boolean('gravame_baixado'),
  criadoEm: criadoEm(),
  atualizadoEm: criadoEm('atualizado_em'),
});

export const colisaoOrigem = pgTable('colisao_origem', {
  id: id(),
  tenantId: tenantId(),
  placa: text('placa').notNull(),
  casoPlataformaId: text('caso_plataforma_id').notNull(),
  leadProprioRef: text('lead_proprio_ref'),
  detectadoEm: criadoEm('detectado_em'),
  resolucao: text('resolucao')
    .$type<'lead_descartado' | 'prosseguiu_com_origem_independente'>()
    .notNull(),
  justificativa: text('justificativa').notNull(),
  evidenciaIndependente: text('evidencia_independente'),
  operadorId: text('operador_id').notNull(),
});

export const casoEvento = pgTable('caso_evento', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: text('tenant_id').notNull(),
  casoId: text('caso_id').notNull(),
  tipo: text('tipo').$type<'criado' | 'status_alterado' | 'distribuido' | 'rito_definido' | 'registro_juridico' | 'verificacao_veicular' | 'avistamento'>().notNull(),
  statusDe: text('status_de'),
  statusPara: text('status_para'),
  usuarioId: text('usuario_id'),
  ocorridoEm: criadoEm('ocorrido_em'),
  dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
});

export const bureau = pgTable('bureau', {
  id: id(),
  tenantId: tenantId(),
  nome: text('nome').notNull(),
  tipo: text('tipo').$type<'Crédito' | 'Veicular' | 'Localização' | 'Judicial'>().notNull(),
  contratoFornecedorId: text('contrato_fornecedor_id').notNull(),
  envVarChave: text('env_var_chave'),
  custoConsulta: numeric('custo_consulta', { precision: 10, scale: 2, mode: 'number' }).notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
});

export const consultaAuditoria = pgTable('consulta_auditoria', {
  id: id(),
  tenantId: tenantId(),
  casoId: text('caso_id').notNull(),
  origemCaso: text('origem_caso').$type<'plataforma_credor' | 'lead_proprio'>().notNull(),
  finalidade: text('finalidade')
    .$type<'recuperacao_para_credor' | 'aquisicao_com_quitacao'>()
    .notNull(),
  bureauId: text('bureau_id').notNull(),
  contratoFornecedorId: text('contrato_fornecedor_id').notNull(),
  baseLegal: text('base_legal')
    .$type<'execucao_contrato' | 'legitimo_interesse' | 'obrigacao_legal' | 'consentimento'>()
    .notNull(),
  justificativa: text('justificativa').notNull(),
  operadorId: text('operador_id').notNull(),
  consultadoEm: criadoEm('consultado_em'),
  camposRetornados: text('campos_retornados').array().notNull().default([]),
  retencaoAte: instante('retencao_ate').notNull(),
  custo: numeric('custo', { precision: 10, scale: 2, mode: 'number' }).notNull().default(0),
});

export const repasse = pgTable('repasse', {
  id: id(),
  tenantId: tenantId(),
  recuperadorId: text('recuperador_id').notNull(),
  casoId: text('caso_id').notNull(),
  valor: dinheiro('valor').notNull(),
  data: criadoEm('data'),
  status: text('status').$type<'Pendente' | 'Pago' | 'Cancelado'>().notNull(),
  tipo: text('tipo').$type<'Comissão' | 'Ajuda de Custo' | 'Bônus'>().notNull(),
  observacao: text('observacao'),
});

export const acessoDadoPessoal = pgTable('acesso_dado_pessoal', {
  id: id(),
  tenantId: tenantId(),
  casoId: text('caso_id').notNull(),
  /** Preenchido pelo banco com o usuário da sessão. */
  usuarioId: text('usuario_id').notNull(),
  campos: text('campos').array().notNull(),
  finalidade: text('finalidade').notNull(),
  acessadoEm: criadoEm('acessado_em'),
});
