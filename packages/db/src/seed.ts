import { sql } from 'drizzle-orm';

import type { Db } from './cliente.ts';
import { comoDono } from './contexto.ts';

/** Primeira empresa da plataforma. Criada pela migração 0004 — os dois têm que bater. */
export const TENANT_RECREDITA = { id: 'recredita', nome: 'ReCredita', sigla: 'RC' } as const;

/** Dados do seed, uma instrução por item. Separadas por ';' no fim da linha. */
const INSTRUCOES_SEED = `
      -- As fontes vêm da migração 0007 (dado de base).

      insert into bureau (id, nome, tipo, contrato_fornecedor_id, env_var_chave, custo_consulta) values
        ('bureau-serasa',   'Serasa Experian',          'Crédito',     'CTR-SERASA-0001',   'SERASA_API_KEY',      2.50),
        ('bureau-boavista', 'Boa Vista SCPC',           'Crédito',     'CTR-BOAVISTA-0001', 'BOAVISTA_API_KEY',    2.20),
        ('bureau-sng',      'B3 / SNG (Gravames)',      'Veicular',    'CTR-B3SNG-0001',    'B3_SNG_API_KEY',      5.00),
        ('bureau-local',    'Localização (contratada)', 'Localização', 'CTR-LOCAL-0001',    'LOCALIZACAO_API_KEY', 0.80)
      on conflict (id) do nothing;

      insert into recuperador (id, nome, documento, telefone, cidades, status, score, taxa_recuperacao) values
        ('rec-001', 'Carlos Pereira', '00000000001', '(31) 90000-0001', '{"Belo Horizonte","Contagem","Betim"}', 'Ativo', 94, 82),
        ('rec-002', 'Joana Martins',  '00000000002', '(11) 90000-0002', '{"São Paulo","Guarulhos"}',            'Ativo', 72, 65),
        ('rec-003', 'Rafael Santos',  '00000000003', '(21) 90000-0003', '{"Rio de Janeiro","Niterói"}',         'Ativo', 88, 78),
        ('rec-004', 'Fernanda Dias',  '00000000004', '(27) 90000-0004', '{"Vitória","Vila Velha","Serra"}',     'Ativo', 91, 80)
      on conflict (id) do nothing;

      insert into ativo (id, placa, chassi, modelo, ano, cor, devedor_nome, devedor_doc, credor_nome, valor_divida, cidade, uf, data_recebimento) values
        ('ativo-001', 'SEED001', 'SEEDCHASSI00000001', 'FIAT/ARGO DRIVE',      2021, 'BRANCA',   'Devedor Sintético Um',     '00000000011', 'Banco Alfa', 38500.00, 'Belo Horizonte', 'MG', now() - interval '12 days'),
        ('ativo-002', 'SEED002', 'SEEDCHASSI00000002', 'VW/T-CROSS 200 TSI',   2022, 'PRATA',    'Devedor Sintético Dois',   '00000000012', 'Banco Beta', 72300.00, 'São Paulo',      'SP', now() - interval '8 days'),
        ('ativo-003', 'SEED003', 'SEEDCHASSI00000003', 'HONDA/CG 160 START',   2020, 'VERMELHA', 'Devedor Sintético Três',   '00000000013', 'Banco Alfa',  9800.00, 'Rio de Janeiro', 'RJ', now() - interval '5 days'),
        ('ativo-004', 'SEED004', 'SEEDCHASSI00000004', 'HYUNDAI/HB20S VISION', 2023, 'CINZA',    'Devedor Sintético Quatro', '00000000014', 'Banco Gama', 61200.00, 'Vitória',        'ES', now() - interval '2 days'),
        ('ativo-005', 'SEED005', 'SEEDCHASSI00000005', 'TOYOTA/COROLLA XEI',   2019, 'PRETA',    'Devedor Sintético Cinco',  '00000000015', 'Banco Beta', 54900.00, 'Contagem',       'MG', now() - interval '20 days')
      on conflict (id) do nothing;

      -- Credores do Plano A, com mandato para a ReCredita agir em nome deles
      -- (exigido no rito extrajudicial e no amigável).
      insert into credor (id, nome) values
        ('cred-alfa', 'Banco Alfa S.A.'),
        ('cred-beta', 'Banco Beta S.A.'),
        ('cred-gama', 'Financeira Gama S.A.')
      on conflict (id) do nothing;

      insert into mandato (id, credor_id, inicio, fim, referencia) values
        ('mand-alfa', 'cred-alfa', current_date - 30, current_date + 335, 'Procuração sintética SEED-M1'),
        ('mand-beta', 'cred-beta', current_date - 30, current_date + 335, 'Procuração sintética SEED-M2')
      on conflict (id) do nothing;

      -- Plano A: recuperação para o credor. Vinculados a recuperador, com prazo.
      insert into caso (id, ativo_id, fonte_id, origem, finalidade, status, credor_id, rito, recuperador_id, prazo_vinculo, prazo_maximo) values
        ('caso-a-001', 'ativo-001', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Em Campo',    'cred-alfa', 'judicial',      'rec-001', now() + interval '2 days', now() + interval '10 days'),
        ('caso-a-002', 'ativo-002', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Distribuído', 'cred-beta', 'extrajudicial', 'rec-002', now() + interval '1 day',  now() + interval '8 days')
      on conflict (id) do nothing;

      -- Retomado há dois dias com mandado: o bem está no pátio e a purga ainda corre.
      insert into caso (id, ativo_id, fonte_id, origem, finalidade, status, credor_id, rito, recuperador_id, prazo_vinculo, prazo_maximo,
                        retomado_em, modalidade_retomada, comprovante_retomada, purga_ate) values
        ('caso-a-003', 'ativo-003', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Em Custódia', 'cred-alfa', 'judicial', 'rec-003',
         now() - interval '1 day', now() + interval '4 days',
         now() - interval '2 days', 'apreensao_judicial', 'Auto de busca e apreensão SEED-0003',
         ((((now() - interval '2 days') at time zone 'America/Sao_Paulo')::date + 6)::timestamp at time zone 'America/Sao_Paulo') - interval '1 millisecond')
      on conflict (id) do nothing;

      -- Habilitado (amigável, com mandato do credor) e aguardando distribuição.
      insert into caso (id, ativo_id, fonte_id, origem, finalidade, status, credor_id, rito) values
        ('caso-a-004', 'ativo-005', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Pronto para Campo', 'cred-beta', 'amigavel')
      on conflict (id) do nothing;

      -- Prova da mora (Tema 1.132) e registros do rito.
      insert into prova_mora (caso_id, meio, enviada_em, endereco_do_contrato, comprovante) values
        ('caso-a-001', 'carta_ar', current_date - 40, true, 'AR SEED-0001'),
        ('caso-a-002', 'carta_ar', current_date - 70, true, 'AR SEED-0002'),
        ('caso-a-003', 'carta_ar', current_date - 50, true, 'AR SEED-0003')
      on conflict do nothing;

      insert into processo_judicial (caso_id, numero_cnj, vara, comarca, uf, ajuizado_em, liminar, liminar_em, mandado_em) values
        ('caso-a-001', '0000001-16.2026.8.13.9999', '2ª Vara Cível (sintética)', 'Belo Horizonte', 'MG', current_date - 30, 'deferida', current_date - 15, current_date - 12),
        ('caso-a-003', '0000003-18.2026.8.19.9999', '5ª Vara Cível (sintética)', 'Rio de Janeiro', 'RJ', current_date - 25, 'deferida', current_date - 10, current_date - 8)
      on conflict do nothing;

      insert into procedimento_extrajudicial (caso_id, via, orgao, clausula_destaque, notificado_em, consolidado_em, certidao_em) values
        ('caso-a-002', 'rtd', '1º Registro de Títulos e Documentos de São Paulo (sintético)', true, current_date - 60, current_date - 35, current_date - 30)
      on conflict do nothing;

      -- Plano B: aquisição. Evidência de lead é obrigatória; RENAJUD e gravame
      -- começam pendentes, então podeTransferir() ainda recusa este caso.
      insert into caso (id, ativo_id, fonte_id, origem, finalidade, status,
                        canal_lead, evidencia_lead, saldo_devedor, anuencia_credor, renajud_ativo, gravame_baixado) values
        ('caso-b-001', 'ativo-004', 'fonte-inbound', 'lead_proprio', 'aquisicao_com_quitacao', 'Em Contato',
         'Inbound Site', 'formulário #SEED-1042 recebido em ' || to_char(now() - interval '3 days', 'YYYY-MM-DD'),
         61200.00, 'Pendente', false, false)
      on conflict (id) do nothing;

      insert into repasse (id, recuperador_id, caso_id, valor, data, status, tipo, observacao) values
        ('rep-001', 'rec-003', 'caso-a-003', 2100.00, now() - interval '1 day',  'Pendente', 'Comissão',       null),
        ('rep-002', 'rec-001', 'caso-a-001',  150.00, now() - interval '2 days', 'Pendente', 'Ajuda de Custo', 'Deslocamento para vistoria'),
        ('rep-003', 'rec-002', 'caso-a-002', 1850.00, now() - interval '6 days', 'Pago',     'Comissão',       null)
      on conflict (id) do nothing;
`
  .split(/;\s*$/m)
  .map((i) => i.trim())
  .filter((i) => i.length > 0);

/**
 * Popula o tenant ReCredita com dados sintéticos para desenvolvimento.
 *
 * Tudo aqui é inventado: placas `SEED###`, documentos `000000000xx`, nomes
 * fictícios. Nenhum dado real de devedor entra no repositório — e se algum dia
 * entrar neste arquivo, ele vai para o git junto.
 *
 * Os bureaus cadastrados são os que têm caminho contratual legítimo (Serasa,
 * Boa Vista, B3/SNG para gravame). A chave de cada um vive em variável de
 * ambiente; o banco guarda só o nome da variável e a referência do contrato.
 *
 * Idempotente: `on conflict do nothing` permite rodar várias vezes.
 */
export const semear = async (db: Db): Promise<void> => {
  // O tenant vem da migração 0004 (dado de base); aqui entra só o sintético.
  // Uma instrução por execute: o driver usa protocolo estendido (prepared
  // statement), que não aceita várias instruções numa chamada só.
  await comoDono(db, TENANT_RECREDITA.id, async (tx) => {
    for (const instrucao of INSTRUCOES_SEED) await tx.execute(sql.raw(instrucao));
  });
};
