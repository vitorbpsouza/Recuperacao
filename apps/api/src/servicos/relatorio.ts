/**
 * Guarda o texto colado e tudo o que o leitor tirou dele, numa transação.
 *
 * Nada se perde: o texto original fica em `relatorio_colado`; o que tem campo
 * vai para o veículo, a pessoa, os contatos, os endereços e os avistamentos; o
 * resto vai para `dado_extra`, com a seção e o rótulo de origem.
 *
 * Colar o mesmo relatório de novo não duplica: contatos e endereços somam as
 * fontes, extras e radares iguais são ignorados.
 */
import { createHash } from 'node:crypto';

import { sql, type SQL } from 'drizzle-orm';

import type { Tx } from '@workspace/db';
import {
  camposNovos,
  lerRelatorio,
  normalizarDocumentoLido,
  papeisDaPessoa,
  type DadoExtra,
  type LeituraDeRelatorio,
  type PapelDoDossie,
  type PapelPessoa,
  type PessoaLida,
} from '@workspace/domain';

import { registrarConsulta } from './auditoria.ts';

const consultar = async <T>(tx: Tx, q: SQL): Promise<T[]> => ((await tx.execute(q)) as unknown as { rows: T[] }).rows;

export class ErroDeRelatorio extends Error {
  constructor(
    mensagem: string,
    readonly statusCode: 404 | 409 | 422,
  ) {
    super(mensagem);
  }
}

export interface PedidoDeImportacao {
  casoId: string;
  texto: string;
  papelPessoa?: PapelDoDossie;
  bureauId?: string;
  baseLegal?: 'execucao_contrato' | 'legitimo_interesse' | 'obrigacao_legal' | 'consentimento';
  justificativa?: string;
  via?: 'colado' | 'integracao';
  /** Integração: guarda a resposta original (JSON) e lê `texto`, que é a versão em rótulos. */
  textoOriginal?: string;
}

export interface ResumoDaImportacao {
  relatorioId: number;
  veiculo: { campos: string[]; restricoes: number } | null;
  pessoas: { id: string; nome: string | null; papeis: PapelPessoa[] }[];
  contatos: number;
  enderecos: number;
  parentes: number;
  radares: number;
  extras: number;
  novos: { secao: string; rotulo: string }[];
  avisos: string[];
}

/** Campos do veículo lido → coluna do ativo. */
const COLUNAS_DO_VEICULO = {
  chassi: 'chassi',
  renavam: 'renavam',
  marca: 'marca',
  modelo: 'modelo',
  cor: 'cor',
  anoModelo: 'ano',
  anoFabricacao: 'ano_fabricacao',
  situacao: 'situacao',
  tipo: 'tipo',
  especie: 'especie',
  categoria: 'categoria',
  carroceria: 'carroceria',
  combustivel: 'combustivel',
  potencia: 'potencia',
  cilindradas: 'cilindradas',
  motor: 'motor',
  procedencia: 'procedencia',
  municipio: 'municipio_emplacamento',
  uf: 'uf_emplacamento',
} as const;

const inserirExtras = async (tx: Tx, casoId: string, relatorioId: number, extras: DadoExtra[], pessoaId: string | null) => {
  let n = 0;
  for (const e of extras) {
    const r = await consultar<{ id: string }>(
      tx,
      sql`insert into dado_extra (caso_id, relatorio_id, entidade, pessoa_id, secao, chave, rotulo, valor, sensivel, novo)
          values (${casoId}, ${relatorioId}, ${e.entidade}, ${e.entidade === 'pessoa' ? pessoaId : null}, ${e.secao}, ${e.chave},
                  ${e.rotulo}, ${e.valor}, ${e.sensivel}, ${e.novo})
          on conflict do nothing
          returning id::text as id`,
    );
    n += r.length;
  }
  return n;
};

