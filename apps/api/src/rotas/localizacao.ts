/**
 * Inteligência de localização: onde procurar o veículo, fotos de campo e o
 * link para o recuperador terceiro.
 *
 * O link chega sem sessão. Ele resolve um caso só, por tempo limitado, e o
 * que se faz por ele (foto, avistamento) entra com o link como autor. O
 * terceiro vê só o que identifica o bem — placa, modelo, cor e região —,
 * nunca o devedor nem a dívida.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';

import type { GoogleGenAI } from '@google/genai';
import { sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { comContexto, type Contexto, type Db, type Tx } from '@workspace/db';
import {
  avistamentoCampoEntrada,
  localizarVeiculo,
  novaFotoEntrada,
  novoLinkCampoEntrada,
  type Sinal,
  type TipoSinal,
} from '@workspace/domain';

import * as c from '../contratos.ts';
import { criarClienteEvolution, numeroWhatsapp, type CredenciaisEvolution } from '../integracoes/evolution.ts';
import { geocodificar } from '../integracoes/geocodificacao.ts';
import { gravarFoto, prepararFoto } from '../servicos/fotos.ts';
import { decifrar } from '../servicos/segredos.ts';

export interface OpcoesLocalizacao {
  db: Db;
  ia: GoogleGenAI | null;
  modelo: string;
  /** Pasta das fotos; nula em produção sem volume configurado. */
  fotosDir: string | null;
  chave: string;
  urlPublica?: string;
  executar?: typeof fetch;
}

const consultar = async <T>(tx: Tx, q: SQL): Promise<T[]> => ((await tx.execute(q)) as unknown as { rows: T[] }).rows;
const params = z.object({ id: z.string() });
const LIMITE_FOTO = 30 * 1024 * 1024;
const SEM_SESSAO: Contexto = { tenantId: '', usuarioId: null, canais: [] };
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/** Papel da pessoa → peso do endereço dela. Parente pesa menos, mas conta: o carro costuma estar na casa da mãe. */
const TIPO_DO_ENDERECO: Record<string, TipoSinal> = {
  devedor: 'endereco',
  proprietario: 'endereco',
  terceiro_possuidor: 'endereco',
  avalista: 'endereco_parente',
  parente: 'endereco_parente',
  outro: 'endereco_parente',
};

/** Endereços das pessoas do caso que ainda não têm coordenada. */
const enderecosSemCoordenada = (tx: Tx, casoId: string, limite: number) =>
  consultar<{ id: number; logradouro: string; numero: string | null; bairro: string | null; cidade: string | null; uf: string | null; cep: string | null }>(
    tx,
    sql`select e.id::int as id, e.logradouro, e.numero, e.bairro, e.cidade, e.uf, e.cep
          from pessoa_endereco e
         where e.pessoa_id in (select cp.pessoa_id from caso_pessoa cp where cp.caso_id = ${casoId})
           and e.latitude is null and not e.geocodificacao_falhou
         order by cardinality(e.fontes) desc, e.id
         limit ${limite}`,
  );

