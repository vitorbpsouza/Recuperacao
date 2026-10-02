import React, { useState } from 'react';
import { 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Filter, 
  Download,
  Search,
  Calendar,
  ChevronRight,
  CreditCard,
  Wallet,
  Receipt,
  BrainCircuit,
  Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { MOCK_REPASSES, MOCK_RECUPERADORES, MOCK_ATIVOS } from '../constants';
import { Repasse, Recuperador, CamilaFinancialRecommendation } from '../types';
import { showToast } from './Toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { analyzeFinancialPriorities } from '../services/camilaFinanceiroService';

interface FinanceiroModuleProps {
  onPaymentPaid?: (repasse: Repasse, recuperador?: Recuperador) => void;
}

const CamilaRecommendationDisplay = ({ rec }: { rec: CamilaFinancialRecommendation }) => (
  <div className="flex flex-col gap-1">
    <div className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
      rec.prioridade === 'Crítica' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
      rec.prioridade === 'Alta' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
      rec.prioridade === 'Média' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
      'bg-slate-500/20 text-slate-400 border border-slate-500/30'
    }`}>
      <Zap size={10} />
      {rec.prioridade}
    </div>
    <span className="text-[9px] text-slate-500 line-clamp-1 group-hover:line-clamp-none transition-all cursor-help" title={rec.justificativa}>
      {rec.justificativa}
    </span>
  </div>
);

export const FinanceiroModule = ({ onPaymentPaid }: FinanceiroModuleProps) => {
  const [repasses, setRepasses] = useState<Repasse[]>(MOCK_REPASSES);
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState<CamilaFinancialRecommendation[]>([]);

  const stats = {
    totalPago: repasses.filter(r => r.status === 'Pago').reduce((acc, curr) => acc + curr.valor, 0),
    totalPendente: repasses.filter(r => r.status === 'Pendente').reduce((acc, curr) => acc + curr.valor, 0),
    volumeMes: repasses.length,
    mediaComissao: repasses.length > 0 ? repasses.reduce((acc, curr) => acc + curr.valor, 0) / repasses.length : 0
  };

  const filteredRepasses = repasses.filter(r => {
    const matchesStatus = filterStatus === 'todos' || r.status.toLowerCase() === filterStatus.toLowerCase();
    const recuperador = MOCK_RECUPERADORES.find(rec => rec.id === r.recuperadorId);
    const matchesSearch = recuperador?.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         r.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handlePagar = (id: string) => {
    const repasse = repasses.find(r => r.id === id);
    const recuperador = MOCK_RECUPERADORES.find(rec => rec.id === repasse?.recuperadorId);
    
    setRepasses(prev => prev.map(r => r.id === id ? { ...r, status: 'Pago' } : r));
    showToast('Pagamento processado com sucesso!', 'success');
    
    if (repasse && onPaymentPaid) {
      onPaymentPaid({ ...repasse, status: 'Pago' }, recuperador);
    }
  };

  const handleExport = () => {
    showToast('Gerando relatório financeiro...', 'info');
    setTimeout(() => {
      showToast('Relatório exportado (CSV)', 'success');
    }, 1500);
  };

  const handleCamilaAnalysis = async () => {
    setIsAnalyzing(true);
    showToast('CAMILA está analisando os repasses pendentes...', 'info');
    
    try {
      // Os repasses pendentes vêm do banco, no servidor — não dos mocks da tela.
      const results = await analyzeFinancialPriorities();
      setRecommendations(results);
      showToast('Análise da CAMILA concluída!', 'success');
    } catch (error) {
      // Sem resultado simulado: a mensagem do servidor diz o que falhou.
      showToast(
        error instanceof Error
          ? `CAMILA: ${error.message}`
          : 'Erro ao realizar análise inteligente.',
        'error',
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
              <DollarSign size={24} />
            </div>
            <span className="text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded-full">+12%</span>
          </div>
          <p className="text-slate-400 text-sm font-medium">Total Pago (Mês)</p>
          <h3 className="text-2xl font-bold text-white mt-1">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalPago)}
          </h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-400">
              <Clock size={24} />
            </div>
            <span className="text-amber-400 text-xs font-bold bg-amber-500/10 px-2 py-1 rounded-full">Aguardando</span>
          </div>
          <p className="text-slate-400 text-sm font-medium">Pendente de Repasse</p>
          <h3 className="text-2xl font-bold text-white mt-1">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalPendente)}
          </h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
              <Wallet size={24} />
            </div>
            <span className="text-blue-400 text-xs font-bold bg-blue-500/10 px-2 py-1 rounded-full">Volume</span>
          </div>
          <p className="text-slate-400 text-sm font-medium">Qtd. de Repasses</p>
          <h3 className="text-2xl font-bold text-white mt-1">{stats.volumeMes}</h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400">
              <ArrowUpRight size={24} />
            </div>
            <span className="text-purple-400 text-xs font-bold bg-purple-500/10 px-2 py-1 rounded-full">Média</span>
          </div>
          <p className="text-slate-400 text-sm font-medium">Ticket Médio Repasse</p>
          <h3 className="text-2xl font-bold text-white mt-1">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.mediaComissao)}
          </h3>
        </motion.div>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/50 p-4 rounded-2xl border border-white/5">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por recuperador ou ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 bg-slate-800 border border-white/10 rounded-xl px-3 py-2">
            <Filter size={16} className="text-slate-400" />
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent text-sm text-white focus:outline-none"
            >
              <option value="todos">Todos Status</option>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button 
            onClick={handleCamilaAnalysis}
            disabled={isAnalyzing}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
              isAnalyzing 
                ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 border-white/10 text-white hover:shadow-lg hover:shadow-blue-600/20'
            }`}
          >
            <BrainCircuit size={18} className={isAnalyzing ? 'animate-spin' : ''} />
            {isAnalyzing ? 'Analisando...' : 'Análise CAMILA'}
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium text-white transition-colors w-full md:w-auto justify-center"
          >
            <Download size={18} />
            Exportar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID / Data</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recuperador</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ativo / Tipo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">CAMILA</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredRepasses.map((repasse) => {
                const recuperador = MOCK_RECUPERADORES.find(r => r.id === repasse.recuperadorId);
                const ativo = MOCK_ATIVOS.find(a => a.id === repasse.ativoId);
                
                return (
                  <tr key={repasse.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">#{repasse.id}</span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                          <Calendar size={10} />
                          {format(new Date(repasse.data), "dd 'de' MMM, yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                          {recuperador?.nome.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-white">{recuperador?.nome}</span>
                          <span className="text-[10px] text-slate-500">{recuperador?.documento}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-200">{ativo?.placa || 'N/A'}</span>
                        <span className={`text-[10px] font-bold uppercase mt-1 ${
                          repasse.tipo === 'Comissão' ? 'text-blue-400' : 'text-purple-400'
                        }`}>
                          {repasse.tipo}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-white">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(repasse.valor)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {recommendations.find(rec => rec.repasseId === repasse.id) ? (
                        <CamilaRecommendationDisplay rec={recommendations.find(r => r.repasseId === repasse.id)!} />
                      ) : (
                        <span className="text-[10px] text-slate-700 italic">Aguardando análise</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        repasse.status === 'Pago' ? 'bg-emerald-500/10 text-emerald-400' :
                        repasse.status === 'Pendente' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {repasse.status === 'Pago' ? <CheckCircle2 size={12} /> : 
                         repasse.status === 'Pendente' ? <Clock size={12} /> : 
                         <XCircle size={12} />}
                        {repasse.status}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {repasse.status === 'Pendente' ? (
                        <button 
                          onClick={() => handlePagar(repasse.id)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-blue-600/20"
                        >
                          Pagar Agora
                        </button>
                      ) : (
                        <button className="p-2 text-slate-500 hover:text-white transition-colors">
                          <Receipt size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {filteredRepasses.length === 0 && (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-slate-600 mb-4">
              <Search size={32} />
            </div>
            <h3 className="text-white font-bold">Nenhum repasse encontrado</h3>
            <p className="text-slate-500 text-sm mt-1">Tente ajustar seus filtros ou termo de busca.</p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-white/10 p-6 rounded-2xl">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <CreditCard size={18} className="text-blue-400" />
            Próximos Pagamentos Agendados
          </h3>
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-slate-400">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Lote de Repasses #{1024 + i}</p>
                    <p className="text-[10px] text-slate-500">Agendado para 15/03/2024</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">R$ 12.450,00</p>
                  <span className="text-[10px] text-amber-400 font-bold uppercase">Processando</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-white/10 p-6 rounded-2xl">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <ArrowDownLeft size={18} className="text-emerald-400" />
            Resumo de Entradas (Bancos)
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                  <DollarSign size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Itaú Unibanco</p>
                  <p className="text-[10px] text-slate-500">Recebimento de Honorários</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-emerald-400">+ R$ 45.200,00</p>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Hoje, 09:45</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                  <DollarSign size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Santander</p>
                  <p className="text-[10px] text-slate-500">Recebimento de Honorários</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-emerald-400">+ R$ 28.150,00</p>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Ontem, 16:20</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
