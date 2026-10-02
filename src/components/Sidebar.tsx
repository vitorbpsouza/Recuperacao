import React from 'react';
import { 
  LayoutDashboard, 
  Car, 
  Users, 
  MapPin, 
  Settings, 
  BarChart3, 
  Building2, 
  BrainCircuit, 
  Briefcase,
  LogOut,
  Database,
  DollarSign
} from 'lucide-react';
import { NavItem } from '../types';

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard Executivo', icon: LayoutDashboard },
  { id: 'ativos', label: 'Ativos', icon: Car },
  { id: 'recuperadores', label: 'Recuperadores', icon: Users },
  { id: 'distribuicao', label: 'Distribuição e Campo', icon: MapPin },
  { id: 'operacoes', label: 'Operações Internas', icon: Briefcase },
  { id: 'enriquecimento', label: 'Enriquecimento', icon: Database },
  { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { id: 'bancos', label: 'Bancos e Clientes', icon: Building2 },
  { id: 'relatorios', label: 'Relatórios e Inteligência', icon: BarChart3 },
  { id: 'camila', label: 'CAMILA — Central', icon: BrainCircuit },
];

interface SidebarProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <aside className="w-64 bg-slate-950 border-r border-white/10 flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-bold text-xl">3A</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">3A Soluções</h1>
            <p className="text-slate-400 text-xs font-medium">by UTILIT</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={20} className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-blue-400'} />
              <span className="font-medium text-sm">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-2">
        <button 
          onClick={() => setActiveTab('config')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
            activeTab === 'config' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <Settings size={20} />
          <span className="font-medium text-sm">Configurações</span>
        </button>
        <div className="pt-4 px-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-bold text-white">
            VB
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Vitor Bruno</p>
            <p className="text-xs text-slate-500 truncate">Gestor Operacional</p>
          </div>
          <button className="text-slate-500 hover:text-red-400 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
};
