/**
 * Especificação de regressão da API.
 *
 * Cada comportamento da API anterior (Express + SQLite) vira um teste: mesmos
 * status HTTP e mesmas mensagens onde a regra é a mesma. Onde o comportamento
 * mudou de propósito, o teste diz por quê:
 *
 * - sessão em cookie httpOnly + token CSRF, em vez de token no corpo;
 * - caso de outro canal responde 404 (não revela que existe), não 403;
 * - ativos, rede de campo, repasses e colisões filtrados por canal — antes
 *   qualquer usuário autenticado listava tudo, inclusive devedores do outro canal;
 * - corpo com campo desconhecido é recusado (400), em vez de ignorado;
 * - status inválido na criação do caso é recusado (422); antes era aceito.
 */
import type { GoogleGenAI } from '@google/genai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { lerAmbiente } from '../src/ambiente.ts';
import { criarServidor } from '../src/servidor.ts';
import { ambienteDeTeste, SENHA, type Ambiente, type Sessao } from './apoio.ts';

let amb: Ambiente;
let admin: Sessao;
let opA: Sessao;
let opB: Sessao;
let auditor: Sessao;

beforeAll(async () => {
  amb = await ambienteDeTeste();
  admin = await amb.entrar('admin@teste.local');
  opA = await amb.entrar('opa@teste.local');
  opB = await amb.entrar('opb@teste.local');
  auditor = await amb.entrar('auditor@teste.local');
});

afterAll(() => amb.fechar());

describe('autenticação', () => {
  it('saúde responde sem sessão', async () => {
    const r = await amb.app.inject({ method: 'GET', url: '/api/saude' });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });

  it('login exige e-mail e senha', async () => {
    const r = await amb.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@y.z' } });
    expect(r.statusCode).toBe(400);
  });

  it('senha errada e usuário inexistente dão a mesma resposta', async () => {
    const errada = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'opa@teste.local', senha: 'senha-errada-aqui' },
    });
    const inexistente = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ninguem@teste.local', senha: SENHA },
    });
    expect(errada.statusCode).toBe(401);
    expect(inexistente.statusCode).toBe(401);
    expect(errada.json()).toEqual({ erro: 'credenciais inválidas' });
    expect(inexistente.json()).toEqual(errada.json());
  });

  it('login devolve o usuário com a marca do tenant e o token só no cookie httpOnly', async () => {
    const r = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'OPA@teste.local', senha: SENHA },
    });
    expect(r.statusCode).toBe(200);
    const cookie = r.cookies.find((c) => c.name === 'sessao');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    const corpo = r.json();
    expect(corpo.usuario).toMatchObject({
      email: 'opa@teste.local',
      papel: 'operador',
      canais: ['plataforma_credor'],
      canaisVisiveis: ['plataforma_credor'],
      tenant: { id: 'recredita', nome: 'ReCredita', sigla: 'RC' },
    });
    expect(typeof corpo.usuario.csrfToken).toBe('string');
    expect(JSON.stringify(corpo)).not.toContain(cookie!.value);
  });

  it('rota protegida sem sessão ou com sessão inválida responde 401', async () => {
    const sem = await amb.app.inject({ method: 'GET', url: '/api/auth/eu' });
    expect(sem.statusCode).toBe(401);
    expect(sem.json()).toEqual({ erro: 'autenticação obrigatória' });
    const invalida = await amb.app.inject({ method: 'GET', url: '/api/auth/eu', cookies: { sessao: 'falsa' } });
    expect(invalida.statusCode).toBe(401);
    expect(invalida.json()).toEqual({ erro: 'sessão inválida ou expirada' });
  });

  it('admin e auditor enxergam os dois canais', async () => {
    for (const s of [admin, auditor]) {
      const r = await amb.chamar(s, 'GET', '/api/auth/eu');
      expect(r.json().canaisVisiveis).toEqual(['plataforma_credor', 'lead_proprio']);
    }
  });

  it('alteração sem token CSRF é recusada', async () => {
    const r = await amb.app.inject({
      method: 'POST',
      url: '/api/ativos',
      cookies: { sessao: opA.cookie },
      payload: { placa: 'CSRF001' },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ erro: 'token CSRF ausente ou inválido' });
  });

  it('auditor é somente leitura', async () => {
    const r = await amb.chamar(auditor, 'POST', '/api/ativos', { placa: 'AUD0001' });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ erro: 'auditor tem acesso somente de leitura' });
  });

  it('logout revoga a sessão no servidor', async () => {
    const s = await amb.entrar('opb@teste.local');
    expect((await amb.chamar(s, 'POST', '/api/auth/logout')).statusCode).toBe(204);
    expect((await amb.chamar(s, 'GET', '/api/auth/eu')).statusCode).toBe(401);
  });
});

