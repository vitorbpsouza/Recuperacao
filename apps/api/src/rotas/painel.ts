/**
 * Painel executivo do Plano A, calculado no banco com o dado real.
 *
 * Sem dado, sem número: taxa sem casos é nula, mapa só com coordenada de
 * avistamento, tendência só com meses que existem. As fórmulas de etapa são
 * as de @workspace/domain (ETAPAS_RECUPERACAO), para o painel e os relatórios
 * contarem igual.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Tx } from '@workspace/db';
import { ETAPAS_RECUPERACAO } from '@workspace/domain';

import * as c from '../contratos.ts';

const consultar = async <T>(tx: Tx, q: SQL): Promise<T[]> => ((await tx.execute(q)) as unknown as { rows: T[] }).rows;
const lista = (xs: readonly string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

const CAMPO = lista(ETAPAS_RECUPERACAO.campo);
const RETOMADOS = lista(ETAPAS_RECUPERACAO.retomados);
const ANDAMENTO = lista([...ETAPAS_RECUPERACAO.preparo, ...ETAPAS_RECUPERACAO.campo]);
const SEM_EXITO = lista(ETAPAS_RECUPERACAO.semExito);
/** Caso em andamento sem nenhum evento há mais que isso: alerta de abandono. */
const DIAS_PARADO = 7;

