import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  MoreHorizontal, 
  Clock, 
  MapPin, 
  ChevronRight,
  Zap,
  ShieldCheck,
  History,
  Download,
  Loader2,
  Database,
  Phone,
  Mail,
  FileText,
  Trash2,
  ExternalLink,
  AlertCircle,
  User,
  X
} from 'lucide-react';
import { Ativo, StatusAtivo } from '../types';
import { format, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlacaMercosul } from './PlacaMercosul';
import { showToast } from './Toast';
import { InfoTooltip } from './InfoTooltip';
import { motion, AnimatePresence } from 'framer-motion';

interface AtivosModuleProps {
  ativos: Ativo[];
  setAtivos: React.Dispatch<React.SetStateAction<Ativo[]>>;
  initialSelectedId?: string | null;
  onClearSelection?: () => void;
}

export const AtivosModule: React.FC<AtivosModuleProps> = ({ 
  ativos, 
  setAtivos, 
  initialSelectedId,
  onClearSelection 
}) => {
  const [selectedAtivo, setSelectedAtivo] = useState<Ativo | null>(null);

  // Handle initial selection from map
  React.useEffect(() => {
    if (initialSelectedId) {
      const found = ativos.find(a => a.id === initialSelectedId);
      if (found) {
        setSelectedAtivo(found);
        // Scroll to top or ensure details are visible
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [initialSelectedId, ativos]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleNewAtivo = () => {
    setIsModalOpen(true);
  };

  const handleExport = () => {
    showToast('Gerando relatório de ativos para exportação...', 'success');
  };

  const handleAction = (ativo: Ativo, action: string) => {
    setOpenMenuId(null);
    if (action === 'distribute') {
      setIsProcessing('distribute');
      showToast(`CAMILA analisando melhor recuperador para ${ativo.placa}...`, 'info');
      setTimeout(() => {
        setIsProcessing(null);
        const updatedAtivos = ativos.map(a => 
          a.id === ativo.id ? { ...a, status: 'Distribuído' as StatusAtivo } : a
        );
        setAtivos(updatedAtivos);
        if (selectedAtivo?.id === ativo.id) setSelectedAtivo({ ...ativo, status: 'Distribuído' });
        showToast(`Ativo ${ativo.placa} distribuído com sucesso via Inteligência Geográfica!`, 'success');
      }, 2500);
    } else if (action === 'enrich') {
      setIsProcessing('enrich');
      showToast(`CAMILA consultando birôs para enriquecer ${ativo.placa}...`, 'info');
      setTimeout(() => {
        setIsProcessing(null);
        const enrichmentData = {
          telefones: ['(11) 98888-1111', '(11) 3333-2222'],
          enderecos: ['Rua Nova, 999, São Paulo, SP'],
          emails: ['contato@exemplo.com'],
          scoreCredito: 620,
          situacaoCadastral: 'Regular',
          ultimaAtualizacao: new Date().toISOString()
        };
        const updatedAtivos = ativos.map(a => 
          a.id === ativo.id ? { ...a, enrichmentData, status: 'Enriquecido' as StatusAtivo } : a
        );
        setAtivos(updatedAtivos);
        if (selectedAtivo?.id === ativo.id) setSelectedAtivo({ ...ativo, enrichmentData, status: 'Enriquecido' });
        showToast(`Dados de ${ativo.devedor} enriquecidos com sucesso!`, 'success');
      }, 2000);
    } else if (action === 'delete') {
      if (confirm(`Deseja realmente remover o ativo ${ativo.placa}?`)) {
        setAtivos(ativos.filter(a => a.id !== ativo.id));
        if (selectedAtivo?.id === ativo.id) setSelectedAtivo(null);
        showToast(`Ativo ${ativo.placa} removido com sucesso.`, 'success');
      }
    } else {
      showToast(`Ação "${action}" executada para ${ativo.placa}`, 'info');
    }
  };

  const handleSaveNewAtivo = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newAtivo: Ativo = {
      id: Math.random().toString(36).substr(2, 9),
      placa: formData.get('placa') as string,
      modelo: formData.get('modelo') as string,
      ano: parseInt(formData.get('ano') as string),
      cor: formData.get('cor') as string,
      devedor: formData.get('devedor') as string,
      documento: formData.get('documento') as string,
      banco: formData.get('banco') as string,
      valorDivida: parseFloat(formData.get('valor') as string),
      cidade: formData.get('cidade') as string,
      dataRecebimento: new Date().toISOString(),
      status: 'Recebido',
      prazoVinculo: new Date(Date.now() + 2 * 3600000).toISOString(),
      prazoMaximo: new Date(Date.now() + 24 * 3600000).toISOString(),
      chassi: 'SIMULADO-' + Math.random().toString(36).toUpperCase().substr(2, 10)
    };

    setAtivos([newAtivo, ...ativos]);
    setIsModalOpen(false);
    showToast(`Ativo ${newAtivo.placa} cadastrado com sucesso!`, 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Ativos</h1>
            <p className="text-slate-400 text-sm">Controle total do ciclo de vida dos veículos em recuperação.</p>
          </div>
          <InfoTooltip text="Módulo central para gestão de veículos, desde o recebimento do banco até a recuperação final." />
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all border border-white/5"
          >
            <Download size={18} />
            Exportar
          </button>
          <button 
            onClick={handleNewAtivo}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
          >
            <Plus size={18} />
            Novo Ativo
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* List Section */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-white/10">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por placa, devedor ou banco..."
                className="w-full bg-slate-800 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button className="p-2 bg-slate-800 text-slate-400 rounded-xl hover:text-white transition-colors">
              <Filter size={20} />
            </button>
          </div>

          <div className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden overflow-x-auto custom-scrollbar relative">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white/5 text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                  <th className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      Ativo / Placa
                      <InfoTooltip text="Modelo do veículo e placa no padrão Mercosul." />
                    </div>
                  </th>
                  <th className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      Devedor / Banco
                      <InfoTooltip text="Nome do devedor e instituição financeira solicitante." />
                    </div>
                  </th>
                  <th className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      Status
                      <InfoTooltip text="Etapa atual do processo de recuperação." />
                    </div>
                  </th>
                  <th className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      Prazo Crítico
                      <InfoTooltip text="Tempo restante baseado no SLA acordado com o banco." />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ativos.map((ativo) => (
                  <tr 
                    key={ativo.id} 
                    onClick={() => setSelectedAtivo(ativo)}
                    className={`hover:bg-white/5 transition-colors cursor-pointer ${selectedAtivo?.id === ativo.id ? 'bg-blue-600/10' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <PlacaMercosul placa={ativo.placa} />
                        <div>
                          <p className="text-sm font-bold text-white whitespace-nowrap">{ativo.modelo}</p>
                          <p className="text-xs text-slate-500">{ativo.ano} • {ativo.cor}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-white whitespace-nowrap">{ativo.devedor}</p>
                      <p className="text-xs text-slate-500">{ativo.banco}</p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={ativo.status} />
                    </td>
                    <td className="px-6 py-4">
                      <TimerBadge deadline={ativo.prazoMaximo} />
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === ativo.id ? null : ativo.id);
                        }}
                        className="p-2 text-slate-500 hover:text-white transition-colors"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      
                      <AnimatePresence>
                        {openMenuId === ativo.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="absolute right-6 top-12 w-56 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="p-2 space-y-1">
                              <button 
                                onClick={() => handleAction(ativo, 'distribute')}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-blue-600 rounded-xl transition-all"
                              >
                                <MapPin size={16} />
                                Distribuir p/ Campo
                              </button>
                              <button 
                                onClick={() => handleAction(ativo, 'enrich')}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-amber-600 rounded-xl transition-all"
                              >
                                <Database size={16} />
                                Enriquecer Dados
                              </button>
                              <button 
                                onClick={() => handleAction(ativo, 'history')}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                              >
                                <History size={16} />
                                Histórico Completo
                              </button>
                              <div className="h-px bg-white/5 my-1" />
                              <button 
                                onClick={() => handleAction(ativo, 'delete')}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-red-400 hover:text-white hover:bg-red-600 rounded-xl transition-all"
                              >
                                <Trash2 size={16} />
                                Remover Ativo
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isProcessing && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-white/10 p-8 rounded-3xl flex flex-col items-center space-y-4 shadow-2xl">
                  <Loader2 className="text-blue-500 animate-spin" size={48} />
                  <div className="text-center">
                    <p className="text-white font-bold">Processando Ação</p>
                    <p className="text-slate-500 text-xs">CAMILA está executando a tarefa solicitada...</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Detail Section */}
        {selectedAtivo && (
          <div className="w-full lg:w-96 space-y-6 animate-in slide-in-from-right duration-300">
            <div className="bg-slate-900/50 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-6 bg-blue-600/10 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-white font-bold">Detalhes do Ativo</h3>
                <button 
                  onClick={() => {
                    setSelectedAtivo(null);
                    onClearSelection?.();
                  }} 
                  className="text-slate-500 hover:text-white"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <PlacaMercosul placa={selectedAtivo.placa} className="w-24 h-12 scale-110 origin-left" />
                  <div className="ml-2">
                    <h4 className="text-white font-bold text-lg">{selectedAtivo.modelo}</h4>
                    <p className="text-slate-500 text-sm">{selectedAtivo.ano} • {selectedAtivo.cor}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="flex items-center gap-1 mb-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Valor da Dívida</p>
                      <InfoTooltip text="Valor total em aberto no contrato do financiamento." />
                    </div>
                    <p className="text-white font-bold">R$ {selectedAtivo.valorDivida.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="flex items-center gap-1 mb-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Cidade</p>
                      <InfoTooltip text="Última localização conhecida ou endereço de contrato." />
                    </div>
                    <p className="text-white font-bold">{selectedAtivo.cidade}</p>
                  </div>
                </div>

                {/* Dados do Cliente / Birôs */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Dados do Devedor (Birôs)</h5>
                    <InfoTooltip text="Informações de contato e localização enriquecidas via APIs de Birôs." />
                  </div>
                  
                  {selectedAtivo.enrichmentData ? (
                    <div className="bg-blue-600/5 border border-blue-500/20 rounded-xl p-4 space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <User size={14} className="text-blue-400" />
                          <span className="font-bold text-white">{selectedAtivo.devedor}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <FileText size={12} />
                          {selectedAtivo.documento}
                        </div>
                      </div>

                      <div className="space-y-2 pt-3 border-t border-white/5">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Telefones Localizados</p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {selectedAtivo.enrichmentData.telefones.map((tel, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-white">
                              <Phone size={12} className="text-emerald-400" />
                              {tel}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-3 border-t border-white/5">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Endereços Identificados</p>
                        <div className="grid grid-cols-1 gap-2">
                          {selectedAtivo.enrichmentData.enderecos.map((end, i) => (
                            <div key={i} className="flex items-start gap-2 text-[10px] text-slate-300 leading-tight">
                              <MapPin size={12} className="text-amber-400 shrink-0 mt-0.5" />
                              {end}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={14} className="text-emerald-500" />
                          <span className="text-[10px] text-slate-400">Score de Crédito:</span>
                        </div>
                        <span className="text-xs font-bold text-white">{selectedAtivo.enrichmentData.scoreCredito}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6 text-center space-y-3">
                      <AlertCircle size={24} className="text-amber-500 mx-auto" />
                      <div>
                        <p className="text-xs font-bold text-white">Dados Básicos</p>
                        <p className="text-[10px] text-slate-500">Este ativo possui apenas dados cadastrais do banco.</p>
                      </div>
                      <button 
                        onClick={() => handleAction(selectedAtivo, 'enrich')}
                        className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 rounded-xl text-[10px] font-bold uppercase transition-all"
                      >
                        Enriquecer via Birôs
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h5 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Ações Rápidas</h5>
                  <div className="grid grid-cols-1 gap-2">
                    <button 
                      onClick={() => handleAction(selectedAtivo, 'distribute')}
                      disabled={!!isProcessing}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      {isProcessing === 'distribute' ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Processando IA...
                        </>
                      ) : (
                        <>
                          <Zap size={16} />
                          Distribuir para Campo
                        </>
                      )}
                    </button>
                    <button 
                      onClick={() => handleAction(selectedAtivo, 'history')}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-white/5"
                    >
                      <History size={16} />
                      Histórico Completo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Novo Ativo Modal */}
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
              className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h2 className="text-xl font-bold text-white">Cadastrar Novo Ativo</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSaveNewAtivo} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Placa</label>
                    <input name="placa" required placeholder="ABC1D23" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Modelo</label>
                    <input name="modelo" required placeholder="Ex: VW Gol 1.0" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Ano</label>
                    <input name="ano" type="number" required placeholder="2023" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Cor</label>
                    <input name="cor" required placeholder="Branco" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Devedor</label>
                    <input name="devedor" required placeholder="Nome Completo" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">CPF/CNPJ</label>
                    <input name="documento" required placeholder="000.000.000-00" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Banco</label>
                    <input name="banco" required placeholder="Ex: Itaú Unibanco" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Valor da Dívida (R$)</label>
                    <input name="valor" type="number" step="0.01" required placeholder="50000.00" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Cidade</label>
                    <input name="cidade" required placeholder="Ex: São Paulo" className="w-full bg-slate-800 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all">
                    Salvar Ativo
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

const StatusBadge: React.FC<{ status: StatusAtivo }> = ({ status }) => {
  const styles: Record<StatusAtivo, string> = {
    'Recebido': 'bg-slate-500/10 text-slate-400',
    'Em Enriquecimento': 'bg-blue-500/10 text-blue-400',
    'Enriquecido': 'bg-emerald-500/10 text-emerald-400',
    'Em Análise': 'bg-indigo-500/10 text-indigo-400',
    'Distribuído': 'bg-amber-500/10 text-amber-400',
    'Aceito': 'bg-emerald-500/10 text-emerald-400',
    'Em Campo': 'bg-blue-600/20 text-blue-400 border border-blue-500/30',
    'Localizado': 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30',
    'Recuperado': 'bg-emerald-500 text-white',
    'Encerrado': 'bg-slate-800 text-slate-500',
    'Removido pelo Banco': 'bg-red-500/10 text-red-400',
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${styles[status]}`}>
      {status}
    </span>
  );
};

const TimerBadge: React.FC<{ deadline: string }> = ({ deadline }) => {
  const hoursLeft = differenceInHours(new Date(deadline), new Date());
  
  let color = 'text-emerald-400 bg-emerald-500/10';
  if (hoursLeft < 1) color = 'text-red-400 bg-red-500/10 animate-pulse';
  else if (hoursLeft < 2) color = 'text-amber-400 bg-amber-500/10';

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg w-fit whitespace-nowrap ${color}`}>
      <Clock size={12} />
      <span className="text-xs font-bold">{hoursLeft > 0 ? `${hoursLeft}h restantes` : 'Expirado'}</span>
    </div>
  );
};

const TimelineItem: React.FC<{ label: string, date: string, status: 'completed' | 'active' | 'pending' }> = ({ label, date, status }) => {
  return (
    <div className="flex gap-4 relative z-10">
      <div className={`w-4 h-4 rounded-full border-2 ${
        status === 'completed' ? 'bg-blue-500 border-blue-500' :
        status === 'active' ? 'bg-slate-950 border-blue-500 animate-pulse' :
        'bg-slate-950 border-slate-800'
      }`} />
      <div className="flex-1">
        <p className={`text-xs font-bold ${status === 'pending' ? 'text-slate-600' : 'text-white'}`}>{label}</p>
        {date !== '--' && (
          <p className="text-[10px] text-slate-500">{format(new Date(date), "dd MMM, HH:mm", { locale: ptBR })}</p>
        )}
      </div>
    </div>
  );
};
