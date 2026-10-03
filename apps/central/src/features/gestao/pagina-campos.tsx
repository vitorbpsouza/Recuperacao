import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseZapIcon, SearchIcon, SparklesIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { semAcento } from '@workspace/domain';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Switch } from '@workspace/ui/components/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { Tabs, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip';
import { formatarData } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { api, camposDinamicosQuery, exigir, pode, type CampoDinamico, type UsuarioSessao } from '@/lib/api.ts';

const ROTULO_ENTIDADE = { veiculo: 'Veículo', pessoa: 'Pessoa', caso: 'Caso' } as const;
const TABELA = { veiculo: 'ativo', pessoa: 'pessoa', caso: 'caso' } as const;
const SEM_JUNTAR = '__nenhum__';

const nomeDaColuna = (rotulo: string) =>
  semAcento(rotulo)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || 'campo';

const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Para quando um campo dinâmico ficar muito usado em filtro: a migração que o
 * transforma em coluna, copiando o valor mais recente de cada registro.
 */
const sqlDeColuna = (c: CampoDinamico) => {
  const tabela = TABELA[c.entidade];
  const coluna = nomeDaColuna(c.rotulo);
  const id = c.entidade === 'veiculo' ? 'k.ativo_id' : c.entidade === 'pessoa' ? 'd.pessoa_id' : 'd.caso_id';
  return [
    `-- ${c.rotulo} (${c.secao}): ${c.ocorrencias} ocorrência(s) em ${c.casos} caso(s)`,
    `alter table ${tabela} add column ${coluna} text;`,
    `update ${tabela} t set ${coluna} = x.valor from (`,
    `  select distinct on (${id}) ${id} as id, d.valor`,
    `    from dado_extra d${c.entidade === 'veiculo' ? ' join caso k on k.id = d.caso_id' : ''}`,
    `   where d.chave = ${literal(c.chave)}`,
    `   order by ${id}, d.id desc`,
    `) x where t.id = x.id;`,
    `update campo_dinamico set oculto = true where id = ${c.id};`,
  ].join('\n');
};

function Rotulo({ campo, editavel, aoSalvar }: { campo: CampoDinamico; editavel: boolean; aoSalvar: (rotulo: string) => void }) {
  const [valor, setValor] = useState(campo.rotulo);
  if (!editavel) return <span className="font-semibold text-white">{campo.rotulo}</span>;
  const salvar = () => {
    const limpo = valor.trim();
    if (limpo && limpo !== campo.rotulo) aoSalvar(limpo);
    else setValor(campo.rotulo);
  };
  return (
    <Input
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setValor(campo.rotulo);
      }}
      className="h-8 min-w-48 font-semibold"
      aria-label={`Nome do campo ${campo.rotuloOriginal}`}
    />
  );
}

/**
 * Todo rótulo novo dos relatórios vira campo oficial na hora. Aqui se dá o
 * nome que aparece na ficha, junta o mesmo dado vindo com nomes diferentes e
 * oculta o que não interessa — sem deploy.
 */
