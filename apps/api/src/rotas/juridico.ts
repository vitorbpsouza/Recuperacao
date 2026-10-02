/**
 * Plano A: credor, mandato, rito e ciclo do caso.
 *
 * As regras não moram aqui. O banco recusa o que a lei não permite (triggers e
 * pendencias_transicao) e esta camada só traduz a entrada, calcula o prazo de
 * purga com o calendário do domínio e devolve as pendências para a tela.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Tx } from '@workspace/db';
import {
  definirRitoEntrada,
  destinosDe,
  formatarCnj,
  normalizarDocumento,
  novoCredorEntrada,
  novoMandatoEntrada,
  prazoDePurga,
  prazoNotificacaoExtrajudicial,
  procedimentoExtrajudicialEntrada,
  processoJudicialEntrada,
  provaMoraEntrada,
  resistenciaEntrada,
  rotuloDaAcao,
  transicaoEntrada,
  verificacaoRjEntrada,
  type StatusRecuperacao,
} from '@workspace/domain';

import { exigirPapel } from '../auth/plugin.ts';
import * as c from '../contratos.ts';

const params = z.object({ id: z.string() });
const resultadoStatus = z.object({ id: z.string(), status: z.string() });

const consultar = async <T>(tx: Tx, q: SQL): Promise<T[]> => ((await tx.execute(q)) as unknown as { rows: T[] }).rows;

/** Data civil como texto, para os dois drivers devolverem igual. */
const dia = (coluna: string) => sql.raw(`to_char(${coluna}, 'YYYY-MM-DD')`);

interface CasoA {
  status: StatusRecuperacao;
  rito: 'judicial' | 'extrajudicial' | 'amigavel' | null;
  finalidade: string;
}

/** O caso, se visível para a sessão; `null` vira 404 (não revela caso de outro canal). */
const casoVisivel = async (tx: Tx, id: string) =>
  (await consultar<CasoA>(tx, sql`select status, rito, finalidade from caso where id = ${id}`))[0] ?? null;

