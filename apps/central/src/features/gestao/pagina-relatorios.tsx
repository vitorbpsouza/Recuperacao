import { useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, FileSpreadsheetIcon, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Spinner } from '@workspace/ui/components/spinner';
import { toast } from '@workspace/ui/lib/toast';

import { CabecalhoDePagina } from '@/components/estado-da-consulta.tsx';
import { auditoriaQuery, casosQuery, pode, repassesQuery, type UsuarioSessao } from '@/lib/api.ts';
import { baixarCsv, gerarCsv } from '@/lib/csv.ts';

interface Relatorio {
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  visivel: (s: UsuarioSessao) => boolean;
  gerar: () => Promise<{ nome: string; csv: string }>;
}

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Exportações em CSV com o dado que cada perfil já enxerga — a API aplica o
 * mesmo filtro de canal. Nenhuma inclui nome ou documento de devedor: esse dado
 * só sai da ficha, com finalidade registrada.
 */
export function PaginaRelatorios({ sessao }: { sessao: UsuarioSessao }) {
  const queryClient = useQueryClient();
  const [gerando, setGerando] = useState<string | null>(null);

  const relatorios: Relatorio[] = [
    {
      titulo: 'Carteira do Plano A',
      descricao: 'Casos de recuperação com status, recuperador e prazos.',
      icone: FileSpreadsheetIcon,
      visivel: (s) => s.canaisVisiveis.includes('plataforma_credor'),
      gerar: async () => {
        const { casos } = await queryClient.fetchQuery(casosQuery('plataforma_credor'));
        return {
          nome: `carteira-plano-a-${hoje()}.csv`,
          csv: gerarCsv(casos, [
            ['Placa', (c) => c.placa],
            ['Modelo', (c) => c.modelo],
            ['Cidade', (c) => c.cidade],
            ['UF', (c) => c.uf],
            ['Status', (c) => c.status],
            ['Recuperador', (c) => c.recuperadorNome],
            ['Prazo de aceite', (c) => c.prazoVinculo],
            ['Prazo máximo', (c) => c.prazoMaximo],
            ['Recebido em', (c) => c.criadoEm],
          ]),
        };
      },
    },
    {
      titulo: 'Negociações do Plano B',
      descricao: 'Leads em aquisição com saldo e pendências para transferir.',
      icone: FileSpreadsheetIcon,
      visivel: (s) => s.canaisVisiveis.includes('lead_proprio'),
      gerar: async () => {
        const { casos } = await queryClient.fetchQuery(casosQuery('lead_proprio'));
        return {
          nome: `negociacoes-plano-b-${hoje()}.csv`,
          csv: gerarCsv(casos, [
            ['Placa', (c) => c.placa],
            ['Modelo', (c) => c.modelo],
            ['Status', (c) => c.status],
            ['Origem do lead', (c) => c.canalLead],
            ['Saldo devedor', (c) => c.saldoDevedor],
            ['Anuência do credor', (c) => c.anuenciaCredor],
            ['RENAJUD ativo', (c) => (c.renajudAtivo ? 'sim' : 'não')],
            ['Gravame baixado', (c) => (c.gravameBaixado ? 'sim' : 'não')],
            ['Recebido em', (c) => c.criadoEm],
          ]),
        };
      },
    },
    {
      titulo: 'Repasses à rede de campo',
      descricao: 'Comissões, ajudas de custo e bônus, com status de pagamento.',
      icone: FileSpreadsheetIcon,
      visivel: (s) => s.canaisVisiveis.includes('plataforma_credor'),
      gerar: async () => {
        const repasses = await queryClient.fetchQuery(repassesQuery);
        return {
          nome: `repasses-${hoje()}.csv`,
          csv: gerarCsv(repasses, [
            ['Data', (r) => r.data],
            ['Recuperador', (r) => r.recuperadorNome],
            ['Placa', (r) => r.placa],
            ['Tipo', (r) => r.tipo],
            ['Valor', (r) => r.valor],
            ['Status', (r) => r.status],
            ['Observação', (r) => r.observacao],
          ]),
        };
      },
    },
    {
      titulo: 'Trilha de consultas a bureau',
      descricao: 'Procedência de cada consulta: base legal, justificativa, operador e retenção.',
      icone: FileSpreadsheetIcon,
      visivel: pode.auditar,
      gerar: async () => {
        const linhas = await queryClient.fetchQuery(auditoriaQuery);
        return {
          nome: `trilha-de-consultas-${hoje()}.csv`,
          csv: gerarCsv(linhas, [
            ['Consultado em', (l) => l.consultadoEm],
            ['Operador', (l) => l.operadorNome],
            ['Bureau', (l) => l.bureauNome],
            ['Contrato', (l) => l.contratoFornecedorId],
            ['Base legal', (l) => l.baseLegal],
            ['Justificativa', (l) => l.justificativa],
            ['Campos retornados', (l) => l.camposRetornados.join(', ')],
            ['Retenção até', (l) => l.retencaoAte],
            ['Custo', (l) => l.custo],
          ]),
        };
      },
    },
  ];

  const exportar = async (r: Relatorio) => {
    setGerando(r.titulo);
    try {
      const { nome, csv } = await r.gerar();
      baixarCsv(nome, csv);
      toast.success(`${r.titulo} exportado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao exportar.');
    } finally {
      setGerando(null);
    }
  };

  return (
    <>
      <CabecalhoDePagina
        titulo="Relatórios"
        descricao="Exportações em CSV (abre direto no Excel) do que o seu perfil já enxerga."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {relatorios
          .filter((r) => r.visivel(sessao))
          .map((r) => (
            <Card key={r.titulo}>
              <CardHeader className="flex-row items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                  <r.icone className="size-5" aria-hidden />
                </span>
                <div>
                  <CardTitle className="text-white">{r.titulo}</CardTitle>
                  <CardDescription>{r.descricao}</CardDescription>
                </div>
              </CardHeader>
              <CardContent />
              <CardFooter>
                <Button variant="outline" onClick={() => void exportar(r)} disabled={gerando !== null}>
                  {gerando === r.titulo ? <Spinner /> : <DownloadIcon />}
                  Exportar CSV
                </Button>
              </CardFooter>
            </Card>
          ))}
      </div>
    </>
  );
}