describe('usuários', () => {
  it('só admin cria conta', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/usuarios', {
      email: 'novo@teste.local',
      nome: 'Novo',
      senha: SENHA,
      papel: 'operador',
      canais: ['plataforma_credor'],
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ erro: 'requer papel: admin' });
  });

  it('admin cria operador; regras de cadastro respondem 409', async () => {
    const base = { nome: 'Fulano', papel: 'operador' as const, canais: ['lead_proprio'] };
    const ok = await amb.chamar(admin, 'POST', '/api/usuarios', { ...base, email: 'Fulano@Teste.Local', senha: SENHA });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ email: 'fulano@teste.local', canais: ['lead_proprio'] });

    const curta = await amb.chamar(admin, 'POST', '/api/usuarios', { ...base, email: 'c@teste.local', senha: 'curta' });
    expect(curta.statusCode).toBe(409);
    expect(curta.json().erro).toContain('12 caracteres');

    const semCanal = await amb.chamar(admin, 'POST', '/api/usuarios', {
      ...base,
      email: 's@teste.local',
      senha: SENHA,
      canais: [],
    });
    expect(semCanal.statusCode).toBe(409);
    expect(semCanal.json().erro).toContain('canal');

    const repetido = await amb.chamar(admin, 'POST', '/api/usuarios', { ...base, email: 'fulano@teste.local', senha: SENHA });
    expect(repetido.statusCode).toBe(409);
  });
});

