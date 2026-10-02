import React, { useState } from 'react';
import { 
  MapPin, 
  Send, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  UserPlus,
  ArrowRight,
  Zap,
  Loader2,
  X,
  Car,
  ShieldCheck,
  User
} from 'lucide-react';
import { MOCK_RECUPERADORES } from '../constants';
import { differenceInHours } from 'date-fns';
import { showToast } from './Toast';
import { InfoTooltip } from './InfoTooltip';
import { Ativo, StatusAtivo } from '../types';
import { PlacaMercosul } from './PlacaMercosul';
import { Map, Marker, Overlay } from 'pigeon-maps';

const MarkerAny = Marker as any;
const OverlayAny = Overlay as any;

interface DistribuicaoModuleProps {
  ativos: Ativo[];
  setAtivos: React.Dispatch<React.SetStateAction<Ativo[]>>;
  onViewDetails: (id: string) => void;
}

export const DistribuicaoModule: React.FC<DistribuicaoModuleProps> = ({ ativos, setAtivos, onViewDetails }) => {
  const [distributingId, setDistributingId] = useState<string | null>(null);
  const [showManualModal, setShowManualModal] = useState<Ativo | null>(null);
  const [selectedAtivos, setSelectedAtivos] = useState<string[]>([]);
  const [selectedMapAtivo, setSelectedMapAtivo] = useState<Ativo | null>(null);
  
  const ativosParaDistribuir = ativos.filter(a => a.status === 'Recebido' || a.status === 'Em Análise' || a.status === 'Enriquecido');
  const ativosEmCampo = ativos.filter(a => a.status === 'Em Campo' || a.status === 'Distribuído' || a.status === 'Aceito' || a.status === 'Localizado');

  // Simulação de Aceite do Agente
  React.useEffect(() => {
    const distribuídos = ativos.filter(a => a.status === 'Distribuído');
    if (distribuídos.length > 0) {
      const timer = setTimeout(() => {
        const target = distribuídos[0];
        setAtivos(prev => prev.map(a => 
          a.id === target.id ? { ...a, status: 'Aceito' as StatusAtivo, updatedAt: new Date().toISOString() } : a
        ));
        showToast(`Agente ${target.responsavel} aceitou o ativo ${target.placa}`, 'success');
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [ativos, setAtivos]);

  const getRecommendedRecuperador = (ativo: Ativo) => {
    // Inferir tipo de veículo (simplificado)
    const tipoAtivo = ativo.modelo.toLowerCase().includes('moto') ? 'Moto' : 
                     ativo.modelo.toLowerCase().includes('caminhão') || ativo.modelo.toLowerCase().includes('strada') ? 'Pesado' : 'Passeio';

    const candidatos = MOCK_RECUPERADORES.filter(r => 
      r.status === 'Ativo' && 
      r.tiposVeiculo.includes(tipoAtivo)
    );

    if (candidatos.length === 0) {
      // Fallback para qualquer ativo se não houver match de tipo
      return MOCK_RECUPERADORES.filter(r => r.status === 'Ativo').sort((a, b) => b.score - a.score)[0];
    }

    // 1. Prioridade: Cidade + Score
    const porCidade = candidatos.filter(r => r.cidades.includes(ativo.cidade));
    if (porCidade.length > 0) {
      return porCidade.sort((a, b) => b.score - a.score)[0];
    }

    // 2. Prioridade: Apenas Score (deslocamento necessário)
    return candidatos.sort((a, b) => b.score - a.score)[0];
  };

  const handleDistribute = (ativoId: string, recNome: string) => {
    const rec = MOCK_RECUPERADORES.find(r => r.nome === recNome);
    setDistributingId(ativoId);
    showToast(`CAMILA enviando ordem de serviço para ${recNome}...`, 'info');
    
    setTimeout(() => {
      setDistributingId(null);
      setAtivos(prev => prev.map(a => 
        a.id === ativoId ? { 
          ...a, 
          status: 'Distribuído' as StatusAtivo, 
          recuperadorId: rec?.id,
          responsavel: recNome,
          updatedAt: new Date().toISOString() 
        } : a
      ));
      setShowManualModal(null);
      setSelectedAtivos(prev => prev.filter(id => id !== ativoId));
      showToast(`Ativo enviado com sucesso para ${recNome}!`, 'success');
    }, 1500);
  };

  const handleBulkDistribute = () => {
    if (selectedAtivos.length === 0) return;
    
    showToast(`CAMILA processando envio em lote de ${selectedAtivos.length} ativos...`, 'info');
    setDistributingId('bulk');

    setTimeout(() => {
      setAtivos(prev => prev.map(a => {
        if (selectedAtivos.includes(a.id)) {
          const rec = getRecommendedRecuperador(a);
          return {
            ...a,
            status: 'Distribuído' as StatusAtivo,
            recuperadorId: rec.id,
            responsavel: rec.nome,
            updatedAt: new Date().toISOString()
          };
        }
        return a;
      }));
      setDistributingId(null);
      setSelectedAtivos([]);
      showToast(`${selectedAtivos.length} ativos enviados para campo com sucesso!`, 'success');
    }, 2500);
  };

  const toggleSelect = (id: string) => {
    setSelectedAtivos(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedAtivos.length === ativosParaDistribuir.length) {
      setSelectedAtivos([]);
    } else {
      setSelectedAtivos(ativosParaDistribuir.map(a => a.id));
    }
  };

  const handleManualIntervention = (ativo: Ativo) => {
    setShowManualModal(ativo);
    showToast(`Iniciando intervenção manual para ${ativo.placa}...`, 'info');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Distribuição e Campo</h1>
            <p className="text-slate-400 text-sm">Gestão inteligente de alocação de ativos para recuperadores.</p>
          </div>
          <InfoTooltip text="Módulo de logística que utiliza IA para alocar o melhor recuperador baseado em geolocalização e performance." />
        </div>
        <div className="flex items-center gap-3 bg-blue-600/10 border border-blue-500/20 px-4 py-2 rounded-2xl">
          <Zap size={18} className="text-blue-400" />
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">CAMILA: Automação Ativa</span>
          <InfoTooltip text="A IA CAMILA monitora a fila 24/7 e sugere distribuições automáticas para otimizar o SLA." />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Fila de Distribuição */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/50 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <Send size={18} className="text-blue-500" />
                    Fila de Distribuição
                  </h3>
                  <InfoTooltip text="Lista de ativos que aguardam envio para agentes de campo." />
                </div>
                {ativosParaDistribuir.length > 0 && (
                  <button 
                    onClick={toggleSelectAll}
                    className="text-[10px] font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
                  >
                    {selectedAtivos.length === ativosParaDistribuir.length ? 'Desmarcar Tudo' : 'Selecionar Tudo'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {selectedAtivos.length > 0 && (
                  <button 
                    onClick={handleBulkDistribute}
                    disabled={distributingId === 'bulk'}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20"
                  >
                    {distributingId === 'bulk' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                    Enviar {selectedAtivos.length} Selecionados
                  </button>
                )}
                <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                  {ativosParaDistribuir.length} Pendentes
                </span>
              </div>
            </div>
            <div className="divide-y divide-white/5">
              {ativosParaDistribuir.map((ativo) => {
                const recRecomendado = getRecommendedRecuperador(ativo);
                const isEspecialista = recRecomendado.cidades.includes(ativo.cidade);
                const isSelected = selectedAtivos.includes(ativo.id);
                const motivo = isEspecialista ? "Especialista Local" : "Melhor Performance Geral";
                
                return (
                  <div key={ativo.id} className={`p-6 hover:bg-white/5 transition-colors group relative ${isSelected ? 'bg-blue-600/5' : ''}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleSelect(ativo.id)}
                          className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                        />
                        <PlacaMercosul placa={ativo.placa} className="w-20 h-10 scale-90 origin-left" />
                        <div>
                          <p className="text-sm font-bold text-white">{ativo.modelo}</p>
                          <p className="text-xs text-slate-500">{ativo.cidade} • {ativo.banco}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1 mb-1">
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Prazo Crítico</p>
                          <InfoTooltip text="Tempo limite para o aceite do recuperador antes de alerta de atraso." />
                        </div>
                        <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                          <Clock size={12} />
                          <span>{differenceInHours(new Date(ativo.prazoMaximo), new Date())}h restantes</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-blue-600/5 border border-blue-500/20 rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                          <Zap size={16} className="text-blue-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Recomendação CAMILA: {motivo}</p>
                            <InfoTooltip text={isEspecialista ? "Agente com alta performance e presença física nesta cidade." : "Agente com melhor score geral disponível para deslocamento."} />
                          </div>
                          <p className="text-sm text-white font-medium">
                            {recRecomendado.nome} 
                            <span className="ml-2 text-[10px] text-slate-500 font-normal">
                              (Score {recRecomendado.score} • Sucesso {recRecomendado.taxaRecuperacao}%)
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setShowManualModal(ativo)}
                          className="px-3 py-2 rounded-lg text-[10px] font-bold text-slate-400 hover:bg-white/5 transition-all"
                        >
                          Trocar
                        </button>
                        <button 
                          onClick={() => handleDistribute(ativo.id, recRecomendado.nome)}
                          disabled={distributingId === ativo.id}
                          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                        >
                          {distributingId === ativo.id ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              Enviar para Campo
                              <ArrowRight size={14} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {ativosParaDistribuir.length === 0 && (
                <div className="p-12 text-center">
                  <CheckCircle2 className="mx-auto text-emerald-500 mb-4" size={48} />
                  <p className="text-white font-bold">Fila Limpa</p>
                  <p className="text-slate-500 text-sm">Todos os ativos foram distribuídos pela CAMILA.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <MapPin size={18} className="text-emerald-500" />
                  Monitoramento de Campo
                </h3>
                <InfoTooltip text="Acompanhamento em tempo real dos ativos que já estão com agentes em campo." />
              </div>
              <span className="px-2 py-1 bg-emerald-600/20 text-emerald-400 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                {ativosEmCampo.length} Ativos
              </span>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {ativosEmCampo.map((ativo) => {
                  const rec = MOCK_RECUPERADORES.find(r => r.id === ativo.recuperadorId);
                  return (
                    <div key={ativo.id} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <PlacaMercosul placa={ativo.placa} className="w-16 h-8 scale-90 origin-left" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-white">
                            {ativo.responsavel || rec?.nome || (ativo.status === 'Distribuído' ? 'Aguardando Aceite' : 'N/A')}
                          </p>
                          <span className="px-1.5 py-0.5 bg-blue-600/20 text-blue-400 text-[8px] font-bold rounded uppercase">Responsável</span>
                        </div>
                        <p className="text-xs text-slate-500">{ativo.modelo} • {ativo.cidade}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Status</p>
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
                          {ativo.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Alertas Críticos */}
        <div className="space-y-6">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-red-500">
                <AlertTriangle size={24} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-white font-bold">Alertas Críticos</h3>
                  <InfoTooltip text="Casos que exigem atenção imediata do gestor por risco de perda de prazo ou inatividade." />
                </div>
                <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest">Intervenção Manual</p>
              </div>
            </div>
            <div className="space-y-4">
              {ativos.filter(a => a.status === 'Recebido' || a.status === 'Em Análise').slice(0, 1).map(ativo => (
                <div key={ativo.id} className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl">
                  <p className="text-white text-sm font-bold mb-2">Ativo em risco de perda</p>
                  <div className="flex items-center gap-3 mb-4">
                    <PlacaMercosul placa={ativo.placa} className="w-16 h-8" />
                    <p className="text-slate-400 text-xs leading-relaxed">
                      está a menos de 1 hora do prazo máximo sem aceite de recuperador.
                    </p>
                  </div>
                  <button 
                    onClick={() => handleManualIntervention(ativo)}
                    className="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-xs font-bold transition-all"
                  >
                    Assumir Manualmente
                  </button>
                </div>
              ))}
              {ativos.filter(a => a.status === 'Recebido' || a.status === 'Em Análise').length === 0 && (
                <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-center">
                  <p className="text-slate-500 text-xs">Nenhum alerta crítico no momento.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-white font-bold">Mapa de Operações</h3>
              <InfoTooltip text="Visão espacial da distribuição de ativos e agentes ativos no território nacional." />
            </div>
            <div className="aspect-square bg-slate-800 rounded-2xl border border-white/5 relative overflow-hidden">
              <Map 
                height={300} 
                defaultCenter={[-19.9167, -43.9333]} 
                defaultZoom={4}
                metaWheelZoom={true}
              >
                {ativos.map((ativo) => {
                  const coords: Record<string, [number, number]> = {
                    'Belo Horizonte': [-19.9167, -43.9333],
                    'São Paulo': [-23.5505, -46.6333],
                    'Rio de Janeiro': [-22.9068, -43.1729],
                    'Curitiba': [-25.4284, -49.2733]
                  };
                  const pos = coords[ativo.cidade] || [-15.7801, -47.9292]; // Fallback Brasília
                  
                  // Adicionar um pequeno offset aleatório para não sobrepor exatamente na mesma cidade
                  const offsetPos: [number, number] = [
                    pos[0] + (Math.random() - 0.5) * 0.5,
                    pos[1] + (Math.random() - 0.5) * 0.5
                  ];

                  return (
                    <MarkerAny 
                      key={ativo.id} 
                      width={30} 
                      anchor={offsetPos} 
                      color={ativo.status === 'Recuperado' ? '#10b981' : ativo.status === 'Localizado' ? '#3b82f6' : '#f59e0b'}
                      onClick={() => setSelectedMapAtivo({ ...ativo, _mapPos: offsetPos } as any)}
                    />
                  );
                })}

                {selectedMapAtivo && (
                  <OverlayAny anchor={(selectedMapAtivo as any)._mapPos} offset={[0, 0]}>
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-2xl w-64 animate-in zoom-in duration-200">
                      <div className="flex justify-between items-start mb-3">
                        <PlacaMercosul placa={selectedMapAtivo.placa} size="sm" />
                        <button 
                          onClick={() => setSelectedMapAtivo(null)}
                          className="p-1 hover:bg-white/10 rounded-lg text-slate-400"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-white font-bold text-sm">
                            <Car size={14} className="text-blue-500" />
                            {selectedMapAtivo.modelo}
                            <span className="text-[10px] text-slate-500 font-normal">({selectedMapAtivo.ano})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-300 text-[11px] font-medium">
                          <User size={12} className="text-slate-500" />
                          {selectedMapAtivo.devedor}
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-2 text-slate-400">
                            <MapPin size={12} />
                            {selectedMapAtivo.cidade}
                          </div>
                          <span className="text-slate-500">{selectedMapAtivo.cor}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <ShieldCheck size={14} className={selectedMapAtivo.status === 'Recuperado' ? 'text-emerald-500' : 'text-blue-500'} />
                          <span className={`font-bold ${selectedMapAtivo.status === 'Recuperado' ? 'text-emerald-500' : 'text-blue-500'}`}>
                            {selectedMapAtivo.status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <button 
                          onClick={() => onViewDetails(selectedMapAtivo.id)}
                          className="w-full text-[10px] bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded-lg font-bold uppercase transition-all"
                        >
                          Ver Ficha Completa
                        </button>
                      </div>
                    </div>
                  </OverlayAny>
                )}
              </Map>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-white font-bold text-lg">12</p>
                <p className="text-[10px] text-slate-500 uppercase">Sudeste</p>
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-lg">4</p>
                <p className="text-[10px] text-slate-500 uppercase">Sul</p>
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-lg">2</p>
                <p className="text-[10px] text-slate-500 uppercase">Nordeste</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Modal de Intervenção Manual */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Intervenção de Gestão</h2>
                <p className="text-slate-400 text-xs">Assumindo controle manual do ativo <span className="text-blue-400 font-bold">{showManualModal.placa}</span></p>
              </div>
              <button 
                onClick={() => setShowManualModal(null)}
                className="p-2 hover:bg-white/5 rounded-full text-slate-400 transition-colors"
              >
                <UserPlus size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
                  <Zap size={24} />
                </div>
                <div>
                  <p className="text-white text-sm font-bold">Por que intervir?</p>
                  <p className="text-slate-400 text-xs">O algoritmo CAMILA prioriza eficiência geográfica, mas você pode forçar a alocação para um parceiro de confiança ou equipe interna.</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Selecionar Recuperador Manualmente</p>
                <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {MOCK_RECUPERADORES.map(rec => (
                    <button
                      key={rec.id}
                      onClick={() => handleDistribute(showManualModal.id, rec.nome)}
                      disabled={distributingId === showManualModal.id}
                      className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 border border-white/10">
                          {rec.nome.charAt(0)}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{rec.nome}</p>
                          <p className="text-[10px] text-slate-500">{rec.cidades[0]} • Score: {rec.score} • Sucesso: {rec.taxaRecuperacao}%</p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 bg-white/5 flex gap-3">
              <button 
                onClick={() => setShowManualModal(null)}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-slate-400 hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  showToast("Ativo movido para Gestão Interna", "success");
                  setShowManualModal(null);
                }}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20"
              >
                Gestão Interna (Elite)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
