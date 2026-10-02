import React, { useState, useRef, useEffect } from 'react';
import { 
  BrainCircuit, 
  Bell, 
  Search, 
  ChevronRight,
  Zap,
  AlertTriangle,
  Info,
  CheckCircle2,
  Loader2,
  Send,
  X,
  Sparkles,
  MessageSquare,
  Database,
  TrendingUp,
  Clock
} from 'lucide-react';
import { CAMILA_INSIGHTS, MOCK_RECUPERADORES } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from './Toast';
import { Ativo } from '../types';
import { PlacaMercosul } from './PlacaMercosul';

interface CamilaPanelProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  ativos: Ativo[];
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'camila';
  timestamp: Date;
}

export const CamilaPanel: React.FC<CamilaPanelProps> = ({ isOpen, setIsOpen, ativos = [] }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'initial',
      text: `Olá, Gestor. Estou monitorando ${ativos?.length || 0} ativos em tempo real. Identifiquei alguns pontos que requerem sua atenção.`,
      sender: 'camila',
      timestamp: new Date()
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Insights Dinâmicos baseados no estado real
  const insightsDinamicos = [
    { id: 'i1', tipo: 'critico', mensagem: `${(ativos?.filter(a => a.status === 'Recebido') || []).length} novos ativos aguardam análise inicial`, data: new Date().toISOString() },
    { id: 'i2', tipo: 'alerta', mensagem: `Recuperador ${MOCK_RECUPERADORES[1].nome} está com score ${MOCK_RECUPERADORES[1].score} (queda de 15%)`, data: new Date().toISOString() },
    { id: 'i3', tipo: 'info', mensagem: `${(ativos?.filter(a => a.status === 'Em Campo' || a.status === 'Distribuído') || []).length} ativos estão em campo atualmente`, data: new Date().toISOString() },
    { id: 'i4', tipo: 'sucesso', mensagem: 'Taxa de recuperação consolidada em 72%', data: new Date().toISOString() },
  ];

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputValue.trim();

    if (!text) return;

    const userMsg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      text,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);
    showToast('CAMILA processando...', 'info');

    // Simular resposta da CAMILA
    setTimeout(() => {
      const normalizedText = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      // Tentar encontrar por placa (mesmo que parcial)
      const foundAtivo = ativos.find(a => {
        const normalizedPlaca = a.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
        return normalizedText.includes(normalizedPlaca) || normalizedPlaca.includes(normalizedText);
      });

      let responseText = "";

      if (foundAtivo) {
        responseText = `Localizei o ativo ${foundAtivo.placa} (${foundAtivo.modelo}). 
          Status: ${foundAtivo.status}. 
          Devedor: ${foundAtivo.devedor}. 
          Banco: ${foundAtivo.banco}. 
          Localização: ${foundAtivo.cidade}. 
          ${foundAtivo.enrichmentData 
            ? `Já possuo dados enriquecidos: ${foundAtivo.enrichmentData.telefones?.length || 0} telefones e ${foundAtivo.enrichmentData.enderecos?.length || 0} endereços identificados.` 
            : 'Ainda não possui enriquecimento de dados avançado. Deseja iniciar agora?'}`;
      } else if (text.toLowerCase().includes('status') || text.toLowerCase().includes('ativos')) {
        responseText = `Atualmente temos ${ativos?.length || 0} ativos em nossa base. ${(ativos?.filter(a => a.status === 'Recuperado') || []).length} já foram recuperados com sucesso.`;
      } else if (text.toLowerCase().includes('gargalo') || text.toLowerCase().includes('bh') || text.toLowerCase().includes('belo horizonte')) {
        responseText = "Identifiquei um gargalo de cobertura em Belo Horizonte. Temos ativos pendentes e cobertura de recuperadores insuficiente na região Norte. Recomendo redistribuição.";
      } else {
        responseText = `Entendi sua solicitação sobre "${text}". Analisei nossa base de dados e não encontrei uma placa correspondente exata, mas identifiquei que temos ${ativos?.length || 0} ativos sob monitoramento. Posso ajudar com mais alguma informação específica?`;
      }

      const camilaMsg: Message = {
        id: Math.random().toString(36).substr(2, 9),
        text: responseText,
        sender: 'camila',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, camilaMsg]);
      setIsTyping(false);
      showToast('CAMILA processou sua consulta.', 'success');
    }, 2000);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl shadow-blue-600/40 z-50 hover:scale-110 transition-transform active:scale-95 group"
      >
        <BrainCircuit className="text-white group-hover:animate-pulse" size={28} />
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 border-2 border-slate-950 rounded-full flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">4</span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-40"
            />
            <motion.aside
              initial={{ opacity: 0, x: 400 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 400 }}
              className="fixed top-0 right-0 w-96 h-screen bg-slate-950 border-l border-white/10 z-50 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-blue-600/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
                    <BrainCircuit className="text-blue-500" size={24} />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-lg">CAMILA AI</h2>
                    <p className="text-blue-400 text-xs font-medium uppercase tracking-wider">Assistente Ativa</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar" ref={scrollRef}>
                {/* Insights do Dia */}
                <section className="space-y-4">
                  <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                    <Sparkles size={14} className="text-blue-400" />
                    Insights do Dia
                  </h3>
                  <div className="space-y-3">
                    {insightsDinamicos.map((insight) => (
                      <div 
                        key={insight.id}
                        className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/10 transition-colors cursor-pointer group"
                      >
                        <div className="flex gap-3">
                          <div className={`mt-1 p-1.5 rounded-lg ${
                            insight.tipo === 'critico' ? 'bg-red-500/20 text-red-400' :
                            insight.tipo === 'alerta' ? 'bg-amber-500/20 text-amber-400' :
                            insight.tipo === 'sucesso' ? 'bg-emerald-500/20 text-emerald-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {insight.tipo === 'critico' && <AlertTriangle size={14} />}
                            {insight.tipo === 'alerta' && <Zap size={14} />}
                            {insight.tipo === 'sucesso' && <CheckCircle2 size={14} />}
                            {insight.tipo === 'info' && <Info size={14} />}
                          </div>
                          <div className="flex-1">
                            <p className="text-slate-200 text-sm font-medium leading-snug group-hover:text-white transition-colors">
                              {insight.mensagem}
                            </p>
                            <p className="text-slate-500 text-[10px] mt-1">há 15 minutos</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Ações Automáticas */}
                <section className="space-y-4">
                  <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                    <Zap size={14} className="text-amber-400" />
                    Ações Automáticas
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400">
                          <TrendingUp size={16} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Redistribuição Ativo</span>
                          {ativos[0] ? <PlacaMercosul placa={ativos[0].placa} className="w-16 h-8 scale-75 origin-left" /> : <span className="text-xs text-white">---</span>}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">Concluído</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-400">
                          <Database size={16} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Enriquecimento Placa</span>
                          {ativos[1] ? <PlacaMercosul placa={ativos[1].placa} className="w-16 h-8 scale-75 origin-left" /> : <span className="text-xs text-white">---</span>}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">Concluído</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center text-red-400">
                          <Clock size={16} />
                        </div>
                        <span className="text-xs text-white font-medium">Alerta SLA {ativos[2]?.banco || '---'}</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Pendente</span>
                    </div>
                  </div>
                </section>

                {/* Conversa Recente */}
                <section className="space-y-4 pt-4 border-t border-white/5">
                  <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare size={14} className="text-slate-500" />
                    Conversa Recente
                  </h3>
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div 
                        key={msg.id}
                        className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                          msg.sender === 'user' 
                            ? 'bg-blue-600 text-white rounded-tr-none' 
                            : 'bg-white/5 text-slate-200 border border-white/5 rounded-tl-none'
                        }`}>
                          {msg.text}
                        </div>
                        <span className="text-[10px] text-slate-600 mt-1 px-1">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex flex-col items-start">
                        <div className="bg-white/5 text-slate-300 border border-white/5 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                          </div>
                          <span className="text-xs italic">CAMILA está pensando...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="p-4 border-t border-white/10 bg-slate-900/50">
                <form 
                  onSubmit={handleSendMessage}
                  className="relative"
                >
                  <input 
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    type="text"
                    placeholder="Pergunte à CAMILA..."
                    className="w-full bg-slate-800 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-400">
                    <Send size={20} />
                  </button>
                </form>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