describe('casos', () => {
  it('lista sempre por canal', async () => {
    expect((await amb.chamar(opA, 'GET', '/api/casos')).statusCode).toBe(400);
    expect((await amb.chamar(opA, 'GET', '/api/casos?origem=outro')).statusCode).toBe(400);
  });

  it('operador não lista o canal que não é dele', async () => {
    const r = await amb.chamar(opB, 'GET', '/api/casos?origem=plataforma_credor');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ erro: 'sem permissão para o canal plataforma_credor' });
  });

  it('lista os casos do canal com o mínimo do ativo e sem dado pessoal', async () => {
    const r = await amb.chamar(opA, 'GET', '/api/casos?origem=plataforma_credor');
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo).toMatchObject({ origem: 'plataforma_credor', finalidade: 'recuperacao_para_credor', total: 4 });
    expect(corpo.casos.map((c: { id: string }) => c.id).sort()).toEqual([
      'caso-a-001',
      'caso-a-002',
      'caso-a-003',
      'caso-a-004',
    ]);
    const primeiro = corpo.casos.find((c: { id: string }) => c.id === 'caso-a-001');
    expect(primeiro).toMatchObject({ placa: 'SEED001', modelo: 'FIAT/ARGO DRIVE', cidade: 'Belo Horizonte' });
    expect(JSON.stringify(corpo)).not.toContain('Devedor Sintético');
  });

  it('cria caso do Plano A com finalidade derivada da origem', async () => {
    const ativo = await amb.chamar(opA, 'POST', '/api/ativos', { placa: 'NOV0A01', modelo: 'VW/GOL' });
    const r = await amb.chamar(opA, 'POST', '/api/casos', {
      origem: 'plataforma_credor',
      ativoId: ativo.json().id,
      fonteId: 'fonte-plataforma',
      status: 'Recebido',
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ origem: 'plataforma_credor', finalidade: 'recuperacao_para_credor' });
  });

  it('não aceita finalidade vinda do cliente nem caso híbrido', async () => {
    const comFinalidade = await amb.chamar(opA, 'POST', '/api/casos', {
      origem: 'plataforma_credor',
      finalidade: 'aquisicao_com_quitacao',
      ativoId: 'ativo-x',
      fonteId: 'fonte-plataforma',
      status: 'Recebido',
    });
    expect(comFinalidade.statusCode).toBe(400);
    const hibrido = await amb.chamar(opA, 'POST', '/api/casos', {
      origem: 'plataforma_credor',
      ativoId: 'ativo-x',
      fonteId: 'fonte-plataforma',
      status: 'Recebido',
      canalLead: 'WhatsApp',
    });
    expect(hibrido.statusCode).toBe(400);
  });

  it('recusa status de outro ciclo de vida na criação', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/casos', {
      origem: 'lead_proprio',
      ativoId: 'ativo-004',
      fonteId: 'fonte-inbound',
      status: 'Recuperado',
      canalLead: 'WhatsApp',
      evidenciaLead: 'msg #1',
      renajudAtivo: false,
      gravameBaixado: false,
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().validos).toContain('Lead Recebido');
  });

  it('operador do Plano B não cria caso do Plano A', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/casos', {
      origem: 'plataforma_credor',
      ativoId: 'ativo-x',
      fonteId: 'fonte-plataforma',
      status: 'Recebido',
    });
    expect(r.statusCode).toBe(403);
  });

  it('aquisição numa placa do Plano A exige colisão documentada (409 do banco)', async () => {
    const ativo = await amb.chamar(opB, 'POST', '/api/ativos', { placa: 'SEED003', modelo: 'HONDA/CG 160' });
    expect(ativo.statusCode).toBe(201);
    const r = await amb.chamar(opB, 'POST', '/api/casos', {
      origem: 'lead_proprio',
      ativoId: ativo.json().id,
      fonteId: 'fonte-inbound',
      status: 'Lead Recebido',
      canalLead: 'Inbound Site',
      evidenciaLead: 'formulário #77',
      renajudAtivo: false,
      gravameBaixado: false,
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toContain('colisao_origem');
  });

  it('pré-condições da transferência listam as pendências', async () => {
    const r = await amb.chamar(opB, 'GET', '/api/casos/caso-b-001/pode-transferir');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      podeTransferir: false,
      pendencias: ['anuência do credor não obtida', 'gravame não baixado'],
    });
  });

  it('transferência não se aplica a caso de plataforma', async () => {
    const r = await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/pode-transferir');
    expect(r.statusCode).toBe(409);
  });

  it('caso de outro canal responde como inexistente', async () => {
    expect((await amb.chamar(opA, 'GET', '/api/casos/caso-b-001/pode-transferir')).statusCode).toBe(404);
    expect((await amb.chamar(opB, 'POST', '/api/casos/caso-a-001/status', { status: 'Localizado' })).statusCode).toBe(404);
  });

  it('muda status validando o vocabulário e registra quem mudou', async () => {
    const invalido = await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/status', { status: 'Quitado' });
    expect(invalido.statusCode).toBe(422);
    expect(invalido.json().validos).toContain('Em Campo');

    const ok = await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/status', { status: 'Aceito' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ id: 'caso-a-002', status: 'Aceito' });

    const [evento] = await amb.banco.bruta.query<{ usuario_id: string; status_de: string; status_para: string }>(
      `select e.usuario_id, e.status_de, e.status_para from caso_evento e
        where e.caso_id = 'caso-a-002' order by e.id desc limit 1`,
    );
    const [operador] = await amb.banco.bruta.query<{ id: string }>(`select id from usuario where email = 'opa@teste.local'`);
    expect(evento).toEqual({ usuario_id: operador!.id, status_de: 'Distribuído', status_para: 'Aceito' });

    expect((await amb.chamar(opA, 'POST', '/api/casos/inexistente/status', { status: 'Aceito' })).statusCode).toBe(404);
  });

  it('vocabulário de status por finalidade', async () => {
    const r = await amb.chamar(opA, 'GET', '/api/status?finalidade=aquisicao_com_quitacao');
    expect(r.json()).toContain('Transferido');
    expect((await amb.chamar(opA, 'GET', '/api/status?finalidade=x')).statusCode).toBe(400);
  });
});

