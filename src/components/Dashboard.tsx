import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Car, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  X,
  MapPin,
  ShieldCheck,
  User
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { InfoTooltip } from './InfoTooltip';

const dataRecuperacao = [
  { name: 'Jan', valor: 65 },
  { name: 'Fev', valor: 68 },
  { name: 'Mar', valor: 72 },
  { name: 'Abr', valor: 70 },
  { name: 'Mai', valor: 75 },
  { name: 'Jun', valor: 82 },
];

const dataCidades = [
  { name: 'BH', valor: 124 },
  { name: 'SP', valor: 186 },
  { name: 'RJ', valor: 95 },
  { name: 'PR', valor: 64 },
  { name: 'RS', valor: 42 },
];

const dataBancos = [
  { name: 'Itaú', value: 400 },
  { name: 'Bradesco', value: 300 },
  { name: 'Santander', value: 300 },
  { name: 'Pan', value: 200 },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

import { Map, Marker, Overlay } from 'pigeon-maps';
import { Ativo } from '../types';
import { PlacaMercosul } from './PlacaMercosul';

const MarkerAny = Marker as any;
const OverlayAny = Overlay as any;

interface DashboardProps {
  ativos: Ativo[];
  onViewDetails: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ ativos = [], onViewDetails }) => {
  const [selectedAtivo, setSelectedAtivo] = useState<Ativo | null>(null);
  const stats = {
    recebidos: ativos?.length || 0,
    recuperados: (ativos?.filter(a => a.status === 'Recuperado') || []).length,
    emAndamento: (ativos?.filter(a => ['Distribuído', 'Aceito', 'Em Campo', 'Localizado'].includes(a.status)) || []).length,
    emAlerta: (ativos?.filter(a => a.status === 'Recebido' || a.status === 'Em Análise') || []).length, // Simplified for demo
    perdidos: (ativos?.filter(a => a.status === 'Removido pelo Banco' || a.status === 'Encerrado') || []).length,
  };

  const taxaRecuperacao = stats.recebidos > 0 ? Math.round((stats.recuperados / stats.recebidos) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Executivo</h1>
          <p className="text-slate-400 text-sm">Visão geral da operação e performance da 3A Soluções.</p>
        </div>
        <InfoTooltip text="Este dashboard consolida dados de todas as frentes da operação em tempo real." />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard 
          title="Ativos Recebidos" 
          value={stats.recebidos.toString()} 
          trend="+12%" 
          icon={Car} 
          color="blue" 
          info="Total de veículos enviados pelos bancos para recuperação este mês."
        />
        <KPICard 
          title="Recuperados" 
          value={stats.recuperados.toString()} 
          trend="+8%" 
          icon={CheckCircle2} 
          color="emerald" 
          info="Veículos que já foram localizados e retomados com sucesso."
        />
        <KPICard 
          title="Taxa de Recup." 
          value={`${taxaRecuperacao}%`} 
          trend="+5%" 
          icon={TrendingUp} 
          color="indigo" 
          info="Percentual de sucesso: (Recuperados / Recebidos) * 100."
        />
        <KPICard 
          title="Em Andamento" 
          value={stats.emAndamento.toString()} 
          trend="-2%" 
          icon={Clock} 
          color="amber" 
          info="Casos que estão atualmente com recuperadores em campo."
        />
        <KPICard 
          title="Em Alerta" 
          value={stats.emAlerta.toString()} 
          trend="+4%" 
          icon={AlertCircle} 
          color="red" 
          info="Casos com SLA próximo do vencimento ou sem atualização há > 24h."
        />
        <KPICard 
          title="Perdidos" 
          value={stats.perdidos.toString()} 
          trend="-15%" 
          icon={TrendingDown} 
          color="slate" 
          info="Casos onde o ativo foi removido pelo banco ou dado como irrecuperável."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Evolução */}
        <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-bold">Evolução da Taxa de Recuperação</h3>
              <InfoTooltip text="Média mensal de sucesso na recuperação de ativos." />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <span>Meta: 75%</span>
            </div>
          </div>
          <div className="h-80 w-full min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={dataRecuperacao}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="valor" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Cidades */}
        <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <h3 className="text-white font-bold">Recuperações por Cidade</h3>
            <InfoTooltip text="Volume bruto de veículos recuperados nas principais praças de atuação." />
          </div>
          <div className="h-80 w-full min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={dataCidades}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="valor" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mapa de Calor / Distribuição Geográfica */}
        <div className="lg:col-span-3 bg-slate-900/50 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-bold">Distribuição Geográfica de Ativos</h3>
              <InfoTooltip text="Visualização em tempo real da dispersão de ativos por todo o território." />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                <span className="text-[10px] text-slate-400 uppercase font-bold">Recuperados</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                <span className="text-[10px] text-slate-400 uppercase font-bold">Em Campo</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded-full" />
                <span className="text-[10px] text-slate-400 uppercase font-bold">Pendentes</span>
              </div>
            </div>
          </div>
          <div className="h-96 rounded-xl overflow-hidden border border-white/5 relative">
            <Map 
              height={384} 
              defaultCenter={[-15.7801, -47.9292]} 
              defaultZoom={4}
            >
              {ativos.map((ativo) => {
                const coords: Record<string, [number, number]> = {
                  'Belo Horizonte': [-19.9167, -43.9333],
                  'São Paulo': [-23.5505, -46.6333],
                  'Rio de Janeiro': [-22.9068, -43.1729],
                  'Curitiba': [-25.4284, -49.2733]
                };
                const pos = coords[ativo.cidade] || [-15.7801, -47.9292];
                const offsetPos: [number, number] = [
                  pos[0] + (Math.random() - 0.5) * 0.8,
                  pos[1] + (Math.random() - 0.5) * 0.8
                ];

                  return (
                    <MarkerAny 
                      key={ativo.id} 
                      width={24} 
                      anchor={offsetPos} 
                      color={ativo.status === 'Recuperado' ? '#10b981' : ativo.status === 'Localizado' ? '#3b82f6' : '#f59e0b'}
                      onClick={() => setSelectedAtivo({ ...ativo, _mapPos: offsetPos } as any)}
                    />
                  );
              })}

              {selectedAtivo && (
                <OverlayAny anchor={(selectedAtivo as any)._mapPos} offset={[0, 0]}>
                  <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-2xl w-64 animate-in zoom-in duration-200">
                    <div className="flex justify-between items-start mb-3">
                      <PlacaMercosul placa={selectedAtivo.placa} size="sm" />
                      <button 
                        onClick={() => setSelectedAtivo(null)}
                        className="p-1 hover:bg-white/10 rounded-lg text-slate-400"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white font-bold text-sm">
                          <Car size={14} className="text-blue-500" />
                          {selectedAtivo.modelo}
                          <span className="text-[10px] text-slate-500 font-normal">({selectedAtivo.ano})</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-slate-300 text-[11px] font-medium">
                        <User size={12} className="text-slate-500" />
                        {selectedAtivo.devedor}
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-2 text-slate-400">
                          <MapPin size={12} />
                          {selectedAtivo.cidade}
                        </div>
                        <span className="text-slate-500">{selectedAtivo.cor}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <ShieldCheck size={14} className={selectedAtivo.status === 'Recuperado' ? 'text-emerald-500' : 'text-blue-500'} />
                        <span className={`font-bold ${selectedAtivo.status === 'Recuperado' ? 'text-emerald-500' : 'text-blue-500'}`}>
                          {selectedAtivo.status}
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                      <button 
                        onClick={() => onViewDetails(selectedAtivo.id)}
                        className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded-lg font-bold uppercase transition-all"
                      >
                        Ver Detalhes
                      </button>
                      <span className="text-[10px] text-white font-mono">14:32</span>
                    </div>
                  </div>
                </OverlayAny>
              )}
            </Map>
          </div>
        </div>

        {/* Distribuição por Banco */}
        <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <h3 className="text-white font-bold">Distribuição por Banco</h3>
            <InfoTooltip text="Representatividade de cada instituição financeira no volume total de ativos." />
          </div>
          <div className="h-64 min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={dataBancos}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {dataBancos.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {dataBancos.map((b, i) => (
              <div key={b.name} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                <span className="text-xs text-slate-400">{b.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Recuperadores */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-bold">Top 5 Recuperadores do Mês</h3>
              <InfoTooltip text="Ranking baseado em score de performance, taxa de sucesso e tempo de resposta." />
            </div>
            <button className="text-blue-500 text-xs font-bold hover:underline">Ver Ranking Completo</button>
          </div>
          <div className="space-y-4">
            {[
              { name: 'Carlos Silva', city: 'Belo Horizonte', score: 94, trend: 'up' },
              { name: 'Fernanda Lima', city: 'Curitiba', score: 91, trend: 'up' },
              { name: 'Ricardo Santos', city: 'Rio de Janeiro', score: 88, trend: 'down' },
              { name: 'Marcos Oliveira', city: 'São Paulo', score: 85, trend: 'up' },
              { name: 'Juliana Costa', city: 'Salvador', score: 82, trend: 'up' },
            ].map((rec, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-sm font-bold text-white">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{rec.name}</p>
                  <p className="text-xs text-slate-500">{rec.city}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-400">{rec.score} pts</p>
                  <div className={`flex items-center justify-end gap-1 text-[10px] ${rec.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {rec.trend === 'up' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    <span>{rec.trend === 'up' ? '+2.4%' : '-1.2%'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface KPICardProps {
  title: string;
  value: string;
  trend: string;
  icon: any;
  color: 'blue' | 'emerald' | 'amber' | 'red' | 'indigo' | 'slate';
  info: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, trend, icon: Icon, color, info }) => {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-500',
    emerald: 'bg-emerald-500/10 text-emerald-500',
    amber: 'bg-amber-500/10 text-amber-500',
    red: 'bg-red-500/10 text-red-500',
    indigo: 'bg-indigo-500/10 text-indigo-500',
    slate: 'bg-slate-500/10 text-slate-500',
  };

  const isPositive = trend.startsWith('+');

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-xl ${colorClasses[color]}`}>
          <Icon size={20} />
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trend}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{title}</p>
        <InfoTooltip text={info} />
      </div>
      <h4 className="text-2xl font-bold text-white mt-1">{value}</h4>
    </div>
  );
};
