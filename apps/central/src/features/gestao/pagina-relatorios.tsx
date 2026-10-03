import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DownloadIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { STATUS_AQUISICAO, STATUS_RECUPERACAO } from '@workspace/domain';
import { StatusBadge } from '@workspace/ui/brand/status-badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { formatarData, formatarDataHora, formatarMoeda, formatarNumero } from '@workspace/ui/lib/formato';
import { toast } from '@workspace/ui/lib/toast';
import { cn } from '@workspace/ui/lib/utils';

import { CabecalhoDePagina, ErroDeConsulta } from '@/components/estado-da-consulta.tsx';
import { auditoriaQuery, casosQuery, painelRecuperacaoQuery, pode, repassesQuery, type UsuarioSessao } from '@/lib/api.ts';
import { baixarCsv, gerarCsv } from '@/lib/csv.ts';
import { tomDoStatus } from '@/lib/status.ts';

type Valor = string | number | boolean | null | undefined | Date;

export interface Coluna<T> {
  titulo: string;
  /** Valor para o CSV (e para a tela, se `celula` não for dado). */
  valor: (l: T) => Valor;
  celula?: (l: T) => ReactNode;
  numero?: boolean;
}

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Relatório na tela: a tabela que se vê é a que se exporta. Filtro e busca
 * valem para os dois.
 */
