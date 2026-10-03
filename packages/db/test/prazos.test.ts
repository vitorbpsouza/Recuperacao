/**
 * Migração 0012: varredura de prazos, recall que revoga o link de campo e
 * NOTIFY de cada evento da linha do tempo. A varredura roda como a API a
 * chama (papel recredita_app); os ajustes de cenário rodam como dono.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

const executar = (sql: string, evento?: Record<string, unknown>) =>
  comoApp(banco, admin, async (tx) => {
    if (evento) await linhas(tx, `select set_config('app.evento', '${JSON.stringify(evento).replace(/'/g, "''")}', true)`);
    return linhas(tx, sql);
  });

const varrer = () => executar('select tenant_id, caso_id, acao from varrer_prazos()');

const caso = async (id: string) => (await executar(`select * from caso where id = '${id}'`))[0]!;

const ultimoEvento = async (id: string, tipo: string) =>
  (await executar(`select * from caso_evento where caso_id = '${id}' and tipo = '${tipo}' order by id desc limit 1`))[0];

describe('varredura de prazos', () => {
  it('sem prazo vencido, não faz nada', async () => {
    expect(await varrer()).toEqual([]);
  });

  it('aceite vencido devolve o caso à fila de distribuição, uma vez só', async () => {
    await banco.bruta.exec(`update caso set prazo_vinculo = now() - interval '1 hour' where id = 'caso-a-002'`);

    expect(await varrer()).toEqual([{ tenant_id: TENANT_RECREDITA.id, caso_id: 'caso-a-002', acao: 'aceite_vencido' }]);
    const k = await caso('caso-a-002');
    expect(k.status).toBe('Pronto para Campo');
    expect(k.recuperador_id).toBeNull();
    expect(k.prazo_vinculo).toBeNull();

    const evento = await ultimoEvento('caso-a-002', 'status_alterado');
    expect(evento?.status_de).toBe('Distribuído');
    expect(evento?.usuario_id).toBeNull();
    const dados = evento?.dados as { motivo: string; automatico: boolean };
    expect(dados.automatico).toBe(true);
    expect(dados.motivo).toMatch(/^Aceite vencido: .+ não aceitou até .+ voltou para a fila de distribuição/);

    expect(await varrer()).toEqual([]);
  });

  it('prazo máximo vencido vira aviso na linha do tempo, sem mudar o status', async () => {
    await banco.bruta.exec(`update caso set prazo_maximo = now() - interval '1 day' where id = 'caso-a-001'`);

    expect((await varrer()).map((a) => a.acao)).toEqual(['prazo_maximo_vencido']);
    expect((await caso('caso-a-001')).status).toBe('Em Campo');
    const aviso = await ultimoEvento('caso-a-001', 'prazo_vencido');
    expect(aviso?.dados).toMatchObject({ prazo: 'maximo', automatico: true });

    // Mesmo prazo não avisa de novo; prazo renovado e vencido de novo avisa.
    expect(await varrer()).toEqual([]);
    await banco.bruta.exec(`update caso set prazo_maximo = now() - interval '1 hour' where id = 'caso-a-001'`);
    expect((await varrer()).map((a) => a.acao)).toEqual(['prazo_maximo_vencido']);
  });

  it('purga encerrada avisa que o bem pode ir ao credor', async () => {
    // Cenário de uma retomada antiga: só o dono, com o trigger do ciclo desligado, reescreve a retomada.
    await banco.bruta.exec(`
      alter table caso disable trigger trg_caso_valida_ciclo;
      update caso set retomado_em = now() - interval '10 days', purga_ate = now() - interval '4 days' where id = 'caso-a-003';
      alter table caso enable trigger trg_caso_valida_ciclo;
    `);

    expect((await varrer()).map((a) => a.acao)).toEqual(['purga_encerrada']);
    expect((await ultimoEvento('caso-a-003', 'prazo_vencido'))?.dados).toMatchObject({ prazo: 'purga' });
    expect(await varrer()).toEqual([]);
  });

  it('20 dias da notificação extrajudicial sem consolidação viram aviso', async () => {
    await banco.bruta.exec(
      `update procedimento_extrajudicial set certidao_em = null, consolidado_em = null where caso_id = 'caso-a-002'`,
    );
    expect((await varrer()).map((a) => a.acao)).toEqual(['notificacao_extrajudicial_vencida']);
    expect((await ultimoEvento('caso-a-002', 'prazo_vencido'))?.dados).toMatchObject({ prazo: 'notificacao_extrajudicial' });
  });

  it('a aplicação só chama a varredura inteira, não os passos', async () => {
    await expect(
      executar(`select registrar_prazo_vencido(c, 'maximo', now(), 'forjado') from caso c limit 1`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('recall', () => {
  const TOKEN = 'a'.repeat(64);
  const resolver = () => executar(`select caso_id from link_campo_resolver('${TOKEN}')`);

  it('revoga o link de campo na hora e avisa ao vivo', async () => {
    await executar(`insert into link_campo (caso_id, token_hash, destinatario, expira_em)
                    values ('caso-a-001', '${TOKEN}', 'Recuperador terceiro', now() + interval '1 day')`);
    expect(await resolver()).toEqual([{ caso_id: 'caso-a-001' }]);

    const recebidos: Record<string, unknown>[] = [];
    const parar = await banco.bruta.ouvir('caso_evento', (p) => recebidos.push(JSON.parse(p) as Record<string, unknown>));
    try {
      await executar(`update caso set status = 'Removido pelo Banco' where id = 'caso-a-001'`, {
        motivo: 'credor informou pagamento integral',
      });
      for (let i = 0; i < 50 && !recebidos.some((e) => e.statusPara === 'Removido pelo Banco'); i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
    } finally {
      await parar();
    }

    expect(recebidos.find((e) => e.statusPara === 'Removido pelo Banco')).toMatchObject({
      tenantId: TENANT_RECREDITA.id,
      casoId: 'caso-a-001',
      origem: 'plataforma_credor',
      tipo: 'status_alterado',
      statusDe: 'Em Campo',
      automatico: false,
    });
    const [link] = await executar(`select revogado_em from link_campo where token_hash = '${TOKEN}'`);
    expect(link?.revogado_em).not.toBeNull();
    expect(await resolver()).toEqual([]);
  });

  it('o payload ao vivo não leva dado pessoal', async () => {
    const recebidos: string[] = [];
    const parar = await banco.bruta.ouvir('caso_evento', (p) => recebidos.push(p));
    try {
      await executar(`update caso set status = 'Em Análise' where id = 'caso-a-004'`);
      for (let i = 0; i < 50 && recebidos.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    } finally {
      await parar();
    }
    expect(Object.keys(JSON.parse(recebidos[0]!) as object).sort()).toEqual(
      ['automatico', 'casoId', 'id', 'ocorridoEm', 'origem', 'placa', 'prazo', 'statusDe', 'statusPara', 'tenantId', 'tipo', 'usuarioId'],
    );
  });
});
