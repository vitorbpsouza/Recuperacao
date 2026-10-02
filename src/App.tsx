import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { CamilaPanel } from './components/CamilaPanel';
import { Dashboard } from './components/Dashboard';
import { AtivosModule } from './components/AtivosModule';
import { RecuperadoresModule } from './components/RecuperadoresModule';
import { DistribuicaoModule } from './components/DistribuicaoModule';
import { OperacoesModule } from './components/OperacoesModule';
import { BancosModule } from './components/BancosModule';
import { RelatoriosModule } from './components/RelatoriosModule';
import { EnriquecimentoModule } from './components/EnriquecimentoModule';
import { FinanceiroModule } from './components/FinanceiroModule';
import { motion, AnimatePresence } from 'framer-motion';
import { Ativo, Notification } from './types';

import { ToastContainer, showToast } from './components/Toast';
import { Login } from './components/Login';
import { SeletorCanal } from './components/SeletorCanal';
import { useAuth } from './auth/AuthProvider';
import { useCasos } from './api/hooks';
import type { OrigemCaso } from './domain/casos';

export default function App() {
  const { usuario, carregando, canaisVisiveis } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCamilaOpen, setIsCamilaOpen] = useState(false);
  const [origem, setOrigem] = useState<OrigemCaso | null>(null);

  // O canal inicial é o primeiro que o usuário pode ver — não um default fixo,
  // que poderia ser um canal sem permissão.
  useEffect(() => {
    if (origem === null && canaisVisiveis.length > 0) setOrigem(canaisVisiveis[0]!);
  }, [canaisVisiveis, origem]);

  const { ativos, carregando: carregandoCasos, erro: erroCasos, recarregar } = useCasos(origem);

  // `setAtivos` ainda é esperado por alguns módulos (edição local otimista).
  // Até eles migrarem para mutação via API, recarregar do servidor é a fonte
  // de verdade — manter estado local divergente é pior que um refetch.
  const setAtivos = (_: Ativo[] | ((a: Ativo[]) => Ativo[])) => recarregar();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedAtivoId, setSelectedAtivoId] = useState<string | null>(null);

  const addNotification = (notif: Omit<Notification, 'id' | 'data' | 'lida'>) => {
    const newNotif: Notification = {
      ...notif,
      id: Math.random().toString(36).substr(2, 9),
      data: new Date().toISOString(),
      lida: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };


  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return (
        <Dashboard 
          ativos={ativos} 
          onViewDetails={(id) => {
            setSelectedAtivoId(id);
            setActiveTab('ativos');
          }}
        />
      );
      case 'ativos': return (
        <AtivosModule 
          ativos={ativos} 
          setAtivos={setAtivos} 
          initialSelectedId={selectedAtivoId}
          onClearSelection={() => setSelectedAtivoId(null)}
        />
      );
      case 'recuperadores': return <RecuperadoresModule />;
      case 'distribuicao': return (
        <DistribuicaoModule 
          ativos={ativos} 
          setAtivos={setAtivos} 
          onViewDetails={(id) => {
            setSelectedAtivoId(id);
            setActiveTab('ativos');
          }}
        />
      );
      case 'operacoes': return <OperacoesModule ativos={ativos} />;
      case 'bancos': return <BancosModule />;
      case 'enriquecimento': return <EnriquecimentoModule />;
      case 'financeiro': return (
        <FinanceiroModule 
          onPaymentPaid={(repasse, recuperador) => {
            addNotification({
              titulo: 'Repasse Pago',
              mensagem: `O repasse #${repasse.id} para ${recuperador?.nome} foi marcado como pago.`,
              tipo: 'pagamento',
              prioridade: 'media'
            });
          }} 
        />
      );
      case 'relatorios': return <RelatoriosModule ativos={ativos} />;
      case 'camila': return <RelatoriosModule ativos={ativos} />; // Placeholder for CAMILA detailed view
      default: return <Dashboard ativos={ativos} />;
    }
  };

  const getActiveTabLabel = () => {
    const labels: Record<string, string> = {
      dashboard: 'Dashboard Executivo',
      ativos: 'Gestão de Ativos',
      recuperadores: 'Recuperadores',
      distribuicao: 'Distribuição e Campo',
      operacoes: 'Operações Internas',
      bancos: 'Bancos e Clientes',
      enriquecimento: 'Enriquecimento de Dados',
      financeiro: 'Gestão Financeira e Repasses',
      relatorios: 'Relatórios e Inteligência',
      camila: 'CAMILA — Central',
      config: 'Configurações'
    };
    return labels[activeTab] || 'Dashboard';
  };

  // `carregando` é a revalidação real do token guardado contra o servidor —
  // substituiu o setTimeout de 1500ms que só simulava carregamento.
  if (carregando) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center space-y-6">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-600/40 animate-bounce">
          <span className="text-white font-bold text-3xl">3A</span>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <h2 className="text-white font-bold text-xl tracking-tight">Iniciando 3A Soluções</h2>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Verificando sessão...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!usuario) return <Login />;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 flex flex-col min-w-0">
        <Header 
          activeTabLabel={getActiveTabLabel()} 
          notifications={notifications}
          onMarkAsRead={markNotificationAsRead}
          onClearAll={clearNotifications}
        />
        
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-6">
            <SeletorCanal origem={origem} setOrigem={setOrigem} />

            {erroCasos && (
              <div
                role="alert"
                className="flex items-center justify-between gap-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
              >
                <p className="text-xs text-red-300">
                  Não foi possível carregar os casos: {erroCasos}
                </p>
                <button
                  onClick={recarregar}
                  className="text-xs font-semibold text-red-200 hover:text-white bg-red-500/20 hover:bg-red-500/30 rounded-lg px-3 py-1.5 transition shrink-0"
                >
                  Tentar de novo
                </button>
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeTab}-${origem}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                // Enquanto carrega, esmaece em vez de trocar por skeleton: o
                // número antigo continua visível e marcado como desatualizado,
                // sem a tela piscar a cada refetch.
                className={carregandoCasos ? 'opacity-40 pointer-events-none transition-opacity' : ''}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      <CamilaPanel isOpen={isCamilaOpen} setIsOpen={setIsCamilaOpen} ativos={ativos} />
      <ToastContainer />
    </div>
  );
}
