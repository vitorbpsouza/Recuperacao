import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { EVENTO_SESSAO_EXPIRADA, api, getToken, limparToken, setToken } from '../api/client';
import type { OrigemCaso } from '../domain/casos';

export type Papel = 'admin' | 'operador' | 'auditor';

export interface UsuarioSessao {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  canais: OrigemCaso[];
}

interface Contexto {
  usuario: UsuarioSessao | null;
  /** true enquanto revalidamos um token guardado — evita piscar o login. */
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  /** Canais que este usuário pode ver. admin e auditor veem os dois. */
  canaisVisiveis: OrigemCaso[];
}

const AuthContext = createContext<Contexto | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Um token em sessionStorage não prova nada: só o servidor sabe se a sessão
  // ainda vale (pode ter expirado ou sido revogada). Revalidamos na montagem.
  useEffect(() => {
    if (!getToken()) {
      setCarregando(false);
      return;
    }
    api
      .get<UsuarioSessao>('/auth/eu')
      .then(setUsuario)
      .catch(() => limparToken())
      .finally(() => setCarregando(false));
  }, []);

  // O cliente avisa quando o servidor rejeita a sessão em qualquer chamada.
  useEffect(() => {
    const aoExpirar = () => setUsuario(null);
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const r = await api.post<{ token: string; usuario: UsuarioSessao }>('/auth/login', {
      email,
      senha,
    });
    setToken(r.token);
    setUsuario(r.usuario);
  }, []);

  const sair = useCallback(async () => {
    // Avisa o servidor para revogar a sessão; se a rede falhar, ainda saímos
    // localmente — deixar o usuário preso numa sessão que ele pediu para
    // encerrar é pior que uma linha órfã em `sessao`.
    try {
      await api.post('/auth/logout');
    } finally {
      limparToken();
      setUsuario(null);
    }
  }, []);

  const canaisVisiveis: OrigemCaso[] =
    usuario?.papel === 'admin' || usuario?.papel === 'auditor'
      ? ['plataforma_credor', 'lead_proprio']
      : (usuario?.canais ?? []);

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, sair, canaisVisiveis }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): Contexto => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
};
