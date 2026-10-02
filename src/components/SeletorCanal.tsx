import { Handshake, ShieldCheck } from 'lucide-react';

import { useAuth } from '../auth/AuthProvider';
import type { OrigemCaso } from '../domain/casos';

const ROTULOS: Record<OrigemCaso, { titulo: string; sub: string; Icone: typeof ShieldCheck }> = {
  plataforma_credor: {
    titulo: 'Recuperação',
    sub: 'carteira do credor',
    Icone: ShieldCheck,
  },
  lead_proprio: {
    titulo: 'Aquisição',
    sub: 'lead próprio',
    Icone: Handshake,
  },
};

interface Props {
  origem: OrigemCaso | null;
  setOrigem: (o: OrigemCaso) => void;
}

/**
 * Alterna entre os dois canais.
 *
 * Só mostra o que o usuário pode ver: um operador restrito a um canal não
 * recebe nem a aba do outro. A API recusaria de todo jeito (403), mas oferecer
 * um botão que sempre falha ensina a pessoa a ignorar erro.
 *
 * Com um único canal disponível, exibe o canal atual como rótulo em vez de um
 * seletor de uma opção.
 */
export const SeletorCanal = ({ origem, setOrigem }: Props) => {
  const { canaisVisiveis } = useAuth();

  if (canaisVisiveis.length === 0) {
    return (
      <div className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
        Seu usuário não tem canal atribuído. Fale com um administrador.
      </div>
    );
  }

  if (canaisVisiveis.length === 1) {
    const { titulo, sub, Icone } = ROTULOS[canaisVisiveis[0]!];
    return (
      <div className="inline-flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2">
        <Icone size={14} className="text-blue-400" />
        <span className="font-semibold text-slate-200">{titulo}</span>
        <span className="text-slate-500">· {sub}</span>
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label="Canal de operação"
      className="inline-flex bg-slate-900/60 border border-slate-800 rounded-xl p-1 gap-1"
    >
      {canaisVisiveis.map((canal) => {
        const { titulo, sub, Icone } = ROTULOS[canal];
        const ativo = origem === canal;
        return (
          <button
            key={canal}
            role="tab"
            aria-selected={ativo}
            onClick={() => setOrigem(canal)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
              ativo
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icone size={14} />
            <span className="font-semibold">{titulo}</span>
            <span className={ativo ? 'text-blue-200' : 'text-slate-600'}>· {sub}</span>
          </button>
        );
      })}
    </div>
  );
};
