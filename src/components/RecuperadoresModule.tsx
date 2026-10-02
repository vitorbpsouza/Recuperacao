import React, { useState } from 'react';
import { 
  Trophy, 
  Star, 
  MapPin, 
  TrendingUp, 
  Search, 
  Filter,
  Medal,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  X
} from 'lucide-react';
import { MOCK_RECUPERADORES } from '../constants';
import { showToast } from './Toast';
import { InfoTooltip } from './InfoTooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { Recuperador } from '../types';

export const RecuperadoresModule: React.FC = () => {
  const [recuperadores, setRecuperadores] = useState<Recuperador[]>(MOCK_RECUPERADORES);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleNewRecuperador = () => {
    setIsModalOpen(true);
  };

  const handleRankingCity = () => {
    showToast('Filtrando ranking por cidade...', 'info');
  };

  const handleSaveRecuperador = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newRec: Recuperador = {
      id: Math.random().toString(36).substr(2, 9),
      nome: formData.get('nome') as string,
      documento: formData.get('documento') as string,
      registro: formData.get('registro') as string,
      telefone: formData.get('telefone') as string,
      whatsapp: formData.get('telefone') as string,
      cidades: (formData.get('cidades') as string).split(',').map(c => c.trim()),
      tiposVeiculo: ['Passeio'],
      status: 'Ativo',
      dataCadastro: new Date().toISOString(),
      score: 85,
      taxaRecuperacao: 0,
      tempoMedioAceite: 0,
      tempoMedioConclusao: 0,
      naoRespostas: 0,
      casosExpirados: 0
    };
    setRecuperadores([newRec, ...recuperadores]);
    setIsModalOpen(false);
    showToast(`Recuperador ${newRec.nome} cadastrado com sucesso!`, 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Ranking de Recuperadores</h1>
            <p className="text-slate-400 text-sm">Performance e inteligência de campo monitorada pela CAMILA.</p>
          </div>
          <InfoTooltip text="Ranking de performance dos agentes de campo baseado em métricas de sucesso e agilidade." />
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleRankingCity}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all border border-white/5"
          >
            Ranking por Cidade
          </button>
          <button 
            onClick={handleNewRecuperador}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
          >
            <Plus size={18} />
            Novo Cadastro
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Top 3 Visual */}
        <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-6">
          {recuperadores.slice(0, 3).map((rec, i) => (
            <div key={rec.id} className="relative bg-slate-900/50 border border-white/10 rounded-3xl p-6 overflow-hidden group">
              <div className="absolute top-0 right-0 p-4">
                {i === 0 && <Medal className="text-amber-400" size={32} />}
                {i === 1 && <Medal className="text-slate-300" size={32} />}
                {i === 2 && <Medal className="text-amber-700" size={32} />}
              </div>
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 rounded-2xl bg-slate-800 border-2 border-blue-500/30 flex items-center justify-center text-2xl font-bold text-white group-hover:border-blue-500 transition-colors">
                  {rec.nome.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">{rec.nome}</h3>
                  <div className="flex items-center justify-center gap-1 text-slate-500 text-xs">
                    <MapPin size={12} />
                    <span>{rec.cidades[0]}</span>
                  </div>
                </div>
                <div className="w-full grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-xl p-2">
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Score</p>
                      <InfoTooltip text="Pontuação geral de 0 a 100 baseada em múltiplos KPIs." />
                    </div>
                    <p className="text-blue-400 font-bold text-lg">{rec.score}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2">
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Taxa Rec.</p>
                      <InfoTooltip text="Percentual de ativos recuperados em relação aos distribuídos." />
                    </div>
                    <p className="text-emerald-400 font-bold text-lg">{rec.taxaRecuperacao}%</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Full List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-white/10">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text" 
                placeholder="Buscar recuperador..."
                className="w-full bg-slate-800 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <select className="bg-slate-800 border border-white/5 rounded-xl py-2 px-4 text-sm text-white focus:outline-none">
              <option>Todas as Cidades</option>
              <option>Belo Horizonte</option>
              <option>São Paulo</option>
              <option>Rio de Janeiro</option>
            </select>
          </div>

          <div className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                  <th className="px-6 py-4">Posição / Nome</th>
                  <th className="px-6 py-4">Cidades de Atuação</th>
                  <th className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      Performance (CAMILA)
                      <InfoTooltip text="Métricas de eficiência calculadas pela inteligência CAMILA." />
                    </div>
                  </th>
                  <th className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      Tempos Médios
                      <InfoTooltip text="Média de tempo para aceitar e concluir uma demanda." />
                    </div>
                  </th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recuperadores.map((rec, i) => (
                  <tr key={rec.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-600 group-hover:text-blue-500 transition-colors">#{i + 1}</span>
                        <div>
                          <p className="text-sm font-bold text-white">{rec.nome}</p>
                          <p className="text-[10px] text-slate-500">{rec.registro}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {rec.cidades.map(c => (
                          <span key={c} className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Score</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-blue-400">{rec.score}</span>
                            <div className="w-16 bg-slate-800 h-1 rounded-full overflow-hidden">
                              <div className="bg-blue-500 h-full" style={{ width: `${rec.score}%` }} />
                            </div>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Taxa</p>
                          <span className="text-sm font-bold text-emerald-400">{rec.taxaRecuperacao}%</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <Clock size={10} />
                          <span>Aceite: <span className="text-white font-bold">{rec.tempoMedioAceite} min</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <CheckCircle2 size={10} />
                          <span>Conclusão: <span className="text-white font-bold">{rec.tempoMedioConclusao} dias</span></span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          rec.status === 'Ativo' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {rec.status}
                        </span>
                        <div className="flex gap-2">
                          <div className="flex items-center gap-1 text-[10px] text-slate-500">
                            <XCircle size={10} className="text-red-500" />
                            <span>{rec.naoRespostas}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Novo Recuperador Modal */}
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
                <h2 className="text-xl font-bold text-white">Novo Recuperador</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSaveRecuperador} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Nome Completo</label>
                    <input name="nome" required placeholder="Ex: João da Silva" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Documento (CPF)</label>
                    <input name="documento" required placeholder="000.000.000-00" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Registro Profissional</label>
                    <input name="registro" required placeholder="Ex: CREA-SP 12345" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Telefone / WhatsApp</label>
                    <input name="telefone" required placeholder="(11) 99999-9999" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Cidades de Atuação (separadas por vírgula)</label>
                    <input name="cidades" required placeholder="São Paulo, Guarulhos" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all">
                    Cadastrar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
