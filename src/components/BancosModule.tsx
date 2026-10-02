import React, { useState } from 'react';
import { 
  Building2, 
  Plus, 
  Mail, 
  Globe, 
  BarChart3, 
  CheckCircle2, 
  Clock,
  MoreVertical,
  X
} from 'lucide-react';
import { MOCK_BANCOS } from '../constants';
import { showToast } from './Toast';
import { InfoTooltip } from './InfoTooltip';
import { motion, AnimatePresence } from 'motion/react';
import { Banco } from '../types';

export const BancosModule: React.FC = () => {
  const [bancos, setBancos] = useState<Banco[]>(MOCK_BANCOS);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleNewBanco = () => {
    setIsModalOpen(true);
  };

  const handleReport = (nome: string) => {
    showToast(`Gerando relatório detalhado para ${nome}...`, 'success');
  };

  const handleSaveBanco = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newBanco: Banco = {
      id: Math.random().toString(36).substr(2, 9),
      nome: formData.get('nome') as string,
      cnpj: formData.get('cnpj') as string,
      contato: 'Gestor Responsável',
      volumeMensal: parseInt(formData.get('volume') as string) || 0,
      taxaRecuperacao: 0,
      canal: (formData.get('canal') as any) || 'API',
      slaAcordado: parseInt(formData.get('sla') as string) || 15,
      casosAtivos: 0
    };
    setBancos([newBanco, ...bancos]);
    setIsModalOpen(false);
    showToast(`Banco ${newBanco.nome} cadastrado com sucesso!`, 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Bancos e Clientes</h1>
            <p className="text-slate-400 text-sm">Gestão de carteiras e SLAs por instituição financeira.</p>
          </div>
          <InfoTooltip text="Gerenciamento das instituições financeiras parceiras e monitoramento de performance por carteira." />
        </div>
        <button 
          onClick={handleNewBanco}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20"
        >
          <Plus size={18} />
          Novo Banco
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {bancos.map((banco) => (
          <div key={banco.id} className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 hover:border-white/20 transition-all group">
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-blue-400 border border-white/5 group-hover:bg-blue-600/10 transition-colors">
                <Building2 size={24} />
              </div>
              <button 
                onClick={() => showToast(`Opções para ${banco.nome}`, 'info')}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <MoreVertical size={20} />
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-white font-bold text-lg">{banco.nome}</h3>
              <p className="text-slate-500 text-xs">{banco.cnpj}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Volume Mensal</p>
                  <InfoTooltip text="Média de novos ativos enviados mensalmente por este banco." />
                </div>
                <p className="text-white font-bold">{banco.volumeMensal} ativos</p>
              </div>
              <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Taxa Recup.</p>
                  <InfoTooltip text="Eficiência histórica de recuperação para esta carteira específica." />
                </div>
                <p className="text-emerald-400 font-bold">{banco.taxaRecuperacao}%</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">Canal de Entrada</span>
                  <InfoTooltip text="Método de integração utilizado para o envio de novos ativos." />
                </div>
                <div className="flex items-center gap-1.5 text-white font-medium">
                  {banco.canal === 'API' ? <Globe size={12} className="text-blue-400" /> : <Mail size={12} className="text-amber-400" />}
                  {banco.canal}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">SLA Acordado</span>
                  <InfoTooltip text="Prazo máximo contratual para a recuperação ou devolução do ativo." />
                </div>
                <span className="text-white font-medium">{banco.slaAcordado} dias</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">Casos Ativos</span>
                  <InfoTooltip text="Total de veículos deste banco que estão atualmente em processo de recuperação." />
                </div>
                <span className="text-blue-400 font-bold">{banco.casosAtivos}</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/5">
              <button 
                onClick={() => handleReport(banco.nome)}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              >
                <BarChart3 size={14} />
                Ver Relatório Detalhado
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Novo Banco Modal */}
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
                <h2 className="text-xl font-bold text-white">Novo Banco Cliente</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSaveBanco} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Nome da Instituição</label>
                    <input name="nome" required placeholder="Ex: Banco Itaú" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">CNPJ</label>
                    <input name="cnpj" required placeholder="00.000.000/0000-00" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Volume Mensal Estimado</label>
                    <input name="volume" type="number" required placeholder="Ex: 500" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">SLA Acordado (Dias)</label>
                    <input name="sla" type="number" required placeholder="Ex: 90" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Canal de Integração</label>
                    <select name="canal" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500">
                      <option value="API">API (Webservice)</option>
                      <option value="Email">Email / Planilha</option>
                    </select>
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
