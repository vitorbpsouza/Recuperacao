import React from 'react';

interface PlacaMercosulProps {
  placa: string;
  className?: string;
}

export const PlacaMercosul: React.FC<PlacaMercosulProps> = ({ placa, className = "" }) => {
  const formatPlaca = (p: string) => {
    const clean = p.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (clean.length === 7) {
      // AAA0A00 -> AAA-0A00
      return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    }
    return clean;
  };

  return (
    <div className={`inline-flex flex-col w-20 h-10 border-2 border-slate-800 rounded-md overflow-hidden bg-white shadow-sm shrink-0 ${className}`}>
      <div className="h-3 bg-blue-700 flex items-center justify-between px-1">
        <div className="flex gap-0.5">
          <div className="w-1 h-1 bg-white rounded-full opacity-50" />
          <div className="w-1 h-1 bg-white rounded-full opacity-50" />
        </div>
        <span className="text-[6px] font-bold text-white uppercase tracking-tighter">BRASIL</span>
        <div className="w-2 h-2 bg-white/20 rounded-full" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <span className="text-slate-900 font-bold text-sm tracking-widest whitespace-nowrap leading-none">
          {formatPlaca(placa)}
        </span>
      </div>
    </div>
  );
};
