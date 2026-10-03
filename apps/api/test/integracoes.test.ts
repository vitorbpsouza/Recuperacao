/** API Brasil, Evolution e painel executivo, com a internet trocada por respostas combinadas. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { comoDono, TENANT_RECREDITA } from '@workspace/db';
import { sql } from 'drizzle-orm';

import { ambienteDeTeste, externo, type Ambiente, type Sessao } from './apoio.ts';

let amb: Ambiente;
let admin: Sessao;
let gestor: Sessao;
let opA: Sessao;
beforeAll(async () => {
  amb = await ambienteDeTeste();
  admin = await amb.entrar('admin@teste.local');
  gestor = await amb.entrar('gestor@teste.local');
  opA = await amb.entrar('opa@teste.local');
});
afterAll(() => amb.fechar());
beforeEach(() => {
  externo.chamadas.length = 0;
  externo.responder = () => ({});
});

const API_BRASIL = {
  tipo: 'apibrasil',
  nome: 'API Brasil',
  bearerToken: 'bearer-de-teste-1234567890',
  deviceToken: 'device-teste-9876',
  servico: 'dados',
  contratoFornecedorId: 'CTR-APIBRASIL-001',
  custoConsulta: 1.5,
};

describe('conexões', () => {
  it('só admin cadastra; a credencial nunca volta, só o final dela', async () => {
    expect((await amb.chamar(gestor, 'POST', '/api/integracoes', API_BRASIL)).statusCode).toBe(403);
    expect((await amb.chamar(admin, 'POST', '/api/integracoes', API_BRASIL)).statusCode).toBe(201);
    const lista = await amb.chamar(gestor, 'GET', '/api/integracoes');
    expect(lista.body).not.toContain('bearer-de-teste-1234567890');
    expect(lista.json()[0]).toMatchObject({ tipo: 'apibrasil', credenciaisFinal: '••••7890 · ••••9876', custoConsulta: 1.5, contrato: 'CTR-APIBRASIL-001' });
    expect((await amb.chamar(opA, 'GET', '/api/integracoes')).statusCode).toBe(403);
  });

  it('no banco, a credencial está cifrada', async () => {
    const [linha] = await comoDono(amb.banco.db, TENANT_RECREDITA.id, async (tx) =>
      ((await tx.execute(sql`select credenciais_cifradas as c from integracao where tipo = 'apibrasil'`)) as unknown as { rows: { c: string }[] }).rows,
    );
    expect(linha!.c).toMatch(/^v1\./);
    expect(linha!.c).not.toContain('bearer-de-teste');
  });
});

describe('consulta à API Brasil', () => {
  it('consulta a placa, guarda o JSON e lê os campos, com consulta na trilha', async () => {
    externo.responder = () => ({
      error: false,
      response: { placa: 'SEED001', marca: 'FIAT', modelo: 'ARGO DRIVE', anoModelo: 2021, combustivel: 'FLEX', especie: 'PASSAGEIRO', potenciaMaxima: '75cv' },
    });
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/consulta-apibrasil', {
      baseLegal: 'execucao_contrato',
      justificativa: 'confirmar o veículo antes da diligência',
    });
    expect(r.statusCode).toBe(201);
    expect(externo.chamadas[0]).toMatchObject({
      url: 'https://gateway.apibrasil.io/api/v2/vehicles/dados',
      corpo: { placa: 'SEED001' },
      headers: expect.objectContaining({ authorization: 'Bearer bearer-de-teste-1234567890', DeviceToken: 'device-teste-9876' }),
    });
    // Campo que a API mandou e o sistema não tem: guardado e sinalizado.
    expect(r.json().novos).toEqual([expect.objectContaining({ rotulo: 'potencia Maxima' })]);
    const ficha = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001')).json();
    expect(ficha.ativo).toMatchObject({ marca: 'FIAT', combustivel: 'FLEX', especie: 'PASSAGEIRO', ano: 2021 });
    const [relatorio] = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/relatorios')).json();
    expect(relatorio).toMatchObject({ via: 'integracao', fornecedor: 'API Brasil' });
    const trilha = (await amb.chamar(admin, 'GET', '/api/auditoria')).json();
    expect(trilha[0]).toMatchObject({ bureauNome: 'API Brasil', custo: 1.5, justificativa: 'confirmar o veículo antes da diligência' });
  });

  it('erro da API Brasil vira 502 e nada é gravado', async () => {
    externo.responder = () => ({ error: true, message: 'Saldo insuficiente' });
    const antes = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/relatorios')).json().length;
    const r = await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/consulta-apibrasil', {
      baseLegal: 'execucao_contrato',
      justificativa: 'confirmar o veículo antes da diligência',
    });
    expect(r.statusCode).toBe(502);
    expect(r.json().erro).toContain('Saldo insuficiente');
    expect((await amb.chamar(opA, 'GET', '/api/casos/caso-a-001/relatorios')).json()).toHaveLength(antes);
  });
});

describe('WhatsApp pela Evolution', () => {
  let webhook = '';

  it('cadastra a Evolution e devolve a URL do webhook uma vez', async () => {
    const r = await amb.chamar(admin, 'POST', '/api/integracoes', {
      tipo: 'evolution',
      nome: 'WhatsApp da operação',
      baseUrl: 'https://evo.exemplo.com',
      apikey: 'apikey-de-teste',
      instancia: 'recredita',
    });
    expect(r.statusCode).toBe(201);
    webhook = r.json().webhookUrl;
    expect(webhook).toMatch(/\/api\/webhooks\/evolution\/[\w-]{20,}$/);
  });

  it('testa a conexão pelo estado da instância', async () => {
    externo.responder = () => ({ instance: { state: 'open' } });
    const [evo] = (await amb.chamar(admin, 'GET', '/api/integracoes')).json().filter((i: { tipo: string }) => i.tipo === 'evolution');
    const r = (await amb.chamar(gestor, 'POST', `/api/integracoes/${evo.id}/testar`)).json();
    expect(r).toEqual({ ok: true, detalhe: 'WhatsApp conectado.' });
    expect(externo.chamadas[0]).toMatchObject({ url: 'https://evo.exemplo.com/instance/connectionState/recredita', headers: expect.objectContaining({ apikey: 'apikey-de-teste' }) });
  });

  it('envia ao recuperador e guarda na conversa, ligada ao recuperador pelo telefone', async () => {
    const [rec] = (await amb.chamar(opA, 'GET', '/api/recuperadores')).json();
    const numero = `55${rec.telefone.replace(/\D/g, '')}`;
    externo.responder = () => ({ key: { id: 'MSG-1' } });
    const r = await amb.chamar(opA, 'POST', `/api/conversas/${numero}`, { texto: 'Caso novo na sua região: placa SEED001.', casoId: 'caso-a-001' });
    expect(r.statusCode).toBe(201);
    expect(externo.chamadas[0]).toMatchObject({ url: 'https://evo.exemplo.com/message/sendText/recredita', corpo: { number: numero } });
    const [conversa] = (await amb.chamar(opA, 'GET', '/api/conversas')).json();
    expect(conversa).toMatchObject({ numero, recuperadorNome: rec.nome, ultimaDirecao: 'enviada', total: 1 });
  });

  it('recebe a resposta pelo webhook sem sessão; token errado é ignorado', async () => {
    const [conversa] = (await amb.chamar(opA, 'GET', '/api/conversas')).json();
    const evento = (texto: string, id: string) => ({
      event: 'messages.upsert',
      data: { key: { remoteJid: `${conversa.numero}@s.whatsapp.net`, fromMe: false, id }, pushName: 'Recuperador', message: { conversation: texto } },
    });
    const caminho = new URL(webhook).pathname;
    expect((await amb.app.inject({ method: 'POST', url: caminho, payload: evento('Aceito, vou hoje.', 'MSG-2') })).statusCode).toBe(200);
    // Repetição do mesmo evento não duplica.
    await amb.app.inject({ method: 'POST', url: caminho, payload: evento('Aceito, vou hoje.', 'MSG-2') });
    await amb.app.inject({ method: 'POST', url: '/api/webhooks/evolution/token-errado-que-nao-existe', payload: evento('invasor', 'MSG-3') });
    const mensagens = (await amb.chamar(opA, 'GET', `/api/conversas/${conversa.numero}`)).json();
    expect(mensagens.map((m: { direcao: string; texto: string }) => `${m.direcao}: ${m.texto}`)).toEqual([
      'enviada: Caso novo na sua região: placa SEED001.',
      'recebida: Aceito, vou hoje.',
    ]);
    expect(mensagens[0]).toMatchObject({ placa: 'SEED001', usuarioNome: 'opa' });
  });

  const evento = (numero: string, id: string, message: Record<string, unknown>, extra: Record<string, unknown> = {}, pushName = 'Zé do Guincho') => ({
    event: 'messages.upsert',
    data: { key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe: false, id, ...extra }, pushName, message },
  });
  const postarWebhook = (corpo: unknown) => amb.app.inject({ method: 'POST', url: new URL(webhook).pathname, payload: corpo as object });

  it('recebe foto, áudio e localização; guarda o arquivo e só o Plano A o abre', async () => {
    const [conversa] = (await amb.chamar(opA, 'GET', '/api/conversas')).json();
    const foto = Buffer.from('conteudo-da-foto-de-teste').toString('base64');
    await postarWebhook(evento(conversa.numero, 'MIDIA-1', { imageMessage: { caption: 'Achei na rua 2', mimetype: 'image/jpeg' }, base64: foto }));
    // Sem base64 no evento: a API baixa da Evolution.
    externo.responder = (url) =>
      url.includes('/chat/getBase64FromMediaMessage') ? { base64: Buffer.from('audio-de-teste').toString('base64'), mimetype: 'audio/ogg; codecs=opus' } : {};
    await postarWebhook(evento(conversa.numero, 'MIDIA-2', { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true } }));
    expect(externo.chamadas[0]).toMatchObject({ url: 'https://evo.exemplo.com/chat/getBase64FromMediaMessage/recredita', corpo: { message: { key: { id: 'MIDIA-2' } } } });
    await postarWebhook(evento(conversa.numero, 'MIDIA-3', { locationMessage: { degreesLatitude: -19.9191, degreesLongitude: -43.9386, name: 'Posto' } }));

    const mensagens = (await amb.chamar(opA, 'GET', `/api/conversas/${conversa.numero}`)).json();
    expect(mensagens.slice(-3).map((m: Record<string, unknown>) => [m.midiaTipo, m.midiaMime, m.temArquivo, m.texto])).toEqual([
      ['imagem', 'image/jpeg', true, 'Achei na rua 2'],
      ['audio', 'audio/ogg', true, ''],
      ['localizacao', null, false, 'Posto'],
    ]);
    expect(mensagens.at(-1)).toMatchObject({ latitude: -19.9191, longitude: -43.9386 });

    const arquivo = await amb.chamar(opA, 'GET', `/api/mensagens/${mensagens.at(-3).id}/midia`);
    expect(arquivo.statusCode).toBe(200);
    expect(arquivo.headers['content-type']).toBe('image/jpeg');
    expect(arquivo.body).toBe('conteudo-da-foto-de-teste');
    const opB = await amb.entrar('opb@teste.local');
    expect((await amb.chamar(opB, 'GET', `/api/mensagens/${mensagens.at(-3).id}/midia`)).statusCode).toBe(404);

    const [atual] = (await amb.chamar(opA, 'GET', '/api/conversas')).json();
    expect(atual).toMatchObject({ nomeWhatsapp: 'Zé do Guincho', ultimaMidia: 'localizacao' });
  });

  it('foto que a Evolution não devolveu fica com o motivo e pode ser baixada de novo pela mensagem original', async () => {
    const [conversa] = (await amb.chamar(opA, 'GET', '/api/conversas')).json();
    // Primeira tentativa: a Evolution responde sem o arquivo.
    await postarWebhook(evento(conversa.numero, 'MIDIA-4', { imageMessage: { mimetype: 'image/jpeg', mediaKey: 'chave-da-midia', jpegThumbnail: 'miniatura' } }));
    let [foto] = (await amb.chamar(opA, 'GET', `/api/conversas/${conversa.numero}`)).json().slice(-1);
    expect(foto).toMatchObject({ midiaTipo: 'imagem', temArquivo: false, podeBaixar: true, midiaFalha: 'a Evolution não devolveu o arquivo' });

    externo.chamadas.length = 0;
    externo.responder = () => ({ base64: Buffer.from('foto-baixada-de-novo').toString('base64'), mimetype: 'image/jpeg' });
    const r = await amb.chamar(opA, 'POST', `/api/mensagens/${foto.id}/midia/baixar`);
    expect(r.statusCode).toBe(200);
    // Vai a mensagem original (com a chave de mídia), sem miniatura nem base64.
    const corpo = externo.chamadas[0]!.corpo as { message: { key: { id: string }; message: { imageMessage: Record<string, unknown> } } };
    expect(corpo.message.key.id).toBe('MIDIA-4');
    expect(corpo.message.message.imageMessage).toEqual({ mimetype: 'image/jpeg', mediaKey: 'chave-da-midia' });

    [foto] = (await amb.chamar(opA, 'GET', `/api/conversas/${conversa.numero}`)).json().slice(-1);
    expect(foto).toMatchObject({ temArquivo: true, podeBaixar: false, midiaFalha: null });
    expect((await amb.chamar(opA, 'GET', `/api/mensagens/${foto.id}/midia`)).body).toBe('foto-baixada-de-novo');
    // Completar a mídia é a única alteração aceita.
    await expect(amb.banco.bruta.query(`update mensagem_whatsapp set texto = 'adulterado' where id = ${foto.id}`)).rejects.toThrow(/append-only/);
  });

  it('mensagem mandada do celular entra como enviada; o eco do que a central mandou não duplica', async () => {
    const [conversa] = (await amb.chamar(opA, 'GET', '/api/conversas')).json();
    const antes = conversa.total;
    await postarWebhook(evento(conversa.numero, 'MSG-1', { conversation: 'Caso novo na sua região: placa SEED001.' }, { fromMe: true }, 'Operação'));
    await postarWebhook(evento(conversa.numero, 'MSG-CEL', { conversation: 'mandei do celular' }, { fromMe: true }, 'Operação'));
    const mensagens = (await amb.chamar(opA, 'GET', `/api/conversas/${conversa.numero}`)).json();
    expect(mensagens).toHaveLength(antes + 1);
    expect(mensagens.at(-1)).toMatchObject({ direcao: 'enviada', texto: 'mandei do celular', usuarioNome: null });
    // O pushName de mensagem enviada é o da operação: não vira nome do contato.
    expect((await amb.chamar(opA, 'GET', '/api/conversas')).json()[0].nomeWhatsapp).toBe('Zé do Guincho');
  });

  it('o nome do contato não some quando a última mensagem é nossa, e a conversa ganha um veículo', async () => {
    const numero = '5531975629312';
    await postarWebhook(evento(numero, 'T-1', { conversation: 'oi' }, {}, 'Fulano Terceiro'));
    externo.responder = () => ({ key: { id: 'T-2' } });
    await amb.chamar(opA, 'POST', `/api/conversas/${numero}`, { texto: 'achou?' });
    const daLista = async () => (await amb.chamar(opA, 'GET', '/api/conversas')).json().find((c: { numero: string }) => c.numero === numero);
    expect(await daLista()).toMatchObject({ nome: 'Fulano Terceiro', ultimaDirecao: 'enviada', casoId: null });

    const vinculo = await amb.chamar(opA, 'PUT', `/api/conversas/${numero}/contato`, { casoId: 'caso-a-002' });
    expect(vinculo.statusCode).toBe(200);
    expect(await daLista()).toMatchObject({ casoId: 'caso-a-002', placa: 'SEED002' });
    // Mensagem nova já entra ligada ao veículo.
    await postarWebhook(evento(numero, 'T-3', { conversation: 'vi o carro' }, {}, 'Fulano Terceiro'));
    expect((await amb.chamar(opA, 'GET', `/api/conversas/${numero}`)).json().at(-1)).toMatchObject({ casoId: 'caso-a-002', placa: 'SEED002' });

    await amb.chamar(opA, 'PUT', `/api/conversas/${numero}/contato`, { nome: 'Guincho do Fulano' });
    expect(await daLista()).toMatchObject({ nome: 'Guincho do Fulano', nomeWhatsapp: 'Fulano Terceiro', casoId: 'caso-a-002' });
    expect((await amb.chamar(opA, 'PUT', `/api/conversas/${numero}/contato`, { casoId: 'caso-b-001' })).statusCode).toBe(404);
    await amb.chamar(opA, 'PUT', `/api/conversas/${numero}/contato`, { casoId: null });
    expect(await daLista()).toMatchObject({ casoId: null, placa: null });
  });

  it('envia foto como mídia e áudio como mensagem de voz, e guarda o arquivo', async () => {
    const numero = '5531975629312';
    externo.responder = (url) => ({ key: { id: url.includes('sendWhatsAppAudio') ? 'ENV-AUDIO' : 'ENV-FOTO' } });
    const foto = await amb.chamar(opA, 'POST', `/api/conversas/${numero}/midia`, {
      arquivo: Buffer.from('png-de-teste-com-conteudo').toString('base64'),
      tipoMime: 'image/png',
      nomeArquivo: 'placa.png',
      legenda: 'é este?',
    });
    expect(foto.statusCode).toBe(201);
    expect(externo.chamadas[0]).toMatchObject({
      url: 'https://evo.exemplo.com/message/sendMedia/recredita',
      corpo: { number: numero, mediatype: 'image', mimetype: 'image/png', fileName: 'placa.png', caption: 'é este?' },
    });
    const audio = await amb.chamar(opA, 'POST', `/api/conversas/${numero}/midia`, {
      arquivo: Buffer.from('webm-de-voz-de-teste').toString('base64'),
      tipoMime: 'audio/webm;codecs=opus',
      voz: true,
    });
    expect(audio.statusCode).toBe(201);
    expect(externo.chamadas[1]).toMatchObject({ url: 'https://evo.exemplo.com/message/sendWhatsAppAudio/recredita', corpo: { number: numero } });

    const mensagens = (await amb.chamar(opA, 'GET', `/api/conversas/${numero}`)).json();
    expect(mensagens.slice(-2).map((m: Record<string, unknown>) => [m.direcao, m.midiaTipo, m.midiaMime, m.temArquivo, m.texto, m.usuarioNome])).toEqual([
      ['enviada', 'imagem', 'image/png', true, 'é este?', 'opa'],
      ['enviada', 'audio', 'audio/webm', true, '', 'opa'],
    ]);
    expect((await amb.chamar(opA, 'GET', `/api/mensagens/${mensagens.at(-1).id}/midia`)).body).toBe('webm-de-voz-de-teste');
  });

  it('confere quais celulares da pessoa têm WhatsApp', async () => {
    await amb.chamar(opA, 'POST', '/api/casos/caso-a-004/relatorios', {
      texto: `--- DADOS BÁSICOS ---\nNome: PESSOA FICTICIA\nCPF: 012.345.678-90\n--- TELEFONES ---\n(37) 99993-0001 | 01/01/2024\n(37) 99993-0002 | 01/01/2024`,
      papelPessoa: 'devedor',
    });
    const { pessoas } = (await amb.chamar(opA, 'GET', '/api/casos/caso-a-004/pessoas')).json();
    externo.responder = () => [
      { exists: true, number: '5537999930001', jid: '5537999930001@s.whatsapp.net' },
      { exists: false, number: '5537999930002', jid: '' },
    ];
    const r = (await amb.chamar(opA, 'POST', `/api/casos/caso-a-004/pessoas/${pessoas[0].id}/conferir-whatsapp`)).json();
    expect(r).toEqual({ conferidos: 2, comWhatsapp: 1 });
    const revelado = (await amb.chamar(opA, 'POST', '/api/casos/caso-a-004/pessoas/revelar', { finalidade: 'contato antes da abordagem' })).json();
    expect(revelado.pessoas[0].contatos.map((c: { valor: string; whatsapp: boolean }) => [c.valor, c.whatsapp])).toEqual(
      expect.arrayContaining([
        ['37999930001', true],
        ['37999930002', false],
      ]),
    );
  });
});

describe('painel executivo', () => {
  it('traz carteira, mapa com coordenada real, mais vistos, cidades, credores, recuperadores e alertas', async () => {
    await amb.chamar(opA, 'POST', '/api/casos/caso-a-001/avistamentos', {
      observadoEm: new Date().toISOString(), latitude: -19.92, longitude: -43.94, descricao: 'estacionado na Av. Afonso Pena', fonte: 'equipe_campo',
    });
    const r = await amb.chamar(opA, 'GET', '/api/painel/recuperacao');
    expect(r.statusCode).toBe(200);
    const p = r.json();
    expect(p.status.reduce((s: number, x: { quantidade: number }) => s + x.quantidade, 0)).toBe(4);
    expect(p.mapa).toEqual([expect.objectContaining({ placa: 'SEED001', latitude: -19.92, longitude: -43.94 })]);
    expect(p.maisVistos[0]).toMatchObject({ placa: 'SEED001', avistamentos: 1 });
    expect(p.porCidade.map((c: { cidade: string }) => c.cidade)).toContain('Belo Horizonte');
    expect(p.porCredor.map((c: { credor: string }) => c.credor)).toContain('Banco Alfa S.A.');
    expect(p.recuperadores.length).toBeGreaterThan(0);
    expect(p.evolucao).toHaveLength(6);
    expect(p.valorDivida).toBeGreaterThan(0);
  });
});
