/**
 * Texto colado e o que saiu dele: pessoas, contatos, endereços e dados sem
 * campo próprio.
 *
 * Dado pessoal segue a regra da ficha: a lista mostra só o resumo mascarado;
 * ver o dado exige finalidade declarada, e cada abertura vai para a trilha de
 * acesso. Perfil, crédito, parentes e o texto original só para admin e gestor.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Tx } from '@workspace/db';
import { colarRelatorioEntrada, finalidadeEntrada, type PapelPessoa } from '@workspace/domain';

import { exigirPapel } from '../auth/plugin.ts';
import type { Papel } from '../auth/sessao.ts';
import * as c from '../contratos.ts';
import { ErroDeRelatorio, importarRelatorio } from '../servicos/relatorio.ts';

const params = z.object({ id: z.string() });
const consultar = async <T>(tx: Tx, q: SQL): Promise<T[]> => ((await tx.execute(q)) as unknown as { rows: T[] }).rows;

/** Quem vê perfil, crédito, parentes e o texto original. */
export const VEEM_SENSIVEL: Papel[] = ['admin', 'gestor'];

const iniciais = (nome: string | null) =>
  nome
    ? nome
        .split(/\s+/)
        .filter((p) => p.length > 2)
        .map((p) => `${p[0]}.`)
        .join(' ')
    : null;

const documentoMascarado = (doc: string | null) =>
  !doc ? null : doc.length === 11 ? `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**` : `**.${doc.slice(2, 5)}.${doc.slice(5, 8)}/****-**`;

interface LinhaPessoa {
  id: string;
  papel: PapelPessoa;
  vinculo: string | null;
  parenteDe: string | null;
  documento: string | null;
  tipoPessoa: string | null;
  nome: string | null;
  obito: boolean | null;
  contatos: number;
  enderecos: number;
}

const pessoasDoCaso = (tx: Tx, casoId: string) =>
  consultar<LinhaPessoa>(
    tx,
    sql`select p.id, cp.papel, cp.vinculo, cp.parente_de as "parenteDe", p.documento, p.tipo_pessoa as "tipoPessoa", p.nome, p.obito,
               (select count(*)::int from pessoa_contato x where x.pessoa_id = p.id) as contatos,
               (select count(*)::int from pessoa_endereco x where x.pessoa_id = p.id) as enderecos
          from caso_pessoa cp join pessoa p on p.id = cp.pessoa_id
         where cp.caso_id = ${casoId}
         order by array_position(array['devedor','proprietario','terceiro_possuidor','avalista','outro','parente'], cp.papel), p.nome`,
  );

/** Alertas que mudam a diligência: proprietário diferente do devedor, óbito. */
const alertasDe = (linhas: LinhaPessoa[]) => {
  const alertas: string[] = [];
  const devedores = new Set(linhas.filter((l) => l.papel === 'devedor').map((l) => l.id));
  const proprietarios = linhas.filter((l) => l.papel === 'proprietario');
  if (devedores.size && proprietarios.some((p) => !devedores.has(p.id))) {
    alertas.push('O proprietário atual (DETRAN) não é o devedor: confira contrato de gaveta ou terceiro possuidor antes da diligência.');
  }
  if (linhas.some((l) => l.papel === 'devedor' && l.obito)) {
    alertas.push('Devedor com registro de óbito: o polo passivo passa a ser o espólio.');
  }
  return alertas;
};

