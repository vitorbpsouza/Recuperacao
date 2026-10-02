import { GoogleGenAI } from '@google/genai';

import type { Ambiente } from './ambiente.ts';

/**
 * Cliente do modelo da CAMILA.
 *
 * Com projeto do Google Cloud, usa a Vertex AI: contrato empresarial, dado
 * fora do treino do modelo e região configurável — o que banco e LGPD exigem.
 * A chave do Gemini (AI Studio) fica só para desenvolvimento.
 */
export const criarClienteIa = (amb: Ambiente): GoogleGenAI | null => {
  if (amb.GOOGLE_CLOUD_PROJECT) {
    return new GoogleGenAI({ vertexai: true, project: amb.GOOGLE_CLOUD_PROJECT, location: amb.GOOGLE_CLOUD_LOCATION });
  }
  if (amb.GEMINI_API_KEY && amb.NODE_ENV !== 'production') {
    return new GoogleGenAI({ apiKey: amb.GEMINI_API_KEY });
  }
  return null;
};