export const rotasLocalizacao: FastifyPluginAsyncZod<OpcoesLocalizacao> = async (app, o) => {
  const executar = o.executar ?? fetch;

  // -------------------------------------------------------------------------
  // Onde procurar
  // -------------------------------------------------------------------------

  app.get(
    '/casos/:id/localizacao',
    { schema: { tags: ['localizacao'], params, response: { 200: c.localizacaoCaso, 404: c.erro } } },
    async (req, reply) =>
      req.banco(async (tx) => {
        const [existe] = await consultar(tx, sql`select 1 from caso where id = ${req.params.id}`);
        if (!existe) return reply.code(404).send({ erro: 'caso não encontrado' });
        const avistamentos = await consultar<{ fonte: string; latitude: number; longitude: number; observadoEm: string; descricao: string }>(
          tx,
          sql`select fonte, latitude::float8 as latitude, longitude::float8 as longitude, observado_em as "observadoEm", descricao
                from avistamento where caso_id = ${req.params.id} and latitude is not null`,
        );
        const enderecos = await consultar<{ papel: string; latitude: number | null; longitude: number | null; linha: string; fontes: number; precisao: string | null }>(
          tx,
          sql`select distinct on (e.id) cp.papel, e.latitude::float8 as latitude, e.longitude::float8 as longitude,
                     concat_ws(' · ', concat_ws(', ', e.logradouro, e.numero), e.bairro, concat_ws('/', e.cidade, e.uf)) as linha,
                     cardinality(e.fontes) + cardinality(e.variantes) - 1 as fontes, e.precisao
                from pessoa_endereco e join caso_pessoa cp on cp.pessoa_id = e.pessoa_id
               where cp.caso_id = ${req.params.id}
               order by e.id, array_position(array['devedor','proprietario','terceiro_possuidor','avalista','outro','parente'], cp.papel)`,
        );
        const sinais: Sinal[] = [
          ...avistamentos.map((a) => ({
            tipo: (['foto', 'equipe_campo', 'camera', 'radar', 'credor', 'devedor'].includes(a.fonte) ? a.fonte : 'outro') as TipoSinal,
            latitude: a.latitude,
            longitude: a.longitude,
            quando: new Date(a.observadoEm).toISOString(),
            descricao: a.descricao,
          })),
          ...enderecos
            .filter((e) => e.latitude != null && e.longitude != null)
            .map((e) => ({
              tipo: TIPO_DO_ENDERECO[e.papel] ?? 'endereco_parente',
              latitude: e.latitude!,
              longitude: e.longitude!,
              descricao: e.linha,
              fontes: e.fontes,
            })),
        ];
        return {
          lugares: localizarVeiculo(sinais),
          sinais: sinais.map((s) => ({ tipo: s.tipo, latitude: s.latitude, longitude: s.longitude, quando: s.quando ?? null, descricao: s.descricao })),
          enderecosSemCoordenada: enderecos.filter((e) => e.latitude == null).length,
        };
      }),
  );

  /** Põe no mapa os endereços das pessoas do caso (até 10 por vez: o OpenStreetMap aceita uma consulta por segundo). */
  app.post(
    '/casos/:id/geocodificar',
    { schema: { tags: ['localizacao'], params, response: { 200: c.resultadoGeocodificacao } } },
    async (req) => {
      const pendentes = await req.banco((tx) => enderecosSemCoordenada(tx, req.params.id, 10));
      let localizados = 0;
      let falharam = 0;
      for (const e of pendentes) {
        const coordenada = await geocodificar(e, executar);
        await req.banco((tx) =>
          coordenada
            ? tx.execute(sql`update pessoa_endereco set latitude = ${coordenada.latitude.toFixed(6)}::numeric, longitude = ${coordenada.longitude.toFixed(6)}::numeric,
                               precisao = ${coordenada.precisao}, geocodificacao_fonte = ${coordenada.fonte}, geocodificado_em = now()
                              where id = ${e.id}`)
            : tx.execute(sql`update pessoa_endereco set geocodificacao_falhou = true, geocodificado_em = now() where id = ${e.id}`),
        );
        if (coordenada) localizados++;
        else falharam++;
      }
      const restantes = await req.banco((tx) => enderecosSemCoordenada(tx, req.params.id, 1000));
      return { localizados, falharam, restantes: restantes.length };
    },
  );

  // -------------------------------------------------------------------------
  // Fotos
  // -------------------------------------------------------------------------

  const semPasta = { erro: 'fotos desligadas: configure FOTOS_DIR num volume do servidor (docs/easypanel.md)' };

  app.post(
    '/casos/:id/fotos',
    {
      bodyLimit: LIMITE_FOTO,
      schema: { tags: ['localizacao'], params, body: novaFotoEntrada, response: { 201: c.fotoEnviada, 404: c.erro, 503: c.erro } },
    },
    async (req, reply) => {
      if (!o.fotosDir) return reply.code(503).send(semPasta);
      const f = req.body;
      const preparada = await prepararFoto(f.imagem, f.tipoMime, o.ia, o.modelo);
      const r = await req.banco((tx) =>
        gravarFoto(tx, o.fotosDir!, preparada, {
          tenantId: req.contexto!.tenantId,
          casoId: req.params.id,
          aparelho: f.latitude !== undefined ? { latitude: f.latitude, longitude: f.longitude!, precisao: f.precisao } : null,
          descricao: f.descricao,
        }),
      );
      if (!r) return reply.code(404).send({ erro: 'caso não encontrado' });
      return reply.code(201).send(r);
    },
  );

  app.get(
    '/casos/:id/fotos',
    { schema: { tags: ['localizacao'], params, response: { 200: z.array(c.foto) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.foto>>(
          tx,
          sql`select f.id::int as id, f.sha256, f.tipo_mime as "tipoMime", f.tamanho_bytes as "tamanhoBytes", f.exif, f.tirada_em as "tiradaEm",
                     f.latitude::float8 as latitude, f.longitude::float8 as longitude, f.precisao_m::float8 as "precisaoM",
                     f.origem_coordenada as "origemCoordenada", f.placa_lida as "placaLida", f.placa_confere as "placaConfere", f.ocr,
                     f.ocr_status as "ocrStatus", f.descricao, coalesce(u.nome, l.destinatario) as autor, (f.link_id is not null) as "peloLink",
                     f.enviado_em as "enviadoEm"
                from foto f
                left join usuario u on u.id = f.usuario_id
                left join link_campo l on l.id = f.link_id
               where f.caso_id = ${req.params.id}
               order by f.enviado_em desc`,
        ),
      ),
  );

  /** O arquivo da foto, para quem enxerga o caso. */
  app.get(
    '/fotos/:fotoId/arquivo',
    { schema: { tags: ['localizacao'], hide: true, params: z.object({ fotoId: z.coerce.number().int() }) } },
    async (req, reply) => {
      const [f] = await req.banco((tx) =>
        consultar<{ arquivo: string; tipoMime: string }>(tx, sql`select arquivo, tipo_mime as "tipoMime" from foto where id = ${req.params.fotoId}`),
      );
      if (!f || !o.fotosDir) return reply.code(404).send({ erro: 'foto não encontrada' });
      const caminho = normalize(join(o.fotosDir, f.arquivo));
      if (!caminho.startsWith(normalize(o.fotosDir))) return reply.code(404).send({ erro: 'foto não encontrada' });
      try {
        await stat(caminho);
      } catch {
        return reply.code(404).send({ erro: 'arquivo da foto não está no volume' });
      }
      return reply.header('content-type', f.tipoMime).header('cache-control', 'private, max-age=86400').send(createReadStream(caminho));
    },
  );

  // -------------------------------------------------------------------------
  // Link de campo
  // -------------------------------------------------------------------------

  const urlDoLink = (protocolo: string, host: string | undefined, token: string) =>
    `${(o.urlPublica ?? `${protocolo}://${host ?? 'localhost'}`).replace(/\/+$/, '')}/campo/${token}`;

  app.post(
    '/casos/:id/links-campo',
    {
      schema: { tags: ['localizacao'], params, body: novoLinkCampoEntrada, response: { 201: c.linkCriado, 404: c.erro, 409: c.erro } },
    },
    async (req, reply) => {
      const v = req.body;
      const token = randomBytes(24).toString('base64url');
      const r = await req.banco(async (tx) => {
        const [k] = await consultar<{ placa: string; modelo: string | null; cor: string | null; cidade: string | null; uf: string | null; finalidade: string }>(
          tx,
          sql`select a.placa, a.modelo, a.cor, a.cidade, a.uf, k.finalidade from caso k join ativo a on a.id = k.ativo_id where k.id = ${req.params.id}`,
        );
        if (!k) return { codigo: 404 as const, erro: 'caso não encontrado' };
        if (k.finalidade !== 'recuperacao_para_credor') return { codigo: 409 as const, erro: 'link de campo é do Plano A: aquisição não vai a campo' };
        let destinatario = v.destinatario ?? null;
        let telefone: string | null = null;
        if (v.recuperadorId) {
          const [rec] = await consultar<{ nome: string; telefone: string | null }>(tx, sql`select nome, telefone from recuperador where id = ${v.recuperadorId}`);
          if (!rec) return { codigo: 404 as const, erro: 'recuperador não encontrado' };
          destinatario = rec.nome;
          telefone = rec.telefone;
        } else if (v.destinatario && /^[\d\s()+-]{10,}$/.test(v.destinatario)) {
          telefone = v.destinatario;
        }
        const [l] = await consultar<{ id: string; expiraEm: string }>(
          tx,
          sql`insert into link_campo (caso_id, token_hash, recuperador_id, destinatario, expira_em)
              values (${req.params.id}, ${hash(token)}, ${v.recuperadorId ?? null}, ${destinatario}, now() + make_interval(hours => ${v.horas}))
              returning id, expira_em as "expiraEm"`,
        );
        const evolution = v.enviarWhatsapp
          ? (
              await consultar<{ id: string; baseUrl: string; credenciais: string; instancia: string }>(
                tx,
                sql`select id, base_url as "baseUrl", credenciais_cifradas as credenciais, config->>'instancia' as instancia
                      from integracao where tipo = 'evolution' and ativo order by criado_em limit 1`,
              )
            )[0]
          : undefined;
        return { codigo: 201 as const, link: l!, caso: k, telefone, evolution };
      });
      if (r.codigo !== 201) return reply.code(r.codigo).send({ erro: r.erro });

      const url = urlDoLink(req.protocol, req.headers.host, token);
      let whatsapp: string | null = null;
      if (v.enviarWhatsapp) {
        if (!r.evolution) whatsapp = 'Sem conexão com a Evolution: copie o link e envie.';
        else if (!r.telefone) whatsapp = 'Sem telefone do destinatário: copie o link e envie.';
        else {
          const k = r.caso;
          const texto = [
            `Caso para localizar · placa ${k.placa}`,
            [k.modelo, k.cor].filter(Boolean).join(' · ') || null,
            [k.cidade, k.uf].filter(Boolean).length ? `Região: ${[k.cidade, k.uf].filter(Boolean).join('/')}` : null,
            `Envie foto e localização por este link (vale até ${new Date(r.link.expiraEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}):`,
            url,
            'Fotografe o veículo em via pública, sem pessoas em foco e sem entrar em residência ou garagem.',
          ]
            .filter(Boolean)
            .join('\n');
          try {
            const e = r.evolution;
            const numero = numeroWhatsapp(r.telefone);
            const enviado = await criarClienteEvolution(e.baseUrl, e.instancia, decifrar<CredenciaisEvolution>(o.chave, e.credenciais), executar).enviarTexto(numero, texto);
            await req.banco((tx) =>
              tx.execute(sql`insert into mensagem_whatsapp (integracao_id, numero, recuperador_id, caso_id, direcao, texto, externo_id)
                             values (${e.id}, ${numero}, ${v.recuperadorId ?? null}, ${req.params.id}, 'enviada', ${texto}, ${enviado.key?.id ?? null})`),
            );
            whatsapp = 'Link enviado pelo WhatsApp.';
          } catch (e) {
            whatsapp = `Não foi possível enviar pelo WhatsApp (${(e as Error).message}): copie o link e envie.`;
          }
        }
      }
      return reply.code(201).send({ id: r.link.id, url, expiraEm: new Date(r.link.expiraEm), whatsapp });
    },
  );

  app.get(
    '/casos/:id/links-campo',
    { schema: { tags: ['localizacao'], params, response: { 200: z.array(c.linkCampo) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.linkCampo>>(
          tx,
          sql`select l.id, l.destinatario, l.expira_em as "expiraEm", l.revogado_em as "revogadoEm", l.usos, l.ultimo_uso_em as "ultimoUsoEm",
                     u.nome as "criadoPor", l.criado_em as "criadoEm",
                     (select count(*)::int from foto f where f.link_id = l.id) as fotos,
                     (select count(*)::int from avistamento a where a.link_id = l.id and a.fonte <> 'foto') as avistamentos
                from link_campo l left join usuario u on u.id = l.usuario_id
               where l.caso_id = ${req.params.id}
               order by l.criado_em desc`,
        ),
      ),
  );

  app.post(
    '/casos/:id/links-campo/:linkId/revogar',
    { schema: { tags: ['localizacao'], params: z.object({ id: z.string(), linkId: z.string() }), response: { 200: c.criado, 404: c.erro } } },
    async (req, reply) => {
      const linhas = await req.banco((tx) =>
        consultar<{ id: string }>(
          tx,
          sql`update link_campo set revogado_em = now() where id = ${req.params.linkId} and caso_id = ${req.params.id} and revogado_em is null returning id`,
        ),
      );
      if (!linhas.length) return reply.code(404).send({ erro: 'link não encontrado ou já revogado' });
      return { id: req.params.linkId };
    },
  );

  // -------------------------------------------------------------------------
  // Rotas do link (sem sessão)
  // -------------------------------------------------------------------------

  /** Resolve o token e devolve o contexto do caso: só o canal do Plano A, sem usuário. */
  const porLink = async (token: string) => {
    const [l] = await comContexto(o.db, SEM_SESSAO, (tx) =>
      consultar<{ link_id: string; tenant_id: string; caso_id: string; destinatario: string; expira_em: string }>(
        tx,
        sql`select * from link_campo_resolver(${hash(token)})`,
      ),
    );
    if (!l) return null;
    const contexto: Contexto = { tenantId: l.tenant_id, usuarioId: null, canais: ['plataforma_credor'] };
    return { ...l, banco: <T>(fn: (tx: Tx) => Promise<T>) => comContexto(o.db, contexto, fn) };
  };

  const token = z.object({ token: z.string().min(20).max(64) });
  const limite = { rateLimit: { max: 60, timeWindow: '1 minute' } };
  const expirado = { erro: 'link expirado ou revogado: peça um novo à central' };

  app.get(
    '/campo/:token',
    { config: { publica: true, ...limite }, schema: { tags: ['campo'], params: token, response: { 200: c.casoDoLink, 404: c.erro } } },
    async (req, reply) => {
      const l = await porLink(req.params.token);
      if (!l) return reply.code(404).send(expirado);
      const [k] = await l.banco((tx) =>
        consultar<{ placa: string; modelo: string | null; cor: string | null; cidade: string | null; uf: string | null }>(
          tx,
          sql`select a.placa, a.modelo, a.cor, a.cidade, a.uf from caso k join ativo a on a.id = k.ativo_id where k.id = ${l.caso_id}`,
        ),
      );
      if (!k) return reply.code(404).send(expirado);
      const [enviados] = await l.banco((tx) =>
        consultar<{ fotos: number; avistamentos: number }>(
          tx,
          sql`select (select count(*)::int from foto where link_id = ${l.link_id}) as fotos,
                     (select count(*)::int from avistamento where link_id = ${l.link_id} and fonte <> 'foto') as avistamentos`,
        ),
      );
      return { ...k, destinatario: l.destinatario, expiraEm: new Date(l.expira_em), fotos: enviados?.fotos ?? 0, avistamentos: enviados?.avistamentos ?? 0 };
    },
  );

  app.post(
    '/campo/:token/fotos',
    {
      bodyLimit: LIMITE_FOTO,
      config: { publica: true, ...limite },
      schema: { tags: ['campo'], params: token, body: novaFotoEntrada, response: { 201: c.fotoEnviada, 404: c.erro, 503: c.erro } },
    },
    async (req, reply) => {
      if (!o.fotosDir) return reply.code(503).send(semPasta);
      const l = await porLink(req.params.token);
      if (!l) return reply.code(404).send(expirado);
      const f = req.body;
      const preparada = await prepararFoto(f.imagem, f.tipoMime, o.ia, o.modelo);
      const r = await l.banco((tx) =>
        gravarFoto(tx, o.fotosDir!, preparada, {
          tenantId: l.tenant_id,
          casoId: l.caso_id,
          linkId: l.link_id,
          aparelho: f.latitude !== undefined ? { latitude: f.latitude, longitude: f.longitude!, precisao: f.precisao } : null,
          descricao: f.descricao,
        }),
      );
      if (!r) return reply.code(404).send(expirado);
      // O terceiro não vê se a placa é de outro caso da carteira.
      return reply.code(201).send({ ...r, outroCaso: null });
    },
  );

  app.post(
    '/campo/:token/avistamentos',
    {
      config: { publica: true, ...limite },
      schema: { tags: ['campo'], params: token, body: avistamentoCampoEntrada, response: { 201: c.criado, 404: c.erro } },
    },
    async (req, reply) => {
      const l = await porLink(req.params.token);
      if (!l) return reply.code(404).send(expirado);
      const a = req.body;
      const [linha] = await l.banco((tx) =>
        consultar<{ id: string }>(
          tx,
          sql`insert into avistamento (caso_id, observado_em, latitude, longitude, descricao, fonte, origem_coordenada, precisao_m, link_id)
              values (${l.caso_id}, now(), ${a.latitude ?? null}, ${a.longitude ?? null}, ${a.descricao}, 'equipe_campo',
                      ${a.latitude !== undefined ? 'aparelho' : null}, ${a.precisao ?? null}, ${l.link_id})
              returning id::text as id`,
        ),
      );
      return reply.code(201).send({ id: linha!.id });
    },
  );
};
