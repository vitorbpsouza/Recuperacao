/**
 * Eventos ao vivo (SSE): cada sessão recebe só o que é do tenant e dos
 * canais dela — a fronteira entre os planos vale também no tempo real.
 */
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { EventoAoVivo } from '@workspace/domain';

import { varrerPrazos } from '../src/jobs/prazos.ts';
import { ambienteDeTeste, type Ambiente, type Sessao } from './apoio.ts';

let amb: Ambiente;
let base: string;
let opA: Sessao;
let opB: Sessao;
let admin: Sessao;

beforeAll(async () => {
  amb = await ambienteDeTeste();
  await amb.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(amb.app.server.address() as AddressInfo).port}`;
  [opA, opB, admin] = await Promise.all([amb.entrar('opa@teste.local'), amb.entrar('opb@teste.local'), amb.entrar('admin@teste.local')]);
});
afterAll(() => amb.fechar());

/** Abre o stream e junta os eventos `caso` que chegarem. */
const ouvir = async (s: Sessao) => {
  const controle = new AbortController();
  const r = await fetch(`${base}/api/eventos`, { headers: { cookie: `sessao=${s.cookie}` }, signal: controle.signal });
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toMatch(/^text\/event-stream/);
  const eventos: EventoAoVivo[] = [];
  const leitor = r.body!.pipeThrough(new TextDecoderStream()).getReader();
  let resto = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) return;
        resto += value;
        const blocos = resto.split('\n\n');
        resto = blocos.pop() ?? '';
        for (const bloco of blocos) {
          const dado = bloco.split('\n').find((l) => l.startsWith('data: '));
          if (bloco.includes('event: caso') && dado) eventos.push(JSON.parse(dado.slice(6)) as EventoAoVivo);
        }
      }
    } catch {
      // abortado pelo teste
    }
  })();
  return { eventos, fechar: () => controle.abort() };
};

const esperar = async (condicao: () => boolean) => {
  for (let i = 0; i < 100 && !condicao(); i++) await new Promise((r) => setTimeout(r, 20));
};

describe('GET /api/eventos', () => {
  it('exige sessão', async () => {
    expect((await fetch(`${base}/api/eventos`)).status).toBe(401);
  });

  it('o recall do Plano A chega ao Plano A e não ao Plano B', async () => {
    const [a, b, todos] = await Promise.all([ouvir(opA), ouvir(opB), ouvir(admin)]);
    try {
      const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-004/transicao', {
        para: 'Removido pelo Banco',
        motivo: 'credor informou pagamento integral',
      });
      expect(r.statusCode).toBe(200);
      const lead = await amb.chamar(opB, 'POST', '/api/casos/caso-b-001/status', { status: 'Proposta Enviada' });
      expect(lead.statusCode).toBe(200);

      await esperar(() => todos.eventos.length >= 2 && a.eventos.length >= 1 && b.eventos.length >= 1);

      expect(a.eventos.map((e) => [e.casoId, e.statusPara])).toEqual([['caso-a-004', 'Removido pelo Banco']]);
      expect(b.eventos.map((e) => [e.casoId, e.statusPara])).toEqual([['caso-b-001', 'Proposta Enviada']]);
      expect(todos.eventos.map((e) => e.casoId).sort()).toEqual(['caso-a-004', 'caso-b-001']);

      const recall = a.eventos[0]!;
      expect(recall).toMatchObject({ origem: 'plataforma_credor', tipo: 'status_alterado', statusDe: 'Pronto para Campo', automatico: false });
      expect(recall).not.toHaveProperty('tenantId');
    } finally {
      a.fechar();
      b.fechar();
      todos.fechar();
    }
  });

  it('a volta à fila por aceite vencido chega como evento automático', async () => {
    const a = await ouvir(opA);
    try {
      await amb.banco.bruta.exec(`update caso set prazo_vinculo = now() - interval '1 minute' where id = 'caso-a-002'`);
      expect((await varrerPrazos(amb.banco.bruta)).map((x) => x.acao)).toEqual(['aceite_vencido']);
      await esperar(() => a.eventos.length >= 1);
      expect(a.eventos[0]).toMatchObject({ casoId: 'caso-a-002', statusPara: 'Pronto para Campo', automatico: true, usuarioId: null });
    } finally {
      a.fechar();
    }
  });
});
