/**
 * Formato das respostas da API.
 *
 * Estes schemas validam o que sai (o serializador recusa resposta fora do
 * contrato) e geram o OpenAPI de onde sai o cliente tipado dos apps.
 * Datas saem como ISO 8601; dinheiro como número; nomes em camelCase.
 */
import { z } from 'zod';

import {
  distribuirEntrada,
  finalidadePermitida,
  loginEntrada,
  mudarStatusEntrada,
  novaColisaoEntrada,
  novaConsultaEntrada,
  novoAtivoEntrada,
  novoCasoEntrada,
  novoRecuperadorEntrada,
  novoUsuarioEntrada,
  origemCaso,
  papelUsuario,
  revelarDevedorEntrada,
} from '@workspace/domain';

export const erro = z.object({ erro: z.string() });

export const tenant = z.object({
  id: z.string(),
  nome: z.string(),
  sigla: z.string(),
  logoUrl: z.string().nullable(),
});

export const usuarioSessao = z.object({
  id: z.string(),
  email: z.string(),
  nome: z.string(),
  papel: papelUsuario,
  canais: z.array(origemCaso),
  /** Canais que esta sessão enxerga (admin e auditor: os dois). */
  canaisVisiveis: z.array(origemCaso),
  tenant,
  /** Enviar no cabeçalho X-CSRF-Token em toda requisição que altera dados. */
  csrfToken: z.string(),
});

export const sessaoAberta = z.object({
  usuario: usuarioSessao,
  expiraEm: z.date(),
});

export const usuarioCriado = z.object({
  id: z.string(),
  email: z.string(),
  nome: z.string(),
  papel: papelUsuario,
  canais: z.array(origemCaso),
});

