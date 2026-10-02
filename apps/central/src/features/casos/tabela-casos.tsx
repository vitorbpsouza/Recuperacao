import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowUpDownIcon, ChevronLeftIcon, ChevronRightIcon, FilterIcon, SearchIcon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PlacaMercosul } from '@workspace/ui/brand/placa-mercosul';
import { PrazoBadge } from '@workspace/ui/brand/prazo-badge';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@workspace/ui/components/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@workspace/ui/components/input-group';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { formatarData, formatarMoeda } from '@workspace/ui/lib/formato';
import { cn } from '@workspace/ui/lib/utils';

import type { Canal, Caso } from '@/lib/api.ts';
import { tomDoStatus } from '@/lib/status.ts';

const ordenavel =
  (titulo: string): ColumnDef<Caso>['header'] =>
  ({ column }) => (
    <Button variant="ghost" size="xs" className="-ml-2 text-[11px] font-semibold tracking-widest uppercase" onClick={() => column.toggleSorting()}>
      {titulo}
      <ArrowUpDownIcon className="size-3" aria-hidden />
    </Button>
  );

/** Primeira coluna: a placa e o modelo, com o link para a ficha (acessível por teclado). */
const colunaAtivo = (canal: Canal): ColumnDef<Caso> => ({
  id: 'ativo',
  accessorFn: (c) => `${c.placa} ${c.modelo ?? ''} ${c.cidade ?? ''}`,
  header: 'Ativo / placa',
  cell: ({ row: { original: c } }) => (
    <div className="flex items-center gap-3">
      <PlacaMercosul placa={c.placa} />
      <div className="min-w-0">
        <Link
          to={canal === 'a' ? '/a/casos/$casoId' : '/b/casos/$casoId'}
          params={{ casoId: c.id }}
          className="block truncate font-semibold text-white hover:underline focus-visible:underline focus-visible:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {c.modelo ?? 'Modelo não informado'}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[c.cidade, c.uf].filter(Boolean).join(' · ') || 'Localidade não informada'}
        </p>
      </div>
    </div>
  ),
});

const colunaStatus: ColumnDef<Caso> = {
  accessorKey: 'status',
  header: 'Status',
  filterFn: (linha, coluna, filtro: string[]) => !filtro.length || filtro.includes(linha.getValue(coluna)),
  cell: ({ row: { original: c } }) => <StatusBadge status={c.status} tom={tomDoStatus(c.status)} />,
};

const colunaRecebido: ColumnDef<Caso> = {
  accessorKey: 'criadoEm',
  header: ordenavel('Recebido em'),
  cell: ({ row: { original: c } }) => <span className="text-muted-foreground tabular-nums">{formatarData(c.criadoEm)}</span>,
};

/** Plano A: quem está em campo e quanto falta para o prazo. */
const COLUNAS_A: ColumnDef<Caso>[] = [
  colunaAtivo('a'),
  colunaStatus,
  {
    accessorKey: 'recuperadorNome',
    header: 'Recuperador',
    cell: ({ row: { original: c } }) =>
      c.recuperadorNome ? <span className="text-white">{c.recuperadorNome}</span> : <span className="text-muted-foreground">sem vínculo</span>,
  },
  {
    accessorKey: 'prazoMaximo',
    header: ordenavel('Prazo máximo'),
    sortingFn: 'datetime',
    cell: ({ row: { original: c } }) => <PrazoBadge ate={c.prazoMaximo} />,
  },
  colunaRecebido,
];

/** Plano B: origem do lead, saldo e o que falta para transferir. */
const COLUNAS_B: ColumnDef<Caso>[] = [
  colunaAtivo('b'),
  colunaStatus,
  {
    accessorKey: 'canalLead',
    header: 'Origem do lead',
    cell: ({ row: { original: c } }) => <span className="text-muted-foreground">{c.canalLead ?? '—'}</span>,
  },
  {
    accessorKey: 'saldoDevedor',
    header: ordenavel('Saldo devedor'),
    cell: ({ row: { original: c } }) => <span className="font-semibold text-white tabular-nums">{formatarMoeda(c.saldoDevedor)}</span>,
  },
  {
    id: 'pendencias',
    header: 'Para transferir',
    cell: ({ row: { original: c } }) => {
      const pendencias = [
        c.anuenciaCredor !== 'Obtida' && 'anuência',
        c.renajudAtivo && 'RENAJUD',
        !c.gravameBaixado && 'gravame',
      ].filter((p): p is string => typeof p === 'string');
      return pendencias.length ? (
        <div className="flex flex-wrap gap-1">
          {pendencias.map((p) => (
            <Badge key={p} variant="outline" className="border-warning/30 text-amber-300">
              {p}
            </Badge>
          ))}
        </div>
      ) : (
        <Badge className="bg-success/15 text-emerald-300">liberado</Badge>
      );
    },
  },
  colunaRecebido,
];

