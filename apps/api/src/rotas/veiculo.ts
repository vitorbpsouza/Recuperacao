/**
 * Dados do veículo com procedência: valor FIPE, verificação de fornecedor
 * contratado (auditada como consulta) e avistamentos.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Tx } from '@workspace/db';
import { avistamentoEntrada, consultaFipeEntrada, normalizarPlaca, TIPOS_FIPE, verificacaoVeicularEntrada } from '@workspace/domain';

import * as c from '../contratos.ts';
import type { ClienteFipe } from '../integracoes/fipe.ts';
import { registrarConsulta } from '../servicos/auditoria.ts';

const params = z.object({ id: z.string() });
const consultar = async <T>(tx: Tx, q: SQL): Promise<T[]> => ((await tx.execute(q)) as unknown as { rows: T[] }).rows;

const opcao = z.object({ codigo: z.string(), nome: z.string() });

export const rotasVeiculo: FastifyPluginAsyncZod<{ fipe: ClienteFipe }> = async (app, { fipe }) => {
  // -------------------------------------------------------------------------
  // FIPE
  // -------------------------------------------------------------------------

  const tipo = z.object({ tipo: z.enum(TIPOS_FIPE) });

  app.get(
    '/fipe/:tipo/marcas',
    { schema: { tags: ['fipe'], params: tipo, response: { 200: z.array(opcao), 502: c.erro } } },
    async (req) => fipe.marcas(req.params.tipo),
  );
  app.get(
    '/fipe/:tipo/marcas/:marca/modelos',
    { schema: { tags: ['fipe'], params: tipo.extend({ marca: z.string() }), response: { 200: z.array(opcao), 502: c.erro } } },
    async (req) => fipe.modelos(req.params.tipo, req.params.marca),
  );
  app.get(
    '/fipe/:tipo/marcas/:marca/modelos/:modelo/anos',
    {
      schema: {
        tags: ['fipe'],
        params: tipo.extend({ marca: z.string(), modelo: z.string() }),
        response: { 200: z.array(opcao), 502: c.erro },
      },
    },
    async (req) => fipe.anos(req.params.tipo, req.params.marca, req.params.modelo),
  );

  /** Consulta o valor e guarda no veículo do caso, com código e mês de referência. */
  app.post(
    '/casos/:id/fipe',
    { schema: { tags: ['fipe'], params, body: consultaFipeEntrada, response: { 200: c.valorFipe, 404: c.erro, 502: c.erro } } },
    async (req, reply) => {
      const [existe] = await req.banco((tx) => consultar(tx, sql`select 1 from caso where id = ${req.params.id}`));
      if (!existe) return reply.code(404).send({ erro: 'caso não encontrado' });
      const { tipo: t, marca, modelo, ano } = req.body;
      const v = await fipe.valor(t, marca, modelo, ano);
      await req.banco((tx) =>
        tx.execute(sql`
          update ativo set valor_fipe = ${v.valor}, fipe_codigo = ${v.codigoFipe},
                 fipe_referencia = ${v.mesReferencia}, fipe_consultado_em = now()
           where id = (select ativo_id from caso where id = ${req.params.id})`),
      );
      return v;
    },
  );

  // -------------------------------------------------------------------------
  // Verificação veicular (fornecedor contratado)
  // -------------------------------------------------------------------------

  app.post(
    '/casos/:id/verificacao-veicular',
    {
      schema: {
        tags: ['veiculo'],
        params,
        body: verificacaoVeicularEntrada,
        response: { 201: c.criado, 404: c.erro, 409: c.erro },
      },
    },
    async (req, reply) => {
      const v = req.body;
      const resultado = await req.banco(async (tx) => {
        const [k] = await consultar<{ placa: string; ativoId: string; origem: string }>(
          tx,
          sql`select a.placa, k.ativo_id as "ativoId", k.origem from caso k join ativo a on a.id = k.ativo_id where k.id = ${req.params.id}`,
        );
        if (!k) return { codigo: 404 as const, erro: 'caso não encontrado' };
        if (normalizarPlaca(v.veiculo.placa) !== k.placa) {
          return { codigo: 409 as const, erro: `o relatório é da placa ${normalizarPlaca(v.veiculo.placa)}, e o caso é da ${k.placa}` };
        }

        // A consulta fica na trilha com fornecedor, contrato, base legal e
        // justificativa; os campos, não os valores.
        const campos = [
          ...Object.entries(v.veiculo)
            .filter(([, x]) => x !== undefined)
            .map(([chave]) => chave),
          ...(['renajud', 'rouboFurto', 'leilao', 'alienacaoFiduciaria', 'anoLicenciamento'] as const).filter((x) => v[x] !== undefined),
          ...(v.restricoes.length ? ['restricoes'] : []),
        ];
        const consulta = await registrarConsulta(tx, req.usuario!.id, {
          casoId: req.params.id,
          bureauId: v.bureauId,
          baseLegal: v.baseLegal,
          justificativa: v.justificativa,
          camposRetornados: campos,
        });

        const [linha] = await consultar<{ id: string }>(
          tx,
          sql`insert into verificacao_veicular
                (caso_id, consulta_id, situacao, restricoes, renajud, roubo_furto, leilao, alienacao_fiduciaria, ano_licenciamento)
              values (${req.params.id}, ${consulta.id}, ${v.veiculo.situacao ?? null}, array(select jsonb_array_elements_text(${JSON.stringify(v.restricoes)}::jsonb)),
                      ${v.renajud ?? null}, ${v.rouboFurto ?? null}, ${v.leilao ?? null}, ${v.alienacaoFiduciaria ?? null},
                      ${v.anoLicenciamento ?? null})
              returning id::text as id`,
        );

        // Completa o veículo com o que o fornecedor trouxe (só o que veio).
        await tx.execute(sql`
          update ativo set
            chassi  = coalesce(${v.veiculo.chassi ?? null}, chassi),
            renavam = coalesce(${v.veiculo.renavam ?? null}, renavam),
            modelo  = coalesce(${v.veiculo.modelo ?? null}, modelo),
            cor     = coalesce(${v.veiculo.cor ?? null}, cor),
            ano     = coalesce(${v.veiculo.anoModelo ?? null}::int, ano)
          where id = ${k.ativoId}`);

        // Plano B: RENAJUD e gravame verificados destravam (ou travam) a transferência.
        if (k.origem === 'lead_proprio') {
          await tx.execute(sql`
            update caso set
              renajud_ativo   = coalesce(${v.renajud ?? null}::boolean, renajud_ativo),
              gravame_baixado = coalesce(not ${v.alienacaoFiduciaria ?? null}::boolean, gravame_baixado)
            where id = ${req.params.id}`);
        }
        return { id: linha!.id, codigo: 201 as const, erro: null };
      });
      if (resultado.codigo !== 201) return reply.code(resultado.codigo).send({ erro: resultado.erro });
      return reply.code(201).send({ id: resultado.id! });
    },
  );

  app.get(
    '/casos/:id/verificacoes-veiculares',
    { schema: { tags: ['veiculo'], params, response: { 200: z.array(c.verificacaoVeicular) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.verificacaoVeicular>>(
          tx,
          sql`select v.id::int as id, b.nome as fornecedor, q.base_legal as "baseLegal", q.justificativa,
                     v.situacao, v.restricoes, v.renajud, v.roubo_furto as "rouboFurto", v.leilao,
                     v.alienacao_fiduciaria as "alienacaoFiduciaria", v.ano_licenciamento as "anoLicenciamento",
                     u.nome as "usuarioNome", v.verificado_em as "verificadoEm"
                from verificacao_veicular v
                join consulta_auditoria q on q.id = v.consulta_id
                join bureau b on b.id = q.bureau_id
                left join usuario u on u.id = v.usuario_id
               where v.caso_id = ${req.params.id}
               order by v.verificado_em desc, v.id desc`,
        ),
      ),
  );

  // -------------------------------------------------------------------------
  // Avistamentos (Plano A)
  // -------------------------------------------------------------------------

  app.get(
    '/casos/:id/avistamentos',
    { schema: { tags: ['veiculo'], params, response: { 200: z.array(c.avistamento) } } },
    async (req) =>
      req.banco((tx) =>
        consultar<z.infer<typeof c.avistamento>>(
          tx,
          sql`select a.id::int as id, a.observado_em as "observadoEm", a.registrado_em as "registradoEm",
                     a.latitude::float8 as latitude, a.longitude::float8 as longitude, a.descricao, a.fonte,
                     u.nome as "usuarioNome"
                from avistamento a left join usuario u on u.id = a.usuario_id
               where a.caso_id = ${req.params.id}
               order by a.observado_em desc, a.id desc`,
        ),
      ),
  );

  app.post(
    '/casos/:id/avistamentos',
    { schema: { tags: ['veiculo'], params, body: avistamentoEntrada, response: { 201: c.criado, 404: c.erro, 409: c.erro } } },
    async (req, reply) => {
      const a = req.body;
      const linhas = await req.banco(async (tx) => {
        const [k] = await consultar<{ finalidade: string }>(tx, sql`select finalidade from caso where id = ${req.params.id}`);
        if (!k) return null;
        return consultar<{ id: string }>(
          tx,
          sql`insert into avistamento (caso_id, observado_em, latitude, longitude, descricao, fonte)
              values (${req.params.id}, ${a.observadoEm.toISOString()}::timestamptz, ${a.latitude ?? null}, ${a.longitude ?? null},
                      ${a.descricao}, ${a.fonte})
              returning id::text as id`,
        );
      });
      if (!linhas) return reply.code(404).send({ erro: 'caso não encontrado' });
      return reply.code(201).send({ id: linhas[0]!.id });
    },
  );
};