/** Cria ou completa a pessoa do canal do caso. O valor novo vence; o vazio não apaga. */
const gravarPessoa = async (tx: Tx, origem: string, casoId: string, p: Partial<PessoaLida>): Promise<string> => {
  const colunas = {
    tipo_pessoa: p.tipoPessoa ?? null,
    nome: p.nome ?? null,
    nome_civil: p.nomeCivil ?? null,
    nome_mae: p.nomeMae ?? null,
    nome_pai: p.nomePai ?? null,
    nascimento: p.nascimento ?? null,
    sexo: p.sexo ?? null,
    estado_civil: p.estadoCivil ?? null,
    rg: p.rg ?? null,
    rg_orgao: p.rgOrgao ?? null,
    rg_uf: p.rgUf ?? null,
    titulo_eleitor: p.tituloEleitor ?? null,
    profissao: p.profissao ?? null,
    nacionalidade: p.nacionalidade ?? null,
    situacao_cadastral: p.situacaoCadastral ?? null,
    obito: p.obito ?? null,
  };
  // Sem documento, a mesma pessoa é a do mesmo nome já ligada a este caso.
  const [existente] = p.documento
    ? await consultar<{ id: string }>(tx, sql`select id from pessoa where origem = ${origem} and documento = ${p.documento}`)
    : await consultar<{ id: string }>(
        tx,
        sql`select p.id from pessoa p join caso_pessoa cp on cp.pessoa_id = p.id
             where cp.caso_id = ${casoId} and upper(p.nome) = upper(${p.nome ?? ''}) limit 1`,
      );
  if (existente) {
    const sets = Object.entries(colunas)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => sql`${sql.identifier(k)} = ${k === 'nascimento' ? sql`${v}::date` : k === 'obito' ? sql`${v}::boolean` : v}`);
    if (sets.length) await tx.execute(sql`update pessoa set ${sql.join(sets, sql`, `)} where id = ${existente.id}`);
    return existente.id;
  }
  const [nova] = await consultar<{ id: string }>(
    tx,
    sql`insert into pessoa (origem, documento, tipo_pessoa, nome, nome_civil, nome_mae, nome_pai, nascimento, sexo, estado_civil, rg,
                            rg_orgao, rg_uf, titulo_eleitor, profissao, nacionalidade, situacao_cadastral, obito)
        values (${origem}, ${p.documento ?? null}, ${colunas.tipo_pessoa}, ${colunas.nome}, ${colunas.nome_civil}, ${colunas.nome_mae},
                ${colunas.nome_pai}, ${colunas.nascimento}::date, ${colunas.sexo}, ${colunas.estado_civil}, ${colunas.rg}, ${colunas.rg_orgao},
                ${colunas.rg_uf}, ${colunas.titulo_eleitor}, ${colunas.profissao}, ${colunas.nacionalidade}, ${colunas.situacao_cadastral},
                ${colunas.obito}::boolean)
        returning id`,
  );
  return nova!.id;
};

const ligar = (tx: Tx, casoId: string, pessoaId: string, papel: PapelPessoa, vinculo?: string, parenteDe?: string) =>
  tx.execute(sql`
    insert into caso_pessoa (caso_id, pessoa_id, papel, vinculo, parente_de)
    values (${casoId}, ${pessoaId}, ${papel}, ${vinculo ?? null}, ${parenteDe ?? null})
    on conflict do nothing`);

const gravarContatosEEnderecos = async (tx: Tx, pessoaId: string, p: PessoaLida) => {
  for (const c of p.contatos) {
    await tx.execute(sql`
      insert into pessoa_contato (pessoa_id, tipo, valor, original, valido, fontes)
      values (${pessoaId}, ${c.tipo}, ${c.valor}, ${c.original}, ${c.valido}, ${JSON.stringify(c.fontes)}::jsonb)
      on conflict (tenant_id, pessoa_id, tipo, valor) do update set
        fontes = (select coalesce(jsonb_agg(distinct f), '[]'::jsonb)
                    from jsonb_array_elements(pessoa_contato.fontes || excluded.fontes) f)`);
  }
  for (const e of p.enderecos) {
    await tx.execute(sql`
      insert into pessoa_endereco (pessoa_id, chave, logradouro, numero, complemento, bairro, cidade, uf, cep, variantes, fontes)
      values (${pessoaId}, ${e.chave}, ${e.logradouro}, ${e.numero ?? null}, ${e.complemento ?? null}, ${e.bairro ?? null},
              ${e.cidade ?? null}, ${e.uf && /^[A-Z]{2}$/.test(e.uf) ? e.uf : null}, ${e.cep ?? null},
              array(select jsonb_array_elements_text(${JSON.stringify(e.variantes)}::jsonb)),
              array(select jsonb_array_elements_text(${JSON.stringify(e.fontes)}::jsonb)))
      on conflict (tenant_id, pessoa_id, chave) do update set
        bairro    = coalesce(pessoa_endereco.bairro, excluded.bairro),
        cep       = coalesce(pessoa_endereco.cep, excluded.cep),
        uf        = coalesce(pessoa_endereco.uf, excluded.uf),
        variantes = array(select distinct unnest(pessoa_endereco.variantes || excluded.variantes)),
        fontes    = array(select distinct unnest(pessoa_endereco.fontes || excluded.fontes))`);
  }
};

/**
 * Lê o texto e grava tudo. Lança `ErroDeRelatorio` quando o texto é de outra
 * placa ou quando falta dizer o papel da pessoa colada.
 */