interface Props {
  canal: Canal;
  casos: Caso[] | undefined;
  carregando: boolean;
  /** Refazendo a consulta com dado antigo na tela: esmaece em vez de piscar. */
  atualizando: boolean;
  vocabulario: readonly string[];
  busca: string;
  aoBuscar: (busca: string) => void;
}

export function TabelaCasos({ canal, casos, carregando, atualizando, vocabulario, busca, aoBuscar }: Props) {
  const navigate = useNavigate();
  const [ordenacao, setOrdenacao] = useState<SortingState>([]);
  const [statusFiltrados, setStatusFiltrados] = useState<string[]>([]);
  const colunas = canal === 'a' ? COLUNAS_A : COLUNAS_B;
  const dados = useMemo(() => casos ?? [], [casos]);
  // Todo estado passado à tabela precisa de identidade estável. Um array novo a
  // cada render faz o TanStack Table refiltrar e reagendar a volta à página 1,
  // que gera estado novo, que renderiza de novo: um laço que queima CPU com a
  // tela parada e congela a página quando cai dentro de um clique.
  const filtrosDeColuna = useMemo(() => [{ id: 'status', value: statusFiltrados }], [statusFiltrados]);

  const tabela = useReactTable({
    data: dados,
    columns: colunas,
    state: {
      sorting: ordenacao,
      globalFilter: busca,
      columnFilters: filtrosDeColuna,
    },
    onSortingChange: setOrdenacao,
    globalFilterFn: (linha, _coluna, filtro: string) => {
      const c = linha.original;
      const alvo = `${c.placa} ${c.modelo ?? ''} ${c.cidade ?? ''} ${c.status} ${c.recuperadorNome ?? ''}`.toLowerCase();
      return filtro
        .toLowerCase()
        .split(/\s+/)
        .every((termo) => alvo.includes(termo.replace(/-/g, '')) || alvo.includes(termo));
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  const linhas = tabela.getRowModel().rows;
  const totalFiltrado = tabela.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        <InputGroup className="h-9 min-w-56 flex-1">
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder="Buscar por placa, modelo, cidade ou recuperador…"
            aria-label="Buscar casos"
          />
          {busca ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Limpar busca" onClick={() => aoBuscar('')}>
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <FilterIcon aria-hidden />
              Status
              {statusFiltrados.length ? (
                <Badge variant="secondary" className="ml-1">
                  {statusFiltrados.length}
                </Badge>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Filtrar por status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {vocabulario.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={statusFiltrados.includes(s)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(marcado) =>
                  setStatusFiltrados((atual) => (marcado ? [...atual, s] : atual.filter((x) => x !== s)))
                }
              >
                {s}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-xs text-muted-foreground tabular-nums">
          {carregando ? 'carregando…' : `${totalFiltrado} de ${dados.length}`}
        </span>
      </div>

      <div
        className={cn(
          'custom-scrollbar overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10 transition-opacity',
          atualizando && 'pointer-events-none opacity-50',
        )}
      >
        <Table className="min-w-[820px]">
          <TableHeader>
            {tabela.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id} className="bg-white/3 hover:bg-white/3">
                {grupo.headers.map((h) => (
                  <TableHead key={h.id} className="h-11 px-4 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {carregando
              ? Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    {colunas.map((_, j) => (
                      <TableCell key={j} className="px-4 py-4">
                        <Skeleton className={j === 0 ? 'h-10 w-48' : 'h-5 w-24'} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : linhas.map((linha) => (
                  <TableRow
                    key={linha.id}
                    className="cursor-pointer"
                    onClick={() =>
                      void navigate({
                        to: canal === 'a' ? '/a/casos/$casoId' : '/b/casos/$casoId',
                        params: { casoId: linha.original.id },
                      })
                    }
                  >
                    {linha.getVisibleCells().map((celula) => (
                      <TableCell key={celula.id} className="px-4 py-3">
                        {flexRender(celula.column.columnDef.cell, celula.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {!carregando && linhas.length === 0 ? (
          <Empty className="border-0 py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>{dados.length ? 'Nenhum caso com esses filtros' : 'Nenhum caso neste canal'}</EmptyTitle>
              <EmptyDescription>
                {dados.length ? 'Ajuste a busca ou o filtro de status.' : 'Casos recebidos aparecem aqui.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>

      {tabela.getPageCount() > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            página {tabela.getState().pagination.pageIndex + 1} de {tabela.getPageCount()}
          </span>
          <Button variant="outline" size="icon-sm" onClick={() => tabela.previousPage()} disabled={!tabela.getCanPreviousPage()} aria-label="Página anterior">
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => tabela.nextPage()} disabled={!tabela.getCanNextPage()} aria-label="Próxima página">
            <ChevronRightIcon />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