export const caso = z.object({
  id: z.string(),
  ativoId: z.string(),
  fonteId: z.string(),
  origem: origemCaso,
  finalidade: finalidadePermitida,
  status: z.string(),
  recuperadorId: z.string().nullable(),
  recuperadorNome: z.string().nullable(),
  prazoVinculo: z.date().nullable(),
  prazoMaximo: z.date().nullable(),
  canalLead: z.string().nullable(),
  evidenciaLead: z.string().nullable(),
  saldoDevedor: z.number().nullable(),
  valorQuitacaoNegociado: z.number().nullable(),
  valorPagoAoDevedor: z.number().nullable(),
  anuenciaCredor: z.enum(['Pendente', 'Obtida', 'Negada']).nullable(),
  renajudAtivo: z.boolean().nullable(),
  gravameBaixado: z.boolean().nullable(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
  // Do ativo: o mínimo para identificar o caso numa lista. Dado pessoal do
  // devedor só na ficha, sob demanda.
  placa: z.string(),
  modelo: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
});

export const listaCasos = z.object({
  origem: origemCaso,
  finalidade: finalidadePermitida,
  total: z.number().int(),
  casos: z.array(caso),
});

export const casoCriado = z.object({ id: z.string(), origem: origemCaso, finalidade: finalidadePermitida });

export const podeTransferir = z.object({
  podeTransferir: z.boolean(),
  pendencias: z.array(z.string()),
});

export const statusAlterado = z.object({ id: z.string(), status: z.string() });

export const statusInvalido = z.object({ erro: z.string(), validos: z.array(z.string()) });

export const colisao = z.object({
  id: z.string(),
  placa: z.string(),
  casoPlataformaId: z.string(),
  leadProprioRef: z.string().nullable(),
  detectadoEm: z.date(),
  resolucao: z.enum(['lead_descartado', 'prosseguiu_com_origem_independente']),
  justificativa: z.string(),
  evidenciaIndependente: z.string().nullable(),
  operadorId: z.string(),
});

export const criado = z.object({ id: z.string() });

export const ativo = z.object({
  id: z.string(),
  placa: z.string(),
  chassi: z.string().nullable(),
  modelo: z.string().nullable(),
  ano: z.number().int().nullable(),
  cor: z.string().nullable(),
  devedorNome: z.string().nullable(),
  devedorDoc: z.string().nullable(),
  credorNome: z.string().nullable(),
  valorDivida: z.number().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  dataRecebimento: z.date(),
  criadoEm: z.date(),
});

export const fonte = z.object({
  id: z.string(),
  nome: z.string(),
  tipo: z.enum(['Plataforma', 'Credor Direto', 'Lead Próprio']),
  ingestao: z.enum(['Manual', 'Exportação', 'API']),
  finalidadePermitida,
  termoDeUsoUrl: z.string().nullable(),
  credorNome: z.string().nullable(),
});

export const recuperador = z.object({
  id: z.string(),
  nome: z.string(),
  documento: z.string().nullable(),
  telefone: z.string().nullable(),
  cidades: z.array(z.string()),
  status: z.enum(['Ativo', 'Inativo', 'Suspenso']),
  score: z.number(),
  taxaRecuperacao: z.number(),
  dataCadastro: z.date(),
});

/** Bureau sem `envVarChave`: nem o nome da variável da chave sai da API. */
export const bureau = z.object({
  id: z.string(),
  nome: z.string(),
  tipo: z.enum(['Crédito', 'Veicular', 'Localização', 'Judicial']),
  contratoFornecedorId: z.string(),
  custoConsulta: z.number(),
});

export const repasse = z.object({
  id: z.string(),
  recuperadorId: z.string(),
  recuperadorNome: z.string(),
  casoId: z.string(),
  placa: z.string(),
  valor: z.number(),
  data: z.date(),
  status: z.enum(['Pendente', 'Pago', 'Cancelado']),
  tipo: z.enum(['Comissão', 'Ajuda de Custo', 'Bônus']),
  observacao: z.string().nullable(),
});

export const consultaAuditoria = z.object({
  id: z.string(),
  casoId: z.string(),
  origemCaso: origemCaso,
  finalidade: finalidadePermitida,
  bureauId: z.string(),
  contratoFornecedorId: z.string(),
  baseLegal: z.enum(['execucao_contrato', 'legitimo_interesse', 'obrigacao_legal', 'consentimento']),
  justificativa: z.string(),
  operadorId: z.string(),
  consultadoEm: z.date(),
  camposRetornados: z.array(z.string()),
  retencaoAte: z.date(),
  custo: z.number(),
});

export const linhaAuditoria = consultaAuditoria.extend({
  bureauNome: z.string(),
  operadorNome: z.string(),
});

export const custoBureau = z.object({
  nome: z.string(),
  consultas: z.number().int(),
  custoTotal: z.number(),
});

export const recomendacaoCamila = z.object({
  repasseId: z.string(),
  prioridade: z.string(),
  justificativa: z.string(),
  riscoCancelamento: z.number(),
});

/*
 * Nomes no OpenAPI: com id registrado, cada schema vira um componente nomeado
 * e o cliente gerado ganha tipos como `Esquemas['Caso']`. Entradas recebem o
 * sufixo "Input" do provider.
 */
const registrar = (esquemas: Record<string, z.ZodType>) => {
  for (const [id, esquema] of Object.entries(esquemas)) z.globalRegistry.add(esquema, { id });
};

registrar({
  Erro: erro,
  Tenant: tenant,
  UsuarioSessao: usuarioSessao,
  SessaoAberta: sessaoAberta,
  UsuarioCriado: usuarioCriado,
  Caso: caso,
  ListaCasos: listaCasos,
  CasoCriado: casoCriado,
  PodeTransferir: podeTransferir,
  StatusAlterado: statusAlterado,
  StatusInvalido: statusInvalido,
  Colisao: colisao,
  Criado: criado,
  Ativo: ativo,
  Fonte: fonte,
  Recuperador: recuperador,
  Bureau: bureau,
  Repasse: repasse,
  ConsultaAuditoria: consultaAuditoria,
  LinhaAuditoria: linhaAuditoria,
  CustoBureau: custoBureau,
  RecomendacaoCamila: recomendacaoCamila,
});

registrar({
  Login: loginEntrada,
  NovoUsuario: novoUsuarioEntrada,
  NovoCaso: novoCasoEntrada,
  MudarStatus: mudarStatusEntrada,
  NovaColisao: novaColisaoEntrada,
  NovoAtivo: novoAtivoEntrada,
  NovoRecuperador: novoRecuperadorEntrada,
  NovaConsulta: novaConsultaEntrada,
});

/** Ficha do caso: o caso, o ativo sem dado pessoal do devedor e a fonte. */
export const casoDetalhe = caso.extend({
  ativo: z.object({
    chassi: z.string().nullable(),
    ano: z.number().int().nullable(),
    cor: z.string().nullable(),
    credorNome: z.string().nullable(),
    valorDivida: z.number().nullable(),
    dataRecebimento: z.date(),
  }),
  fonte: z.object({
    nome: z.string(),
    tipo: z.enum(['Plataforma', 'Credor Direto', 'Lead Próprio']),
    credorNome: z.string().nullable(),
  }),
});

export const eventoCaso = z.object({
  id: z.number().int(),
  tipo: z.enum(['criado', 'status_alterado', 'distribuido', 'rito_definido', 'registro_juridico']),
  statusDe: z.string().nullable(),
  statusPara: z.string().nullable(),
  usuarioNome: z.string().nullable(),
  ocorridoEm: z.date(),
  /** Na distribuição: recuperador, anterior e prazos. */
  dados: z.record(z.string(), z.unknown()),
});

export const devedorRevelado = z.object({
  devedorNome: z.string().nullable(),
  devedorDoc: z.string().nullable(),
});

export const acessoDadoPessoal = z.object({
  id: z.string(),
  usuarioNome: z.string(),
  campos: z.array(z.string()),
  finalidade: z.string(),
  acessadoEm: z.date(),
});

export const distribuicao = z.object({
  id: z.string(),
  status: z.string(),
  recuperadorId: z.string(),
  prazoVinculo: z.date(),
  prazoMaximo: z.date(),
});

registrar({
  CasoDetalhe: casoDetalhe,
  EventoCaso: eventoCaso,
  DevedorRevelado: devedorRevelado,
  AcessoDadoPessoal: acessoDadoPessoal,
  Distribuicao: distribuicao,
});

registrar({
  Distribuir: distribuirEntrada,
  RevelarDevedor: revelarDevedorEntrada,
});

// ---------------------------------------------------------------------------
// Plano A — credor, rito e ciclo
// ---------------------------------------------------------------------------

/** Data do calendário (AAAA-MM-DD). Instantes vêm do SQL cru como texto: coerce. */
const dataCivil = z.string();

export const mandato = z.object({
  id: z.string(),
  credorId: z.string(),
  inicio: dataCivil,
  fim: dataCivil,
  referencia: z.string(),
  revogadoEm: z.coerce.date().nullable(),
  vigente: z.boolean(),
});

export const credor = z.object({
  id: z.string(),
  nome: z.string(),
  cnpj: z.string().nullable(),
  ativo: z.boolean(),
  mandatos: z.array(mandato),
});

export const processoJudicial = z.object({
  numeroCnj: z.string(),
  vara: z.string().nullable(),
  comarca: z.string(),
  uf: z.string(),
  ajuizadoEm: dataCivil.nullable(),
  liminar: z.enum(['pendente', 'deferida', 'indeferida', 'revogada']),
  liminarEm: dataCivil.nullable(),
  mandadoEm: dataCivil.nullable(),
  atualizadoEm: z.coerce.date(),
});

export const procedimentoExtrajudicial = z.object({
  via: z.enum(['rtd', 'detran']),
  orgao: z.string(),
  clausulaDestaque: z.boolean(),
  notificadoEm: dataCivil.nullable(),
  consolidadoEm: dataCivil.nullable(),
  certidaoEm: dataCivil.nullable(),
  /** Último dia para o devedor pagar após a notificação (20 dias, art. 8º-B). */
  prazoNotificacao: dataCivil.nullable(),
  atualizadoEm: z.coerce.date(),
});

export const provaMora = z.object({
  meio: z.enum(['carta_ar', 'cartorio', 'protesto', 'eletronico']),
  enviadaEm: dataCivil,
  enderecoDoContrato: z.boolean(),
  comprovante: z.string(),
  atualizadoEm: z.coerce.date(),
});

export const verificacaoRj = z.object({
  id: z.number(),
  resultado: z.enum(['sem_registro', 'recuperacao_judicial', 'falencia']),
  fonte: z.string(),
  detalhe: z.string().nullable(),
  liberadoPeloJuridico: z.boolean(),
  justificativa: z.string().nullable(),
  usuarioNome: z.string().nullable(),
  verificadoEm: z.coerce.date(),
});

export const juridicoCaso = z.object({
  status: z.string(),
  rito: z.enum(['judicial', 'extrajudicial', 'amigavel']).nullable(),
  credor: credor.omit({ mandatos: true }).nullable(),
  mandatoVigente: mandato.nullable(),
  /** Pelo tamanho do documento, como o banco decide: 14 posições é empresa. */
  devedorTipo: z.enum(['PF', 'PJ']).nullable(),
  processo: processoJudicial.nullable(),
  extrajudicial: procedimentoExtrajudicial.nullable(),
  mora: provaMora.nullable(),
  verificacoesRj: z.array(verificacaoRj),
  retomada: z
    .object({
      em: z.coerce.date(),
      modalidade: z.enum(['apreensao_judicial', 'apreensao_extrajudicial', 'entrega_voluntaria']),
      comprovante: z.string(),
      purgaAte: z.coerce.date().nullable(),
    })
    .nullable(),
});

export const acaoCaso = z.object({
  para: z.string(),
  rotulo: z.string(),
  /** O que falta para poder. Vazio: pode. */
  pendencias: z.array(z.string()),
});

registrar({
  Mandato: mandato,
  Credor: credor,
  ProcessoJudicial: processoJudicial,
  ProcedimentoExtrajudicial: procedimentoExtrajudicial,
  ProvaMora: provaMora,
  VerificacaoRj: verificacaoRj,
  JuridicoCaso: juridicoCaso,
  AcaoCaso: acaoCaso,
});
