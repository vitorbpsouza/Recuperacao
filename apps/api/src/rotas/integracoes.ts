/**
 * Conexões com serviços pagos, configuradas pela tela: API Brasil (consulta
 * veicular) e Evolution (WhatsApp com a rede de campo e terceiros).
 *
 * Credencial entra cifrada e nunca sai. Consulta paga é consulta a fornecedor:
 * base legal, justificativa e custo na trilha, como o texto colado com
 * fornecedor. Mensagem ao recuperador não leva valor da dívida nem dado do
 * devedor além do necessário para achar o bem (proibido revelar a dívida a
 * terceiros, CDC art. 42 e LGPD).
 */
import { createHash, randomBytes } from 'node:crypto';

import { sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { comContexto, type Db, type Tx } from '@workspace/db';
import {
  atualizarIntegracaoEntrada,
  consultaIntegracaoEntrada,
  enviarMensagemEntrada,
  novaIntegracaoEntrada,
} from '@workspace/domain';

import { exigirPapel } from '../auth/plugin.ts';
import * as c from '../contratos.ts';
import { criarClienteApiBrasil, ErroDeIntegracao, type CredenciaisApiBrasil, type ServicoApiBrasil } from '../integracoes/apibrasil.ts';
import { criarClienteEvolution, lerMensagemDoWebhook, numeroWhatsapp, type CredenciaisEvolution } from '../integracoes/evolution.ts';
import { ErroDeRelatorio, importarRelatorio } from '../servicos/relatorio.ts';
import { cifrar, decifrar, finalDe } from '../servicos/segredos.ts';

export interface OpcoesIntegracoes {
  db: Db;
  chave: string;
  urlPublica?: string;
  /** Os testes passam um fetch falso: nada sai para a internet. */
  executar?: typeof fetch;
}

const consultar = async <T>(tx: Tx, q: SQL): Promise<T[]> => ((await tx.execute(q)) as unknown as { rows: T[] }).rows;

interface LinhaIntegracao {
  id: string;
  tipo: 'apibrasil' | 'evolution';
  nome: string;
  baseUrl: string;
  credenciais: string;
  config: { instancia?: string; servico?: ServicoApiBrasil };
  bureauId: string | null;
  ativo: boolean;
}

const integracaoAtiva = async (tx: Tx, tipo: LinhaIntegracao['tipo'], id?: string) => {
  const [i] = await consultar<LinhaIntegracao>(
    tx,
    sql`select id, tipo, nome, base_url as "baseUrl", credenciais_cifradas as credenciais, config, bureau_id as "bureauId", ativo
          from integracao
         where tipo = ${tipo} and ativo ${id ? sql`and id = ${id}` : sql``}
         order by criado_em limit 1`,
  );
  return i ?? null;
};

const webhookUrl = (base: string, token: string) => `${base.replace(/\/+$/, '')}/api/webhooks/evolution/${token}`;

export const rotasIntegracoes: FastifyPluginAsyncZod<OpcoesIntegracoes> = async (app, { db, chave, urlPublica, executar = fetch }) => {
  const baseDaRequisicao = (protocolo: string, host: string | undefined) => urlPublica ?? `${protocolo}://${host ?? 'localhost'}`;

  const clienteEvolution = (i: LinhaIntegracao) =>
    criarClienteEvolution(i.baseUrl, i.config.instancia ?? '', decifrar<CredenciaisEvolution>(chave, i.credenciais), executar);

  // -------------------------------------------------------------------------
  // Cadastro das conexões
  // -------------------------------------------------------------------------

  app.get(
    '/integracoes',
    { preHandler: exigirPapel('admin', 'gestor'), schema: { tags: ['integracoes'], response: { 200: z.array(c.integracao) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.integracao>>(
          tx,
          sql`select i.id, i.tipo, i.nome, i.base_url as "baseUrl", i.config, i.bureau_id as "bureauId", b.nome as "bureauNome",
                     b.custo_consulta::float8 as "custoConsulta", b.contrato_fornecedor_id as "contrato",
                     i.ativo, i.credenciais_final as "credenciaisFinal", i.webhook_token_hash is not null as "webhookConfigurado",
                     i.ultimo_teste_em as "ultimoTesteEm", i.ultimo_teste_ok as "ultimoTesteOk", i.ultimo_teste_detalhe as "ultimoTesteDetalhe",
                     i.criado_em as "criadoEm"
                from integracao i left join bureau b on b.id = i.bureau_id
               order by i.tipo, i.nome`,
        ),
      ),
  );

  app.post(
    '/integracoes',
    {
      preHandler: exigirPapel('admin'),
      schema: { tags: ['integracoes'], body: novaIntegracaoEntrada, response: { 201: c.integracaoCriada, 409: c.erro } },
    },
    async (req, reply) => {
      const v = req.body;
      const resultado = await req.banco(async (tx) => {
        const [repetida] = await consultar(tx, sql`select 1 from integracao where tipo = ${v.tipo} and nome = ${v.nome}`);
        if (repetida) return null;
        if (v.tipo === 'apibrasil') {
          // A API Brasil é um fornecedor: contrato e custo dão procedência a cada consulta.
          const [b] = await consultar<{ id: string }>(
            tx,
            sql`insert into bureau (nome, tipo, contrato_fornecedor_id, custo_consulta)
                values (${v.nome}, 'Veicular', ${v.contratoFornecedorId}, ${v.custoConsulta}) returning id`,
          );
          const credenciais: CredenciaisApiBrasil = { bearerToken: v.bearerToken, deviceToken: v.deviceToken };
          const [i] = await consultar<{ id: string }>(
            tx,
            sql`insert into integracao (tipo, nome, base_url, credenciais_cifradas, credenciais_final, config, bureau_id)
                values ('apibrasil', ${v.nome}, ${v.baseUrl}, ${cifrar(chave, credenciais)}, ${finalDe(v.bearerToken, v.deviceToken)},
                        ${JSON.stringify({ servico: v.servico })}::jsonb, ${b!.id})
                returning id`,
          );
          return { id: i!.id, webhookUrl: null };
        }
        const token = randomBytes(24).toString('base64url');
        const [i] = await consultar<{ id: string }>(
          tx,
          sql`insert into integracao (tipo, nome, base_url, credenciais_cifradas, credenciais_final, config, webhook_token_hash)
              values ('evolution', ${v.nome}, ${v.baseUrl}, ${cifrar(chave, { apikey: v.apikey })}, ${finalDe(v.apikey)},
                      ${JSON.stringify({ instancia: v.instancia })}::jsonb, ${createHash('sha256').update(token).digest('hex')})
              returning id`,
        );
        // O token só aparece aqui: o banco guarda o hash.
        return { id: i!.id, webhookUrl: webhookUrl(baseDaRequisicao(req.protocol, req.headers.host), token) };
      });
      if (!resultado) return reply.code(409).send({ erro: 'já existe uma conexão com esse nome' });
      return reply.code(201).send(resultado);
    },
  );

  app.put(
    '/integracoes/:id',
    {
      preHandler: exigirPapel('admin'),
      schema: { tags: ['integracoes'], params: z.object({ id: z.string() }), body: atualizarIntegracaoEntrada, response: { 200: c.criado, 404: c.erro } },
    },
    async (req, reply) =>
      req.banco(async (tx) => {
        const [i] = await consultar<{ tipo: string; credenciais: string; config: Record<string, unknown> }>(
          tx,
          sql`select tipo, credenciais_cifradas as credenciais, config from integracao where id = ${req.params.id}`,
        );
        if (!i) return reply.code(404).send({ erro: 'conexão não encontrada' });
        const v = req.body;
        const sets: SQL[] = [];
        if (v.nome) sets.push(sql`nome = ${v.nome}`);
        if (v.baseUrl) sets.push(sql`base_url = ${v.baseUrl}`);
        if (v.ativo !== undefined) sets.push(sql`ativo = ${v.ativo}`);
        const config = { ...i.config, ...(v.instancia ? { instancia: v.instancia } : {}), ...(v.servico ? { servico: v.servico } : {}) };
        sets.push(sql`config = ${JSON.stringify(config)}::jsonb`);
        if (v.bearerToken || v.deviceToken || v.apikey) {
          const atuais = decifrar<Record<string, string>>(chave, i.credenciais);
          const novas = { ...atuais, ...(v.bearerToken ? { bearerToken: v.bearerToken } : {}), ...(v.deviceToken ? { deviceToken: v.deviceToken } : {}), ...(v.apikey ? { apikey: v.apikey } : {}) };
          sets.push(sql`credenciais_cifradas = ${cifrar(chave, novas)}`);
          sets.push(sql`credenciais_final = ${finalDe(novas.bearerToken ?? novas.apikey, novas.deviceToken)}`);
        }
        await tx.execute(sql`update integracao set ${sql.join(sets, sql`, `)} where id = ${req.params.id}`);
        return { id: req.params.id };
      }),
  );

  /** Testa a conexão e guarda o resultado (sem cobrança: homologação na API Brasil, estado na Evolution). */
  app.post(
    '/integracoes/:id/testar',
    {
      preHandler: exigirPapel('admin', 'gestor'),
      schema: { tags: ['integracoes'], params: z.object({ id: z.string() }), response: { 200: c.testeIntegracao, 404: c.erro } },
    },
    async (req, reply) => {
      const i = await req.banco(async (tx) => {
        const [linha] = await consultar<LinhaIntegracao>(
          tx,
          sql`select id, tipo, nome, base_url as "baseUrl", credenciais_cifradas as credenciais, config, bureau_id as "bureauId", ativo
                from integracao where id = ${req.params.id}`,
        );
        return linha ?? null;
      });
      if (!i) return reply.code(404).send({ erro: 'conexão não encontrada' });
      let ok = false;
      let detalhe: string;
      try {
        if (i.tipo === 'evolution') {
          const r = await clienteEvolution(i).estado();
          ok = r.instance?.state === 'open';
          detalhe = ok ? 'WhatsApp conectado.' : `Instância encontrada, mas o WhatsApp está "${r.instance?.state ?? 'desconhecido'}": leia o QR Code na Evolution.`;
        } else {
          await criarClienteApiBrasil(i.baseUrl, decifrar<CredenciaisApiBrasil>(chave, i.credenciais), executar).testar();
          ok = true;
          detalhe = 'Credenciais aceitas pela API Brasil (homologação, sem cobrança).';
        }
      } catch (e) {
        detalhe = e instanceof Error ? e.message : 'falha desconhecida';
      }
      await req.banco((tx) =>
        tx.execute(sql`update integracao set ultimo_teste_em = now(), ultimo_teste_ok = ${ok}, ultimo_teste_detalhe = ${detalhe}
                        where id = ${req.params.id}`),
      );
      return { ok, detalhe };
    },
  );

  /** Gera um token novo e aponta o webhook da Evolution para esta API. */
  app.post(
    '/integracoes/:id/webhook',
    {
      preHandler: exigirPapel('admin'),
      schema: { tags: ['integracoes'], params: z.object({ id: z.string() }), response: { 200: c.webhookConfigurado, 404: c.erro, 502: c.erro } },
    },
    async (req, reply) => {
      const token = randomBytes(24).toString('base64url');
      const url = webhookUrl(baseDaRequisicao(req.protocol, req.headers.host), token);
      const i = await req.banco(async (tx) => {
        const linha = await integracaoAtiva(tx, 'evolution', req.params.id);
        if (linha) {
          await tx.execute(sql`update integracao set webhook_token_hash = ${createHash('sha256').update(token).digest('hex')} where id = ${linha.id}`);
        }
        return linha;
      });
      if (!i) return reply.code(404).send({ erro: 'conexão da Evolution não encontrada ou inativa' });
      try {
        await clienteEvolution(i).configurarWebhook(url);
        return { url, configuradoNaEvolution: true, detalhe: 'Webhook gravado na Evolution: as respostas chegam na Operação.' };
      } catch (e) {
        return { url, configuradoNaEvolution: false, detalhe: `Configure na Evolution manualmente: ${(e as Error).message}` };
      }
    },
  );

  // -------------------------------------------------------------------------
  // API Brasil: consulta da placa do caso
  // -------------------------------------------------------------------------

  app.post(
    '/casos/:id/consulta-apibrasil',
    {
      schema: {
        tags: ['integracoes'],
        params: z.object({ id: z.string() }),
        body: consultaIntegracaoEntrada,
        response: { 201: c.resumoImportacao, 404: c.erro, 409: c.erro, 422: c.erro, 502: c.erro },
      },
    },
    async (req, reply) => {
      const preparo = await req.banco(async (tx) => {
        const [k] = await consultar<{ placa: string }>(
          tx,
          sql`select a.placa from caso k join ativo a on a.id = k.ativo_id where k.id = ${req.params.id}`,
        );
        return k ? { placa: k.placa, integracao: await integracaoAtiva(tx, 'apibrasil', req.body.integracaoId) } : null;
      });
      if (!preparo) return reply.code(404).send({ erro: 'caso não encontrado' });
      if (!preparo.integracao) return reply.code(409).send({ erro: 'nenhuma conexão ativa com a API Brasil: cadastre em Integrações' });
      const i = preparo.integracao;

      let resposta: { json: unknown; texto: string };
      try {
        resposta = await criarClienteApiBrasil(i.baseUrl, decifrar<CredenciaisApiBrasil>(chave, i.credenciais), executar).consultarPlaca(
          preparo.placa,
          i.config.servico ?? 'dados',
        );
      } catch (e) {
        if (e instanceof ErroDeIntegracao) return reply.code(502).send({ erro: e.message });
        throw e;
      }
      try {
        const resumo = await req.banco((tx) =>
          importarRelatorio(tx, req.usuario!.id, {
            casoId: req.params.id,
            texto: resposta.texto,
            textoOriginal: JSON.stringify(resposta.json, null, 2),
            via: 'integracao',
            bureauId: i.bureauId!,
            baseLegal: req.body.baseLegal,
            justificativa: req.body.justificativa,
            papelPessoa: req.body.papelPessoa,
          }),
        );
        return reply.code(201).send(resumo);
      } catch (e) {
        if (e instanceof ErroDeRelatorio) return reply.code(e.statusCode).send({ erro: e.message });
        throw e;
      }
    },
  );

  // -------------------------------------------------------------------------
  // Evolution: WhatsApp
  // -------------------------------------------------------------------------

  /** Confere na Evolution quais números da pessoa têm WhatsApp e guarda a resposta. */
  app.post(
    '/casos/:id/pessoas/:pessoaId/conferir-whatsapp',
    {
      schema: {
        tags: ['integracoes'],
        params: z.object({ id: z.string(), pessoaId: z.string() }),
        response: { 200: z.object({ conferidos: z.number().int(), comWhatsapp: z.number().int() }), 404: c.erro, 409: c.erro, 502: c.erro },
      },
    },
    async (req, reply) => {
      const dados = await req.banco(async (tx) => {
        const [ligada] = await consultar(tx, sql`select 1 from caso_pessoa where caso_id = ${req.params.id} and pessoa_id = ${req.params.pessoaId}`);
        if (!ligada) return null;
        const celulares = await consultar<{ id: number; valor: string }>(
          tx,
          sql`select id::int as id, valor from pessoa_contato where pessoa_id = ${req.params.pessoaId} and tipo = 'celular' and valido`,
        );
        return { celulares, integracao: await integracaoAtiva(tx, 'evolution') };
      });
      if (!dados) return reply.code(404).send({ erro: 'pessoa não encontrada neste caso' });
      if (!dados.integracao) return reply.code(409).send({ erro: 'nenhuma conexão ativa com a Evolution: cadastre em Integrações' });
      if (!dados.celulares.length) return { conferidos: 0, comWhatsapp: 0 };
      let mapa: Map<string, boolean>;
      try {
        mapa = await clienteEvolution(dados.integracao).temWhatsapp(dados.celulares.map((x) => x.valor));
      } catch (e) {
        if (e instanceof ErroDeIntegracao) return reply.code(502).send({ erro: e.message });
        throw e;
      }
      let comWhatsapp = 0;
      await req.banco(async (tx) => {
        for (const cel of dados.celulares) {
          const existe = mapa.get(numeroWhatsapp(cel.valor));
          if (existe === undefined) continue;
          if (existe) comWhatsapp++;
          await tx.execute(sql`update pessoa_contato set whatsapp = ${existe}, whatsapp_conferido_em = now() where id = ${cel.id}`);
        }
      });
      return { conferidos: dados.celulares.length, comWhatsapp };
    },
  );

  /** Conversas da operação: uma por número, com a última mensagem. */
  app.get(
    '/conversas',
    { schema: { tags: ['integracoes'], response: { 200: z.array(c.conversa) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.conversa>>(
          tx,
          sql`select distinct on (m.numero) m.numero, r.id as "recuperadorId", r.nome as "recuperadorNome",
                     coalesce(r.nome, m.nome_contato) as nome, m.texto as "ultimaMensagem", m.direcao as "ultimaDirecao",
                     m.criado_em as "ultimaEm",
                     (select count(*)::int from mensagem_whatsapp x where x.numero = m.numero) as total
                from mensagem_whatsapp m left join recuperador r on r.id = m.recuperador_id
               order by m.numero, m.criado_em desc`,
        ).then((l) => l.sort((a, b) => +new Date(b.ultimaEm) - +new Date(a.ultimaEm))),
      ),
  );

  app.get(
    '/conversas/:numero',
    { schema: { tags: ['integracoes'], params: z.object({ numero: z.string().regex(/^\d{10,15}$/) }), response: { 200: z.array(c.mensagem) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.mensagem>>(
          tx,
          sql`select m.id::int as id, m.direcao, m.texto, m.caso_id as "casoId", a.placa, u.nome as "usuarioNome", m.criado_em as "criadoEm"
                from mensagem_whatsapp m
                left join usuario u on u.id = m.usuario_id
                left join caso k on k.id = m.caso_id
                left join ativo a on a.id = k.ativo_id
               where m.numero = ${req.params.numero}
               order by m.criado_em, m.id
               limit 500`,
        ),
      ),
  );

  app.post(
    '/conversas/:numero',
    {
      schema: {
        tags: ['integracoes'],
        params: z.object({ numero: z.string().regex(/^\d{10,15}$/) }),
        body: enviarMensagemEntrada,
        response: { 201: c.criado, 409: c.erro, 502: c.erro },
      },
    },
    async (req, reply) => {
      const numero = numeroWhatsapp(req.params.numero);
      const i = await req.banco((tx) => integracaoAtiva(tx, 'evolution', req.body.integracaoId));
      if (!i) return reply.code(409).send({ erro: 'nenhuma conexão ativa com a Evolution: cadastre em Integrações' });
      let externoId: string | null = null;
      try {
        externoId = (await clienteEvolution(i).enviarTexto(numero, req.body.texto)).key?.id ?? null;
      } catch (e) {
        if (e instanceof ErroDeIntegracao) return reply.code(502).send({ erro: e.message });
        throw e;
      }
      const [m] = await req.banco((tx) =>
        consultar<{ id: string }>(
          tx,
          sql`insert into mensagem_whatsapp (integracao_id, numero, recuperador_id, caso_id, direcao, texto, externo_id)
              values (${i.id}, ${numero}, recuperador_do_numero(app_tenant(), ${numero}), ${req.body.casoId ?? null}, 'enviada',
                      ${req.body.texto}, ${externoId})
              returning id::text as id`,
        ),
      );
      return reply.code(201).send({ id: m!.id });
    },
  );

  /**
   * Webhook da Evolution: sem sessão, autenticado pelo token na URL. Responde
   * 200 sempre — quem não tem o token não descobre se acertou.
   */
  app.post(
    '/webhooks/evolution/:token',
    {
      config: { publica: true, rateLimit: { max: 600, timeWindow: '1 minute' } },
      schema: { hide: true, params: z.object({ token: z.string().min(16).max(64) }), body: z.unknown() },
    },
    async (req) => {
      const m = lerMensagemDoWebhook(req.body);
      if (m && /^\d{10,15}$/.test(m.numero)) {
        await comContexto(db, { tenantId: '', usuarioId: null, canais: [] }, (tx) =>
          tx.execute(sql`select webhook_evolution_registrar(${createHash('sha256').update(req.params.token).digest('hex')}, ${m.numero},
                                                          ${m.texto}, ${m.externoId}, ${m.nome})`),
        );
      }
      return { ok: true };
    },
  );
};
