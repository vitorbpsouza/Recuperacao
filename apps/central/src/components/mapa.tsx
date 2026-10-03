import 'maplibre-gl/dist/maplibre-gl.css';

import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import { cn } from '@workspace/ui/lib/utils';

/**
 * Mapa com os pontos que têm coordenada real (avistamento, radar). Tiles do
 * OpenFreeMap: sem chave, sem rastreio de terceiros. Sem ponto, sem mapa
 * inventado: quem chama mostra o estado vazio.
 */
export interface PontoDoMapa {
  id: string | number;
  latitude: number;
  longitude: number;
  /** Cor do marcador (CSS). */
  cor?: string;
  titulo: string;
  linhas?: string[];
  /** Ação do balão ("Abrir caso"). */
  acao?: { rotulo: string; aoClicar: () => void };
  /** Diâmetro do marcador em px (padrão 14). */
  tamanho?: number;
  /** Texto curto dentro do marcador (posição no ranking). */
  rotulo?: string;
}

const ESTILO = 'https://tiles.openfreemap.org/styles/dark';
const CENTRO_DO_BRASIL: [number, number] = [-47.93, -15.78];

const balao = (p: PontoDoMapa) => {
  // Texto pelo textContent: nada que veio do relatório vira HTML.
  const raiz = document.createElement('div');
  raiz.className = 'space-y-1 text-xs';
  const titulo = document.createElement('p');
  titulo.className = 'font-semibold text-sm text-white';
  titulo.textContent = p.titulo;
  raiz.append(titulo);
  for (const l of p.linhas ?? []) {
    const linha = document.createElement('p');
    linha.className = 'text-slate-300';
    linha.textContent = l;
    raiz.append(linha);
  }
  if (p.acao) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'mt-2 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-500';
    botao.textContent = p.acao.rotulo;
    botao.onclick = p.acao.aoClicar;
    raiz.append(botao);
  }
  return raiz;
};

export function Mapa({
  pontos,
  className,
  ligarPontos = false,
  zoomMaximo = 15,
}: {
  pontos: PontoDoMapa[];
  className?: string;
  /** Liga os pontos na ordem (trajeto do veículo pelos radares). */
  ligarPontos?: boolean;
  zoomMaximo?: number;
}) {
  const recipiente = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const marcadores = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!recipiente.current) return;
    const m = new maplibregl.Map({
      container: recipiente.current,
      style: ESTILO,
      center: CENTRO_DO_BRASIL,
      zoom: 3.5,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.FullscreenControl(), 'top-right');
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    for (const mk of marcadores.current) mk.remove();
    marcadores.current = pontos.map((p) => {
      const el = document.createElement('div');
      const tamanho = p.tamanho ?? 14;
      el.className = 'flex items-center justify-center rounded-full ring-2 ring-white/80 shadow-lg cursor-pointer text-[11px] font-bold text-white';
      el.style.width = `${tamanho}px`;
      el.style.height = `${tamanho}px`;
      el.style.background = p.cor ?? '#3b82f6';
      if (p.rotulo) el.textContent = p.rotulo;
      return new maplibregl.Marker({ element: el })
        .setLngLat([p.longitude, p.latitude])
        .setPopup(new maplibregl.Popup({ offset: 12, closeButton: false, className: 'mapa-balao' }).setDOMContent(balao(p)))
        .addTo(m);
    });

    const desenharTrajeto = () => {
      const fonte = m.getSource('trajeto') as maplibregl.GeoJSONSource | undefined;
      const dados = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: pontos.map((p) => [p.longitude, p.latitude]) },
      };
      if (fonte) fonte.setData(dados);
      else {
        m.addSource('trajeto', { type: 'geojson', data: dados });
        m.addLayer({
          id: 'trajeto',
          type: 'line',
          source: 'trajeto',
          paint: { 'line-color': '#a78bfa', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 },
        });
      }
    };
    if (ligarPontos && pontos.length > 1) {
      if (m.isStyleLoaded()) desenharTrajeto();
      else m.once('load', desenharTrajeto);
    }

    if (pontos.length === 1) {
      m.jumpTo({ center: [pontos[0]!.longitude, pontos[0]!.latitude], zoom: Math.min(14, zoomMaximo) });
    } else if (pontos.length > 1) {
      const limites = new maplibregl.LngLatBounds();
      for (const p of pontos) limites.extend([p.longitude, p.latitude]);
      m.fitBounds(limites, { padding: 48, maxZoom: zoomMaximo, duration: 0 });
    }
  }, [pontos, ligarPontos, zoomMaximo]);

  return <div ref={recipiente} className={cn('h-80 w-full overflow-hidden rounded-xl ring-1 ring-white/10', className)} />;
}