describe('colisões', () => {
  it('só admin registra', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/colisoes', {
      placa: 'SEED001',
      casoPlataformaId: 'caso-a-001',
      resolucao: 'lead_descartado',
      justificativa: 'lead chegou depois',
    });
    expect(r.statusCode).toBe(403);
  });

  it('prosseguir sem evidência independente é recusado pelo banco', async () => {
    const r = await amb.chamar(admin, 'POST', '/api/colisoes', {
      placa: 'SEED002',
      casoPlataformaId: 'caso-a-002',
      resolucao: 'prosseguiu_com_origem_independente',
      justificativa: 'achei que podia',
    });
    expect(r.statusCode).toBe(409);
  });

  it('colisão documentada libera a aquisição, e só quem vê os dois canais a lista', async () => {
    const col = await amb.chamar(admin, 'POST', '/api/colisoes', {
      placa: 'seed-002',
      casoPlataformaId: 'caso-a-002',
      resolucao: 'prosseguiu_com_origem_independente',
      justificativa: 'vendedor procurou o site antes do ativo entrar na plataforma',
      evidenciaIndependente: 'formulário #555 de 2026-01-05, anterior ao recebimento',
    });
    expect(col.statusCode).toBe(201);

    const ativo = await amb.chamar(opB, 'POST', '/api/ativos', { placa: 'SEED002', modelo: 'VW/T-CROSS' });
    const caso = await amb.chamar(opB, 'POST', '/api/casos', {
      origem: 'lead_proprio',
      ativoId: ativo.json().id,
      fonteId: 'fonte-inbound',
      status: 'Lead Recebido',
      canalLead: 'Inbound Site',
      evidenciaLead: 'formulário #555',
      renajudAtivo: false,
      gravameBaixado: false,
    });
    expect(caso.statusCode).toBe(201);

    expect((await amb.chamar(admin, 'GET', '/api/colisoes')).json()).toHaveLength(1);
    expect((await amb.chamar(opA, 'GET', '/api/colisoes')).json()).toEqual([]);
    expect((await amb.chamar(opB, 'GET', '/api/colisoes')).json()).toEqual([]);
  });
});

describe('cadastros filtrados por canal', () => {
  it('operador do Plano B não lista devedores do Plano A', async () => {
    const r = await amb.chamar(opB, 'GET', '/api/ativos');
    const placas = r.json().map((a: { placa: string }) => a.placa);
    expect(placas).toContain('SEED004');
    expect(placas).not.toContain('SEED001');
    expect(JSON.stringify(r.json())).not.toContain('Devedor Sintético Um');
  });

  it('cadastra ativo normalizando a placa', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/ativos', { placa: 'abc 1d23' });
    expect(r.statusCode).toBe(201);
    const [linha] = await amb.banco.bruta.query<{ placa: string }>(`select placa from ativo where id = '${r.json().id}'`);
    expect(linha?.placa).toBe('ABC1D23');
    expect((await amb.chamar(opA, 'POST', '/api/ativos', { modelo: 'sem placa' })).statusCode).toBe(400);
  });

  it('fontes, rede de campo e repasses respeitam o canal', async () => {
    expect((await amb.chamar(opA, 'GET', '/api/fontes')).json().map((f: { id: string }) => f.id)).toEqual([
      'fonte-plataforma',
    ]);
    const recuperadores = (await amb.chamar(opA, 'GET', '/api/recuperadores')).json();
    expect(recuperadores.map((r: { score: number }) => r.score)).toEqual([94, 91, 88, 72]);
    expect((await amb.chamar(opB, 'GET', '/api/recuperadores')).json()).toEqual([]);

    const repasses = (await amb.chamar(opA, 'GET', '/api/repasses')).json();
    expect(repasses).toHaveLength(3);
    expect(repasses[0]).toHaveProperty('recuperadorNome');
    expect((await amb.chamar(opB, 'GET', '/api/repasses')).json()).toEqual([]);
  });

  it('só admin cadastra recuperador', async () => {
    expect((await amb.chamar(opA, 'POST', '/api/recuperadores', { nome: 'X' })).statusCode).toBe(403);
    const r = await amb.chamar(admin, 'POST', '/api/recuperadores', { nome: 'Nova Recuperadora', cidades: ['Recife'] });
    expect(r.statusCode).toBe(201);
  });

  it('bureaus não expõem nem o nome da variável da chave', async () => {
    const r = await amb.chamar(opA, 'GET', '/api/bureaus');
    expect(r.json()).toHaveLength(4);
    expect(JSON.stringify(r.json())).not.toContain('_API_KEY');
  });
});