export const rotasPainel: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/painel/recuperacao',
    { schema: { tags: ['painel'], response: { 200: c.painelRecuperacao } } },
    async (req) =>
      req.banco(async (tx) => {
        const base = sql`from caso k join ativo a on a.id = k.ativo_id where k.origem = 'plataforma_credor'`;

        const [valores] = await consultar<{ carteira: number; valorDivida: number | null; fipeRetomados: number | null; fipeCarteira: number | null }>(
          tx,
          sql`select count(*)::int as carteira,
                     sum(a.valor_divida)::float8 as "valorDivida",
                     sum(a.valor_fipe) filter (where k.status in (${RETOMADOS}))::float8 as "fipeRetomados",
                     sum(a.valor_fipe)::float8 as "fipeCarteira"
                ${base}`,
        );

        const mapa = await consultar<z.infer<typeof c.pontoMapa>>(
          tx,
          sql`select distinct on (k.id) k.id as "casoId", a.placa, a.modelo, k.status, v.latitude::float8 as latitude,
                     v.longitude::float8 as longitude, v.observado_em as "observadoEm", v.fonte, v.descricao
                from caso k join ativo a on a.id = k.ativo_id
                join avistamento v on v.caso_id = k.id and v.latitude is not null
               where k.origem = 'plataforma_credor'
               order by k.id, v.observado_em desc`,
        );

        const maisVistos = await consultar<z.infer<typeof c.ativoMaisVisto>>(
          tx,
          sql`select k.id as "casoId", a.placa, a.modelo, k.status, count(v.id)::int as avistamentos,
                     max(v.observado_em) as "ultimoEm", count(distinct v.descricao)::int as locais
                from caso k join ativo a on a.id = k.ativo_id join avistamento v on v.caso_id = k.id
               where k.origem = 'plataforma_credor'
               group by k.id, a.placa, a.modelo, k.status
               order by count(v.id) desc, max(v.observado_em) desc
               limit 10`,
        );

        const porCidade = await consultar<z.infer<typeof c.contagemCidade>>(
          tx,
          sql`select coalesce(a.cidade, 'Sem cidade') as cidade, a.uf, count(*)::int as total,
                     count(*) filter (where k.status in (${RETOMADOS}))::int as retomados,
                     count(*) filter (where k.status in (${CAMPO}))::int as "emCampo"
                ${base}
               group by 1, 2 order by count(*) desc limit 12`,
        );

        const porCredor = await consultar<z.infer<typeof c.contagemCredor>>(
          tx,
          sql`select coalesce(cr.nome, a.credor_nome, 'Sem credor') as credor, count(*)::int as total,
                     count(*) filter (where k.status in (${RETOMADOS}))::int as retomados,
                     sum(a.valor_divida)::float8 as "valorDivida"
                from caso k join ativo a on a.id = k.ativo_id left join credor cr on cr.id = k.credor_id
               where k.origem = 'plataforma_credor'
               group by 1 order by count(*) desc`,
        );

        const recuperadores = await consultar<z.infer<typeof c.desempenhoRecuperador>>(
          tx,
          sql`select r.id, r.nome, r.status, r.cidades,
                     count(k.id)::int as casos,
                     count(k.id) filter (where k.status in (${RETOMADOS}))::int as retomados,
                     count(k.id) filter (where k.status in (${CAMPO}))::int as "emCampo",
                     count(k.id) filter (where k.status in (${SEM_EXITO}))::int as "semExito"
                from recuperador r left join caso k on k.recuperador_id = r.id
               group by r.id, r.nome, r.status, r.cidades
               order by count(k.id) filter (where k.status in (${RETOMADOS})) desc, count(k.id) desc`,
        );

        const alertas = await consultar<z.infer<typeof c.alertaCaso>>(
          tx,
          sql`select * from (
                select k.id as "casoId", a.placa, a.modelo, k.status, 'prazo_vencido' as tipo,
                       'Prazo máximo vencido com o caso em andamento' as motivo, k.prazo_maximo as desde
                  ${base} and k.status in (${CAMPO}) and k.prazo_maximo < now()
                union all
                select k.id, a.placa, a.modelo, k.status, 'prazo_48h', 'Prazo máximo vence nas próximas 48 horas', k.prazo_maximo
                  ${base} and k.status in (${CAMPO}) and k.prazo_maximo between now() and now() + interval '48 hours'
                union all
                select k.id, a.placa, a.modelo, k.status, 'aceite_vencido', 'Recuperador não aceitou no prazo', k.prazo_vinculo
                  ${base} and k.status = 'Distribuído' and k.prazo_vinculo < now()
                union all
                select k.id, a.placa, a.modelo, k.status, 'parado', ${`Sem movimentação há mais de ${DIAS_PARADO} dias`}::text,
                       (select max(e.ocorrido_em) from caso_evento e where e.caso_id = k.id)
                  ${base} and k.status in (${ANDAMENTO})
                   and (select max(e.ocorrido_em) from caso_evento e where e.caso_id = k.id) < now() - make_interval(days => ${DIAS_PARADO})
                union all
                select k.id, a.placa, a.modelo, k.status, 'proprietario_diferente', 'Proprietário atual (DETRAN) não é o devedor',
                       (select max(cp.criado_em) from caso_pessoa cp where cp.caso_id = k.id)
                  ${base} and k.status in (${ANDAMENTO})
                   and exists (select 1 from caso_pessoa d where d.caso_id = k.id and d.papel = 'devedor')
                   and exists (select 1 from caso_pessoa p where p.caso_id = k.id and p.papel = 'proprietario'
                                  and not exists (select 1 from caso_pessoa d where d.caso_id = k.id and d.papel = 'devedor' and d.pessoa_id = p.pessoa_id))
              ) x order by desde nulls last limit 30`,
        );

        const evolucao = await consultar<z.infer<typeof c.pontoEvolucao>>(
          tx,
          sql`with meses as (
                select to_char(m, 'YYYY-MM') as mes
                  from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
              )
              select meses.mes,
                     (select count(*)::int ${base} and to_char(a.data_recebimento, 'YYYY-MM') = meses.mes) as recebidos,
                     (select count(*)::int ${base} and to_char(k.retomado_em, 'YYYY-MM') = meses.mes) as retomados
                from meses order by meses.mes`,
        );

        const status = await consultar<{ status: string; quantidade: number }>(
          tx,
          sql`select k.status, count(*)::int as quantidade ${base} group by k.status`,
        );

        return {
          valorDivida: valores?.valorDivida ?? null,
          fipeCarteira: valores?.fipeCarteira ?? null,
          fipeRetomados: valores?.fipeRetomados ?? null,
          status,
          mapa,
          maisVistos,
          porCidade,
          porCredor,
          recuperadores,
          alertas,
          evolucao,
        };
      }),
  );
};