export function PaginaCampos({ sessao }: { sessao: UsuarioSessao }) {
  const queryClient = useQueryClient();
  const consulta = useQuery(camposDinamicosQuery);
  const editavel = pode.gerir(sessao);
  const [entidade, setEntidade] = useState<'todos' | CampoDinamico['entidade']>('todos');
  const [busca, setBusca] = useState('');

  const salvar = useMutation({
    mutationFn: ({ id, ...corpo }: { id: number; rotulo?: string; oculto?: boolean; juntoDe?: number | null }) =>
      exigir(api.PUT('/api/campos-dinamicos/{campoId}', { params: { path: { campoId: id } }, body: corpo })),
    onSuccess: () => {
      toast.success('Campo atualizado. Já vale em todos os casos.');
      void queryClient.invalidateQueries({ queryKey: ['campos-dinamicos'] });
      void queryClient.invalidateQueries({ queryKey: ['caso'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const todos = useMemo(() => consulta.data ?? [], [consulta.data]);
  const lista = useMemo(() => {
    const b = semAcento(busca);
    return todos.filter(
      (c) => (entidade === 'todos' || c.entidade === entidade) && (!b || semAcento(`${c.rotulo} ${c.rotuloOriginal} ${c.secao}`).includes(b)),
    );
  }, [todos, entidade, busca]);
  const principais = (c: CampoDinamico) => todos.filter((x) => x.entidade === c.entidade && x.id !== c.id && !x.juntoDe);

  return (
    <>
      <CabecalhoDePagina
        titulo="Campos dos relatórios"
        descricao="Todo rótulo novo que um relatório trouxer vira campo na hora: na ficha, nos relatórios e no CSV. Aqui você dá o nome, junta sinônimos e oculta."
      />
      {consulta.isError ? <ErroDeConsulta erro={consulta.error} aoTentar={() => void consulta.refetch()} /> : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <SparklesIcon className="size-4 text-amber-300" aria-hidden />
            {todos.length} campo(s)
          </CardTitle>
          <CardDescription>
            Juntar: quando dois fornecedores chamam o mesmo dado de jeitos diferentes ("Capacidade de Carga" e "Capacidade Carga"), o
            valor de um aparece no outro. Ocultar: some da ficha e do CSV, mas o dado continua guardado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={entidade} onValueChange={(v) => setEntidade(v as typeof entidade)}>
              <TabsList>
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="veiculo">Veículo</TabsTrigger>
                <TabsTrigger value="pessoa">Pessoa</TabsTrigger>
                <TabsTrigger value="caso">Caso</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar campo" className="pl-9" aria-label="Buscar campo" />
            </div>
          </div>
          {consulta.isPending ? (
            <Skeleton className="h-60" />
          ) : lista.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
              {todos.length ? 'Nenhum campo com esse filtro.' : 'Nenhum campo novo ainda. Quando um relatório trouxer um rótulo desconhecido, ele aparece aqui.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-white/[0.06]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome na ficha</TableHead>
                    <TableHead>Como veio</TableHead>
                    <TableHead className="text-right">Vezes</TableHead>
                    <TableHead className="text-right">Casos</TableHead>
                    <TableHead>Último valor</TableHead>
                    <TableHead>Juntar com</TableHead>
                    <TableHead className="text-center">Visível</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((c) => (
                    <TableRow key={c.id} className={c.oculto ? 'opacity-50' : undefined}>
                      <TableCell>
                        <Rotulo key={c.rotulo} campo={c} editavel={editavel} aoSalvar={(rotulo) => salvar.mutate({ id: c.id, rotulo })} />
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="mr-1 text-[11px]">
                          {ROTULO_ENTIDADE[c.entidade]}
                        </Badge>
                        <span className="text-slate-300">{c.rotuloOriginal}</span>
                        <span className="text-muted-foreground"> · {c.secao}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.ocorrencias}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.casos}</TableCell>
                      <TableCell className="max-w-48 truncate text-slate-300" title={c.exemplo ?? undefined}>
                        {c.exemplo ?? <span className="text-muted-foreground">sensível</span>}
                        {c.ultimaVez ? <span className="block text-[11px] text-muted-foreground">{formatarData(c.ultimaVez)}</span> : null}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={c.juntoDe ? String(c.juntoDe) : SEM_JUNTAR}
                          onValueChange={(v) => salvar.mutate({ id: c.id, juntoDe: v === SEM_JUNTAR ? null : Number(v) })}
                          disabled={!editavel}
                        >
                          <SelectTrigger className="h-8 w-48" aria-label={`Juntar ${c.rotulo} com`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM_JUNTAR}>— campo próprio</SelectItem>
                            {principais(c).map((x) => (
                              <SelectItem key={x.id} value={String(x.id)}>
                                {x.rotulo}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={!c.oculto}
                          onCheckedChange={(visivel) => salvar.mutate({ id: c.id, oculto: !visivel })}
                          disabled={!editavel}
                          aria-label={`Mostrar ${c.rotulo}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label="Copiar SQL para virar coluna"
                              onClick={() => void navigator.clipboard.writeText(sqlDeColuna(c)).then(() => toast.success('SQL copiado.'))}
                            >
                              <DatabaseZapIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Avançado: SQL para virar coluna de verdade num deploy (só se for usado em filtro pesado).</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
