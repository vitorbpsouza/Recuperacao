import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@workspace/ui/components/chart';
import { useMovimentoReduzido } from '@workspace/ui/hooks/use-movimento-reduzido';

interface Props {
  dados: { status: string; quantidade: number }[];
  /** Cor do plano: azul (A) ou índigo (B). */
  cor: string;
}

const ALTURA_LINHA = 28;

/**
 * Quantos casos em cada etapa do ciclo de vida do canal, na ordem do
 * vocabulário. Barras horizontais: com 9 a 11 status, o nome inteiro de cada
 * etapa fica legível, sem rótulo inclinado nem cortado.
 */
export function GraficoStatus({ dados, cor }: Props) {
  const config = { quantidade: { label: 'Casos', color: cor } } satisfies ChartConfig;
  const semAnimacao = useMovimentoReduzido();
  return (
    <ChartContainer config={config} className="w-full" style={{ height: dados.length * ALTURA_LINHA + 24 }}>
      <BarChart data={dados} layout="vertical" margin={{ left: 0, right: 32, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} hide domain={[0, (maximo: number) => Math.max(maximo, 1)]} />
        <YAxis type="category" dataKey="status" tickLine={false} axisLine={false} width={150} fontSize={12} interval={0} />
        <ChartTooltip cursor={{ fill: 'var(--accent)' }} content={<ChartTooltipContent hideLabel={false} />} />
        <Bar
          dataKey="quantidade"
          fill="var(--color-quantidade)"
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
          isAnimationActive={!semAnimacao}
        >
          <LabelList dataKey="quantidade" position="right" className="fill-foreground" fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
