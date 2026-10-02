import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Lock, Mail } from 'lucide-react';
import React, { useState } from 'react';

import { ErroApi } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

export const Login = () => {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      // O servidor não distingue senha errada de usuário inexistente, e a tela
      // não deve inventar essa distinção.
      setErro(
        err instanceof ErroApi && err.status === 401
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Verifique se a API está no ar.',
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-6 selection:bg-blue-500/30">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-8 space-y-3">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-600/40">
            <span className="text-white font-bold text-2xl">3A</span>
          </div>
          <h1 className="text-white font-bold text-xl tracking-tight">3A Soluções</h1>
          <p className="text-slate-500 text-[10px] font-medium uppercase tracking-widest">
            Recuperação de Ativos
          </p>
        </div>

        <form
          onSubmit={submeter}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 backdrop-blur"
        >
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-slate-400">
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
                placeholder="voce@dominio.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="senha" className="text-xs font-medium text-slate-400">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="senha"
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          {erro && (
            <div
              role="alert"
              className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 leading-relaxed">{erro}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg py-2.5 transition flex items-center justify-center gap-2"
          >
            {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-slate-600 text-[10px] mt-6 leading-relaxed">
          Acesso restrito. Toda consulta realizada é registrada
          <br />
          em trilha de auditoria vinculada ao seu usuário.
        </p>
      </motion.div>
    </div>
  );
};
