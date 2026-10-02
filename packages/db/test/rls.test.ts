/**
 * Segregação imposta pelo banco: tenant e canal.
 *
 * Tudo aqui roda como a API roda — papel `recredita_app`, com o contexto da
 * sessão aplicado por `comContexto`. Se uma rota esquecer de filtrar, estas
 * políticas ainda impedem o vazamento.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Banco } from '../src/cliente.ts';
import type { Contexto } from '../src/contexto.ts';
import { bancoDeTeste, comoApp, linhas } from './apoio.ts';

let banco: Banco;

const canalA: Contexto = { tenantId: 't1', usuarioId: 'u_a', canais: ['plataforma_credor'] };
const canalB: Contexto = { tenantId: 't1', usuarioId: 'u_b', canais: ['lead_proprio'] };
const admin: Contexto = { tenantId: 't1', usuarioId: 'u_admin', canais: ['plataforma_credor', 'lead_proprio'] };
const outroTenant: Contexto = { tenantId: 't2', usuarioId: null, canais: ['plataforma_credor', 'lead_proprio'] };

const ids = async (ctx: Contexto, consulta: string) =>
  (await comoApp(banco, ctx, (tx) => linhas<{ id: string }>(tx, consulta))).map((l) => l.id).sort();

beforeAll(async () => {
  banco = await bancoDeTeste();
  await banco.bruta.exec(`
    insert into tenant (id, nome, sigla) values ('t1', 'Tenant Um', 'T1'), ('t2', 'Tenant Dois', 'T2');
    insert into usuario (id, tenant_id, email, nome, senha_hash, papel, canais) values
      ('u_a',     't1', 'a@t1.local',     'Operador A', 'x:y', 'operador', '{plataforma_credor}'),
      ('u_b',     't1', 'b@t1.local',     'Operador B', 'x:y', 'operador', '{lead_proprio}'),
      ('u_admin', 't1', 'admin@t1.local', 'Admin',      'x:y', 'admin',    '{}');
    insert into fonte_ativo (id, tenant_id, nome, tipo, ingestao, finalidade_permitida) values
      ('f_plat', 't1', 'Plataforma',  'Plataforma',   'Manual', 'recuperacao_para_credor'),
      ('f_lead', 't1', 'Inbound',     'Lead Próprio', 'Manual', 'aquisicao_com_quitacao'),
      ('f_t2',   't2', 'Plataforma2', 'Plataforma',   'Manual', 'recuperacao_para_credor');
    insert into ativo (id, tenant_id, placa, devedor_nome) values
      ('at_a', 't1', 'AAA0A00', 'Devedor do Plano A'),
      ('at_b', 't1', 'BBB0B00', 'Vendedor do Plano B'),
      ('at_t2', 't2', 'CCC0C00', 'Devedor do outro tenant');
    insert into recuperador (id, tenant_id, nome, status) values ('rec1', 't1', 'Recuperador', 'Ativo');
    insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status, recuperador_id) values
      ('caso_a', 't1', 'at_a', 'f_plat', 'plataforma_credor', 'recuperacao_para_credor', 'Em Campo', 'rec1');
    insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, evidencia_lead, anuencia_credor, renajud_ativo, gravame_baixado) values
      ('caso_b', 't1', 'at_b', 'f_lead', 'lead_proprio', 'aquisicao_com_quitacao', 'Em Contato', 'WhatsApp', 'msg #1', 'Pendente', false, false);
    insert into caso (id, tenant_id, ativo_id, fonte_id, origem, finalidade, status) values
      ('caso_t2', 't2', 'at_t2', 'f_t2', 'plataforma_credor', 'recuperacao_para_credor', 'Recebido');
    insert into repasse (id, tenant_id, recuperador_id, caso_id, valor, status, tipo) values
      ('rep1', 't1', 'rec1', 'caso_a', 100, 'Pendente', 'Comissão');
    insert into bureau (id, tenant_id, nome, tipo, contrato_fornecedor_id, env_var_chave) values
      ('b1', 't1', 'Bureau', 'Crédito', 'CTR-1', 'B1_KEY');
    insert into consulta_auditoria (id, tenant_id, caso_id, origem_caso, finalidade, bureau_id, contrato_fornecedor_id, base_legal, justificativa, operador_id, retencao_ate) values
      ('ca_a', 't1', 'caso_a', 'plataforma_credor', 'recuperacao_para_credor', 'b1', 'CTR-1', 'legitimo_interesse', 'localizar', 'u_a', now() + interval '180 days'),
      ('ca_b', 't1', 'caso_b', 'lead_proprio', 'aquisicao_com_quitacao', 'b1', 'CTR-1', 'execucao_contrato', 'due diligence', 'u_b', now() + interval '365 days');
  `);
});

afterAll(() => banco.bruta.fechar());

describe('canal', () => {
  it('operador do Plano A só enxerga o Plano A', async () => {
    expect(await ids(canalA, 'select id from caso')).toEqual(['caso_a']);
    expect(await ids(canalA, 'select id from ativo')).toEqual(['at_a']);
    expect(await ids(canalA, 'select id from fonte_ativo')).toEqual(['f_plat']);
    expect(await ids(canalA, 'select id from consulta_auditoria')).toEqual(['ca_a']);
    expect(await ids(canalA, 'select id from recuperador')).toEqual(['rec1']);
    expect(await ids(canalA, 'select id from repasse')).toEqual(['rep1']);
    expect(await ids(canalA, "select caso_id as id from caso_evento")).toEqual(['caso_a']);
  });

  it('operador do Plano B só enxerga o Plano B — nem rede de campo, nem repasse', async () => {
    expect(await ids(canalB, 'select id from caso')).toEqual(['caso_b']);
    expect(await ids(canalB, 'select id from ativo')).toEqual(['at_b']);
    expect(await ids(canalB, 'select id from fonte_ativo')).toEqual(['f_lead']);
    expect(await ids(canalB, 'select id from consulta_auditoria')).toEqual(['ca_b']);
    expect(await ids(canalB, 'select id from recuperador')).toEqual([]);
    expect(await ids(canalB, 'select id from repasse')).toEqual([]);
    expect(await ids(canalB, "select caso_id as id from caso_evento")).toEqual(['caso_b']);
  });

  it('o join com ativo não vaza o devedor do outro canal', async () => {
    const r = await comoApp(banco, canalB, (tx) =>
      linhas<{ devedor_nome: string }>(tx, 'select a.devedor_nome from caso c join ativo a on a.id = c.ativo_id'),
    );
    expect(r).toEqual([{ devedor_nome: 'Vendedor do Plano B' }]);
  });

  it('colisão só aparece para quem enxerga os dois canais', async () => {
    await banco.bruta.exec(`
      insert into ativo (id, tenant_id, placa) values ('at_b2', 't1', 'AAA0A00');
      insert into colisao_origem (id, tenant_id, placa, caso_plataforma_id, resolucao, justificativa, operador_id)
        values ('col1', 't1', 'AAA0A00', 'caso_a', 'lead_descartado', 'lead chegou depois da plataforma', 'u_admin');
    `);
    expect(await ids(canalA, 'select id from colisao_origem')).toEqual([]);
    expect(await ids(canalB, 'select id from colisao_origem')).toEqual([]);
    expect(await ids(admin, 'select id from colisao_origem')).toEqual(['col1']);
  });

  it('operador do Plano B não consegue criar caso do Plano A', async () => {
    await expect(
      comoApp(banco, canalB, (tx) =>
        linhas(
          tx,
          `insert into caso (id, ativo_id, fonte_id, origem, finalidade, status)
           values ('caso_intruso', 'at_b2', 'f_plat', 'plataforma_credor', 'recuperacao_para_credor', 'Recebido')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('tenant', () => {
  it('admin vê os dois canais do próprio tenant e nada do outro', async () => {
    expect(await ids(admin, 'select id from caso')).toEqual(['caso_a', 'caso_b']);
    expect(await ids(outroTenant, 'select id from caso')).toEqual(['caso_t2']);
    expect(await ids(outroTenant, 'select id from usuario')).toEqual([]);
  });

  it('sem contexto, o papel da aplicação não vê nada', async () => {
    const vazio: Contexto = { tenantId: '', usuarioId: null, canais: [] };
    expect(await ids(vazio, 'select id from caso')).toEqual([]);
    expect(await ids(vazio, 'select id from tenant')).toEqual([]);
  });

  it('o tenant do registro vem da sessão, não do corpo', async () => {
    await comoApp(banco, canalB, (tx) =>
      linhas(
        tx,
        `insert into ativo (id, placa, modelo) values ('at_novo', 'DDD0D00', 'Modelo')`,
      ),
    );
    const [linha] = await banco.bruta.query<{ tenant_id: string }>(
      `select tenant_id from ativo where id = 'at_novo'`,
    );
    expect(linha?.tenant_id).toBe('t1');
    await expect(
      comoApp(banco, canalB, (tx) =>
        linhas(tx, `insert into ativo (id, tenant_id, placa) values ('at_falso', 't2', 'EEE0E00')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('permissões do papel da aplicação', () => {
  it('não escreve linha do tempo à mão', async () => {
    await expect(
      comoApp(banco, admin, (tx) =>
        linhas(tx, `insert into caso_evento (tenant_id, caso_id, tipo) values ('t1', 'caso_a', 'criado')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('não altera nem apaga a trilha de auditoria', async () => {
    await expect(
      comoApp(banco, admin, (tx) => linhas(tx, `update consulta_auditoria set justificativa = 'x'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      comoApp(banco, admin, (tx) => linhas(tx, `delete from consulta_auditoria`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('não lê sessões diretamente', async () => {
    await expect(comoApp(banco, admin, (tx) => linhas(tx, `select * from sessao`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('mudança de status registra o usuário da sessão', async () => {
    await comoApp(banco, canalA, (tx) => linhas(tx, `update caso set status = 'Localizado' where id = 'caso_a'`));
    const [evento] = await banco.bruta.query<{ usuario_id: string; status_para: string }>(
      `select usuario_id, status_para from caso_evento where caso_id = 'caso_a' order by id desc limit 1`,
    );
    expect(evento).toEqual({ usuario_id: 'u_a', status_para: 'Localizado' });
  });

  it('consulta registrada pela API leva o operador da sessão, não o declarado', async () => {
    await comoApp(banco, canalA, (tx) =>
      linhas(
        tx,
        `insert into consulta_auditoria (id, caso_id, origem_caso, finalidade, bureau_id, contrato_fornecedor_id, base_legal, justificativa, operador_id, retencao_ate)
         values ('ca_spoof', 'caso_a', 'plataforma_credor', 'recuperacao_para_credor', 'b1', 'CTR-1', 'legitimo_interesse', 'teste', 'u_admin', now())`,
      ),
    );
    const [linha] = await banco.bruta.query<{ operador_id: string }>(
      `select operador_id from consulta_auditoria where id = 'ca_spoof'`,
    );
    expect(linha?.operador_id).toBe('u_a');
  });
});

describe('autenticação pelas funções auth_*', () => {
  it('abre, resolve e revoga sessão guardando só o hash', async () => {
    const vazio: Contexto = { tenantId: '', usuarioId: null, canais: [] };
    await comoApp(banco, vazio, async (tx) => {
      await linhas(tx, `select auth_abrir_sessao('u_a', 'hash-do-token', now() + interval '1 hour')`);
      const [s] = await linhas<{ id: string; tenant_id: string }>(
        tx,
        `select id, tenant_id from auth_resolver_sessao('hash-do-token')`,
      );
      expect(s).toEqual({ id: 'u_a', tenant_id: 't1' });
      await linhas(tx, `select auth_revogar_sessao('hash-do-token')`);
      expect(await linhas(tx, `select id from auth_resolver_sessao('hash-do-token')`)).toEqual([]);
    });
  });
});

describe('acesso a dado pessoal', () => {
  it('registra o usuário da sessão, é append-only e herda o canal do caso', async () => {
    await comoApp(banco, canalA, (tx) =>
      linhas(
        tx,
        `insert into acesso_dado_pessoal (caso_id, usuario_id, campos, finalidade)
         values ('caso_a', 'u_admin', '{devedor_nome,devedor_doc}', 'confirmar identidade antes da abordagem')`,
      ),
    );
    const [acesso] = await banco.bruta.query<{ usuario_id: string; tenant_id: string }>(
      `select usuario_id, tenant_id from acesso_dado_pessoal where caso_id = 'caso_a'`,
    );
    expect(acesso).toEqual({ usuario_id: 'u_a', tenant_id: 't1' });

    expect(await ids(canalB, 'select id from acesso_dado_pessoal')).toEqual([]);
    await expect(
      comoApp(banco, canalB, (tx) =>
        linhas(
          tx,
          `insert into acesso_dado_pessoal (caso_id, usuario_id, campos, finalidade)
           values ('caso_a', 'u_b', '{devedor_nome}', 'curiosidade')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(banco.bruta.exec(`delete from acesso_dado_pessoal`)).rejects.toThrow(/append-only/);
  });

  it('exige finalidade declarada', async () => {
    await expect(
      comoApp(banco, canalA, (tx) =>
        linhas(
          tx,
          `insert into acesso_dado_pessoal (caso_id, usuario_id, campos, finalidade)
           values ('caso_a', 'u_a', '{devedor_nome}', '  ')`,
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
