/**
 * Ciclo do caso do Plano A imposto pelo banco: transições, guardas jurídicas
 * e registro na linha do tempo. Roda como a API roda (papel recredita_app).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TRANSICOES_RECUPERACAO } from '@workspace/domain';

import type { Banco } from '../src/cliente.ts';
import type { Contexto } from '../src/contexto.ts';
import { semear, TENANT_RECREDITA } from '../src/seed.ts';
import { bancoDeTeste, comoApp, linhas } from './apoio.ts';

let banco: Banco;
const admin: Contexto = { tenantId: TENANT_RECREDITA.id, usuarioId: null, canais: ['plataforma_credor', 'lead_proprio'] };

beforeAll(async () => {
  banco = await bancoDeTeste();
  await semear(banco.db);
});
afterAll(() => banco.bruta.fechar());

/** Executa SQL como a aplicação, com app.evento definido quando houver. */
const executar = (sql: string, evento?: Record<string, unknown>) =>
  comoApp(banco, admin, async (tx) => {
    if (evento) await linhas(tx, `select set_config('app.evento', '${JSON.stringify(evento).replace(/'/g, "''")}', true)`);
    return linhas(tx, sql);
  });

const status = async (id: string) =>
  (await executar(`select status from caso where id = '${id}'`))[0]?.status as string;

describe('matriz de transições', () => {
  it('o banco permite exatamente as transições do domínio', async () => {
    const doBanco = await executar('select de, para from transicao_recuperacao order by de, para');
    const doDominio = Object.entries(TRANSICOES_RECUPERACAO)
      .flatMap(([de, paras]) => paras.map((para) => ({ de, para })))
      .sort((a, b) => (a.de + a.para).localeCompare(b.de + b.para));
    const chave = (t: Record<string, unknown>) => `${String(t.de)}→${String(t.para)}`;
    expect(doBanco.map(chave).sort()).toEqual(doDominio.map(chave).sort());
  });

  it('recusa pular etapas', async () => {
    await expect(executar(`update caso set status = 'Entregue ao Credor' where id = 'caso-a-001'`)).rejects.toThrow(
      /transição de "Em Campo" para "Entregue ao Credor" não é permitida/,
    );
  });

  it('caso novo do Plano A entra como Recebido', async () => {
    await expect(
      executar(`insert into caso (id, ativo_id, fonte_id, origem, finalidade, status)
                values ('caso-x', 'ativo-001', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Em Campo')`),
    ).rejects.toThrow(/entra como "Recebido"/);
  });
});

describe('guardas', () => {
  it('encerramento exige motivo, e o motivo vai para a linha do tempo', async () => {
    await expect(executar(`update caso set status = 'Suspenso' where id = 'caso-a-002'`)).rejects.toThrow(/informe o motivo/);
    await executar(`update caso set status = 'Suspenso' where id = 'caso-a-002'`, { motivo: 'credor pediu para aguardar acordo' });
    const [evento] = await executar(
      `select dados from caso_evento where caso_id = 'caso-a-002' and status_para = 'Suspenso' order by id desc limit 1`,
    );
    expect((evento?.dados as { motivo: string }).motivo).toBe('credor pediu para aguardar acordo');
  });

  it('retomada judicial exige mandado, e recall encerra o caso para sempre', async () => {
    // caso-a-001 tem liminar e mandado: falta só registrar a retomada com os dados.
    await expect(executar(`update caso set status = 'Retomado' where id = 'caso-a-001'`)).rejects.toThrow(
      /informe quando e como/,
    );
    await executar(`update processo_judicial set mandado_em = null where caso_id = 'caso-a-001'`);
    await expect(
      executar(`update caso set status = 'Retomado', retomado_em = now(), modalidade_retomada = 'apreensao_judicial',
                comprovante_retomada = 'Auto 1', purga_ate = now() + interval '6 days' where id = 'caso-a-001'`),
    ).rejects.toThrow(/mandado de busca e apreensão ainda não expedido/);

    await executar(`update caso set status = 'Removido pelo Banco' where id = 'caso-a-001'`, {
      motivo: 'credor informou pagamento integral',
    });
    await expect(executar(`update caso set status = 'Em Campo' where id = 'caso-a-001'`)).rejects.toThrow(
      /não é permitida/,
    );
  });

  it('não entrega ao credor antes de vencer a purga da mora', async () => {
    expect(await status('caso-a-003')).toBe('Em Custódia');
    await expect(executar(`update caso set status = 'Entregue ao Credor' where id = 'caso-a-003'`)).rejects.toThrow(
      /ainda pode purgar a mora até/,
    );
  });

  it('habilitar para campo exige mandato no rito amigável', async () => {
    await executar(`insert into ativo (id, placa, devedor_doc) values ('ativo-y', 'TESTE0Y', '52998224725')`);
    await executar(`insert into caso (id, ativo_id, fonte_id, origem, finalidade, status)
                    values ('caso-y', 'ativo-y', 'fonte-plataforma', 'plataforma_credor', 'recuperacao_para_credor', 'Recebido')`);
    await executar(`update caso set status = 'Em Análise', rito = 'amigavel', credor_id = 'cred-gama' where id = 'caso-y'`);
    await expect(executar(`update caso set status = 'Pronto para Campo' where id = 'caso-y'`)).rejects.toThrow(
      /sem mandato vigente/,
    );
    await executar(`update caso set credor_id = 'cred-beta' where id = 'caso-y'`);
    await executar(`update caso set status = 'Pronto para Campo' where id = 'caso-y'`);
    expect(await status('caso-y')).toBe('Pronto para Campo');
    // Depois de habilitado, rito e credor não mudam mais.
    await expect(executar(`update caso set rito = 'judicial' where id = 'caso-y'`)).rejects.toThrow(/só mudam com o caso em preparo/);
  });

  it('valida o número CNJ e a consolidação só depois dos 20 dias', async () => {
    expect((await executar(`select cnj_valido('0000001-16.2026.8.13.9999') as ok`))[0]?.ok).toBe(true);
    expect((await executar(`select cnj_valido('0000001-17.2026.8.13.9999') as ok`))[0]?.ok).toBe(false);
    await expect(
      executar(`update procedimento_extrajudicial set consolidado_em = notificado_em + 10 where caso_id = 'caso-a-002'`),
    ).rejects.toThrow(/check/);
  });

  it('verificação de RJ é append-only', async () => {
    await executar(`insert into verificacao_rj (caso_id, resultado, fonte) values ('caso-a-002', 'sem_registro', 'TJSP')`);
    await expect(executar(`update verificacao_rj set resultado = 'falencia'`)).rejects.toThrow();
  });
});
