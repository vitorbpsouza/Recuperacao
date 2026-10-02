import React, { useState } from 'react';
import { 
  Briefcase, 
  MessageSquare, 
  Clock, 
  AlertCircle, 
  ChevronRight,
  User,
  Send
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { showToast } from './Toast';
import { InfoTooltip } from './InfoTooltip';
import { PlacaMercosul } from './PlacaMercosul';

import { Ativo } from '../types';

interface OperacoesModuleProps {
  ativos: Ativo[];
}

export const OperacoesModule: React.FC<OperacoesModuleProps> = ({ ativos }) => {
  const [message, setMessage] = useState('');
  const casosAtivos = ativos.filter(a => a.status === 'Em Campo' || a.status === 'Localizado' || a.status === 'Distribuído' || a.status === 'Aceito');
  const [selectedAtivoId, setSelectedAtivoId] = useState<string | null>(casosAtivos.length > 0 ? casosAtivos[0].id : null);

  const selectedAtivo = casosAtivos.find(a => a.id === selectedAtivoId);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message && selectedAtivo) {
      showToast(`Mensagem enviada para o campo (${selectedAtivo.placa}).`, 'success');
      setMessage('');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Operações Internas</h1>
            <p className="text-slate-400 text-sm">Acompanhamento em tempo real e suporte à equipe de campo.</p>
          </div>
          <InfoTooltip text="Monitoramento direto das atividades em campo e canal de comunicação com os recuperadores." />
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">8 Operadores Online</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lista de Casos Ativos */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Briefcase size={20} className="text-blue-500" />
              Casos em Acompanhamento
            </h3>
            <InfoTooltip text="Ativos que estão atualmente com equipes de campo ou já foram localizados e aguardam remoção." />
          </div>
          <div className="grid grid-cols-1 gap-4">
            {casosAtivos.map((ativo) => (
              <div 
                key={ativo.id} 
                onClick={() => setSelectedAtivoId(ativo.id)}
                className={`bg-slate-900/50 border rounded-2xl p-6 transition-all group cursor-pointer ${
                  selectedAtivoId === ativo.id ? 'border-blue-500 ring-1 ring-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <PlacaMercosul placa={ativo.placa} />
                    <div>
                      <p className="text-sm font-bold text-white">{ativo.modelo}</p>
                      <p className="text-xs text-slate-500">{ativo.cidade} • {ativo.banco}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
                      {ativo.status}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-2">Última atualização: há 12 min</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex -space-x-2">
                    {[1, 2].map(i => (
                      <div key={i} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-950 flex items-center justify-center text-[10px] font-bold text-white">
                        {i === 1 ? 'OP' : 'RC'}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 bg-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <MessageSquare size={14} className="text-slate-500" />
                      <p className="text-xs text-slate-400 truncate max-w-[200px]">"Recuperador em deslocamento para o endereço 2..."</p>
                    </div>
                    <button 
                      className={`transition-colors ${selectedAtivoId === ativo.id ? 'text-blue-400' : 'text-blue-500 hover:text-blue-400'}`}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat e Alertas */}
        <div className="space-y-6">
          <div className="bg-slate-900/50 border border-white/10 rounded-3xl overflow-hidden flex flex-col h-[500px]">
            <div className="p-6 border-b border-white/10 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <MessageSquare size={18} className="text-blue-500" />
                    Chat de Suporte
                  </h3>
                  <InfoTooltip text="Canal direto entre a central e os recuperadores em campo." />
                </div>
                {selectedAtivo && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedAtivo.placa}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {selectedAtivo ? (
                <>
                  <div className="flex flex-col gap-1">
                    <div className="bg-slate-800 rounded-2xl p-3 text-xs text-white max-w-[80%] space-y-2">
                      <p>Olá {selectedAtivo.responsavel || 'Agente'}, algum progresso no ativo:</p>
                      <PlacaMercosul placa={selectedAtivo.placa} className="w-16 h-8" />
                    </div>
                    <span className="text-[10px] text-slate-600 ml-2">Operador • 14:20</span>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <div className="bg-blue-600 rounded-2xl p-3 text-xs text-white max-w-[80%]">
                      Sim, estou no local. O veículo está na garagem, aguardando o guincho.
                    </div>
                    <span className="text-[10px] text-slate-600 mr-2">{selectedAtivo.responsavel || 'Agente'} • 14:22</span>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-slate-600 mb-4">
                    <MessageSquare size={32} />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">Selecione um caso para iniciar o suporte</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/10">
              <form onSubmit={handleSendMessage} className="relative">
                <input 
                  type="text" 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="w-full bg-slate-800 border border-white/5 rounded-xl py-2.5 pl-4 pr-10 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="text-amber-500" size={20} />
              <div className="flex items-center gap-2">
                <h4 className="text-white font-bold text-sm">Atenção CAMILA</h4>
                <InfoTooltip text="Alertas automáticos gerados pela CAMILA baseados em inatividade ou atrasos de SLA." />
              </div>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <PlacaMercosul placa="RJX4H88" className="w-16 h-8" />
              <p className="text-slate-400 text-xs leading-relaxed">
                está há mais de <span className="text-amber-400 font-bold">3 horas</span> sem atualização de status pelo campo.
              </p>
            </div>
            <button 
              onClick={() => showToast('Solicitando atualização de status...', 'info')}
              className="w-full mt-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
            >
              Solicitar Atualização
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