describe('consultas a bureau e auditoria', () => {
  it('registra consulta com procedência derivada e operador da sessão', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/consultas', {
      casoId: 'caso-a-001',
      bureauId: 'bureau-serasa',
      baseLegal: 'legitimo_interesse',
      justificativa: 'localização para recuperação do ativo',
      camposRetornados: ['telefone', 'endereco'],
    });
    expect(r.statusCode).toBe(201);
    const linha = r.json();
    const [operador] = await amb.banco.bruta.query<{ id: string }>(`select id from usuario where email = 'opa@teste.local'`);
    expect(linha).toMatchObject({
      finalidade: 'recuperacao_para_credor',
      origemCaso: 'plataforma_credor',
      contratoFornecedorId: 'CTR-SERASA-0001',
      operadorId: operador!.id,
      custo: 2.5,
    });
    const dias = (new Date(linha.retencaoAte).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(dias)).toBe(180);
  });

  it('consulta sobre caso de outro canal responde como inexistente', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/consultas', {
      casoId: 'caso-a-001',
      bureauId: 'bureau-serasa',
      baseLegal: 'legitimo_interesse',
      justificativa: 'tentativa',
    });
    expect(r.statusCode).toBe(404);
  });

  it('consulta sem justificativa é recusada', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/consultas', {
      casoId: 'caso-a-001',
      bureauId: 'bureau-serasa',
      baseLegal: 'legitimo_interesse',
      justificativa: '   ',
    });
    expect(r.statusCode).toBe(400);
  });

  it('trilha e custos só para admin e auditor', async () => {
    expect((await amb.chamar(opA, 'GET', '/api/auditoria')).statusCode).toBe(403);
    const trilha = await amb.chamar(auditor, 'GET', '/api/auditoria');
    expect(trilha.statusCode).toBe(200);
    expect(trilha.json()[0]).toMatchObject({ bureauNome: 'Serasa Experian', operadorNome: 'opa' });
    const custos = await amb.chamar(admin, 'GET', '/api/custos/bureau');
    expect(custos.json()).toEqual([{ nome: 'Serasa Experian', consultas: 1, custoTotal: 2.5 }]);
  });
});

describe('CAMILA', () => {
  it('sem credencial de modelo responde 503, sem número inventado', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/camila/prioridades');
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({ pendentes: 2 });
  });

  it('operador do Plano B não tem repasses para priorizar', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/camila/prioridades');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
  });

  it('valida a resposta do modelo, descarta repasse inventado e não envia nome nem placa', async () => {
    let enviado = '';
    const iaFalsa = {
      models: {
        generateContent: async (req: { contents: string }) => {
          enviado = req.contents;
          return {
            text: JSON.stringify([
              { repasseId: 'rep-001', prioridade: 'Alta', justificativa: 'atraso', riscoCancelamento: 70 },
              { repasseId: 'rep-inventado', prioridade: 'Crítica', justificativa: '?', riscoCancelamento: 99 },
            ]),
          };
        },
      },
    } as unknown as GoogleGenAI;
    const app = await criarServidor({ db: amb.banco.db, ambiente: lerAmbiente({ NODE_ENV: 'test' }), ia: iaFalsa });
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'opa@teste.local', senha: SENHA },
      });
      const r = await app.inject({
        method: 'POST',
        url: '/api/camila/prioridades',
        cookies: { sessao: login.cookies.find((c) => c.name === 'sessao')!.value },
        headers: { 'x-csrf-token': login.json().usuario.csrfToken },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().map((x: { repasseId: string }) => x.repasseId)).toEqual(['rep-001']);
      expect(enviado).not.toContain('Carlos Pereira');
      expect(enviado).not.toContain('SEED');
    } finally {
      await app.close();
    }
  });
});
