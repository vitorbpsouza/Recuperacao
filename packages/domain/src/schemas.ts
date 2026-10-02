/**
 * Schemas de entrada compartilhados entre a API e os formulários.
 *
 * O mesmo schema valida a tela e a requisição: o que a tela aceita a API
 * aceita, e vice-versa. As regras de fronteira continuam no banco; aqui fica o
 * formato.
 *
 * Os objetos são `strict`: campo desconhecido é recusado em vez de descartado.
 * Um caso do Plano A enviado com campos do Plano B é sinal de tela errada —
 * ignorar esses campos esconderia o erro.
 */
import { z } from 'zod';

import { chassiValido, cnpjValido, cpfValido, numeroCnjValido, placaValida } from './documentos.ts';
import { MODALIDADES_RETOMADA, RITOS } from './fluxos.ts';

export const origemCaso = z.enum(['plataforma_credor', 'lead_proprio']);
export const finalidadePermitida = z.enum(['recuperacao_para_credor', 'aquisicao_com_quitacao']);
export const papelUsuario = z.enum(['admin', 'operador', 'auditor']);

const texto = z.string().trim().min(1);

export const loginEntrada = z
  .object({
    email: z.string().trim().min(1),
    senha: z.string().min(1),
  })
  .strict();

export const novoUsuarioEntrada = z
  .object({
    email: z.string().trim().email(),
    nome: texto,
    senha: z.string(),
    papel: papelUsuario,
    canais: z.array(origemCaso).default([]),
  })
  .strict();

const casoBase = {
  id: texto.optional(),
  ativoId: texto,
  fonteId: texto,
  status: texto,
};

export const novoCasoEntrada = z.discriminatedUnion('origem', [
  z
    .object({
      origem: z.literal('plataforma_credor'),
      ...casoBase,
      recuperadorId: texto.optional(),
      prazoVinculo: z.coerce.date().optional(),
      prazoMaximo: z.coerce.date().optional(),
    })
    .strict(),
  z
    .object({
      origem: z.literal('lead_proprio'),
      ...casoBase,
      canalLead: z.enum(['Inbound Site', 'WhatsApp', 'Indicação', 'Parceria', 'Anúncio']),
      evidenciaLead: texto,
      saldoDevedor: z.number().nonnegative().optional(),
      valorQuitacaoNegociado: z.number().nonnegative().optional(),
      valorPagoAoDevedor: z.number().nonnegative().optional(),
      anuenciaCredor: z.enum(['Pendente', 'Obtida', 'Negada']).default('Pendente'),
      renajudAtivo: z.boolean(),
      gravameBaixado: z.boolean(),
    })
    .strict(),
]);

export const mudarStatusEntrada = z.object({ status: texto }).strict();

export const novaColisaoEntrada = z
  .object({
    placa: texto,
    casoPlataformaId: texto,
    leadProprioRef: texto.optional(),
    resolucao: z.enum(['lead_descartado', 'prosseguiu_com_origem_independente']),
    justificativa: texto,
    evidenciaIndependente: texto.optional(),
  })
  .strict();

export const novoAtivoEntrada = z
  .object({
    id: texto.optional(),
    placa: texto,
    chassi: texto.optional(),
    modelo: texto.optional(),
    ano: z.number().int().min(1900).max(2100).optional(),
    cor: texto.optional(),
    devedorNome: texto.optional(),
    devedorDoc: texto.optional(),
    credorNome: texto.optional(),
    valorDivida: z.number().nonnegative().optional(),
    cidade: texto.optional(),
    uf: z.string().regex(/^[A-Z]{2}$/).optional(),
    dataRecebimento: z.coerce.date().optional(),
  })
  .strict();

export const novoRecuperadorEntrada = z
  .object({
    id: texto.optional(),
    nome: texto,
    documento: texto.optional(),
    telefone: texto.optional(),
    cidades: z.array(texto).default([]),
    status: z.enum(['Ativo', 'Inativo', 'Suspenso']).default('Ativo'),
    score: z.number().min(0).max(100).default(0),
    taxaRecuperacao: z.number().min(0).max(100).default(0),
  })
  .strict();

export const baseLegal = z.enum([
  'execucao_contrato',
  'legitimo_interesse',
  'obrigacao_legal',
  'consentimento',
]);

export const novaConsultaEntrada = z
  .object({
    casoId: texto,
    bureauId: texto,
    baseLegal,
    justificativa: texto,
    camposRetornados: z.array(texto).default([]),
  })
  .strict();

