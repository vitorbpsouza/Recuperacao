/**
 * Cadastro de caso com o bem, numa transação só.
 *
 * A fronteira continua no banco: RLS recusa cadastrar em canal que a sessão
 * não enxerga, e os triggers de fronteira tratam a colisão entre planos.
 */
import { and, eq, notInArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { schema } from '@workspace/db';
import { cadastroCasoEntrada, finalidadeDe, normalizarDocumento, normalizarPlaca } from '@workspace/domain';

import * as c from '../contratos.ts';

const { ativo, caso, credor } = schema;

/** Status em que o caso já acabou: placa com caso assim pode receber caso novo. */
const FINAIS = ['Entregue ao Credor', 'Curado', 'Não Localizado', 'Removido pelo Banco', 'Encerrado', 'Transferido', 'Desistiu'];

export const rotasCadastroCaso: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/casos/cadastro',
    {
      schema: {
        tags: ['casos'],
        body: cadastroCasoEntrada,
        response: { 201: c.criado, 404: c.erro, 409: c.erro },
      },
    },
    async (req, reply) => {
      const corpo = req.body;
      const bem = corpo.bem;
      const placa = normalizarPlaca(bem.placa);

      const resultado = await req.banco(async (tx) => {
        let credorNome: string | null = null;
        if (corpo.credorId) {
          const [cr] = await tx.select({ nome: credor.nome }).from(credor).where(eq(credor.id, corpo.credorId));
          if (!cr) return { erro: 404 as const, mensagem: 'credor não encontrado' };
          credorNome = cr.nome;
        }

        const [aberto] = await tx
          .select({ id: caso.id, status: caso.status })
          .from(caso)
          .innerJoin(ativo, eq(ativo.id, caso.ativoId))
          .where(and(eq(ativo.placa, placa), eq(caso.origem, corpo.origem), notInArray(caso.status, FINAIS)));
        if (aberto) {
          return { erro: 409 as const, mensagem: `a placa ${placa} já tem caso aberto neste plano (${aberto.status})` };
        }

        const [novoAtivo] = await tx
          .insert(ativo)
          .values({
            placa,
            chassi: bem.chassi?.toUpperCase().replace(/\s/g, ''),
            modelo: bem.modelo,
            ano: bem.ano,
            cor: bem.cor,
            cidade: bem.cidade,
            uf: bem.uf,
            devedorNome: bem.devedorNome,
            devedorDoc: bem.devedorDoc ? normalizarDocumento(bem.devedorDoc) : undefined,
            credorNome: credorNome ?? undefined,
            valorDivida: bem.valorDivida,
          })
          .returning({ id: ativo.id });

        const base = {
          ativoId: novoAtivo!.id,
          fonteId: corpo.fonteId,
          origem: corpo.origem,
          finalidade: finalidadeDe(corpo.origem),
          credorId: corpo.credorId ?? null,
        };
        const [novoCaso] = await tx
          .insert(caso)
          .values(
            corpo.origem === 'plataforma_credor'
              ? { ...base, status: 'Recebido' }
              : {
                  ...base,
                  status: 'Lead Recebido',
                  canalLead: corpo.canalLead,
                  evidenciaLead: corpo.evidenciaLead,
                  saldoDevedor: corpo.saldoDevedor,
                  anuenciaCredor: 'Pendente',
                  // Até alguém verificar, presume-se restrição: transferir sem
                  // conferir o RENAJUD é o erro caro.
                  renajudAtivo: true,
                  gravameBaixado: false,
                },
          )
          .returning({ id: caso.id });
        return { id: novoCaso!.id, erro: undefined, mensagem: undefined };
      });

      if ('erro' in resultado && resultado.erro) return reply.code(resultado.erro).send({ erro: resultado.mensagem });
      return reply.code(201).send({ id: resultado.id! });
    },
  );
};
