import { useQuery } from '@tanstack/react-query';
import { CopyIcon, DatabaseZapIcon, SparklesIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { semAcento } from '@workspace/domain';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Checkbox } from '@workspace/ui/components/checkbox';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { formatarData } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { camposNovosQuery, type CampoNovo } from '@/lib/api.ts';

const TABELA = { veiculo: 'ativo', pessoa: 'pessoa', caso: 'caso' } as const;
const ROTULO_ENTIDADE = { veiculo: 'Veículo', pessoa: 'Pessoa', caso: 'Caso' } as const;

/** "Capacidade de Carga" → capacidade_de_carga. */
const nomeDaColuna = (rotulo: string) =>
  semAcento(rotulo.split('›').at(-1) ?? rotulo)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || 'campo_novo';

const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * A migração que promove o campo: cria a coluna, copia o valor mais recente
 * de cada veículo ou pessoa e marca o dado extra como promovido.
 */
const sqlDaPromocao = (campos: CampoNovo[]) =>
  [
    `-- Promoção de ${campos.length} campo(s) novo(s) vindos dos relatórios colados.`,
    '-- Depois desta migração, inclua o rótulo no catálogo do leitor (CAMPOS_VEICULO ou CAMPOS_PESSOA',
    '-- em packages/domain/src/relatorio-colado.ts), para os próximos textos já caírem na coluna.',
    '',
    ...campos.flatMap((c) => {
      const tabela = TABELA[c.entidade];
      const coluna = nomeDaColuna(c.rotulo);
      const origem =
        c.entidade === 'veiculo'
          ? `select distinct on (k.ativo_id) k.ativo_id as id, d.valor
      from dado_extra d join caso k on k.id = d.caso_id
     where d.chave = ${literal(c.chave)}
     order by k.ativo_id, d.id desc`
          : c.entidade === 'pessoa'
            ? `select distinct on (d.pessoa_id) d.pessoa_id as id, d.valor
      from dado_extra d
     where d.chave = ${literal(c.chave)}
     order by d.pessoa_id, d.id desc`
            : `select distinct on (d.caso_id) d.caso_id as id, d.valor
      from dado_extra d
     where d.chave = ${literal(c.chave)}
     order by d.caso_id, d.id desc`;
      return [
        `-- ${c.rotulo} (${c.secao}): ${c.ocorrencias} ocorrência(s) em ${c.casos} caso(s)`,
        `alter table ${tabela} add column ${coluna} text;`,
        `update ${tabela} t set ${coluna} = x.valor from (\n    ${origem}\n  ) x where t.id = x.id;`,
        `update dado_extra set promovido_em = now() where chave = ${literal(c.chave)};`,
        '',
      ];
    }),
  ].join('\n');

/** O que os fornecedores passaram a mandar e o sistema ainda não tem campo para guardar. */
export function PaginaCamposNovos() {
  const consulta = useQuery(camposNovosQuery);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const lista = useMemo(() => consulta.data ?? [], [consulta.data]);
  const sql = useMemo(() => sqlDaPromocao(lista.filter((c) => escolhidos.has(c.chave))), [lista, escolhidos]);

  const alternar = (chave: string) =>
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  return (
    <>
      <CabecalhoDePagina
        titulo="Campos novos"
        descricao="Rótulos que chegaram nos relatórios e ainda não têm campo próprio. Estão guardados; no próximo deploy viram coluna, com os valores já copiados."
      />
      {consulta.isError ? <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} /> : null}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <SparklesIcon className="size-4 text-amber-300" aria-hidden />
              Detectados ({lista.length})
            </CardTitle>
            <CardDescription>Marque os que devem virar campo. Os mais frequentes primeiro.</CardDescription>
          </CardHeader>
          <CardContent>
            {consulta.isPending ? (
              <Skeleton className="h-48" />
            ) : lista.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
                Nenhum campo novo. Tudo o que os relatórios trouxeram até agora já tem lugar.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl ring-1 ring-white/[0.06]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Rótulo</TableHead>
                      <TableHead>Onde</TableHead>
                      <TableHead className="text-right">Vezes</TableHead>
                      <TableHead className="text-right">Casos</TableHead>
                      <TableHead>Exemplo</TableHead>
                      <TableHead>Visto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.map((c) => (
                      <TableRow key={c.chave} className="cursor-pointer" onClick={() => alternar(c.chave)}>
                        <TableCell>
                          <Checkbox checked={escolhidos.has(c.chave)} aria-label={`Promover ${c.rotulo}`} />
                        </TableCell>
                        <TableCell className="font-semibold text-white">{c.rotulo}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px]">
                            {ROTULO_ENTIDADE[c.entidade]}
                          </Badge>{' '}
                          <span className="text-xs text-muted-foreground">{c.secao}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.ocorrencias}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.casos}</TableCell>
                        <TableCell className="max-w-48 truncate text-slate-300">{c.exemplo ?? <span className="text-muted-foreground">sensível</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {formatarData(c.primeiraVez)} – {formatarData(c.ultimaVez)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <DatabaseZapIcon className="size-4 text-blue-300" aria-hidden />
              Migração do próximo deploy
            </CardTitle>
            <CardDescription>
              Cria a coluna, copia o valor mais recente de cada veículo ou pessoa e marca o dado como promovido. Entregue ao desenvolvimento
              para virar o próximo arquivo em packages/db/migrations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {escolhidos.size ? (
              <>
                <pre className="custom-scrollbar max-h-[55vh] overflow-auto rounded-lg bg-black/40 p-4 font-mono text-xs whitespace-pre text-slate-200">{sql}</pre>
                <Button variant="outline" onClick={() => void navigator.clipboard.writeText(sql).then(() => toast.success('SQL copiado.'))}>
                  <CopyIcon />
                  Copiar SQL
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Marque um ou mais campos na lista.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