function TabelaRelatorio<T>({
  titulo,
  descricao,
  linhas,
  colunas,
  arquivo,
  carregando,
  erro,
  aoTentar,
  filtros,
  rodape,
}: {
  titulo: string;
  descricao: string;
  linhas: T[];
  colunas: Coluna<T>[];
  arquivo: string;
  carregando: boolean;
  erro?: unknown;
  aoTentar?: () => void;
  filtros?: ReactNode;
  rodape?: ReactNode;
}) {
  const [busca, setBusca] = useState('');
  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return linhas;
    return linhas.filter((l) => colunas.some((c) => String(c.valor(l) ?? '').toLowerCase().includes(b)));
  }, [linhas, colunas, busca]);

  const exportar = () => {
    baixarCsv(`${arquivo}-${hoje()}.csv`, gerarCsv(filtradas, colunas.map((c) => [c.titulo, c.valor] as [string, (l: T) => Valor])));
    toast.success(`${titulo}: ${filtradas.length} linha(s) exportada(s).`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-white">{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar em qualquer coluna" className="pl-9" aria-label="Buscar" />
          </div>
          {filtros}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {filtradas.length} de {linhas.length}
          </span>
          <Button variant="outline" size="sm" onClick={exportar} disabled={carregando || !filtradas.length}>
            <DownloadIcon />
            Exportar CSV
          </Button>
        </div>
        {erro ? (
          <ErroDeConsulta erro={erro} aoTentar={aoTentar ?? (() => undefined)} />
        ) : carregando ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="custom-scrollbar max-h-[65vh] overflow-auto rounded-xl ring-1 ring-white/[0.06]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-900">
                <TableRow>
                  {colunas.map((c) => (
                    <TableHead key={c.titulo} className={cn(c.numero && 'text-right')}>
                      {c.titulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((l, i) => (
                  <TableRow key={i}>
                    {colunas.map((c) => (
                      <TableCell key={c.titulo} className={cn(c.numero && 'text-right tabular-nums')}>
                        {c.celula ? c.celula(l) : (() => {
                          const v = c.valor(l);
                          return v instanceof Date ? formatarDataHora(v) : typeof v === 'boolean' ? (v ? 'sim' : 'não') : (v ?? '—');
                        })()}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!filtradas.length ? (
                  <TableRow>
                    <TableCell colSpan={colunas.length} className="py-8 text-center text-muted-foreground">
                      Nada para mostrar.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
              {rodape ? <TableFooter>{rodape}</TableFooter> : null}
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FiltroStatus({ valor, aoMudar, opcoes }: { valor: string; aoMudar: (v: string) => void; opcoes: readonly string[] }) {
  return (
    <Select value={valor} onValueChange={aoMudar}>
      <SelectTrigger className="w-56" aria-label="Status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">Todos os status</SelectItem>
        {opcoes.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Relatórios na tela, com o mesmo filtro de canal da API, e exportação do que
 * está filtrado. Nenhum leva nome ou documento de devedor: esse dado só sai da
 * ficha, com finalidade registrada.
 */
export function PaginaRelatorios({ sessao }: { sessao: UsuarioSessao }) {
  const veA = sessao.canaisVisiveis.includes('plataforma_credor');
  const veB = sessao.canaisVisiveis.includes('lead_proprio');
  const auditor = pode.auditar(sessao);
  const casosA = useQuery({ ...casosQuery('plataforma_credor'), enabled: veA });
  const casosB = useQuery({ ...casosQuery('lead_proprio'), enabled: veB });
  const painel = useQuery({ ...painelRecuperacaoQuery, enabled: veA });
  const repasses = useQuery({ ...repassesQuery, enabled: veA });
  const auditoria = useQuery({ ...auditoriaQuery, enabled: auditor });
  const [statusA, setStatusA] = useState('todos');
  const [statusB, setStatusB] = useState('todos');
  const [statusRepasse, setStatusRepasse] = useState('todos');

  const carteira = (casosA.data?.casos ?? []).filter((c) => statusA === 'todos' || c.status === statusA);
  const negociacoes = (casosB.data?.casos ?? []).filter((c) => statusB === 'todos' || c.status === statusB);
  const listaRepasses = (repasses.data ?? []).filter((r) => statusRepasse === 'todos' || r.status === statusRepasse);
  const totalRepasses = listaRepasses.reduce((s, r) => s + r.valor, 0);
  const custoConsultas = (auditoria.data ?? []).reduce((s, l) => s + l.custo, 0);

  const abaInicial = veA ? 'carteira' : veB ? 'negociacoes' : 'consultas';

  return (
    <>
      <CabecalhoDePagina titulo="Relatórios" descricao="Veja na tela, filtre e exporte o que está filtrado (CSV abre direto no Excel)." />
      <Tabs defaultValue={abaInicial}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            {veA ? <TabsTrigger value="carteira">Carteira (Plano A)</TabsTrigger> : null}
            {veA ? <TabsTrigger value="rede">Rede de campo</TabsTrigger> : null}
            {veA ? <TabsTrigger value="pracas">Praças</TabsTrigger> : null}
            {veA ? <TabsTrigger value="credores">Credores</TabsTrigger> : null}
            {veA ? <TabsTrigger value="repasses">Repasses</TabsTrigger> : null}
            {veB ? <TabsTrigger value="negociacoes">Negociações (Plano B)</TabsTrigger> : null}
            {auditor ? <TabsTrigger value="consultas">Consultas a fornecedor</TabsTrigger> : null}
          </TabsList>
        </div>

        {veA ? (
          <TabsContent value="carteira">
            <TabelaRelatorio
              titulo="Carteira do Plano A"
              descricao="Casos de recuperação com status, recuperador e prazos."
              arquivo="carteira-plano-a"
              carregando={casosA.isPending}
              erro={casosA.error}
              aoTentar={() => void casosA.refetch()}
              linhas={carteira}
              filtros={<FiltroStatus valor={statusA} aoMudar={setStatusA} opcoes={STATUS_RECUPERACAO} />}
              colunas={[
                {
                  titulo: 'Placa',
                  valor: (c) => c.placa,
                  celula: (c) => (
                    <Link to="/a/casos/$casoId" params={{ casoId: c.id }} className="font-mono font-semibold text-blue-300 hover:underline">
                      {c.placa}
                    </Link>
                  ),
                },
                { titulo: 'Modelo', valor: (c) => c.modelo },
                { titulo: 'Cidade', valor: (c) => [c.cidade, c.uf].filter(Boolean).join('/') || null },
                { titulo: 'Status', valor: (c) => c.status, celula: (c) => <StatusBadge status={c.status} tom={tomDoStatus(c.status)} /> },
                { titulo: 'Recuperador', valor: (c) => c.recuperadorNome },
                { titulo: 'Prazo máximo', valor: (c) => c.prazoMaximo, celula: (c) => (c.prazoMaximo ? formatarDataHora(c.prazoMaximo) : '—') },
                { titulo: 'Recebido em', valor: (c) => c.criadoEm, celula: (c) => formatarData(c.criadoEm) },
              ]}
            />
          </TabsContent>
        ) : null}

        {veA ? (
          <TabsContent value="rede">
            <TabelaRelatorio
              titulo="Produtividade da rede de campo"
              descricao="Casos de cada recuperador por etapa. Retomada é o que paga a comissão."
              arquivo="rede-de-campo"
              carregando={painel.isPending}
              erro={painel.error}
              linhas={painel.data?.recuperadores ?? []}
              colunas={[
                { titulo: 'Recuperador', valor: (r) => r.nome },
                { titulo: 'Situação', valor: (r) => r.status },
                { titulo: 'Cidades', valor: (r) => r.cidades.join(', ') },
                { titulo: 'Casos', valor: (r) => r.casos, numero: true },
                { titulo: 'Em campo', valor: (r) => r.emCampo, numero: true },
                { titulo: 'Retomados', valor: (r) => r.retomados, numero: true },
                { titulo: 'Sem êxito', valor: (r) => r.semExito, numero: true },
                { titulo: 'Taxa', valor: (r) => (r.casos ? Math.round((r.retomados / r.casos) * 100) : null), celula: (r) => (r.casos ? `${Math.round((r.retomados / r.casos) * 100)}%` : '—'), numero: true },
              ]}
            />
          </TabsContent>
        ) : null}

        {veA ? (
          <TabsContent value="pracas">
            <TabelaRelatorio
              titulo="Casos por praça"
              descricao="As cidades com mais casos, com o que está em campo e o que já foi retomado."
              arquivo="pracas"
              carregando={painel.isPending}
              erro={painel.error}
              linhas={painel.data?.porCidade ?? []}
              colunas={[
                { titulo: 'Cidade', valor: (c) => c.cidade },
                { titulo: 'UF', valor: (c) => c.uf },
                { titulo: 'Casos', valor: (c) => c.total, numero: true },
                { titulo: 'Em campo', valor: (c) => c.emCampo, numero: true },
                { titulo: 'Retomados', valor: (c) => c.retomados, numero: true },
              ]}
            />
          </TabsContent>
        ) : null}

        {veA ? (
          <TabsContent value="credores">
            <TabelaRelatorio
              titulo="Carteira por credor"
              descricao="Volume, dívida em aberto e retomadas de cada credor: base da prestação de contas."
              arquivo="credores"
              carregando={painel.isPending}
              erro={painel.error}
              linhas={painel.data?.porCredor ?? []}
              colunas={[
                { titulo: 'Credor', valor: (c) => c.credor },
                { titulo: 'Casos', valor: (c) => c.total, numero: true },
                { titulo: 'Retomados', valor: (c) => c.retomados, numero: true },
                { titulo: 'Dívida em aberto', valor: (c) => c.valorDivida, celula: (c) => formatarMoeda(c.valorDivida), numero: true },
              ]}
            />
          </TabsContent>
        ) : null}

        {veA ? (
          <TabsContent value="repasses">
            <TabelaRelatorio
              titulo="Repasses à rede de campo"
              descricao="Comissões, ajudas de custo e bônus, com status de pagamento."
              arquivo="repasses"
              carregando={repasses.isPending}
              erro={repasses.error}
              linhas={listaRepasses}
              filtros={<FiltroStatus valor={statusRepasse} aoMudar={setStatusRepasse} opcoes={['Pendente', 'Pago', 'Cancelado']} />}
              colunas={[
                { titulo: 'Data', valor: (r) => r.data, celula: (r) => formatarData(r.data) },
                { titulo: 'Recuperador', valor: (r) => r.recuperadorNome },
                { titulo: 'Placa', valor: (r) => r.placa },
                { titulo: 'Tipo', valor: (r) => r.tipo },
                { titulo: 'Status', valor: (r) => r.status },
                { titulo: 'Observação', valor: (r) => r.observacao },
                { titulo: 'Valor', valor: (r) => r.valor, celula: (r) => formatarMoeda(r.valor), numero: true },
              ]}
              rodape={
                <TableRow>
                  <TableCell colSpan={6} className="font-semibold">
                    Total filtrado
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{formatarMoeda(totalRepasses)}</TableCell>
                </TableRow>
              }
            />
          </TabsContent>
        ) : null}

        {veB ? (
          <TabsContent value="negociacoes">
            <TabelaRelatorio
              titulo="Negociações do Plano B"
              descricao="Leads em aquisição com saldo e pendências para transferir."
              arquivo="negociacoes-plano-b"
              carregando={casosB.isPending}
              erro={casosB.error}
              linhas={negociacoes}
              filtros={<FiltroStatus valor={statusB} aoMudar={setStatusB} opcoes={STATUS_AQUISICAO} />}
              colunas={[
                {
                  titulo: 'Placa',
                  valor: (c) => c.placa,
                  celula: (c) => (
                    <Link to="/b/casos/$casoId" params={{ casoId: c.id }} className="font-mono font-semibold text-blue-300 hover:underline">
                      {c.placa}
                    </Link>
                  ),
                },
                { titulo: 'Modelo', valor: (c) => c.modelo },
                { titulo: 'Status', valor: (c) => c.status, celula: (c) => <StatusBadge status={c.status} tom={tomDoStatus(c.status)} /> },
                { titulo: 'Origem do lead', valor: (c) => c.canalLead },
                { titulo: 'Saldo devedor', valor: (c) => c.saldoDevedor, celula: (c) => formatarMoeda(c.saldoDevedor), numero: true },
                { titulo: 'Anuência', valor: (c) => c.anuenciaCredor },
                { titulo: 'RENAJUD ativo', valor: (c) => c.renajudAtivo },
                { titulo: 'Gravame baixado', valor: (c) => c.gravameBaixado },
              ]}
            />
          </TabsContent>
        ) : null}

        {auditor ? (
          <TabsContent value="consultas">
            <TabelaRelatorio
              titulo="Trilha de consultas a fornecedor"
              descricao={`Procedência de cada consulta: base legal, justificativa, operador, custo e retenção. Custo total: ${formatarMoeda(custoConsultas)} em ${formatarNumero(auditoria.data?.length ?? 0)} consulta(s).`}
              arquivo="trilha-de-consultas"
              carregando={auditoria.isPending}
              erro={auditoria.error}
              linhas={auditoria.data ?? []}
              colunas={[
                { titulo: 'Consultado em', valor: (l) => l.consultadoEm, celula: (l) => formatarDataHora(l.consultadoEm) },
                { titulo: 'Operador', valor: (l) => l.operadorNome },
                { titulo: 'Fornecedor', valor: (l) => l.bureauNome },
                { titulo: 'Contrato', valor: (l) => l.contratoFornecedorId },
                { titulo: 'Base legal', valor: (l) => l.baseLegal },
                { titulo: 'Justificativa', valor: (l) => l.justificativa },
                { titulo: 'Retenção até', valor: (l) => l.retencaoAte, celula: (l) => formatarData(l.retencaoAte) },
                { titulo: 'Custo', valor: (l) => l.custo, celula: (l) => formatarMoeda(l.custo), numero: true },
              ]}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}
