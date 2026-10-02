import React from 'react';
import { 
  BarChart3, 
  Download, 
  Filter, 
  BrainCircuit, 
  TrendingUp, 
  AlertCircle, 
  MapPin,
  ChevronRight
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { showToast } from './Toast';
import { InfoTooltip } from './InfoTooltip';
import { MOCK_RECUPERADORES } from '../constants';

const dataPerformance = [
  { name: 'Sem 1', valor: 45 },
  { name: 'Sem 2', valor: 52 },
  { name: 'Sem 3', valor: 48 },
  { name: 'Sem 4', valor: 61 },
  { name: 'Sem 5', valor: 55 },
  { name: 'Sem 6', valor: 67 },
];

import { Ativo } from '../types';

interface RelatoriosModuleProps {
  ativos: Ativo[];
}

export const RelatoriosModule: React.FC<RelatoriosModuleProps> = ({ ativos = [] }) => {
  const handleExport = () => {
    showToast('Preparando exportação de PDF...', 'info');
    setTimeout(() => {
      showToast('Relatório exportado com sucesso!', 'success');
    }, 2000);
  };

  const handleFilters = () => {
    showToast('Abrindo painel de filtros avançados...', 'info');
  };

  const handleReportClick = (name: string) => {
    showToast(`Carregando relatório: ${name}`, 'info');
  };

  // Insights Dinâmicos
  const recuperadorComQueda = MOCK_RECUPERADORES.find(r => r.score < 80) || MOCK_RECUPERADORES[1];
  const ativosEmCampoCount = (ativos?.filter(a => a.status === 'Em Campo' || a.status === 'Distribuído' || a.status === 'Aceito') || []).length;
  const ativosSP = (ativos?.filter(a => a.cidade === 'São Paulo') || []).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Relatórios e Inteligência</h1>
            <p className="text-slate-400 text-sm">Análises avançadas e previsões geradas pela CAMILA.</p>
          </div>
          <InfoTooltip text="Central de BI e Inteligência Artificial para análise de performance e tendências da operação." />
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleFilters}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all border border-white/5 flex items-center gap-2"
          >
            <Filter size={18} />
            Filtros Avançados
          </button>
          <button 
            onClick={handleExport}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
          >
            <Download size={18} />
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Inteligência Preditiva CAMILA */}
        <div className="lg:col-span-3 bg-gradient-to-br from-blue-600/20 to-indigo-900/20 border border-blue-500/30 rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <BrainCircuit size={120} className="text-blue-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/40">
                <BrainCircuit size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-white font-bold text-xl">Inteligência Preditiva CAMILA</h2>
                  <InfoTooltip text="Insights gerados por modelos de Machine Learning baseados em dados históricos da 3A Soluções." />
                </div>
                <p className="text-blue-400 text-xs font-bold uppercase tracking-widest">Análise de Tendências e Recomendações</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 text-amber-400 mb-3">
                  <TrendingUp size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">Volume de Entrada</span>
                </div>
                <p className="text-white text-sm leading-relaxed">
                  "Com base no histórico, <span className="text-blue-400 font-bold">quinta-feira</span> é o dia com maior volume de entrada de ativos — recomendo aumentar equipe de campo."
                </p>
              </div>
              <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 text-red-400 mb-3">
                  <AlertCircle size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">Gargalo de Cobertura</span>
                </div>
                <p className="text-white text-sm leading-relaxed">
                  "Cidade de <span className="text-blue-400 font-bold">São Paulo</span> aparece com crescimento de 40% em demandas mas cobertura insuficiente: apenas {MOCK_RECUPERADORES.filter(r => r.cidades.includes('São Paulo')).length} recuperadores para {ativosSP} ativos."
                </p>
              </div>
              <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 text-emerald-400 mb-3">
                  <TrendingUp size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">Otimização de Score</span>
                </div>
                <p className="text-white text-sm leading-relaxed">
                  "Recuperador <span className="text-blue-400 font-bold">{recuperadorComQueda.nome}</span> tem padrão de queda de performance nos finais de mês — avaliar conversa de alinhamento."
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico de Performance */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-white/10 rounded-3xl p-8">
          <div className="flex items-center gap-2 mb-8">
            <h3 className="text-white font-bold flex items-center gap-2">
              <BarChart3 size={20} className="text-blue-500" />
              Performance de Recuperação (SLA)
            </h3>
            <InfoTooltip text="Média de cumprimento de prazos e sucesso de recuperação ao longo das últimas semanas." />
          </div>
          <div className="h-80 w-full min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={dataPerformance}>
                <defs>
                  <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                />
                <Area type="monotone" dataKey="valor" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorValor)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Relatórios Disponíveis */}
        <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <h3 className="text-white font-bold">Relatórios Disponíveis</h3>
            <InfoTooltip text="Acesso rápido a relatórios analíticos detalhados por categoria." />
          </div>
          <div className="space-y-3">
            {[
              'Performance por Recuperador',
              'Ativos por Status',
              'Análise de Ativos Perdidos',
              'Performance por Cidade',
              'SLA por Banco Cliente'
            ].map((rel, i) => (
              <button 
                key={i}
                onClick={() => handleReportClick(rel)}
                className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-white/10 transition-all group"
              >
                <span className="text-sm font-medium text-slate-300 group-hover:text-white">{rel}</span>
                <ChevronRight size={18} className="text-slate-600 group-hover:text-blue-500" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