export const rotasRelatorios: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/casos/:id/relatorios',
    {
      schema: {
        tags: ['relatorios'],
        params,
        body: colarRelatorioEntrada,
        response: { 201: c.resumoImportacao, 404: c.erro, 409: c.erro, 422: c.erro },
      },
    },
    async (req, reply) => {
      try {
        const resumo = await req.banco((tx) => importarRelatorio(tx, req.usuario!.id, { casoId: req.params.id, ...req.body }));
        return reply.code(201).send(resumo);
      } catch (e) {
        if (e instanceof ErroDeRelatorio) return reply.code(e.statusCode).send({ erro: e.message });
        throw e;
      }
    },
  );

  /**
   * O documento colado é o do devedor? Só sim ou não, sem revelar o documento:
   * a prévia da tela decide se precisa perguntar o papel da pessoa.
   */
  app.post(
    '/casos/:id/conferir-devedor',
    {
      schema: {
        tags: ['relatorios'],
        params,
        body: z.object({ documentos: z.array(z.string().regex(/^[0-9A-Z]{11,14}$/)).max(20) }).strict(),
        response: { 200: z.object({ iguais: z.array(z.boolean()) }), 404: c.erro },
      },
    },
    async (req, reply) =>
      req.banco(async (tx) => {
        const [k] = await consultar<{ doc: string | null }>(
          tx,
          sql`select a.devedor_doc as doc from caso k join ativo a on a.id = k.ativo_id where k.id = ${req.params.id}`,
        );
        if (!k) return reply.code(404).send({ erro: 'caso não encontrado' });
        return { iguais: req.body.documentos.map((d) => !!k.doc && d === k.doc) };
      }),
  );

  app.get(
    '/casos/:id/relatorios',
    { schema: { tags: ['relatorios'], params, response: { 200: z.array(c.relatorioColado) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.relatorioColado>>(
          tx,
          sql`select r.id::int as id, r.via, r.secoes, r.resumo, b.nome as fornecedor, u.nome as "usuarioNome",
                     r.colado_em as "coladoEm", length(r.texto)::int as tamanho
                from relatorio_colado r
                left join bureau b on b.id = r.bureau_id
                left join usuario u on u.id = r.usuario_id
               where r.caso_id = ${req.params.id}
               order by r.colado_em desc, r.id desc`,
        ),
      ),
  );

  /** O texto original, como foi colado. Tem dado sensível: admin e gestor, com finalidade. */
  app.post(
    '/casos/:id/relatorios/:relatorioId/texto',
    {
      preHandler: exigirPapel(...VEEM_SENSIVEL),
      schema: {
        tags: ['relatorios'],
        params: z.object({ id: z.string(), relatorioId: z.coerce.number().int() }),
        body: finalidadeEntrada,
        response: { 200: z.object({ texto: z.string() }), 404: c.erro },
      },
    },
    async (req, reply) =>
      req.banco(async (tx) => {
        const [r] = await consultar<{ texto: string }>(
          tx,
          sql`select texto from relatorio_colado where id = ${req.params.relatorioId} and caso_id = ${req.params.id}`,
        );
        if (!r) return reply.code(404).send({ erro: 'relatório não encontrado' });
        await tx.execute(sql`
          insert into acesso_dado_pessoal (caso_id, usuario_id, campos, finalidade)
          values (${req.params.id}, ${req.usuario!.id}, array['relatorio_colado:' || ${req.params.relatorioId}::text], ${req.body.finalidade})`);
        return r;
      }),
  );

  /** O que não tem campo próprio, sem o sensível: aparece na aba do veículo e da pessoa. */
  app.get(
    '/casos/:id/dados-extras',
    { schema: { tags: ['relatorios'], params, response: { 200: z.array(c.dadoExtra) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.dadoExtra>>(
          tx,
          sql`select d.id::int as id, d.entidade, d.pessoa_id as "pessoaId", d.secao, d.chave, d.rotulo, d.valor, d.sensivel, d.novo,
                     d.promovido_em as "promovidoEm", d.criado_em as "criadoEm"
                from dado_extra d
               where d.caso_id = ${req.params.id} and not d.sensivel and d.entidade <> 'pessoa'
               order by d.secao, d.id`,
        ),
      ),
  );

  /** Pessoas do caso, mascaradas: papel, iniciais, documento parcial e quantos contatos há. */
  app.get(
    '/casos/:id/pessoas',
    { schema: { tags: ['relatorios'], params, response: { 200: c.pessoasDoCaso } } },
    async (req) =>
      req.banco(async (tx) => {
        const linhas = await pessoasDoCaso(tx, req.params.id);
        const sensivel = VEEM_SENSIVEL.includes(req.usuario!.papel);
        return {
          alertas: alertasDe(linhas),
          pessoas: linhas
            .filter((l) => sensivel || l.papel !== 'parente')
            .map((l) => ({
              id: l.id,
              papel: l.papel,
              vinculo: l.vinculo,
              iniciais: iniciais(l.nome),
              documentoMascarado: documentoMascarado(l.documento),
              tipoPessoa: l.tipoPessoa as 'PF' | 'PJ' | null,
              obito: l.obito,
              contatos: l.contatos,
              enderecos: l.enderecos,
            })),
        };
      }),
  );

  /**
   * Revela as pessoas do caso com contatos e endereços. Admin e gestor recebem
   * também perfil, crédito e parentes. A trilha registra o que foi aberto.
   */
  app.post(
    '/casos/:id/pessoas/revelar',
    {
      schema: { tags: ['relatorios'], params, body: finalidadeEntrada, response: { 200: c.pessoasReveladas, 404: c.erro } },
    },
    async (req, reply) =>
      req.banco(async (tx) => {
        const [existe] = await consultar(tx, sql`select 1 from caso where id = ${req.params.id}`);
        if (!existe) return reply.code(404).send({ erro: 'caso não encontrado' });
        const sensivel = VEEM_SENSIVEL.includes(req.usuario!.papel);
        const linhas = (await pessoasDoCaso(tx, req.params.id)).filter((l) => sensivel || l.papel !== 'parente');
        const ids = [...new Set(linhas.map((l) => l.id))];
        if (!ids.length) return { alertas: [], pessoas: [], sensivelLiberado: sensivel };
        const lista = sql.join(ids.map((x) => sql`${x}`), sql`, `);

        const fichas = await consultar<Record<string, unknown> & { id: string }>(
          tx,
          sql`select id, documento, tipo_pessoa as "tipoPessoa", nome, nome_civil as "nomeCivil", nome_mae as "nomeMae", nome_pai as "nomePai",
                     to_char(nascimento, 'YYYY-MM-DD') as nascimento, sexo, estado_civil as "estadoCivil", rg, rg_orgao as "rgOrgao", rg_uf as "rgUf",
                     titulo_eleitor as "tituloEleitor", profissao, nacionalidade, situacao_cadastral as "situacaoCadastral", obito,
                     atualizado_em as "atualizadoEm"
                from pessoa where id in (${lista})`,
        );
        const contatos = await consultar<z.infer<typeof c.contatoPessoa> & { pessoaId: string }>(
          tx,
          sql`select id::int as id, pessoa_id as "pessoaId", tipo, valor, original, valido, whatsapp, whatsapp_conferido_em as "whatsappConferidoEm",
                     fontes
                from pessoa_contato where pessoa_id in (${lista})
               order by valido desc, jsonb_array_length(fontes) desc, id`,
        );
        const enderecos = await consultar<z.infer<typeof c.enderecoPessoa> & { pessoaId: string }>(
          tx,
          sql`select id::int as id, pessoa_id as "pessoaId", logradouro, numero, complemento, bairro, cidade, uf, cep, variantes, fontes,
                     latitude::float8 as latitude, longitude::float8 as longitude
                from pessoa_endereco where pessoa_id in (${lista})
               order by cardinality(variantes) + cardinality(fontes) desc, id`,
        );
        const extras = await consultar<z.infer<typeof c.dadoExtra>>(
          tx,
          sql`select d.id::int as id, d.entidade, d.pessoa_id as "pessoaId", d.secao, d.chave, d.rotulo, d.valor, d.sensivel, d.novo,
                     d.promovido_em as "promovidoEm", d.criado_em as "criadoEm"
                from dado_extra d
               where d.caso_id = ${req.params.id} and d.entidade = 'pessoa' and (${sensivel} or not d.sensivel)
               order by d.secao, d.id`,
        );

        const campos = ['pessoa', 'contatos', 'enderecos', ...(sensivel ? ['perfil_e_credito', 'parentes'] : [])];
        await tx.execute(sql`
          insert into acesso_dado_pessoal (caso_id, usuario_id, campos, finalidade)
          values (${req.params.id}, ${req.usuario!.id}, array(select jsonb_array_elements_text(${JSON.stringify(campos)}::jsonb)),
                  ${req.body.finalidade})`);

        const porId = new Map(fichas.map((f) => [f.id, f]));
        return {
          alertas: alertasDe(linhas),
          sensivelLiberado: sensivel,
          pessoas: linhas.map((l) => ({
            ...(porId.get(l.id) as object),
            id: l.id,
            papel: l.papel,
            vinculo: l.vinculo,
            parenteDe: l.parenteDe,
            contatos: contatos.filter((x) => x.pessoaId === l.id).map(({ pessoaId: _, ...x }) => x),
            enderecos: enderecos.filter((x) => x.pessoaId === l.id).map(({ pessoaId: _, ...x }) => x),
            extras: extras.filter((x) => x.pessoaId === l.id),
          })) as z.infer<typeof c.pessoasReveladas>['pessoas'],
        };
      }),
  );

  /**
   * Campos que os relatórios trouxeram e o sistema ainda não tem: o que
   * precisa virar coluna no próximo deploy. O valor de exemplo nunca é de
   * dado sensível.
   */
  app.get(
    '/campos-novos',
    {
      preHandler: exigirPapel('admin', 'gestor', 'auditor'),
      schema: { tags: ['relatorios'], response: { 200: z.array(c.campoNovo) } },
    },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.campoNovo>>(
          tx,
          sql`select d.entidade, d.secao, d.chave, min(d.rotulo) as rotulo, count(*)::int as ocorrencias,
                     count(distinct d.caso_id)::int as casos,
                     (array_agg(d.valor order by d.id desc) filter (where not d.sensivel))[1] as exemplo,
                     min(d.criado_em) as "primeiraVez", max(d.criado_em) as "ultimaVez"
                from dado_extra d
               where d.novo and d.promovido_em is null
               group by d.entidade, d.secao, d.chave
               order by count(*) desc, min(d.criado_em)`,
        ),
      ),
  );
};
