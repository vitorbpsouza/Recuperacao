import React from 'react';
import { 
  Bell, 
  Search, 
  User, 
  Menu,
  BrainCircuit,
  Zap,
  Check,
  Trash2,
  Clock,
  DollarSign,
  ShieldAlert,
  Info,
  LogOut
} from 'lucide-react';
import { Notification } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HeaderProps {
  activeTabLabel: string;
  notifications?: Notification[];
  onMarkAsRead?: (id: string) => void;
  onClearAll?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeTabLabel, 
  notifications = [], 
  onMarkAsRead, 
  onClearAll 
}) => {
  const [isNotifOpen, setIsNotifOpen] = React.useState(false);
  const unreadCount = notifications.filter(n => !n.lida).length;
  const { usuario, sair } = useAuth();

  // Iniciais do nome real: no máximo duas, primeira e última palavra.
  const iniciais = (usuario?.nome ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p[0]!.toUpperCase())
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .slice(0, 2);

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'pagamento': return <DollarSign size={14} className="text-emerald-400" />;
      case 'alerta': return <ShieldAlert size={14} className="text-red-400" />;
      case 'ativo': return <Zap size={14} className="text-blue-400" />;
      default: return <Info size={14} className="text-slate-400" />;
    }
  };

  return (
    <header className="h-16 border-b border-white/10 bg-slate-950/50 backdrop-blur-md sticky top-0 z-30 px-8 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button className="lg:hidden text-slate-400 hover:text-white">
          <Menu size={24} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-sm font-medium">3A Soluções</span>
          <span className="text-slate-700">/</span>
          <span className="text-white font-bold text-sm tracking-tight">{activeTabLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-3 bg-blue-600/10 border border-blue-500/20 px-3 py-1.5 rounded-full">
          <Zap size={14} className="text-blue-400 animate-pulse" />
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">CAMILA Ativa: Monitorando 12 ativos</span>
        </div>

        <div className="flex items-center gap-2 relative">
          <button 
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className={`p-2 hover:bg-white/5 rounded-xl transition-all relative ${isNotifOpen ? 'text-white bg-white/5' : 'text-slate-400'}`}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-950" />
            )}
          </button>

          <AnimatePresence>
            {isNotifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsNotifOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <h3 className="text-xs font-bold text-white uppercase tracking-widest">Notificações</h3>
                    {notifications.length > 0 && (
                      <button 
                        onClick={onClearAll}
                        className="text-[10px] text-slate-500 hover:text-red-400 font-bold uppercase transition-colors"
                      >
                        Limpar Tudo
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    {notifications.length > 0 ? (
                      <div className="divide-y divide-white/5">
                        {notifications.map((n) => (
                          <div 
                            key={n.id} 
                            className={`p-4 hover:bg-white/[0.02] transition-colors relative group ${!n.lida ? 'bg-blue-500/5' : ''}`}
                          >
                            <div className="flex gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                n.tipo === 'pagamento' ? 'bg-emerald-500/10' : 
                                n.tipo === 'alerta' ? 'bg-red-500/10' : 'bg-blue-500/10'
                              }`}>
                                {getIcon(n.tipo)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white truncate">{n.titulo}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{n.mensagem}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <Clock size={10} className="text-slate-600" />
                                  <span className="text-[9px] text-slate-600 font-medium">
                                    {formatDistanceToNow(new Date(n.data), { addSuffix: true, locale: ptBR })}
                                  </span>
                                </div>
                              </div>
                              {!n.lida && (
                                <button 
                                  onClick={() => onMarkAsRead?.(n.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-emerald-500/20 text-emerald-400 rounded transition-all"
                                >
                                  <Check size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <Bell size={24} className="text-slate-700 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">Nenhuma notificação por enquanto.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <button className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <Search size={20} />
          </button>
        </div>

        <div className="h-8 w-px bg-white/10 mx-2" />

        <div className="flex items-center gap-3 pl-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-white">{usuario?.nome}</p>
            <p className="text-[10px] text-slate-500 capitalize">{usuario?.papel}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-600/20 border border-white/10">
            {iniciais}
          </div>
          <button
            onClick={() => void sair()}
            title="Sair"
            aria-label="Sair"
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};
