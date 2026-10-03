/** Texto colado: tudo guardado, papel da pessoa, dado sensível só para admin e gestor. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ambienteDeTeste, type Ambiente, type Sessao } from './apoio.ts';

let amb: Ambiente;
let admin: Sessao;
let gestor: Sessao;
let opA: Sessao;
let opB: Sessao;
beforeAll(async () => {
  amb = await ambienteDeTeste();
  admin = await amb.entrar('admin@teste.local');
  gestor = await amb.entrar('gestor@teste.local');
  opA = await amb.entrar('opa@teste.local');
  opB = await amb.entrar('opb@teste.local');
});
afterAll(() => amb.fechar());

// Dados inventados (CPF 012.345.678-90 é fictício, mas confere pelo dígito).
const veiculo = (placa: string) => `--- RADAR (${placa}): ---
DATA - HORA: 21/07/2026:17:25, PLACA: ${placa}, LOCAL: MG - CIDADE - RUA FICTICIA 100, LATITUDE: -19.9, LONGITUDE: -43.9
----------------------------------
🚗 DADOS DO VEÍCULO 🚗
Placa: ${placa}
Situação: EM_CIRCULACAO
Tipo: AUTOMOVEL
Categoria: PARTICULAR
Combustível: FLEX
Capacidade de Carga: 0,45
⛔ RESTRIÇÕES & INDICADORES ⛔
Restrição 1: ALIENACAO_FIDUCIARIA
Renajud: Sim
👤 PROPRIETÁRIO 👤
Documento: 012.345.678-90
Nome: PESSOA FICTICIA`;

const DOSSIE = `--- DADOS BÁSICOS COMPLETO: ---
Nome Completo: PESSOA FICTICIA
CPF: 1234567890
Nome da Mãe: MAE FICTICIA
Renda: R$ 3.450,00
--- TELEFONES (OPERADORAS) ---
[ANATEL]
  • ANATEL: PESSOA FICTICIA | CPF 012.345.678-90 | (37) 99993-0001
--- ENDERECOS ---
R MARINGA, Nº 195, BAIRRO, CIDADE TESTE/MG, 35660-179
--- PARENTES: ---
VINCULO: MAE, NOME: MAE FICTICIA, CPF: 222.555.888-46
--- CREDIT ANALYTICS: ---
TODOS FLAGS:
Financeiro:
  Fintech: True`;

describe('colar o relatório do veículo', () => {
  it('recusa texto de outra placa', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/relatorios', { texto: veiculo('ZZZ9Z99') });
    expect(r.statusCode).toBe(409);
  });

  it('guarda tudo: campos do veículo, restrições, proprietário, radar e o campo novo', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/relatorios', { texto: veiculo('SEED001') });
    expect(r.statusCode).toBe(201);
    const resumo = r.json();
    expect(resumo).toMatchObject({ radares: 1, novos: [{ rotulo: 'Capacidade de Carga' }] });
    expect(resumo.pessoas).toEqual([expect.objectContaining({ nome: 'PESSOA FICTICIA', papeis: ['proprietario'] })]);

    const ficha = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001')).json();
    expect(ficha.ativo).toMatchObject({ situacao: 'EM_CIRCULACAO', tipo: 'AUTOMOVEL', categoria: 'PARTICULAR', combustivel: 'FLEX' });

    const [verificacao] = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/verificacoes-veiculares')).json();
    expect(verificacao).toMatchObject({ fornecedor: null, renajud: true, alienacaoFiduciaria: true, restricoes: ['ALIENACAO_FIDUCIARIA'] });

    const avistamentos = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/avistamentos')).json();
    expect(avistamentos.find((a: { fonte: string }) => a.fonte === 'radar')).toMatchObject({ latitude: -19.9, longitude: -43.9 });

    const extras = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/dados-extras')).json();
    expect(extras).toEqual([expect.objectContaining({ rotulo: 'Capacidade de Carga', valor: '0,45', novo: true })]);

    const eventos = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/eventos')).json();
    expect(eventos.filter((e: { tipo: string }) => e.tipo === 'relatorio_colado')).toHaveLength(1);
    // Radar entra às dezenas: não vira um evento por passagem.
    expect(eventos.filter((e: { tipo: string }) => e.tipo === 'avistamento')).toHaveLength(0);
  });

  it('colar de novo não duplica radar nem extra', async () => {
    await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/relatorios', { texto: veiculo('SEED001') });
    const radares = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/avistamentos')).json().filter((a: { fonte: string }) => a.fonte === 'radar');
    expect(radares).toHaveLength(1);
    expect((await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/dados-extras')).json()).toHaveLength(1);
    expect((await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/relatorios')).json()).toHaveLength(2);
  });

  it('campos novos aparecem para quem cuida do próximo deploy', async () => {
    expect((await amb.chamar(opA, 'GET', '/api/campos-novos')).statusCode).toBe(403);
    const novos = (await amb.chamar(admin, 'GET', '/api/campos-novos')).json();
    expect(novos).toEqual([expect.objectContaining({ rotulo: 'Capacidade de Carga', ocorrencias: 1, casos: 1, exemplo: '0,45' })]);
  });

  it('no Plano B atualiza RENAJUD e gravame e guarda o radar sem virar avistamento', async () => {
    const r = await amb.chamar(opB, 'POST', '/api/casos/caso-b-001/relatorios', { texto: veiculo('SEED004') });
    expect(r.statusCode).toBe(201);
    expect(r.json().radares).toBe(0);
    const t = (await amb.chamar(opB, 'GET', '/api/casos/caso-b-001/pode-transferir')).json();
    expect(t.pendencias.join(' ')).toMatch(/RENAJUD/i);
    expect((await amb.chamar(opB, 'GET', '/api/casos/caso-b-001/dados-extras')).json().map((e: { secao: string }) => e.secao)).toContain('RADAR');
  });
});

describe('colar o dossiê da pessoa', () => {
  it('pergunta o papel quando o documento não é o do devedor', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/relatorios', { texto: DOSSIE });
    expect(r.statusCode).toBe(422);
  });

  it('com o papel, grava pessoa, contatos, endereço, parente e perfil', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/relatorios', { texto: DOSSIE, papelPessoa: 'terceiro_possuidor' });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ contatos: 1, enderecos: 1, parentes: 1 });
  });

  it('a lista mostra só o resumo mascarado; o operador não vê parentes', async () => {
    const { pessoas } = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-002/pessoas')).json();
    expect(pessoas).toEqual([
      expect.objectContaining({ papel: 'terceiro_possuidor', iniciais: 'P. F.', documentoMascarado: '***.345.678-**', contatos: 1, enderecos: 1 }),
    ]);
    expect(JSON.stringify(pessoas)).not.toContain('PESSOA FICTICIA');
  });

  it('revelar exige finalidade e registra o acesso; o operador não recebe perfil nem parentes', async () => {
    expect((await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/pessoas/revelar', { finalidade: 'curta' })).statusCode).toBe(400);
    const r = (await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/pessoas/revelar', { finalidade: 'ligar antes da abordagem em campo' })).json();
    expect(r.sensivelLiberado).toBe(false);
    expect(r.pessoas).toHaveLength(1);
    const [p] = r.pessoas;
    expect(p).toMatchObject({ nome: 'PESSOA FICTICIA', documento: '01234567890', nomeMae: 'MAE FICTICIA' });
    expect(p.contatos).toEqual([expect.objectContaining({ tipo: 'celular', valor: '37999930001', fontes: [expect.objectContaining({ fonte: 'ANATEL' })] })]);
    expect(p.enderecos).toEqual([expect.objectContaining({ logradouro: 'R MARINGA', numero: '195', cep: '35660-179' })]);
    expect(p.extras.some((e: { sensivel: boolean }) => e.sensivel)).toBe(false);

    const acessos = (await amb.chamar(admin, 'GET', '/api/casos/caso-a-002/acessos')).json();
    expect(acessos[0]).toMatchObject({ campos: ['pessoa', 'contatos', 'enderecos'], finalidade: 'ligar antes da abordagem em campo' });
  });

  it('o gestor recebe perfil, crédito e parentes, e a trilha diz isso', async () => {
    const r = (await amb.chamar(gestor, 'POST', '/api/casos/caso-a-002/pessoas/revelar', { finalidade: 'análise de risco do caso' })).json();
    expect(r.sensivelLiberado).toBe(true);
    expect(r.pessoas.map((p: { papel: string }) => p.papel)).toEqual(['terceiro_possuidor', 'parente']);
    const titular = r.pessoas[0];
    expect(titular.extras.map((e: { rotulo: string; valor: string }) => `${e.rotulo}=${e.valor}`)).toEqual(
      expect.arrayContaining(['Renda=R$ 3.450,00', 'TODOS FLAGS › Financeiro › Fintech=True']),
    );
    expect(r.pessoas[1]).toMatchObject({ nome: 'MAE FICTICIA', vinculo: 'MAE', parenteDe: titular.id });
    const acessos = (await amb.chamar(admin, 'GET', '/api/casos/caso-a-002/acessos')).json();
    expect(acessos[0].campos).toEqual(['pessoa', 'contatos', 'enderecos', 'perfil_e_credito', 'parentes']);
  });

  it('somar o relatório do veículo: proprietário diferente do devedor gera alerta', async () => {
    await amb.chamar(opA, 'POST', '/api/casos/caso-a-002/relatorios', { texto: veiculo('SEED002') });
    const { alertas } = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-002/pessoas')).json();
    // Ainda não há pessoa "devedor" ligada: sem comparação, sem alerta.
    expect(alertas).toEqual([]);
  });

  it('o texto original só sai para admin e gestor, com finalidade', async () => {
    const [ultimo] = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-002/relatorios')).json();
    const url = `/api/casos/caso-a-002/relatorios/${ultimo.id}/texto`;
    expect((await amb.chamar(opA, 'POST', url, { finalidade: 'conferir o texto original' })).statusCode).toBe(403);
    const r = await amb.chamar(gestor, 'POST', url, { finalidade: 'conferir o texto original' });
    expect(r.json().texto).toContain('DADOS DO VEÍCULO');
  });

  it('pessoa do Plano A não aparece para o operador do Plano B', async () => {
    expect((await amb.chamar(opB, 'GET', '/api/casos/caso-a-002/pessoas')).json().pessoas).toEqual([]);
  });
});

describe('cadastro com texto colado', () => {
  it('cria o caso e grava o texto na mesma transação; o devedor vem do dossiê', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/cadastro', {
      origem: 'plataforma_credor',
      fonteId: 'fonte-plataforma',
      credorId: 'cred-alfa',
      bem: { placa: 'TST1A23', modelo: 'MARCA/MODELO X' },
      relatorio: { texto: `${veiculo('TST1A23')}\n\n${DOSSIE}`, papelPessoa: 'devedor' },
    });
    expect(r.statusCode).toBe(201);
    const { id } = r.json();
    const { pessoas } = (await amb.chamar(opA, 'GET', `/api/casos/${id}/pessoas`)).json();
    // O mesmo CPF no bloco do proprietário e no dossiê: uma pessoa, proprietário pelo DETRAN.
    expect(pessoas.map((p: { papel: string }) => p.papel)).toEqual(['proprietario']);
  });

  it('texto de outra placa desfaz o cadastro inteiro', async () => {
    const r = await amb.chamar(opA, 'POST', '/api/casos/cadastro', {
      origem: 'plataforma_credor',
      fonteId: 'fonte-plataforma',
      credorId: 'cred-alfa',
      bem: { placa: 'TST9Z99', modelo: 'MARCA/MODELO X' },
      relatorio: { texto: veiculo('OUT1A11') },
    });
    expect(r.statusCode).toBe(409);
    const { casos } = (await amb.chamar(opA, 'GET', '/api/casos?origem=plataforma_credor')).json();
    expect(casos.map((c: { placa: string }) => c.placa)).not.toContain('TST9Z99');
  });
});
