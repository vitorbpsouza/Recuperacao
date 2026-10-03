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
    renavam: z.string().nullable(),
    valorFipe: z.number().nullable(),
    fipeCodigo: z.string().nullable(),
    fipeReferencia: z.string().nullable(),
    marca: z.string().nullable(),
    situacao: z.string().nullable(),
    tipo: z.string().nullable(),
    especie: z.string().nullable(),
    categoria: z.string().nullable(),
    carroceria: z.string().nullable(),
    combustivel: z.string().nullable(),
    potencia: z.string().nullable(),
    cilindradas: z.string().nullable(),
    motor: z.string().nullable(),
    procedencia: z.string().nullable(),
    municipioEmplacamento: z.string().nullable(),
    ufEmplacamento: z.string().nullable(),
    anoFabricacao: z.number().int().nullable(),
  }),
  fonte: z.object({
    nome: z.string(),
    tipo: z.enum(['Plataforma', 'Credor Direto', 'Lead Próprio']),
    credorNome: z.string().nullable(),
  }),
});

export const eventoCaso = z.object({
  id: z.number().int(),
  tipo: z.enum([
    'criado',
    'status_alterado',
    'distribuido',
    'rito_definido',
    'registro_juridico',
    'verificacao_veicular',
    'avistamento',
    'relatorio_colado',
  ]),
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

// ---------------------------------------------------------------------------
// Dados do veículo
// ---------------------------------------------------------------------------

export const valorFipe = z.object({
  valor: z.number(),
  codigoFipe: z.string(),
  mesReferencia: z.string(),
  marca: z.string(),
  modelo: z.string(),
  anoModelo: z.number(),
});

export const verificacaoVeicular = z.object({
  id: z.number(),
  /** Sem fornecedor: veio de texto colado sem consulta registrada. */
  fornecedor: z.string().nullable(),
  baseLegal: z.string().nullable(),
  justificativa: z.string().nullable(),
  situacao: z.string().nullable(),
  restricoes: z.array(z.string()),
  renajud: z.boolean().nullable(),
  rouboFurto: z.boolean().nullable(),
  leilao: z.boolean().nullable(),
  alienacaoFiduciaria: z.boolean().nullable(),
  anoLicenciamento: z.number().nullable(),
  usuarioNome: z.string().nullable(),
  verificadoEm: z.coerce.date(),
});

export const avistamento = z.object({
  id: z.number(),
  observadoEm: z.coerce.date(),
  registradoEm: z.coerce.date(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  descricao: z.string(),
  fonte: z.enum(['equipe_campo', 'credor', 'devedor', 'outro', 'radar']),
  usuarioNome: z.string().nullable(),
});

registrar({ ValorFipe: valorFipe, VerificacaoVeicular: verificacaoVeicular, Avistamento: avistamento });

// ---------------------------------------------------------------------------
// Texto colado, pessoas e campos novos
// ---------------------------------------------------------------------------

const papelPessoa = z.enum(['devedor', 'proprietario', 'terceiro_possuidor', 'parente', 'avalista', 'outro']);

export const resumoImportacao = z.object({
  relatorioId: z.number().int(),
  veiculo: z.object({ campos: z.array(z.string()), restricoes: z.number().int() }).nullable(),
  pessoas: z.array(z.object({ id: z.string(), nome: z.string().nullable(), papeis: z.array(papelPessoa) })),
  contatos: z.number().int(),
  enderecos: z.number().int(),
  parentes: z.number().int(),
  radares: z.number().int(),
  extras: z.number().int(),
  novos: z.array(z.object({ secao: z.string(), rotulo: z.string() })),
  avisos: z.array(z.string()),
});

export const relatorioColado = z.object({
  id: z.number().int(),
  via: z.enum(['colado', 'integracao']),
  secoes: z.array(z.string()),
  resumo: z.record(z.string(), z.unknown()),
  fornecedor: z.string().nullable(),
  usuarioNome: z.string().nullable(),
  coladoEm: z.coerce.date(),
  tamanho: z.number().int(),
});

export const dadoExtra = z.object({
  id: z.number().int(),
  entidade: z.enum(['veiculo', 'pessoa', 'caso']),
  pessoaId: z.string().nullable(),
  secao: z.string(),
  chave: z.string(),
  rotulo: z.string(),
  valor: z.string(),
  sensivel: z.boolean(),
  novo: z.boolean(),
  promovidoEm: z.coerce.date().nullable(),
  criadoEm: z.coerce.date(),
});

export const pessoasDoCaso = z.object({
  /** O que muda a diligência: proprietário ≠ devedor, óbito. */
  alertas: z.array(z.string()),
  pessoas: z.array(
    z.object({
      id: z.string(),
      papel: papelPessoa,
      vinculo: z.string().nullable(),
      iniciais: z.string().nullable(),
      documentoMascarado: z.string().nullable(),
      tipoPessoa: z.enum(['PF', 'PJ']).nullable(),
      obito: z.boolean().nullable(),
      contatos: z.number().int(),
      enderecos: z.number().int(),
    }),
  ),
});

export const fonteContato = z.object({
  fonte: z.string(),
  data: z.string().optional(),
  ranking: z.number().optional(),
  titular: z.string().optional(),
});

export const contatoPessoa = z.object({
  id: z.number().int(),
  tipo: z.enum(['celular', 'fixo', 'email', 'invalido']),
  valor: z.string(),
  original: z.string().nullable(),
  valido: z.boolean(),
  whatsapp: z.boolean().nullable(),
  whatsappConferidoEm: z.coerce.date().nullable(),
  fontes: z.array(fonteContato),
});

export const enderecoPessoa = z.object({
  id: z.number().int(),
  logradouro: z.string(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  cep: z.string().nullable(),
  variantes: z.array(z.string()),
  fontes: z.array(z.string()),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export const pessoaRevelada = z.object({
  id: z.string(),
  papel: papelPessoa,
  vinculo: z.string().nullable(),
  parenteDe: z.string().nullable(),
  documento: z.string().nullable(),
  tipoPessoa: z.enum(['PF', 'PJ']).nullable(),
  nome: z.string().nullable(),
  nomeCivil: z.string().nullable(),
  nomeMae: z.string().nullable(),
  nomePai: z.string().nullable(),
  nascimento: z.string().nullable(),
  sexo: z.string().nullable(),
  estadoCivil: z.string().nullable(),
  rg: z.string().nullable(),
  rgOrgao: z.string().nullable(),
  rgUf: z.string().nullable(),
  tituloEleitor: z.string().nullable(),
  profissao: z.string().nullable(),
  nacionalidade: z.string().nullable(),
  situacaoCadastral: z.string().nullable(),
  obito: z.boolean().nullable(),
  atualizadoEm: z.coerce.date(),
  contatos: z.array(contatoPessoa),
  enderecos: z.array(enderecoPessoa),
  extras: z.array(dadoExtra),
});

export const pessoasReveladas = z.object({
  alertas: z.array(z.string()),
  /** Perfil, crédito e parentes vieram junto (admin e gestor). */
  sensivelLiberado: z.boolean(),
  pessoas: z.array(pessoaRevelada),
});

export const campoNovo = z.object({
  entidade: z.enum(['veiculo', 'pessoa', 'caso']),
  secao: z.string(),
  chave: z.string(),
  rotulo: z.string(),
  ocorrencias: z.number().int(),
  casos: z.number().int(),
  /** Último valor visto; nulo quando o campo é sensível. */
  exemplo: z.string().nullable(),
  primeiraVez: z.coerce.date(),
  ultimaVez: z.coerce.date(),
});

registrar({
  ResumoImportacao: resumoImportacao,
  RelatorioColado: relatorioColado,
  DadoExtra: dadoExtra,
  PessoasDoCaso: pessoasDoCaso,
  FonteContato: fonteContato,
  ContatoPessoa: contatoPessoa,
  EnderecoPessoa: enderecoPessoa,
  PessoaRevelada: pessoaRevelada,
  PessoasReveladas: pessoasReveladas,
  CampoNovo: campoNovo,
});

// ---------------------------------------------------------------------------
// Integrações e conversas
// ---------------------------------------------------------------------------

/** Conexão sem credencial: só o final dela, para reconhecer qual está em uso. */
export const integracao = z.object({
  id: z.string(),
  tipo: z.enum(['apibrasil', 'evolution']),
  nome: z.string(),
  baseUrl: z.string(),
  config: z.object({ instancia: z.string().optional(), servico: z.enum(['dados', 'consulta']).optional() }),
  bureauId: z.string().nullable(),
  bureauNome: z.string().nullable(),
  custoConsulta: z.number().nullable(),
  contrato: z.string().nullable(),
  ativo: z.boolean(),
  credenciaisFinal: z.string(),
  webhookConfigurado: z.boolean(),
  ultimoTesteEm: z.coerce.date().nullable(),
  ultimoTesteOk: z.boolean().nullable(),
  ultimoTesteDetalhe: z.string().nullable(),
  criadoEm: z.coerce.date(),
});

export const integracaoCriada = z.object({
  id: z.string(),
  /** Evolution: aparece uma vez só (o banco guarda o hash do token). */
  webhookUrl: z.string().nullable(),
});

export const testeIntegracao = z.object({ ok: z.boolean(), detalhe: z.string() });

export const webhookConfigurado = z.object({ url: z.string(), configuradoNaEvolution: z.boolean(), detalhe: z.string() });

export const conversa = z.object({
  numero: z.string(),
  nome: z.string().nullable(),
  recuperadorId: z.string().nullable(),
  recuperadorNome: z.string().nullable(),
  ultimaMensagem: z.string(),
  ultimaDirecao: z.enum(['enviada', 'recebida']),
  ultimaEm: z.coerce.date(),
  total: z.number().int(),
});

export const mensagem = z.object({
  id: z.number().int(),
  direcao: z.enum(['enviada', 'recebida']),
  texto: z.string(),
  casoId: z.string().nullable(),
  placa: z.string().nullable(),
  usuarioNome: z.string().nullable(),
  criadoEm: z.coerce.date(),
});

registrar({
  Integracao: integracao,
  IntegracaoCriada: integracaoCriada,
  TesteIntegracao: testeIntegracao,
  WebhookConfigurado: webhookConfigurado,
  Conversa: conversa,
  Mensagem: mensagem,
});

// ---------------------------------------------------------------------------
// Painel executivo (Plano A)
// ---------------------------------------------------------------------------

export const pontoMapa = z.object({
  casoId: z.string(),
  placa: z.string(),
  modelo: z.string().nullable(),
  status: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  observadoEm: z.coerce.date(),
  fonte: z.string(),
  descricao: z.string(),
});

export const ativoMaisVisto = z.object({
  casoId: z.string(),
  placa: z.string(),
  modelo: z.string().nullable(),
  status: z.string(),
  avistamentos: z.number().int(),
  locais: z.number().int(),
  ultimoEm: z.coerce.date(),
});

export const contagemCidade = z.object({
  cidade: z.string(),
  uf: z.string().nullable(),
  total: z.number().int(),
  retomados: z.number().int(),
  emCampo: z.number().int(),
});

export const contagemCredor = z.object({
  credor: z.string(),
  total: z.number().int(),
  retomados: z.number().int(),
  valorDivida: z.number().nullable(),
});

export const desempenhoRecuperador = z.object({
  id: z.string(),
  nome: z.string(),
  status: z.string(),
  cidades: z.array(z.string()),
  casos: z.number().int(),
  retomados: z.number().int(),
  emCampo: z.number().int(),
  semExito: z.number().int(),
});

export const alertaCaso = z.object({
  casoId: z.string(),
  placa: z.string(),
  modelo: z.string().nullable(),
  status: z.string(),
  tipo: z.enum(['prazo_vencido', 'prazo_48h', 'aceite_vencido', 'parado', 'proprietario_diferente']),
  motivo: z.string(),
  desde: z.coerce.date().nullable(),
});

export const pontoEvolucao = z.object({ mes: z.string(), recebidos: z.number().int(), retomados: z.number().int() });

export const painelRecuperacao = z.object({
  valorDivida: z.number().nullable(),
  fipeCarteira: z.number().nullable(),
  fipeRetomados: z.number().nullable(),
  status: z.array(z.object({ status: z.string(), quantidade: z.number().int() })),
  mapa: z.array(pontoMapa),
  maisVistos: z.array(ativoMaisVisto),
  porCidade: z.array(contagemCidade),
  porCredor: z.array(contagemCredor),
  recuperadores: z.array(desempenhoRecuperador),
  alertas: z.array(alertaCaso),
  evolucao: z.array(pontoEvolucao),
});

registrar({
  PontoMapa: pontoMapa,
  AtivoMaisVisto: ativoMaisVisto,
  ContagemCidade: contagemCidade,
  ContagemCredor: contagemCredor,
  DesempenhoRecuperador: desempenhoRecuperador,
  AlertaCaso: alertaCaso,
  PontoEvolucao: pontoEvolucao,
  PainelRecuperacao: painelRecuperacao,
});