class Recusa extends Error {
  constructor(
    readonly codigo: 404 | 409,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** Caso do Plano A visível, ou recusa com o código certo. */
const exigirCasoA = async (tx: Tx, id: string) => {
  const caso = await casoVisivel(tx, id);
  if (!caso) throw new Recusa(404, 'caso não encontrado');
  if (caso.finalidade !== 'recuperacao_para_credor') throw new Recusa(409, 'só casos do Plano A têm rito e retomada');
  return caso;
};

/** Dados que a linha do tempo grava junto com a mudança (lidos pelo trigger). */
const definirEvento = (tx: Tx, evento: Record<string, unknown>) =>
  tx.execute(sql`select set_config('app.evento', ${JSON.stringify(evento)}, true)`);

const selecaoMandato = sql`
  m.id, m.credor_id as "credorId", ${dia('m.inicio')} as inicio, ${dia('m.fim')} as fim, m.referencia,
  m.revogado_em as "revogadoEm",
  (m.revogado_em is null and hoje_operacao() between m.inicio and m.fim) as vigente`;

export const rotasJuridico: FastifyPluginAsyncZod = async (app) => {
  app.setErrorHandler((erro, req, reply) => {
    if (erro instanceof Recusa) return reply.code(erro.codigo).send({ erro: erro.message });
    throw erro;
  });

  // -------------------------------------------------------------------------
  // Credores e mandatos
  // -------------------------------------------------------------------------

  app.get('/credores', { schema: { tags: ['credores'], response: { 200: z.array(c.credor) } } }, async (req) =>
    req.banco(async (tx) => {
      const credores = await consultar<Omit<z.infer<typeof c.credor>, 'mandatos'>>(
        tx,
        sql`select id, nome, cnpj, ativo from credor order by nome`,
      );
      // Mandato é do Plano A: quem só vê o Plano B recebe a lista vazia (RLS).
      const mandatos = await consultar<z.infer<typeof c.mandato>>(
        tx,
        sql`select ${selecaoMandato} from mandato m order by m.inicio desc`,
      );
      return credores.map((cr) => ({ ...cr, mandatos: mandatos.filter((m) => m.credorId === cr.id) }));
    }),
  );

  app.post(
    '/credores',
    {
      preHandler: exigirPapel('admin'),
      schema: { tags: ['credores'], body: novoCredorEntrada, response: { 201: c.criado, 409: c.erro } },
    },
    async (req, reply) => {
      const cnpj = req.body.cnpj ? normalizarDocumento(req.body.cnpj) : null;
      const [linha] = await req.banco((tx) =>
        consultar<{ id: string }>(tx, sql`insert into credor (nome, cnpj) values (${req.body.nome}, ${cnpj}) returning id`),
      );
      return reply.code(201).send({ id: linha!.id });
    },
  );

  app.post(
    '/credores/:id/mandatos',
    {
      preHandler: exigirPapel('admin'),
      schema: { tags: ['credores'], params, body: novoMandatoEntrada, response: { 201: c.criado, 404: c.erro } },
    },
    async (req, reply) => {
      const [linha] = await req.banco(async (tx) => {
        const [existe] = await consultar(tx, sql`select 1 from credor where id = ${req.params.id}`);
        if (!existe) throw new Recusa(404, 'credor não encontrado');
        return consultar<{ id: string }>(
          tx,
          sql`insert into mandato (credor_id, inicio, fim, referencia)
              values (${req.params.id}, ${req.body.inicio}::date, ${req.body.fim}::date, ${req.body.referencia})
              returning id`,
        );
      });
      return reply.code(201).send({ id: linha!.id });
    },
  );

  app.post(
    '/mandatos/:id/revogar',
    { preHandler: exigirPapel('admin'), schema: { tags: ['credores'], params, response: { 204: z.null(), 404: c.erro } } },
    async (req, reply) => {
      const linhas = await req.banco((tx) =>
        consultar(tx, sql`update mandato set revogado_em = now() where id = ${req.params.id} and revogado_em is null returning id`),
      );
      if (!linhas.length) return reply.code(404).send({ erro: 'mandato não encontrado ou já revogado' });
      return reply.code(204).send(null);
    },
  );

  // -------------------------------------------------------------------------
  // Ficha jurídica do caso
  // -------------------------------------------------------------------------

  app.get(
    '/casos/:id/juridico',
    { schema: { tags: ['casos'], params, response: { 200: c.juridicoCaso, 404: c.erro, 409: c.erro } } },
    async (req) =>
      req.banco(async (tx) => {
        const caso = await exigirCasoA(tx, req.params.id);
        const [base] = await consultar<{
          credorId: string | null;
          credorNome: string | null;
          credorCnpj: string | null;
          credorAtivo: boolean | null;
          documento: string;
          retomadoEm: Date | null;
          modalidade: NonNullable<z.infer<typeof c.juridicoCaso>['retomada']>['modalidade'] | null;
          comprovante: string | null;
          purgaAte: Date | null;
        }>(
          tx,
          sql`select k.credor_id as "credorId", cr.nome as "credorNome", cr.cnpj as "credorCnpj", cr.ativo as "credorAtivo",
                     upper(regexp_replace(coalesce(a.devedor_doc, ''), '[^0-9A-Za-z]', '', 'g')) as documento,
                     k.retomado_em as "retomadoEm", k.modalidade_retomada as modalidade,
                     k.comprovante_retomada as comprovante, k.purga_ate as "purgaAte"
                from caso k
                join ativo a on a.id = k.ativo_id
                left join credor cr on cr.id = k.credor_id
               where k.id = ${req.params.id}`,
        );
        const [mandatoVigente] = base?.credorId
          ? await consultar<z.infer<typeof c.mandato>>(
              tx,
              sql`select ${selecaoMandato} from mandato m
                   where m.credor_id = ${base.credorId} and m.revogado_em is null
                     and hoje_operacao() between m.inicio and m.fim
                   order by m.fim desc limit 1`,
            )
          : [];
        const [processo] = await consultar<z.infer<typeof c.processoJudicial>>(
          tx,
          sql`select numero_cnj as "numeroCnj", vara, comarca, uf, ${dia('ajuizado_em')} as "ajuizadoEm", liminar,
                     ${dia('liminar_em')} as "liminarEm", ${dia('mandado_em')} as "mandadoEm", atualizado_em as "atualizadoEm"
                from processo_judicial where caso_id = ${req.params.id}`,
        );
        const [extra] = await consultar<Omit<z.infer<typeof c.procedimentoExtrajudicial>, 'prazoNotificacao'>>(
          tx,
          sql`select via, orgao, clausula_destaque as "clausulaDestaque", ${dia('notificado_em')} as "notificadoEm",
                     ${dia('consolidado_em')} as "consolidadoEm", ${dia('certidao_em')} as "certidaoEm",
                     atualizado_em as "atualizadoEm"
                from procedimento_extrajudicial where caso_id = ${req.params.id}`,
        );
        const [mora] = await consultar<z.infer<typeof c.provaMora>>(
          tx,
          sql`select meio, ${dia('enviada_em')} as "enviadaEm", endereco_do_contrato as "enderecoDoContrato",
                     comprovante, atualizado_em as "atualizadoEm"
                from prova_mora where caso_id = ${req.params.id}`,
        );
        const verificacoesRj = await consultar<z.infer<typeof c.verificacaoRj>>(
          tx,
          sql`select v.id::int as id, v.resultado, v.fonte, v.detalhe, v.liberado_pelo_juridico as "liberadoPeloJuridico",
                     v.justificativa, u.nome as "usuarioNome", v.verificado_em as "verificadoEm"
                from verificacao_rj v left join usuario u on u.id = v.usuario_id
               where v.caso_id = ${req.params.id}
               order by v.verificado_em desc, v.id desc`,
        );

        const documento = base?.documento ?? '';
        return {
          status: caso.status,
          rito: caso.rito,
          credor: base?.credorId
            ? { id: base.credorId, nome: base.credorNome!, cnpj: base.credorCnpj, ativo: base.credorAtivo ?? true }
            : null,
          mandatoVigente: mandatoVigente ?? null,
          devedorTipo: documento.length === 14 ? ('PJ' as const) : documento.length === 11 ? ('PF' as const) : null,
          processo: processo ?? null,
          extrajudicial: extra
            ? {
                ...extra,
                prazoNotificacao: extra.notificadoEm ? prazoNotificacaoExtrajudicial(extra.notificadoEm).ultimoDia : null,
              }
            : null,
          mora: mora ?? null,
          verificacoesRj,
          retomada:
            base?.retomadoEm && base.modalidade
              ? { em: base.retomadoEm, modalidade: base.modalidade, comprovante: base.comprovante!, purgaAte: base.purgaAte }
              : null,
        };
      }),
  );

  app.put(
    '/casos/:id/rito',
    { schema: { tags: ['casos'], params, body: definirRitoEntrada, response: { 200: resultadoStatus, 404: c.erro, 409: c.erro } } },
    async (req) =>
      req.banco(async (tx) => {
        const caso = await exigirCasoA(tx, req.params.id);
        await tx.execute(sql`update caso set rito = ${req.body.rito}, credor_id = ${req.body.credorId} where id = ${req.params.id}`);
        return { id: req.params.id, status: caso.status };
      }),
  );

  app.put(
    '/casos/:id/processo',
    { schema: { tags: ['casos'], params, body: processoJudicialEntrada, response: { 200: resultadoStatus, 404: c.erro, 409: c.erro } } },
    async (req) =>
      req.banco(async (tx) => {
        const caso = await exigirCasoA(tx, req.params.id);
        const p = req.body;
        await tx.execute(sql`
          insert into processo_judicial (caso_id, numero_cnj, vara, comarca, uf, ajuizado_em, liminar, liminar_em, mandado_em)
          values (${req.params.id}, ${formatarCnj(p.numeroCnj)}, ${p.vara ?? null}, ${p.comarca}, ${p.uf},
                  ${p.ajuizadoEm ?? null}::date, ${p.liminar}, ${p.liminarEm ?? null}::date, ${p.mandadoEm ?? null}::date)
          on conflict (tenant_id, caso_id) do update set
            numero_cnj = excluded.numero_cnj, vara = excluded.vara, comarca = excluded.comarca, uf = excluded.uf,
            ajuizado_em = excluded.ajuizado_em, liminar = excluded.liminar, liminar_em = excluded.liminar_em,
            mandado_em = excluded.mandado_em`);
        return { id: req.params.id, status: caso.status };
      }),
  );

  app.put(
    '/casos/:id/extrajudicial',
    {
      schema: { tags: ['casos'], params, body: procedimentoExtrajudicialEntrada, response: { 200: resultadoStatus, 404: c.erro, 409: c.erro } },
    },
    async (req) =>
      req.banco(async (tx) => {
        const caso = await exigirCasoA(tx, req.params.id);
        const e = req.body;
        await tx.execute(sql`
          insert into procedimento_extrajudicial (caso_id, via, orgao, clausula_destaque, notificado_em, consolidado_em, certidao_em)
          values (${req.params.id}, ${e.via}, ${e.orgao}, ${e.clausulaDestaque},
                  ${e.notificadoEm ?? null}::date, ${e.consolidadoEm ?? null}::date, ${e.certidaoEm ?? null}::date)
          on conflict (tenant_id, caso_id) do update set
            via = excluded.via, orgao = excluded.orgao, clausula_destaque = excluded.clausula_destaque,
            notificado_em = excluded.notificado_em, consolidado_em = excluded.consolidado_em, certidao_em = excluded.certidao_em`);
        return { id: req.params.id, status: caso.status };
      }),
  );

  app.put(
    '/casos/:id/mora',
    { schema: { tags: ['casos'], params, body: provaMoraEntrada, response: { 200: resultadoStatus, 404: c.erro, 409: c.erro } } },
    async (req) =>
      req.banco(async (tx) => {
        const caso = await exigirCasoA(tx, req.params.id);
        const m = req.body;
        await tx.execute(sql`
          insert into prova_mora (caso_id, meio, enviada_em, endereco_do_contrato, comprovante)
          values (${req.params.id}, ${m.meio}, ${m.enviadaEm}::date, ${m.enderecoDoContrato}, ${m.comprovante})
          on conflict (tenant_id, caso_id) do update set
            meio = excluded.meio, enviada_em = excluded.enviada_em,
            endereco_do_contrato = excluded.endereco_do_contrato, comprovante = excluded.comprovante`);
        return { id: req.params.id, status: caso.status };
      }),
  );

  app.post(
    '/casos/:id/verificacoes-rj',
    { schema: { tags: ['casos'], params, body: verificacaoRjEntrada, response: { 201: c.criado, 404: c.erro, 409: c.erro } } },
    async (req, reply) => {
      const [linha] = await req.banco(async (tx) => {
        await exigirCasoA(tx, req.params.id);
        const v = req.body;
        return consultar<{ id: string }>(
          tx,
          sql`insert into verificacao_rj (caso_id, resultado, fonte, detalhe, liberado_pelo_juridico, justificativa)
              values (${req.params.id}, ${v.resultado}, ${v.fonte}, ${v.detalhe ?? null}, ${v.liberadoPeloJuridico}, ${v.justificativa ?? null})
              returning id::text as id`,
        );
      });
      return reply.code(201).send({ id: linha!.id });
    },
  );

  // -------------------------------------------------------------------------
  // Ciclo
  // -------------------------------------------------------------------------

  /** Próximos passos do caso, cada um com o que falta para dar. Vem da mesma função que o banco usa para recusar. */
  app.get(
    '/casos/:id/acoes',
    { schema: { tags: ['casos'], params, response: { 200: z.array(c.acaoCaso), 404: c.erro, 409: c.erro } } },
    async (req) =>
      req.banco(async (tx) => {
        const caso = await exigirCasoA(tx, req.params.id);
        const linhas = await consultar<{ para: StatusRecuperacao; pendencias: string[] }>(
          tx,
          sql`select t.para, pendencias_transicao(k, t.para) as pendencias
                from caso k join transicao_recuperacao t on t.de = k.status
               where k.id = ${req.params.id}`,
        );
        const ordem = destinosDe(caso.status);
        return linhas
          .sort((a, b) => ordem.indexOf(a.para) - ordem.indexOf(b.para))
          .map((l) => ({ para: l.para, rotulo: rotuloDaAcao(caso.status, l.para), pendencias: l.pendencias ?? [] }));
      }),
  );

  app.post(
    '/casos/:id/transicao',
    { schema: { tags: ['casos'], params, body: transicaoEntrada, response: { 200: resultadoStatus, 404: c.erro, 409: c.erro } } },
    async (req) =>
      req.banco(async (tx) => {
        await exigirCasoA(tx, req.params.id);
        const t = req.body;
        if (t.para === 'Retomado') {
          if (t.modalidade === 'apreensao_extrajudicial' && t.condutaConforme !== true) {
            throw new Recusa(
              409,
              'na apreensão extrajudicial, declare que não houve violência, ingresso em domicílio nem exposição do devedor',
            );
          }
          const purga = prazoDePurga(t.modalidade, t.em);
          await definirEvento(tx, { conduta_conforme: t.condutaConforme ?? null });
          await tx.execute(sql`
            update caso set status = 'Retomado', retomado_em = ${t.em.toISOString()}::timestamptz,
                   modalidade_retomada = ${t.modalidade}, comprovante_retomada = ${t.comprovante},
                   purga_ate = ${purga ? purga.ate.toISOString() : null}::timestamptz
             where id = ${req.params.id}`);
        } else {
          if ('motivo' in t) await definirEvento(tx, { motivo: t.motivo });
          if ('local' in t) await definirEvento(tx, { local: t.local });
          await tx.execute(sql`update caso set status = ${t.para} where id = ${req.params.id}`);
        }
        return { id: req.params.id, status: t.para };
      }),
  );

  /**
   * Resistência na abordagem. A retomada é abortada: no extrajudicial e no
   * amigável o caso converte para o rito judicial (STF: sem violência, sem
   * ingresso em domicílio); no judicial, volta a campo para o oficial agir.
   */
  app.post(
    '/casos/:id/resistencia',
    { schema: { tags: ['casos'], params, body: resistenciaEntrada, response: { 200: resultadoStatus, 404: c.erro, 409: c.erro } } },
    async (req) =>
      req.banco(async (tx) => {
        const caso = await exigirCasoA(tx, req.params.id);
        if (caso.status !== 'Localizado') throw new Recusa(409, 'resistência se registra com o bem localizado');
        await definirEvento(tx, { motivo: `resistência na abordagem: ${req.body.relato}`, acao: 'resistencia' });
        if (caso.rito === 'judicial') {
          await tx.execute(sql`update caso set status = 'Em Campo' where id = ${req.params.id}`);
          return { id: req.params.id, status: 'Em Campo' };
        }
        await tx.execute(sql`update caso set status = 'Em Análise', rito = 'judicial' where id = ${req.params.id}`);
        return { id: req.params.id, status: 'Em Análise' };
      }),
  );
};
