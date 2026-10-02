import React, { useState } from 'react';
import { 
  Database, 
  Plus, 
  Settings2, 
  Zap, 
  ShieldCheck, 
  Activity,
  Search,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit3,
  Cpu,
  X,
  ShieldAlert,
  BarChart,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { MOCK_BUREAUS, MOCK_ENRICHMENT_FLOWS, MOCK_ENRICHMENT_TASKS } from '../constants';
import { showToast } from './Toast';
import { InfoTooltip } from './InfoTooltip';
import { motion, AnimatePresence } from 'motion/react';
import { Bureau, EnrichmentFlow, EnrichmentTask } from '../types';

export const EnriquecimentoModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'bureaus' | 'fluxos' | 'monitoramento'>('bureaus');
  const [bureaus, setBureaus] = useState<Bureau[]>(MOCK_BUREAUS);
  const [fluxos, setFluxos] = useState<EnrichmentFlow[]>(MOCK_ENRICHMENT_FLOWS);
  const [tasks, setTasks] = useState<EnrichmentTask[]>(MOCK_ENRICHMENT_TASKS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [configBureau, setConfigBureau] = useState<Bureau | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const handleAddBureau = () => {
    setIsModalOpen(true);
  };

  const handleAddFlow = () => {
    showToast('Abrindo configurador de novo fluxo...', 'info');
  };

  const handleDeleteBureau = (id: string, name: string) => {
    if (confirm(`Deseja realmente desconectar o Birô ${name}?`)) {
      setBureaus(bureaus.filter(b => b.id !== id));
      showToast(`Birô ${name} desconectado com sucesso.`, 'success');
    }
  };

  const handleToggleFlow = (id: string) => {
    setFluxos(fluxos.map(f => 
      f.id === id ? { ...f, status: f.status === 'Ativo' ? 'Inativo' : 'Ativo' } : f
    ));
    showToast('Status do fluxo atualizado.', 'success');
  };

  const handleSaveBureau = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newBureau: Bureau = {
      id: Math.random().toString(36).substr(2, 9),
      nome: formData.get('nome') as string,
      tipo: formData.get('tipo') as any,
      status: 'Ativo',
      apiKey: '********-****-****-****-************',
      custoConsulta: parseFloat(formData.get('custo') as string),
      consultasMes: 0
    };
    setBureaus([...bureaus, newBureau]);
    setIsModalOpen(false);
    showToast(`Birô ${newBureau.nome} conectado com sucesso!`, 'success');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Enriquecimento de Dados</h1>
            <p className="text-slate-400 text-sm">Gestão de Birôs (APIs) e automação de fluxos de localização.</p>
          </div>
          <InfoTooltip text="Configure as fontes de dados externas e os processos automáticos para encontrar devedores e veículos." />
        </div>
        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('bureaus')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'bureaus' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            Birôs (APIs)
          </button>
          <button
            onClick={() => setActiveTab('fluxos')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'fluxos' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            Fluxos de Automação
          </button>
          <button
            onClick={() => setActiveTab('monitoramento')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'monitoramento' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            Monitoramento
          </button>
        </div>
      </div>

      {activeTab === 'bureaus' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Database size={20} className="text-blue-500" />
              Birôs Conectados
            </h3>
            <button 
              onClick={handleAddBureau}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"
            >
              <Plus size={18} />
              Conectar Birô
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bureaus.map((bureau) => (
              <div key={bureau.id} className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 hover:border-white/20 transition-all group">
                <div className="flex items-center justify-between mb-6">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-blue-400 border border-white/5">
                    {bureau.tipo === 'Crédito' ? <ShieldCheck size={24} /> : bureau.tipo === 'Veicular' ? <Cpu size={24} /> : <Activity size={24} />}
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    bureau.status === 'Ativo' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    {bureau.status}
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="text-white font-bold text-lg">{bureau.nome}</h4>
                  <p className="text-slate-500 text-xs">{bureau.tipo}</p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">API Key</span>
                    <span className="text-white font-mono">{bureau.apiKey.slice(0, 12)}...</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Custo p/ Consulta</span>
                    <span className="text-white font-bold">R$ {bureau.custoConsulta.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Consultas no Mês</span>
                    <span className="text-blue-400 font-bold">{bureau.consultasMes}</span>
                  </div>
                  {bureau.tempoRespostaMedio && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Latência Média</span>
                      <span className={`font-bold ${bureau.tempoRespostaMedio > 1500 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {bureau.tempoRespostaMedio}ms
                      </span>
                    </div>
                  )}
                  {bureau.taxaSucesso && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Taxa de Sucesso</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${bureau.taxaSucesso > 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${bureau.taxaSucesso}%` }}
                          />
                        </div>
                        <span className="text-white font-bold">{bureau.taxaSucesso}%</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-6 border-t border-white/5">
                  <button 
                    onClick={() => setConfigBureau(bureau)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Settings2 size={14} />
                    Configurar
                  </button>
                  <button 
                    onClick={() => handleDeleteBureau(bureau.id, bureau.nome)}
                    className="p-2 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'fluxos' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Zap size={20} className="text-amber-500" />
              Fluxos de Enriquecimento
            </h3>
            <button 
              onClick={handleAddFlow}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"
            >
              <Plus size={18} />
              Novo Fluxo
            </button>
          </div>

          <div className="space-y-4">
            {fluxos.map((fluxo) => (
              <div key={fluxo.id} className="bg-slate-900/50 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      fluxo.tipo === 'Automático' ? 'bg-blue-600/20 text-blue-400' : 'bg-amber-600/20 text-amber-400'
                    }`}>
                      {fluxo.tipo === 'Automático' ? <Zap size={20} /> : <Edit3 size={20} />}
                    </div>
                    <div>
                      <h4 className="text-white font-bold">{fluxo.nome}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-slate-500 text-[10px] uppercase font-bold">{fluxo.tipo}</span>
                        <span className="text-slate-700">•</span>
                        <span className="text-slate-500 text-[10px] uppercase font-bold">Gatilho: {fluxo.gatilho}</span>
                        {fluxo.prioridade && (
                          <>
                            <span className="text-slate-700">•</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 ${
                              fluxo.prioridade === 'Velocidade' ? 'text-blue-400' : 
                              fluxo.prioridade === 'Custo' ? 'text-emerald-400' : 'text-purple-400'
                            }`}>
                              Prioridade: {fluxo.prioridade}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Status:</span>
                      <button 
                        onClick={() => handleToggleFlow(fluxo.id)}
                        className="text-blue-500"
                      >
                        {fluxo.status === 'Ativo' ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                    </div>
                    <button className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-all">
                      <Settings2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">Birôs Utilizados:</span>
                    <div className="flex flex-wrap gap-2">
                      {fluxo.bureaus.map((bId) => {
                        const b = bureaus.find(x => x.id === bId);
                        return (
                          <span key={bId} className="px-2 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] text-slate-300">
                            {b?.nome || 'Birô Desconectado'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {fluxo.ultimaExecucao && (
                    <span className="text-[10px] text-slate-500">
                      Última execução: {new Date(fluxo.ultimaExecucao).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Smart Optimization Suggestion */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-600/10 border border-blue-500/30 rounded-2xl p-6 flex items-start gap-4"
          >
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <Sparkles size={24} />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-bold mb-1">Otimização Inteligente Disponível</h4>
              <p className="text-slate-400 text-sm mb-4">
                Identificamos que o birô <span className="text-blue-400 font-bold">CheckAuto</span> está com latência de 2.5s. 
                Sugerimos alternar para o <span className="text-emerald-400 font-bold">Sinesp Cidadão</span> para o fluxo "Enriquecimento Inicial" para reduzir o tempo de resposta em 80%.
              </p>
              <div className="flex gap-3">
                <button className="px-4 py-2 bg-blue-600 hover:bg-blue-50 text-white hover:text-blue-600 rounded-lg text-xs font-bold transition-all">
                  Aplicar Otimização
                </button>
                <button className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg text-xs font-bold transition-all">
                  Ignorar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : activeTab === 'monitoramento' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Activity size={20} className="text-emerald-500" />
              Monitoramento de Tarefas
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-slate-400">2 Processando</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-slate-400">1 Erro</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tarefa / Ativo</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fluxo</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progresso</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tasks.map((task) => {
                  const fluxo = fluxos.find(f => f.id === task.flowId);
                  return (
                    <tr key={task.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">#{task.id}</span>
                          <span className="text-[10px] text-slate-500">Ativo: {task.ativoId}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-300 font-medium">{fluxo?.nome}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden min-w-[100px]">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${task.progresso}%` }}
                              className={`h-full rounded-full ${
                                task.status === 'Erro' ? 'bg-red-500' : 
                                task.status === 'Concluído' ? 'bg-emerald-500' : 'bg-blue-500'
                              }`}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-white">{task.progresso}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                          task.status === 'Concluído' ? 'bg-emerald-500/10 text-emerald-400' :
                          task.status === 'Processando' ? 'bg-blue-500/10 text-blue-400' :
                          task.status === 'Erro' ? 'bg-red-500/10 text-red-400' :
                          'bg-slate-500/10 text-slate-400'
                        }`}>
                          {task.status === 'Processando' && <Activity size={10} className="animate-spin" />}
                          {task.status}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-slate-400">Início: {new Date(task.dataInicio).toLocaleTimeString()}</span>
                          {task.tempoEstimado && (
                            <span className="text-[10px] text-blue-400 font-bold">ETA: {task.tempoEstimado}s</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Novo Birô Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h2 className="text-xl font-bold text-white">Conectar Novo Birô</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSaveBureau} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Nome do Birô</label>
                    <input name="nome" required placeholder="Ex: Serasa Experian" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Tipo de Dado</label>
                    <select name="tipo" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500">
                      <option value="Crédito">Crédito / PF / PJ</option>
                      <option value="Veicular">Veicular / Histórico</option>
                      <option value="Localização">Localização / Mapas</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Custo por Consulta (R$)</label>
                    <input name="custo" type="number" step="0.01" required placeholder="2.50" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">API Key</label>
                    <input type="password" required placeholder="Insira sua chave de API" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all">
                    Conectar Birô
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Configuração de API Modal */}
      <AnimatePresence>
        {configBureau && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfigBureau(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-400">
                    <Settings2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Configurações de API</h2>
                    <p className="text-slate-400 text-xs">Ajustando integração com <span className="text-blue-400 font-bold">{configBureau.nome}</span></p>
                  </div>
                </div>
                <button onClick={() => setConfigBureau(null)} className="text-slate-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase">Endpoint Base</label>
                      <input 
                        defaultValue={`https://api.${configBureau.nome.toLowerCase().replace(/\s/g, '')}.com.br/v1`}
                        className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-xs text-white focus:outline-none focus:border-blue-500" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase">Tipo de Autenticação</label>
                      <select className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-xs text-white focus:outline-none focus:border-blue-500">
                        <option>Bearer Token</option>
                        <option>API Key (Header)</option>
                        <option>Basic Auth</option>
                        <option>OAuth 2.0</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase">Timeout (ms)</label>
                      <input defaultValue="5000" type="number" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-xs text-white focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase">Retentativas</label>
                      <select className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-xs text-white focus:outline-none focus:border-blue-500">
                        <option>0 - Nenhuma</option>
                        <option selected>3 - Padrão</option>
                        <option>5 - Agressivo</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-400 uppercase">Mapeamento de Resposta (JSON Path)</label>
                    <button className="text-blue-500 text-[10px] font-bold uppercase hover:underline">Adicionar Campo</button>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Endereço', path: '$.data.addresses[0].full' },
                      { label: 'Telefone', path: '$.data.contacts.phones[0].number' },
                      { label: 'Score', path: '$.data.credit_score.value' }
                    ].map((field, i) => (
                      <div key={i} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-500 w-20">{field.label}</span>
                        <input defaultValue={field.path} className="flex-1 bg-transparent border-none text-[10px] text-blue-400 font-mono focus:ring-0" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-600/5 border border-blue-500/20 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="text-blue-400" size={20} />
                      <h4 className="text-white font-bold text-sm">Ambiente de Teste</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Sandbox</span>
                      <div className="w-8 h-4 bg-blue-600 rounded-full relative">
                        <div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full" />
                      </div>
                    </div>
                  </div>
                  <p className="text-slate-400 text-xs mb-6">Execute uma chamada de teste para validar as credenciais e o mapeamento de campos configurado.</p>
                  <button 
                    onClick={() => {
                      setIsTestingConnection(true);
                      setTimeout(() => {
                        setIsTestingConnection(false);
                        showToast('Conexão estabelecida com sucesso! Payload recebido e mapeado.', 'success');
                      }, 2000);
                    }}
                    disabled={isTestingConnection}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
                  >
                    {isTestingConnection ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        >
                          <Activity size={16} />
                        </motion.div>
                        Testando...
                      </>
                    ) : (
                      <>
                        <Zap size={16} />
                        Testar Conexão
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-6 bg-white/5 border-t border-white/10 flex gap-4">
                <button onClick={() => setConfigBureau(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all">
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    showToast('Configurações de API salvas com sucesso.', 'success');
                    setConfigBureau(null);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all"
                >
                  Salvar Configurações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