/** Placa como o banco guarda: maiúscula e sem espaço nem hífen. */
export const normalizarPlaca = (placa: string): string => placa.toUpperCase().replace(/[\s-]/g, '');

export const distribuirEntrada = z
  .object({
    recuperadorId: texto,
    /** Horas para o recuperador aceitar antes de o caso voltar para a fila. */
    horasParaAceite: z.number().int().min(1).max(168).default(24),
    /** Dias até o prazo máximo de retomada. */
    diasDePrazo: z.number().int().min(1).max(180).default(10),
  })
  .strict();

export const revelarDevedorEntrada = z
  .object({
    /** Por que o dado pessoal precisa ser visto agora. Fica na trilha de acesso. */
    finalidade: z.string().trim().min(10, 'descreva a finalidade em ao menos 10 caracteres'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Plano A — credor, rito e prova
// ---------------------------------------------------------------------------

/** Data do calendário, sem hora. */
export const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato AAAA-MM-DD');
const motivo = z.string().trim().min(10, 'descreva o motivo em ao menos 10 caracteres');

export const novoCredorEntrada = z
  .object({
    nome: texto,
    cnpj: z.string().trim().refine(cnpjValido, 'CNPJ inválido: confira os dígitos').optional(),
  })
  .strict();

/** Mandato do credor para a ReCredita localizar e retomar em nome dele (DL 911/69, art. 8º-C). */
export const novoMandatoEntrada = z
  .object({
    inicio: dataCivil,
    fim: dataCivil,
    /** Número, cartório ou arquivo do instrumento — o que permite achá-lo numa auditoria. */
    referencia: z.string().trim().min(3, 'informe como achar o instrumento (número, cartório ou arquivo)'),
  })
  .strict()
  .refine((m) => m.fim >= m.inicio, { message: 'o fim vem antes do início', path: ['fim'] });

export const definirRitoEntrada = z
  .object({
    rito: z.enum(RITOS),
    credorId: texto,
  })
  .strict();

export const processoJudicialEntrada = z
  .object({
    numeroCnj: z.string().trim().refine(numeroCnjValido, 'número CNJ inválido: confira o dígito verificador'),
    vara: texto.optional(),
    comarca: texto,
    uf: z.string().regex(/^[A-Z]{2}$/, 'UF com duas letras maiúsculas'),
    ajuizadoEm: dataCivil.optional(),
    liminar: z.enum(['pendente', 'deferida', 'indeferida', 'revogada']),
    liminarEm: dataCivil.optional(),
    /** Mandado de busca e apreensão expedido: só com liminar deferida. */
    mandadoEm: dataCivil.optional(),
  })
  .strict()
  .refine((p) => p.liminar === 'pendente' || p.liminarEm, {
    message: 'informe a data da decisão sobre a liminar',
    path: ['liminarEm'],
  })
  .refine((p) => !p.mandadoEm || p.liminar === 'deferida', {
    message: 'mandado só existe com liminar deferida',
    path: ['mandadoEm'],
  });

export const procedimentoExtrajudicialEntrada = z
  .object({
    via: z.enum(['rtd', 'detran']),
    /** Cartório de registro de títulos e documentos ou Detran da UF. */
    orgao: texto,
    /** A cláusula em destaque que permite a via extrajudicial foi conferida no contrato. */
    clausulaDestaque: z.boolean(),
    notificadoEm: dataCivil.optional(),
    consolidadoEm: dataCivil.optional(),
    /** Certidão de busca e apreensão e restrição no Renavam. */
    certidaoEm: dataCivil.optional(),
  })
  .strict();

/** Prova da mora. Basta o envio ao endereço do contrato (STJ, Tema 1.132). */
export const provaMoraEntrada = z
  .object({
    meio: z.enum(['carta_ar', 'cartorio', 'protesto', 'eletronico']),
    enviadaEm: dataCivil,
    enderecoDoContrato: z.boolean(),
    /** Código de rastreio, protocolo do cartório ou número do protesto. */
    comprovante: z.string().trim().min(3, 'informe o código de rastreio, o protocolo ou o número do protesto'),
  })
  .strict();

/** Devedor pessoa jurídica: recuperação judicial ou falência mudam o que se pode fazer com o bem. */
export const verificacaoRjEntrada = z
  .object({
    resultado: z.enum(['sem_registro', 'recuperacao_judicial', 'falencia']),
    /** Onde se consultou: tribunal, provedor, certidão. */
    fonte: z.string().trim().min(3, 'informe onde a consulta foi feita'),
    detalhe: texto.optional(),
    /** Em RJ, o jurídico pode liberar: bem não essencial, fora do stay period ou com autorização do juízo. */
    liberadoPeloJuridico: z.boolean().default(false),
    justificativa: texto.optional(),
  })
  .strict()
  .refine((v) => !(v.resultado === 'falencia' && v.liberadoPeloJuridico), {
    message: 'na falência o bem não se retoma: o caminho é o pedido de restituição',
    path: ['liberadoPeloJuridico'],
  })
  .refine((v) => !v.liberadoPeloJuridico || (v.justificativa?.length ?? 0) >= 10, {
    message: 'a liberação exige justificativa do jurídico (ao menos 10 caracteres)',
    path: ['justificativa'],
  });

/**
 * Mudança de status do Plano A. "Distribuído" não entra: tem rota própria,
 * que escolhe o recuperador. Cada destino leva o que a linha do tempo precisa
 * registrar.
 */
export const transicaoEntrada = z.discriminatedUnion('para', [
  z
    .object({
      para: z.literal('Retomado'),
      em: z.coerce.date(),
      modalidade: z.enum(MODALIDADES_RETOMADA),
      /** Auto de busca e apreensão, certidão do cartório ou termo de entrega voluntária. */
      comprovante: z.string().trim().min(3, 'informe o auto, a certidão ou o termo da retomada'),
      /**
       * Na apreensão extrajudicial, quem registra declara que não houve
       * violência, ingresso em domicílio nem exposição do devedor (STF, ADIs
       * 7600, 7601 e 7608).
       */
      condutaConforme: z.boolean().optional(),
    })
    .strict(),
  z.object({ para: z.literal('Em Custódia'), local: z.string().trim().min(3, 'informe o pátio') }).strict(),
  z
    .object({
      para: z.enum(['Suspenso', 'Curado', 'Removido pelo Banco', 'Não Localizado', 'Encerrado']),
      motivo,
    })
    .strict(),
  z
    .object({
      para: z.enum([
        'Em Enriquecimento',
        'Enriquecido',
        'Em Análise',
        'Pronto para Campo',
        'Aceito',
        'Em Campo',
        'Localizado',
        'Entregue ao Credor',
      ]),
    })
    .strict(),
]);

/** Resistência na abordagem: aborta a retomada (STF: sem violência, sem ingresso em domicílio). */
export const resistenciaEntrada = z
  .object({
    relato: z.string().trim().min(10, 'descreva o que aconteceu em ao menos 10 caracteres'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Cadastro de caso com o bem
// ---------------------------------------------------------------------------

/** O veículo e a dívida, como chegam do credor ou do lead. */
export const bemEntrada = z
  .object({
    placa: z.string().trim().refine(placaValida, 'placa inválida: use ABC1234 ou ABC1D23'),
    chassi: z.string().trim().refine(chassiValido, 'chassi inválido: 17 caracteres, sem I, O nem Q').optional(),
    modelo: texto,
    ano: z.number().int().min(1950).max(2100).optional(),
    cor: texto.optional(),
    cidade: texto.optional(),
    uf: z.string().regex(/^[A-Z]{2}$/, 'UF com duas letras maiúsculas').optional(),
    devedorNome: texto.optional(),
    devedorDoc: z
      .string()
      .trim()
      .refine((d) => cpfValido(d) || cnpjValido(d), 'CPF ou CNPJ inválido: confira os dígitos')
      .optional(),
    valorDivida: z.number().nonnegative().optional(),
  })
  .strict();

/**
 * Bem e caso numa entrada só. O caso do Plano A nasce "Recebido", com o
 * credor; o do Plano B nasce "Lead Recebido", com a evidência de origem.
 */
export const cadastroCasoEntrada = z.discriminatedUnion('origem', [
  z
    .object({
      origem: z.literal('plataforma_credor'),
      fonteId: texto,
      credorId: texto,
      bem: bemEntrada,
    })
    .strict(),
  z
    .object({
      origem: z.literal('lead_proprio'),
      fonteId: texto,
      credorId: texto.optional(),
      bem: bemEntrada,
      canalLead: z.enum(['Inbound Site', 'WhatsApp', 'Indicação', 'Parceria', 'Anúncio']),
      /** Como se prova que o lead não veio do dado de uma plataforma de credor. */
      evidenciaLead: z.string().trim().min(10, 'descreva a evidência de origem em ao menos 10 caracteres'),
      saldoDevedor: z.number().nonnegative().optional(),
    })
    .strict(),
]);
