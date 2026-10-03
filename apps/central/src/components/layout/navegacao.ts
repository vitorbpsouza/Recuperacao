import {
  CableIcon,
  CarFrontIcon,
  MessagesSquareIcon,
  SparklesIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  GitMergeIcon,
  HandshakeIcon,
  InboxIcon,
  LayoutDashboardIcon,
  SendIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

import { pode, type Canal, type UsuarioSessao } from '@/lib/api.ts';
import type { FileRoutesByTo } from '@/routeTree.gen.ts';

/** Destinos válidos da árvore de rotas gerada: um link para rota inexistente não compila. */
export type Destino = keyof FileRoutesByTo;

export interface ItemNavegacao {
  titulo: string;
  icone: LucideIcon;
  para: Destino;
  /** Ativo só na rota exata (painel), não nas filhas. */
  exato?: boolean;
  /** Quem vê o item. Ausente: todos. A rota tem a mesma guarda. */
  visivel?: (s: UsuarioSessao) => boolean;
}

/** Navegação de cada plano. Uma tela nunca mistura os dois. */
export const NAVEGACAO_DO_CANAL: Record<Canal, ItemNavegacao[]> = {
  a: [
    { titulo: 'Painel', icone: LayoutDashboardIcon, para: '/a', exato: true },
    { titulo: 'Casos', icone: CarFrontIcon, para: '/a/casos' },
    { titulo: 'Distribuição', icone: SendIcon, para: '/a/distribuicao' },
    { titulo: 'Operação', icone: MessagesSquareIcon, para: '/a/operacao' },
    { titulo: 'Rede de campo', icone: UsersIcon, para: '/a/rede' },
    { titulo: 'Repasses', icone: WalletIcon, para: '/a/repasses' },
  ],
  b: [
    { titulo: 'Painel', icone: LayoutDashboardIcon, para: '/b', exato: true },
    { titulo: 'Negociações', icone: HandshakeIcon, para: '/b/casos' },
  ],
};

/** Telas que valem para os dois planos. */
export const NAVEGACAO_GESTAO: ItemNavegacao[] = [
  { titulo: 'Dados & Bureaus', icone: DatabaseIcon, para: '/gestao/dados' },
  { titulo: 'Fontes e credores', icone: InboxIcon, para: '/gestao/fontes' },
  { titulo: 'Relatórios', icone: FileSpreadsheetIcon, para: '/gestao/relatorios' },
  { titulo: 'Integrações', icone: CableIcon, para: '/gestao/integracoes', visivel: pode.gerir },
  { titulo: 'Campos dos relatórios', icone: SparklesIcon, para: '/gestao/campos', visivel: pode.auditar },
  { titulo: 'Colisões', icone: GitMergeIcon, para: '/gestao/colisoes', visivel: pode.auditar },
  { titulo: 'Usuários', icone: UserCogIcon, para: '/gestao/usuarios', visivel: pode.administrar },
];
