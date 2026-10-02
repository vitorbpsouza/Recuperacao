/**
 * Popula o banco com dados sintéticos para desenvolvimento.
 *
 *   npm run seed
 *
 * Tudo aqui é inventado: placas `SEED###`, documentos `000000000xx`, nomes
 * fictícios. Nenhum dado real de devedor entra no repositório — e se algum dia
 * entrar neste arquivo, ele vai para o git junto.
 *
 * Os bureaus cadastrados são os que têm caminho contratual legítimo (Serasa,
 * Boa Vista, B3/SNG para gravame). A chave de cada um vive em variável de
 * ambiente; o banco guarda só o nome da variável e a referência do contrato.
 *
 * Idempotente: `INSERT OR IGNORE` permite rodar várias vezes.
 */
import 'dotenv/config';

import { abrirBanco } from './db.js';

const db = abrirBanco();

const agora = new Date();
const diasAtras = (d: number) => new Date(agora.getTime() - d * 86400_000).toISOString();
const diasFrente = (d: number) => new Date(agora.getTime() + d * 86400_000).toISOString();

db.exec(`
  INSERT OR IGNORE INTO fonte_ativo (id, nome, tipo, ingestao, finalidade_permitida, termo_de_uso_url, credor_nome) VALUES
    ('fonte-plataforma', 'Plataforma de Bens (app do credor)', 'Plataforma', 'Manual', 'recuperacao_para_credor', 'https://exemplo.invalid/termos', NULL),
    ('fonte-inbound',    'Lead Inbound (site e WhatsApp)',     'Lead Próprio', 'Manual', 'aquisicao_com_quitacao', NULL, NULL);

  INSERT OR IGNORE INTO bureau (id, nome, tipo, contrato_fornecedor_id, env_var_chave, custo_consulta) VALUES
    ('bureau-serasa',  'Serasa Experian',          'Crédito',     'CTR-SERASA-0001',   'SERASA_API_KEY',      2.50),
    ('bureau-boavista','Boa Vista SCPC',           'Crédito',     'CTR-BOAVISTA-0001', 'BOAVISTA_API_KEY',    2.20),
    ('bureau-sng',     'B3 / SNG (Gravames)',      'Veicular',    'CTR-B3SNG-0001',    'B3_SNG_API_KEY',      5.00),
    ('bureau-local',   'Localização (contratada)', 'Localização', 'CTR-LOCAL-0001',    'LOCALIZACAO_API_KEY', 0.80);

  INSERT OR IGNORE INTO recuperador (id, nome, documento, telefone, cidades, status, score, taxa_recuperacao) VALUES
    ('rec-001', 'Carlos Pereira', '00000000001', '(31) 90000-0001', '["Belo Horizonte","Contagem","Betim"]', 'Ativo', 94, 82),
    ('rec-002', 'Joana Martins',  '00000000002', '(11) 90000-0002', '["São Paulo","Guarulhos"]',            'Ativo', 72, 65),
    ('rec-003', 'Rafael Santos',  '00000000003', '(21) 90000-0003', '["Rio de Janeiro","Niterói"]',         'Ativo', 88, 78),
    ('rec-004', 'Fernanda Dias',  '00000000004', '(27) 90000-0004', '["Vitória","Vila Velha","Serra"]',     'Ativo', 91, 80);

  INSERT OR IGNORE INTO ativo (id, placa, chassi, modelo, ano, cor, devedor_nome, devedor_doc, credor_nome, valor_divida, cidade, uf, data_recebimento) VALUES
    ('ativo-001', 'SEED001', 'SEEDCHASSI00000001', 'FIAT/ARGO DRIVE',      2021, 'BRANCA',   'Devedor Sintético Um',     '00000000011', 'Banco Alfa', 38500.00, 'Belo Horizonte', 'MG', '${diasAtras(12)}'),
    ('ativo-002', 'SEED002', 'SEEDCHASSI00000002', 'VW/T-CROSS 200 TSI',   2022, 'PRATA',    'Devedor Sintético Dois',   '00000000012', 'Banco Beta', 72300.00, 'São Paulo',      'SP', '${diasAtras(8)}'),
    ('ativo-003', 'SEED003', 'SEEDCHASSI00000003', 'HONDA/CG 160 START',   2020, 'VERMELHA', 'Devedor Sintético Três',   '00000000013', 'Banco Alfa',  9800.00, 'Rio de Janeiro', 'RJ', '${diasAtras(5)}'),
    ('ativo-004', 'SEED004', 'SEEDCHASSI00000004', 'HYUNDAI/HB20S VISION', 2023, 'CINZA',    'Devedor Sintético Quatro', '00000000014', 'Banco Gama', 61200.00, 'Vitória',        'ES', '${diasAtras(2)}'),
    ('ativo-005', 'SEED005', 'SEEDCHASSI00000005', 'TOYOTA/COROLLA XEI',   2019, 'PRETA',    'Devedor Sintético Cinco',  '00000000015', 'Banco Beta', 54900.00, 'Contagem',       'MG', '${diasAtras(20)}');

  -- Canal A: recuperação para o credor. Vinculados a recuperador, com prazo.
  INSERT OR IGNORE INTO caso (id, ativo_id, fonte_id, origem, finalidade, status, recuperador_id, prazo_vinculo, prazo_maximo) VALUES
    ('caso-a-001', 'ativo-001', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Em Campo',    'rec-001', '${diasFrente(2)}', '${diasFrente(10)}'),
    ('caso-a-002', 'ativo-002', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Distribuído', 'rec-002', '${diasFrente(1)}', '${diasFrente(8)}'),
    ('caso-a-003', 'ativo-003', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Recuperado',  'rec-003', '${diasAtras(1)}',  '${diasFrente(4)}');

  -- Canal A sem vínculo ainda: entrou e aguarda enriquecimento.
  INSERT OR IGNORE INTO caso (id, ativo_id, fonte_id, origem, finalidade, status) VALUES
    ('caso-a-004', 'ativo-005', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Em Enriquecimento');

  -- Canal B: aquisição. Evidência de lead é obrigatória; RENAJUD e gravame
  -- começam pendentes, então podeTransferir() ainda recusa este caso.
  INSERT OR IGNORE INTO caso (id, ativo_id, fonte_id, origem, finalidade, status,
                              canal_lead, evidencia_lead, saldo_devedor, anuencia_credor, renajud_ativo, gravame_baixado) VALUES
    ('caso-b-001', 'ativo-004', 'fonte-inbound', 'lead_proprio', 'aquisicao_com_quitacao', 'Em Contato',
     'Inbound Site', 'formulário #SEED-1042 recebido em ${diasAtras(3).slice(0, 10)}', 61200.00, 'Pendente', 0, 0);

  INSERT OR IGNORE INTO repasse (id, recuperador_id, caso_id, valor, data, status, tipo, observacao) VALUES
    ('rep-001', 'rec-003', 'caso-a-003', 2100.00, '${diasAtras(1)}', 'Pendente', 'Comissão', NULL),
    ('rep-002', 'rec-001', 'caso-a-001',  150.00, '${diasAtras(2)}', 'Pendente', 'Ajuda de Custo', 'Deslocamento para vistoria'),
    ('rep-003', 'rec-002', 'caso-a-002', 1850.00, '${diasAtras(6)}', 'Pago',     'Comissão', NULL);
`);

const contar = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

for (const t of ['fonte_ativo', 'bureau', 'recuperador', 'ativo', 'caso', 'repasse', 'usuario']) {
  console.log(`  ${t.padEnd(14)} ${contar(t)}`);
}
console.log('\nseed aplicado (dados sintéticos).');
if (contar('usuario') === 0) {
  console.log('nenhum usuário ainda — crie um com server/criar-usuario.ts para poder entrar.');
}