export const importarRelatorio = async (tx: Tx, operadorId: string, pedido: PedidoDeImportacao): Promise<ResumoDaImportacao> => {
  const [caso] = await consultar<{ origem: string; finalidade: string; ativoId: string; placa: string; devedorDoc: string | null; devedorNome: string | null }>(
    tx,
    sql`select k.origem, k.finalidade, k.ativo_id as "ativoId", a.placa, a.devedor_doc as "devedorDoc", a.devedor_nome as "devedorNome"
          from caso k join ativo a on a.id = k.ativo_id where k.id = ${pedido.casoId}`,
  );
  if (!caso) throw new ErroDeRelatorio('caso não encontrado', 404);

  const leitura: LeituraDeRelatorio = lerRelatorio(pedido.texto);
  const v = leitura.veiculo;
  if (v?.placa && v.placa !== caso.placa) {
    throw new ErroDeRelatorio(`o relatório é da placa ${v.placa}, e o caso é da ${caso.placa}`, 409);
  }
  // Radar de outra placa no mesmo texto: não é deste caso.
  const radares = leitura.radares.filter((r) => !r.placa || r.placa === caso.placa);

  const papeis = leitura.pessoas.map((p) => papeisDaPessoa(p, caso.devedorDoc));
  if (papeis.some((x) => x.pergunta) && !pedido.papelPessoa) {
    throw new ErroDeRelatorio('informe o papel da pessoa colada no caso: o documento não é o do devedor', 422);
  }

  let consultaId: string | null = null;
  if (pedido.bureauId) {
    const consulta = await registrarConsulta(tx, operadorId, {
      casoId: pedido.casoId,
      bureauId: pedido.bureauId,
      baseLegal: pedido.baseLegal!,
      justificativa: pedido.justificativa!,
      camposRetornados: leitura.secoes.length ? leitura.secoes : ['texto'],
    });
    consultaId = consulta.id;
  }

  const novos = camposNovos(leitura);
  const resumoEvento = {
    veiculo: v ? 1 : 0,
    pessoas: leitura.pessoas.length,
    contatos: leitura.pessoas.reduce((s, p) => s + p.contatos.length, 0),
    enderecos: leitura.pessoas.reduce((s, p) => s + p.enderecos.length, 0),
    radares: radares.length,
    camposNovos: novos.length,
  };
  const guardado = pedido.textoOriginal ?? pedido.texto;
  const [relatorio] = await consultar<{ id: number }>(
    tx,
    sql`insert into relatorio_colado (caso_id, texto, sha256, via, bureau_id, consulta_id, secoes, resumo)
        values (${pedido.casoId}, ${guardado}, ${createHash('sha256').update(guardado).digest('hex')}, ${pedido.via ?? 'colado'},
                ${pedido.bureauId ?? null}, ${consultaId}, array(select jsonb_array_elements_text(${JSON.stringify(leitura.secoes)}::jsonb)),
                ${JSON.stringify(resumoEvento)}::jsonb)
        returning id::int as id`,
  );
  const relatorioId = relatorio!.id;
  let extras = 0;

  // -- Veículo ---------------------------------------------------------------
  let camposDoVeiculo: string[] = [];
  if (v) {
    const sets: SQL[] = [];
    for (const [campo, coluna] of Object.entries(COLUNAS_DO_VEICULO) as [keyof typeof COLUNAS_DO_VEICULO, string][]) {
      const valor = v[campo];
      if (valor === undefined) continue;
      if (coluna === 'chassi' && !/^[A-HJ-NPR-Z0-9]{17}$/.test(String(valor))) continue;
      if (coluna === 'renavam' && !/^\d{11}$/.test(String(valor))) continue;
      if (coluna === 'uf_emplacamento' && !/^[A-Z]{2}$/.test(String(valor))) continue;
      sets.push(sql`${sql.identifier(coluna)} = ${valor}`);
      camposDoVeiculo.push(campo);
    }
    if (sets.length) await tx.execute(sql`update ativo set ${sql.join(sets, sql`, `)} where id = ${caso.ativoId}`);

    const temVerificacao =
      v.restricoes.length > 0 || v.situacao || [v.renajud, v.rouboFurto, v.leilao, v.alienacaoFiduciaria, v.anoLicenciamento].some((x) => x !== undefined);
    if (temVerificacao) {
      const alienacao = v.alienacaoFiduciaria ?? (v.restricoes.length ? v.restricoes.some((r) => /aliena/i.test(r)) : undefined);
      const renajud = v.renajud ?? (v.restricoes.some((r) => /renajud/i.test(r)) ? true : undefined);
      await tx.execute(sql`
        insert into verificacao_veicular
          (caso_id, consulta_id, relatorio_id, situacao, restricoes, renajud, roubo_furto, leilao, alienacao_fiduciaria, ano_licenciamento)
        values (${pedido.casoId}, ${consultaId}, ${relatorioId}, ${v.situacao ?? null},
                array(select jsonb_array_elements_text(${JSON.stringify(v.restricoes)}::jsonb)),
                ${renajud ?? null}, ${v.rouboFurto ?? null}, ${v.leilao ?? null}, ${alienacao ?? null}, ${v.anoLicenciamento ?? null})`);
      // Plano B: RENAJUD e gravame verificados destravam (ou travam) a transferência.
      if (caso.origem === 'lead_proprio') {
        await tx.execute(sql`
          update caso set
            renajud_ativo   = coalesce(${renajud ?? null}::boolean, renajud_ativo),
            gravame_baixado = coalesce(not ${alienacao ?? null}::boolean, gravame_baixado)
          where id = ${pedido.casoId}`);
      }
    }
    extras += await inserirExtras(tx, pedido.casoId, relatorioId, v.extras, null);
  }
  camposDoVeiculo = [...new Set(camposDoVeiculo)];

  // -- Pessoas ---------------------------------------------------------------
  const pessoas: ResumoDaImportacao['pessoas'] = [];
  let parentes = 0;
  for (const [i, p] of leitura.pessoas.entries()) {
    const decidido = papeis[i]!;
    const papeisDela: PapelPessoa[] = decidido.pergunta ? [pedido.papelPessoa!] : decidido.papeis;
    const id = await gravarPessoa(tx, caso.origem, pedido.casoId, p);
    for (const papel of papeisDela) await ligar(tx, pedido.casoId, id, papel);
    // Devedor sem nome ou documento no caso: completa com o que veio.
    if (papeisDela.includes('devedor') && (!caso.devedorDoc || !caso.devedorNome)) {
      await tx.execute(sql`
        update ativo set devedor_doc = coalesce(devedor_doc, ${p.documento ?? null}), devedor_nome = coalesce(devedor_nome, ${p.nome ?? null})
         where id = ${caso.ativoId}`);
    }
    await gravarContatosEEnderecos(tx, id, p);
    for (const parente of p.parentes) {
      const doc = parente.documento ? normalizarDocumentoLido(parente.documento) : {};
      const parenteId = await gravarPessoa(tx, caso.origem, pedido.casoId, { nome: parente.nome, documento: doc.documento, tipoPessoa: doc.tipo });
      await ligar(tx, pedido.casoId, parenteId, 'parente', parente.vinculo, id);
      parentes++;
    }
    extras += await inserirExtras(tx, pedido.casoId, relatorioId, p.extras, id);
    pessoas.push({ id, nome: p.nome ?? null, papeis: papeisDela });
  }

  // -- Radar → avistamento (Plano A); no Plano B o radar fica guardado como extra.
  let radaresGravados = 0;
  if (caso.finalidade === 'recuperacao_para_credor') {
    for (const r of radares) {
      const linhas = await consultar<{ id: string }>(
        tx,
        sql`insert into avistamento (caso_id, observado_em, latitude, longitude, descricao, fonte, relatorio_id)
            values (${pedido.casoId}, ${r.observadoEm}::timestamptz, ${r.latitude ?? null}, ${r.longitude ?? null},
                    ${r.local.length >= 5 ? r.local : `Radar: ${r.local}`}, 'radar', ${relatorioId})
            on conflict do nothing
            returning id::text as id`,
      );
      radaresGravados += linhas.length;
    }
  } else if (radares.length) {
    extras += await inserirExtras(
      tx,
      pedido.casoId,
      relatorioId,
      radares.map((r) => ({
        entidade: 'caso' as const,
        secao: 'RADAR',
        chave: `radar > ${r.observadoEm}`,
        rotulo: r.observadoEm,
        valor: [r.local, r.latitude, r.longitude].filter((x) => x !== undefined).join(' · '),
        sensivel: false,
        novo: false,
      })),
      null,
    );
  }

  extras += await inserirExtras(tx, pedido.casoId, relatorioId, leitura.outros, null);

  return {
    relatorioId,
    veiculo: v ? { campos: camposDoVeiculo, restricoes: v.restricoes.length } : null,
    pessoas,
    contatos: resumoEvento.contatos,
    enderecos: resumoEvento.enderecos,
    parentes,
    radares: radaresGravados,
    extras,
    novos: novos.map((n) => ({ secao: n.secao, rotulo: n.rotulo })),
    avisos: leitura.avisos,
  };
};
