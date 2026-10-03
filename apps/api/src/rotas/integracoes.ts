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
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';

import { sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { comContexto, type Db, type Tx } from '@workspace/db';
import {
  atualizarIntegracaoEntrada,
  consultaIntegracaoEntrada,
  contatoConversaEntrada,
  enviarMensagemEntrada,
  enviarMidiaEntrada,
  novaIntegracaoEntrada,
} from '@workspace/domain';

import { exigirPapel } from '../auth/plugin.ts';
import * as c from '../contratos.ts';
import { criarClienteApiBrasil, ErroDeIntegracao, type CredenciaisApiBrasil, type ServicoApiBrasil } from '../integracoes/apibrasil.ts';
import {
  criarClienteEvolution,
  lerMensagemDoWebhook,
  mimeSimples,
  numeroWhatsapp,
  type CredenciaisEvolution,
  type OrigemDaMidia,
  type TipoDeMidia,
} from '../integracoes/evolution.ts';
import { conteudoDoBase64, guardarMidia, LIMITE_MIDIA } from '../servicos/midia-whatsapp.ts';
import { ErroDeRelatorio, importarRelatorio } from '../servicos/relatorio.ts';
import { cifrar, decifrar, finalDe } from '../servicos/segredos.ts';

export interface OpcoesIntegracoes {
  db: Db;
  chave: string;
  urlPublica?: string;
  /** Os testes passam um fetch falso: nada sai para a internet. */
  executar?: typeof fetch;
  /** Pasta das mídias do WhatsApp (a mesma das fotos de campo). Nulo: a mensagem entra sem o arquivo. */
  fotosDir?: string | null;
  /** Quanto o eco de uma mensagem enviada pela central espera para não passar na frente dela. */
  esperaEcoMs?: number;
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

export const rotasIntegracoes: FastifyPluginAsyncZod<OpcoesIntegracoes> = async (
  app,
  { db, chave, urlPublica, executar = fetch, fotosDir = null, esperaEcoMs = 2000 },
) => {
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

  /** Conversas da operação: uma por número, com a última mensagem, o nome do contato e o veículo. */
  app.get(
    '/conversas',
    { schema: { tags: ['integracoes'], response: { 200: z.array(c.conversa) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.conversa>>(
          tx,
          sql`select m.numero, r.id as "recuperadorId", r.nome as "recuperadorNome",
                     coalesce(ct.nome, r.nome, ct.nome_whatsapp, ultimo.nome_contato) as nome,
                     coalesce(ct.nome_whatsapp, ultimo.nome_contato) as "nomeWhatsapp", ct.nome as "nomeDado",
                     ct.caso_id as "casoId", a.placa, a.modelo, k.status as "casoStatus",
                     m.texto as "ultimaMensagem", m.midia_tipo as "ultimaMidia", m.direcao as "ultimaDirecao", m.criado_em as "ultimaEm",
                     (select count(*)::int from mensagem_whatsapp x where x.numero = m.numero) as total
                from (select distinct on (numero) * from mensagem_whatsapp order by numero, criado_em desc, id desc) m
                left join recuperador r on r.id = m.recuperador_id
                left join contato_whatsapp ct on ct.tenant_id = m.tenant_id and ct.numero = m.numero
                left join lateral (
                  select x.nome_contato from mensagem_whatsapp x
                   where x.numero = m.numero and x.nome_contato is not null
                   order by x.criado_em desc limit 1
                ) ultimo on true
                left join caso k on k.id = ct.caso_id
                left join ativo a on a.id = k.ativo_id
               order by m.criado_em desc`,
        ),
      ),
  );

  app.get(
    '/conversas/:numero',
    { schema: { tags: ['integracoes'], params: z.object({ numero: z.string().regex(/^\d{10,15}$/) }), response: { 200: z.array(c.mensagem) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.mensagem>>(
          tx,
          // As 500 mais recentes, em ordem de chegada.
          sql`select * from (
                select m.id::int as id, m.direcao, m.texto, m.caso_id as "casoId", a.placa, u.nome as "usuarioNome", m.criado_em as "criadoEm",
                       m.midia_tipo as "midiaTipo", m.midia_mime as "midiaMime", m.midia_nome as "midiaNome",
                       (m.midia_arquivo is not null) as "temArquivo", m.latitude::float8 as latitude, m.longitude::float8 as longitude,
                       m.midia_falha as "midiaFalha", (m.midia_arquivo is null and m.midia_origem is not null) as "podeBaixar"
                  from mensagem_whatsapp m
                  left join usuario u on u.id = m.usuario_id
                  left join caso k on k.id = m.caso_id
                  left join ativo a on a.id = k.ativo_id
                 where m.numero = ${req.params.numero}
                 order by m.criado_em desc, m.id desc
                 limit 500
              ) x order by "criadoEm", id`,
        ),
      ),
  );

  /** Nome dado pela operação e veículo da conversa. As próximas mensagens já entram ligadas ao caso. */
  app.put(
    '/conversas/:numero/contato',
    {
      schema: {
        tags: ['integracoes'],
        params: z.object({ numero: z.string().regex(/^\d{10,15}$/) }),
        body: contatoConversaEntrada,
        response: { 200: c.contatoConversa, 404: c.erro },
      },
    },
    async (req, reply) => {
      const numero = numeroWhatsapp(req.params.numero);
      const { nome, casoId } = req.body;
      const r = await req.banco(async (tx) => {
        if (casoId) {
          const [k] = await consultar(tx, sql`select id from caso where id = ${casoId} and finalidade = 'recuperacao_para_credor'`);
          if (!k) return null;
        }
        const [l] = await consultar<z.infer<typeof c.contatoConversa>>(
          tx,
          sql`insert into contato_whatsapp (numero, nome, caso_id) values (${numero}, ${nome ?? null}, ${casoId ?? null})
              on conflict (tenant_id, numero) do update set
                nome    = case when ${nome !== undefined}::boolean then excluded.nome else contato_whatsapp.nome end,
                caso_id = case when ${casoId !== undefined}::boolean then excluded.caso_id else contato_whatsapp.caso_id end
              returning numero, nome, caso_id as "casoId"`,
        );
        return l ?? null;
      });
      if (!r) return reply.code(404).send({ erro: 'caso do Plano A não encontrado' });
      return r;
    },
  );

  /**
   * Grava a mensagem que a central mandou. Se o eco do webhook chegou antes
   * (mesmo id na Evolution), devolve a que já está gravada.
   */
  const registrarEnviada = (
    tx: Tx,
    m: { integracaoId: string; numero: string; casoId: string | null; texto: string; externoId: string | null; midia?: Record<string, unknown> | null },
  ) => {
    const d = m.midia ?? {};
    return consultar<{ id: string }>(
      tx,
      sql`with nova as (
            insert into mensagem_whatsapp (integracao_id, numero, recuperador_id, caso_id, direcao, texto, externo_id,
                                           midia_tipo, midia_mime, midia_nome, midia_arquivo, midia_sha256, midia_tamanho)
            values (${m.integracaoId}, ${m.numero}, recuperador_do_numero(app_tenant(), ${m.numero}), ${m.casoId}, 'enviada', ${m.texto}, ${m.externoId},
                    ${(d.tipo as string) ?? null}, ${(d.mime as string) ?? null}, ${(d.nome as string) ?? null}, ${(d.arquivo as string) ?? null},
                    ${(d.sha256 as string) ?? null}, ${(d.tamanho as number) ?? null})
            on conflict do nothing
            returning id::text as id
          )
          select id from nova
          union all
          select id::text from mensagem_whatsapp where integracao_id = ${m.integracaoId} and externo_id = ${m.externoId}
          limit 1`,
    );
  };

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
        registrarEnviada(tx, { integracaoId: i.id, numero, casoId: req.body.casoId ?? null, texto: req.body.texto, externoId }),
      );
      return reply.code(201).send({ id: m!.id });
    },
  );

  /** Foto, vídeo, documento ou áudio para o contato. O arquivo fica guardado como o recebido. */
  app.post(
    '/conversas/:numero/midia',
    {
      bodyLimit: 48 * 1024 * 1024,
      schema: {
        tags: ['integracoes'],
        params: z.object({ numero: z.string().regex(/^\d{10,15}$/) }),
        body: enviarMidiaEntrada,
        response: { 201: c.criado, 400: c.erro, 409: c.erro, 502: c.erro },
      },
    },
    async (req, reply) => {
      const numero = numeroWhatsapp(req.params.numero);
      const b = req.body;
      const i = await req.banco((tx) => integracaoAtiva(tx, 'evolution', b.integracaoId));
      if (!i) return reply.code(409).send({ erro: 'nenhuma conexão ativa com a Evolution: cadastre em Integrações' });

      const conteudo = conteudoDoBase64(b.arquivo);
      if (conteudo.length === 0) return reply.code(400).send({ erro: 'arquivo vazio' });
      if (conteudo.length > LIMITE_MIDIA) return reply.code(400).send({ erro: `arquivo grande demais (máximo de ${LIMITE_MIDIA / 1024 / 1024} MB)` });
      const mime = mimeSimples(b.tipoMime) ?? 'application/octet-stream';
      const tipo: TipoDeMidia =
        b.voz || mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'imagem' : mime.startsWith('video/') ? 'video' : 'documento';
      const base64 = conteudo.toString('base64');

      let externoId: string | null = null;
      try {
        const evolution = clienteEvolution(i);
        const r =
          tipo === 'audio'
            ? await evolution.enviarAudio(numero, base64)
            : await evolution.enviarMidia(numero, {
                tipo: tipo === 'imagem' ? 'image' : tipo === 'video' ? 'video' : 'document',
                mime,
                base64,
                nome: b.nomeArquivo,
                legenda: b.legenda,
              });
        externoId = r.key?.id ?? null;
      } catch (e) {
        if (e instanceof ErroDeIntegracao) return reply.code(502).send({ erro: e.message });
        throw e;
      }

      const guardada = fotosDir ? await guardarMidia(fotosDir, req.contexto!.tenantId, conteudo, mime) : null;
      const [m] = await req.banco((tx) =>
        registrarEnviada(tx, {
          integracaoId: i.id,
          numero,
          casoId: b.casoId ?? null,
          texto: tipo === 'audio' ? '' : (b.legenda ?? ''),
          externoId,
          midia: { tipo, mime, nome: b.nomeArquivo ?? null, ...guardada },
        }),
      );
      return reply.code(201).send({ id: m!.id });
    },
  );

  /** O arquivo de uma mídia da conversa, para quem enxerga o Plano A. */
  app.get(
    '/mensagens/:id/midia',
    { schema: { tags: ['integracoes'], hide: true, params: z.object({ id: z.coerce.number().int() }) } },
    async (req, reply) => {
      const [m] = await req.banco((tx) =>
        consultar<{ arquivo: string | null; mime: string | null; nome: string | null }>(
          tx,
          sql`select midia_arquivo as arquivo, midia_mime as mime, midia_nome as nome from mensagem_whatsapp where id = ${req.params.id}`,
        ),
      );
      if (!m?.arquivo || !fotosDir) return reply.code(404).send({ erro: 'mídia não encontrada' });
      const caminho = normalize(join(fotosDir, m.arquivo));
      if (!caminho.startsWith(normalize(fotosDir))) return reply.code(404).send({ erro: 'mídia não encontrada' });
      try {
        await stat(caminho);
      } catch {
        return reply.code(404).send({ erro: 'arquivo da mídia não está no volume' });
      }
      const nome = m.nome ? `; filename*=UTF-8''${encodeURIComponent(m.nome)}` : '';
      return reply
        .header('content-type', m.mime ?? 'application/octet-stream')
        .header('content-disposition', `inline${nome}`)
        .header('cache-control', 'private, max-age=86400')
        .send(createReadStream(caminho));
    },
  );

  /** Baixa de novo, da Evolution, a mídia que não foi guardada quando chegou. */
  app.post(
    '/mensagens/:id/midia/baixar',
    {
      schema: {
        tags: ['integracoes'],
        params: z.object({ id: z.coerce.number().int() }),
        response: { 200: c.midiaBaixada, 404: c.erro, 409: c.erro, 502: c.erro, 503: c.erro },
      },
    },
    async (req, reply) => {
      if (!fotosDir) return reply.code(503).send({ erro: 'servidor sem volume para mídias: configure FOTOS_DIR' });
      const dados = await req.banco(async (tx) => {
        const [m] = await consultar<{ integracaoId: string; origem: OrigemDaMidia | null; arquivo: string | null; mime: string | null }>(
          tx,
          sql`select integracao_id as "integracaoId", midia_origem as origem, midia_arquivo as arquivo, midia_mime as mime
                from mensagem_whatsapp where id = ${req.params.id}`,
        );
        if (!m) return null;
        const [i] = await consultar<LinhaIntegracao>(
          tx,
          sql`select id, tipo, nome, base_url as "baseUrl", credenciais_cifradas as credenciais, config, bureau_id as "bureauId", ativo
                from integracao where id = ${m.integracaoId}`,
        );
        return { m, i };
      });
      if (!dados) return reply.code(404).send({ erro: 'mensagem não encontrada' });
      const { m, i } = dados;
      if (m.arquivo) return { ok: true, detalhe: 'a mídia já estava guardada' };
      if (!m.origem) return reply.code(409).send({ erro: 'esta mensagem chegou antes de a origem da mídia ser guardada: peça para reenviar' });
      if (!i) return reply.code(409).send({ erro: 'a conexão da Evolution desta mensagem não existe mais' });

      let base64: string | null = null;
      let mime = m.mime;
      try {
        const baixada = await clienteEvolution(i).baixarMidia(m.origem);
        base64 = baixada.base64 ?? null;
        mime = mimeSimples(baixada.mimetype) ?? mime;
      } catch (e) {
        const falha = e instanceof Error ? e.message : 'falha desconhecida';
        await req.banco((tx) => tx.execute(sql`update mensagem_whatsapp set midia_falha = ${falha.slice(0, 500)} where id = ${req.params.id}`));
        return reply.code(502).send({ erro: falha });
      }
      if (!base64) return reply.code(502).send({ erro: 'a Evolution não devolveu o arquivo' });
      const g = await guardarMidia(fotosDir, req.contexto!.tenantId, conteudoDoBase64(base64), mime);
      await req.banco((tx) =>
        tx.execute(sql`update mensagem_whatsapp
                          set midia_arquivo = ${g.arquivo}, midia_sha256 = ${g.sha256}, midia_tamanho = ${g.tamanho}, midia_mime = ${mime}, midia_falha = null
                        where id = ${req.params.id} and midia_arquivo is null`),
      );
      return { ok: true, detalhe: 'mídia guardada' };
    },
  );

  /**
   * Webhook da Evolution: sem sessão, autenticado pelo token na URL. Responde
   * 200 sempre — quem não tem o token não descobre se acertou.
   *
   * Grava o que o contato mandou e o que a operação mandou direto do celular.
   * A mídia vem em base64 no próprio evento (webhook com base64 ligado) ou é
   * baixada da Evolution.
   */
  app.post(
    '/webhooks/evolution/:token',
    {
      bodyLimit: 64 * 1024 * 1024,
      config: { publica: true, rateLimit: { max: 600, timeWindow: '1 minute' } },
      schema: { hide: true, params: z.object({ token: z.string().min(16).max(64) }), body: z.unknown() },
    },
    async (req) => {
      const m = lerMensagemDoWebhook(req.body);
      if (!m) return { ok: true };
      const hash = createHash('sha256').update(req.params.token).digest('hex');
      const semSessao = <T>(fn: (tx: Tx) => Promise<T>) => comContexto(db, { tenantId: '', usuarioId: null, canais: [] }, fn);

      let midia: Record<string, unknown> | null = null;
      if (m.midia) {
        const { base64: _base64, ...descricao } = m.midia;
        midia = descricao;
        if (m.midia.tipo !== 'localizacao') {
          // Guardada mesmo quando a mídia baixa agora: é o que permite baixar de novo.
          midia.origem = m.origem;
          if (!fotosDir) midia.falha = 'servidor sem volume para mídias (FOTOS_DIR)';
        }
        if (m.midia.tipo !== 'localizacao' && fotosDir) {
          const [i] = await semSessao((tx) =>
            consultar<{ tenant_id: string; base_url: string; credenciais_cifradas: string; config: { instancia?: string } }>(
              tx,
              sql`select tenant_id, base_url, credenciais_cifradas, config from webhook_evolution_integracao(${hash})`,
            ),
          );
          if (!i) return { ok: true };
          try {
            let base64 = m.midia.base64;
            let mime = m.midia.mime;
            if (!base64) {
              const evolution = criarClienteEvolution(i.base_url, i.config.instancia ?? '', decifrar<CredenciaisEvolution>(chave, i.credenciais_cifradas), executar);
              const baixada = await evolution.baixarMidia(m.origem);
              base64 = baixada.base64 ?? null;
              mime = mimeSimples(baixada.mimetype) ?? mime;
            }
            if (base64) midia = { ...midia, mime, ...(await guardarMidia(fotosDir, i.tenant_id, conteudoDoBase64(base64), mime)) };
            else midia.falha = 'a Evolution não devolveu o arquivo';
          } catch (e) {
            // A mensagem entra mesmo sem o arquivo: a tela mostra o motivo e oferece baixar de novo.
            midia.falha = e instanceof Error ? e.message : 'falha desconhecida';
            req.log.warn({ err: e }, 'mídia do WhatsApp não guardada');
          }
        }
      }

      // O que a central mandou volta como eco: espera a central gravar a dela, com o usuário.
      if (m.direcao === 'enviada' && esperaEcoMs > 0) await new Promise((r) => setTimeout(r, esperaEcoMs));

      await semSessao((tx) =>
        tx.execute(sql`select webhook_evolution_registrar(${hash}, ${m.numero}, ${m.direcao}, ${m.texto}, ${m.externoId}, ${m.nome},
                                                        ${midia ? JSON.stringify(midia) : null}::jsonb)`),
      );
      return { ok: true };
    },
  );
};
