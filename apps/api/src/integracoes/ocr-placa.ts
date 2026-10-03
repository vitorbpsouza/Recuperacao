/**
 * Leitura da placa na foto pelo Gemini Vision (o mesmo cliente da CAMILA:
 * Vertex AI em produção, contrato empresarial e dado fora do treino).
 *
 * Devolve placa, cor, modelo aparente e confiança. A placa lida é comparada
 * com a do caso pela API; aqui só se lê.
 */
import type { GoogleGenAI } from '@google/genai';

import { normalizarPlaca } from '@workspace/domain';

/** Sete letras ou dígitos: o padrão antigo e o Mercosul. A comparação com o caso diz se é a placa certa. */
const parecePlaca = (p: string) => /^[A-Z0-9]{7}$/.test(p);

export interface LeituraDePlaca {
  legivel: boolean;
  placa: string | null;
  cor: string | null;
  modelo: string | null;
  /** 0 a 1, como o modelo declarou. */
  confianca: number | null;
  observacao: string | null;
}

const INSTRUCAO = `Você recebe a foto de um veículo tirada na rua por uma equipe de recuperação de bens.
Leia a placa brasileira (padrão antigo ABC1234 ou Mercosul ABC1D23) e descreva o veículo.
Responda só em JSON: {"legivel": boolean, "placa": "ABC1D23" ou null, "cor": string ou null, "modelo": string ou null, "confianca": número de 0 a 1, "observacao": string ou null}.
Se a placa não estiver legível, "legivel": false e "placa": null. Não invente caracteres: na dúvida, diga na observação quais estão incertos.
Não descreva pessoas.`;

export const lerPlacaNaFoto = async (ia: GoogleGenAI, modelo: string, imagem: Buffer, tipoMime: string): Promise<LeituraDePlaca> => {
  const r = await ia.models.generateContent({
    model: modelo,
    contents: [
      {
        role: 'user',
        parts: [{ text: INSTRUCAO }, { inlineData: { mimeType: tipoMime, data: imagem.toString('base64') } }],
      },
    ],
    config: { responseMimeType: 'application/json', temperature: 0 },
  });
  const bruto = JSON.parse(r.text ?? '{}') as Partial<LeituraDePlaca>;
  const placa = bruto.placa ? normalizarPlaca(String(bruto.placa)) : null;
  return {
    legivel: !!bruto.legivel && !!placa && parecePlaca(placa),
    placa: placa && parecePlaca(placa) ? placa : null,
    cor: bruto.cor ?? null,
    modelo: bruto.modelo ?? null,
    confianca: typeof bruto.confianca === 'number' ? Math.max(0, Math.min(1, bruto.confianca)) : null,
    observacao: bruto.observacao ?? null,
  };
};
