/**
 * Verificação da fronteira de finalidade, agora em Postgres.
 *
 * Prova que as garantias centrais são impostas pelo banco, não por convenção:
 * um caso de plataforma não pode virar aquisição, e a trilha de auditoria não
 * pode ser reescrita. Porta os casos do teste original em SQLite e acrescenta
 * os que o porte trouxe. Dados sintéticos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Banco } from '../src/cliente.ts';
import { bancoDeTeste } from './apoio.ts';

let banco: Banco;
const exec = (sql: string) => banco.bruta.exec(sql);

beforeAll(async () => {
  banco = await bancoDeTeste();
  await exec(`
    insert into tenant (id, nome, sigla) values ('t1', 'Tenant Teste', 'TT');
    insert into fonte_ativo (id, tenant_id, nome, tipo, ingestao, finalidade_permitida) values
      ('f_plat', 't1', 'Plataforma Teste', 'Plataforma',   'Manual', 'recuperacao_para_credor'),
      ('f_lead', 't1', 'Inbound Teste',    'Lead Próprio', 'Manual', 'aquisicao_com_quitacao');
    insert into ativo (id, tenant_id, placa, devedor_nome, devedor_doc) values
      ('at1',      't1', 'TEST001', 'Devedor Sintetico', '00000000000'),
      -- placa sem caso de plataforma: isola as constraints de campo do trigger
      -- de colisão, que senão recusaria antes e mascararia o teste.
      ('at2',      't1', 'TEST002', 'Outro Sintetico',   '00000000000'),
      -- a mesma placa de at1, cadastrada a partir do lead: ativo de um canal só.
      ('at1_lead', 't1', 'TEST001', null, null);
    insert into recuperador (id, tenant_id, nome, status) values ('rec1', 't1', 'Recuperador Teste', 'Ativo');
    -- operador_id tem FK para usuario: a trilha aponta para uma pessoa real.
    insert into usuario (id, tenant_id, email, nome, senha_hash, papel, canais)
      values ('op1', 't1', 'op1@teste.local', 'Operador Teste', 'x:y', 'admin', '{}');
    insert into bureau (id, tenant_id, nome, tipo, contrato_fornecedor_id, env_var_chave, custo_consulta)
      values ('b1', 't1', 'Bureau Teste', 'Crédito', 'CTR-001', 'BUREAU_TESTE_KEY', 2.5);
  `);
});

afterAll(() => banco.bruta.fechar());

describe('fronteira origem → finalidade', () => {
  it('aceita caso de plataforma com finalidade de recuperação', async () => {
    await exec(`
      insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status, recuperador_id, prazo_vinculo, prazo_maximo)
      values ('c_plat', 't1', 'at1', 'f_plat', 'plataforma_credor', 'recuperacao_para_credor', 'Recebido', 'rec1', '2026-02-01', '2026-03-01')
    `);
  });

  it('recusa caso de plataforma com finalidade de AQUISIÇÃO', async () => {
    await expect(
      exec(`
        insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, evidencia_lead, anuencia_credor, renajud_ativo, gravame_baixado)
        values ('c_x', 't1', 'at2', 'f_plat', 'plataforma_credor', 'aquisicao_com_quitacao', 'Lead Recebido', 'WhatsApp', 'ev', 'Pendente', false, false)
      `),
    ).rejects.toThrow(/fronteira_origem_finalidade/);
  });

  it('recusa caso híbrido: recuperação carregando campos de aquisição', async () => {
    await expect(
      exec(`
        insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status, anuencia_credor)
        values ('c_y', 't1', 'at2', 'f_plat', 'plataforma_credor', 'recuperacao_para_credor', 'Recebido', 'Obtida')
      `),
    ).rejects.toThrow(/campos_por_finalidade/);
  });

  it('recusa aquisição sem evidência de lead (NULL)', async () => {
    await expect(
      exec(`
        insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, anuencia_credor, renajud_ativo, gravame_baixado)
        values ('c_z', 't1', 'at2', 'f_lead', 'lead_proprio', 'aquisicao_com_quitacao', 'Lead Recebido', 'WhatsApp', 'Pendente', false, false)
      `),
    ).rejects.toThrow(/campos_por_finalidade/);
  });

  it('recusa status que não pertence ao ciclo de vida do canal', async () => {
    await expect(
      exec(`
        insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status)
        values ('c_s', 't1', 'at2', 'f_plat', 'plataforma_credor', 'recuperacao_para_credor', 'Quitado')
      `),
    ).rejects.toThrow(/status_do_canal/);
  });

  it('recusa trocar a origem de um caso existente', async () => {
    await expect(
      exec(`
        update caso set origem = 'lead_proprio', finalidade = 'aquisicao_com_quitacao', status = 'Lead Recebido',
          recuperador_id = null, prazo_vinculo = null, canal_lead = 'WhatsApp', evidencia_lead = 'ev',
          anuencia_credor = 'Pendente', renajud_ativo = false, gravame_baixado = false
        where id = 'c_plat'
      `),
    ).rejects.toThrow(/fronteira: origem, finalidade, ativo e tenant/);
  });

  it('recusa usar o mesmo registro de ativo nos dois canais', async () => {
    await expect(
      exec(`
        insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, evidencia_lead, anuencia_credor, renajud_ativo, gravame_baixado)
        values ('c_mesmo', 't1', 'at1', 'f_lead', 'lead_proprio', 'aquisicao_com_quitacao', 'Lead Recebido', 'Inbound Site', 'form #9', 'Pendente', false, false)
      `),
    ).rejects.toThrow(/este ativo ja pertence ao outro canal/);
  });
});

describe('colisão de origem', () => {
  it('recusa aquisição na mesma placa sem colisão registrada', async () => {
    await expect(
      exec(`
        insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, evidencia_lead, anuencia_credor, renajud_ativo, gravame_baixado)
        values ('c_aq', 't1', 'at1_lead', 'f_lead', 'lead_proprio', 'aquisicao_com_quitacao', 'Lead Recebido', 'Inbound Site', 'form #123', 'Pendente', true, false)
      `),
    ).rejects.toThrow(/colisao_origem: placa ja possui caso de plataforma/);
  });

  it('recusa colisão "prosseguiu" sem evidência independente', async () => {
    await expect(
      exec(`
        insert into colisao_origem (id, tenant_id, placa, caso_plataforma_id, resolucao, justificativa, operador_id)
        values ('col_x', 't1', 'TEST001', 'c_plat', 'prosseguiu_com_origem_independente', 'achei que podia', 'op1')
      `),
    ).rejects.toThrow(/evidencia_obrigatoria_para_prosseguir/);
  });

  it('recusa colisão apontando para caso que não é desta placa', async () => {
    await exec(`
      insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status)
      values ('c_plat2', 't1', 'at2', 'f_plat', 'plataforma_credor', 'recuperacao_para_credor', 'Recebido')
    `);
    await expect(
      exec(`
        insert into colisao_origem (id, tenant_id, placa, caso_plataforma_id, resolucao, justificativa, evidencia_independente, operador_id)
        values ('col_y', 't1', 'TEST001', 'c_plat2', 'prosseguiu_com_origem_independente', 'outra placa', 'form #1', 'op1')
      `),
    ).rejects.toThrow(/nao e um caso de plataforma desta placa/);
  });

  it('registra colisão com evidência independente', async () => {
    await exec(`
      insert into colisao_origem (id, tenant_id, placa, caso_plataforma_id, resolucao, justificativa, evidencia_independente, operador_id)
      values ('col1', 't1', 'TEST001', 'c_plat', 'prosseguiu_com_origem_independente',
              'devedor procurou pelo site antes do ativo entrar na plataforma',
              'form inbound #123 datado de 2026-01-05, anterior ao recebimento', 'op1')
    `);
  });

  it('libera a aquisição depois da colisão documentada', async () => {
    await exec(`
      insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, evidencia_lead, anuencia_credor, renajud_ativo, gravame_baixado)
      values ('c_aq', 't1', 'at1_lead', 'f_lead', 'lead_proprio', 'aquisicao_com_quitacao', 'Lead Recebido', 'Inbound Site', 'form #123', 'Pendente', true, false)
    `);
  });
});

describe('trilha de auditoria', () => {
  const consulta = (id: string, extra: { finalidade?: string; justificativa?: string; operador?: string } = {}) => `
    insert into consulta_auditoria (id, tenant_id, caso_id, origem_caso, finalidade, bureau_id, contrato_fornecedor_id,
                                    base_legal, justificativa, operador_id, retencao_ate)
    values ('${id}', 't1', 'c_plat', 'plataforma_credor', '${extra.finalidade ?? 'recuperacao_para_credor'}', 'b1', 'CTR-001',
            'legitimo_interesse', '${extra.justificativa ?? 'localização para recuperação do ativo'}', '${extra.operador ?? 'op1'}', '2027-01-01')
  `;

  it('registra consulta coerente com o caso', async () => {
    await exec(consulta('ca_ok'));
  });

  it('recusa consulta declarando finalidade divergente do caso', async () => {
    await expect(exec(consulta('ca_x', { finalidade: 'aquisicao_com_quitacao' }))).rejects.toThrow(
      /origem\/finalidade divergem do caso/,
    );
  });

  it('recusa consulta sem justificativa', async () => {
    await expect(exec(consulta('ca_y', { justificativa: '   ' }))).rejects.toThrow(/check constraint/);
  });

  it('recusa UPDATE na trilha de auditoria', async () => {
    await expect(exec(`update consulta_auditoria set justificativa = 'reescrito'`)).rejects.toThrow(
      /append-only: UPDATE proibido/,
    );
  });

  it('recusa DELETE na trilha de auditoria', async () => {
    await expect(exec(`delete from consulta_auditoria`)).rejects.toThrow(/append-only: DELETE proibido/);
  });

  it('recusa consulta atribuída a operador inexistente', async () => {
    await expect(exec(consulta('ca_z', { operador: 'fantasma' }))).rejects.toThrow(/foreign key/);
  });
});

describe('linha do tempo do caso', () => {
  it('registra a criação e cada mudança de status, e não aceita reescrita', async () => {
    await exec(`update caso set status = 'Em Enriquecimento' where id = 'c_plat'`);
    const eventos = await banco.bruta.query<{ tipo: string; status_de: string | null; status_para: string }>(
      `select tipo, status_de, status_para from caso_evento where caso_id = 'c_plat' order by id`,
    );
    expect(eventos).toEqual([
      { tipo: 'criado', status_de: null, status_para: 'Recebido' },
      { tipo: 'status_alterado', status_de: 'Recebido', status_para: 'Em Enriquecimento' },
    ]);
    await expect(exec(`delete from caso_evento`)).rejects.toThrow(/append-only: DELETE proibido/);
  });
});

describe('isolamento entre tenants nas chaves estrangeiras', () => {
  it('recusa caso apontando para ativo de outro tenant', async () => {
    await exec(`
      insert into tenant (id, nome, sigla) values ('t2', 'Outro Tenant', 'OT');
      insert into fonte_ativo (id, tenant_id, nome, tipo, ingestao, finalidade_permitida)
        values ('f_t2', 't2', 'Plataforma T2', 'Plataforma', 'Manual', 'recuperacao_para_credor');
      -- ativo de t1 ainda sem caso: o índice único não interfere no teste da FK.
      insert into ativo (id, tenant_id, placa) values ('at_livre', 't1', 'TEST009');
    `);
    await expect(
      exec(`
        insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status)
        values ('c_cruzado', 't2', 'at_livre', 'f_t2', 'plataforma_credor', 'recuperacao_para_credor', 'Recebido')
      `),
    ).rejects.toThrow(/foreign key/);
  });
});
