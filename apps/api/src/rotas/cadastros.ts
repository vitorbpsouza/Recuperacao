import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { schema } from '@workspace/db';
import { normalizarPlaca, novoAtivoEntrada, novoRecuperadorEntrada } from '@workspace/domain';

import { exigirPapel } from '../auth/plugin.ts';
import * as c from '../contratos.ts';

const { ativo, bureau, fonteAtivo, recuperador } = schema;

/**
 * Cadastros de apoio.
 *
 * Toda leitura passa pelo RLS: um operador do Plano B não lista ativos com
 * caso no Plano A (com o nome e o documento do devedor), nem a rede de campo,
 * nem os repasses — no sistema anterior, essas rotas devolviam tudo a qualquer
 * usuário autenticado.
 */
export const rotasCadastros: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/ativos',
    { schema: { tags: ['cadastros'], response: { 200: z.array(c.ativo) } } },
    async (req) =>
      req.banco((tx) =>
        tx
          .select({
            id: ativo.id,
            placa: ativo.placa,
            chassi: ativo.chassi,
            modelo: ativo.modelo,
            ano: ativo.ano,
            cor: ativo.cor,
            devedorNome: ativo.devedorNome,
            devedorDoc: ativo.devedorDoc,
            credorNome: ativo.credorNome,
            valorDivida: ativo.valorDivida,
            cidade: ativo.cidade,
            uf: ativo.uf,
            dataRecebimento: ativo.dataRecebimento,
            criadoEm: ativo.criadoEm,
          })
          .from(ativo)
          .orderBy(desc(ativo.criadoEm)),
      ),
  );

  app.post(
    '/ativos',
    { schema: { tags: ['cadastros'], body: novoAtivoEntrada, response: { 201: c.criado, 409: c.erro } } },
    async (req, reply) => {
      const corpo = req.body;
      const [novo] = await req.banco((tx) =>
        tx
          .insert(ativo)
          .values({ ...corpo, placa: normalizarPlaca(corpo.placa) })
          .returning({ id: ativo.id }),
      );
      return reply.code(201).send({ id: novo!.id });
    },
  );

  app.get(
    '/fontes',
    { schema: { tags: ['cadastros'], response: { 200: z.array(c.fonte) } } },
    async (req) =>
      req.banco((tx) =>
        tx
          .select({
            id: fonteAtivo.id,
            nome: fonteAtivo.nome,
            tipo: fonteAtivo.tipo,
            ingestao: fonteAtivo.ingestao,
            finalidadePermitida: fonteAtivo.finalidadePermitida,
            termoDeUsoUrl: fonteAtivo.termoDeUsoUrl,
            credorNome: fonteAtivo.credorNome,
          })
          .from(fonteAtivo)
          .where(eq(fonteAtivo.ativa, true)),
      ),
  );

  app.get(
    '/recuperadores',
    { schema: { tags: ['cadastros'], response: { 200: z.array(c.recuperador) } } },
    async (req) =>
      req.banco((tx) =>
        tx
          .select({
            id: recuperador.id,
            nome: recuperador.nome,
            documento: recuperador.documento,
            telefone: recuperador.telefone,
            cidades: recuperador.cidades,
            status: recuperador.status,
            score: recuperador.score,
            taxaRecuperacao: recuperador.taxaRecuperacao,
            dataCadastro: recuperador.dataCadastro,
          })
          .from(recuperador)
          .orderBy(desc(recuperador.score)),
      ),
  );

  app.post(
    '/recuperadores',
    {
      preHandler: exigirPapel('admin'),
      schema: { tags: ['cadastros'], body: novoRecuperadorEntrada, response: { 201: c.criado, 409: c.erro } },
    },
    async (req, reply) => {
      const [novo] = await req.banco((tx) =>
        tx.insert(recuperador).values(req.body).returning({ id: recuperador.id }),
      );
      return reply.code(201).send({ id: novo!.id });
    },
  );

  // A chave de API do bureau não está no banco nem é exposta — nem o nome da
  // variável de ambiente sai daqui. Só a referência do contrato.
  app.get(
    '/bureaus',
    { schema: { tags: ['cadastros'], response: { 200: z.array(c.bureau) } } },
    async (req) =>
      req.banco((tx) =>
        tx
          .select({
            id: bureau.id,
            nome: bureau.nome,
            tipo: bureau.tipo,
            contratoFornecedorId: bureau.contratoFornecedorId,
            custoConsulta: bureau.custoConsulta,
          })
          .from(bureau)
          .where(eq(bureau.ativo, true)),
      ),
  );
};
