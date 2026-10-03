/**
 * Evolution API (v2): WhatsApp da operação com a rede de campo.
 *
 *   - enviar texto: POST /message/sendText/{instancia} { number, text };
 *   - enviar mídia: POST /message/sendMedia/{instancia} { number, mediatype, mimetype, media (base64), fileName, caption };
 *   - enviar áudio de voz: POST /message/sendWhatsAppAudio/{instancia} { number, audio (base64) };
 *   - baixar mídia recebida: POST /chat/getBase64FromMediaMessage/{instancia} { message: { key, message } } —
 *     com a mensagem original a Evolution baixa direto do WhatsApp; só com a
 *     chave, ela precisa ter guardado a mensagem no banco dela;
 *   - conferir se o número tem WhatsApp: POST /chat/whatsappNumbers/{instancia} { numbers };
 *   - estado da conexão: GET /instance/connectionState/{instancia};
 *   - webhook: POST /webhook/set/{instancia}, evento MESSAGES_UPSERT.
 *
 * Autenticação pelo cabeçalho `apikey`.
 */
import { ErroDeIntegracao } from './apibrasil.ts';

export interface CredenciaisEvolution {
  apikey: string;
}

/** Número brasileiro só com dígitos e DDI: 37999990000 → 5537999990000. */
export const numeroWhatsapp = (digitos: string) => {
  const d = digitos.replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
};

export const criarClienteEvolution = (
  baseUrl: string,
  instancia: string,
  credenciais: CredenciaisEvolution,
  executar: typeof fetch = fetch,
) => {
  const base = baseUrl.replace(/\/+$/, '');
  const chamar = async <T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown, limiteMs = 20_000): Promise<T> => {
    let resposta: Response;
    try {
      resposta = await executar(`${base}${caminho}/${encodeURIComponent(instancia)}`, {
        method: metodo,
        headers: { 'content-type': 'application/json', apikey: credenciais.apikey },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(limiteMs),
      });
    } catch (e) {
      throw new ErroDeIntegracao(`Evolution inacessível: ${(e as Error).message}`);
    }
    const texto = await resposta.text();
    if (!resposta.ok) throw new ErroDeIntegracao(`Evolution recusou (${resposta.status}): ${texto.slice(0, 300)}`);
    try {
      return JSON.parse(texto) as T;
    } catch {
      return {} as T;
    }
  };

  return {
    estado: () => chamar<{ instance?: { state?: string } }>('GET', '/instance/connectionState'),
    enviarTexto: (numero: string, texto: string) =>
      chamar<{ key?: { id?: string } }>('POST', '/message/sendText', { number: numeroWhatsapp(numero), text: texto }),
    enviarMidia: (numero: string, m: { tipo: 'image' | 'video' | 'document'; mime: string; base64: string; nome?: string; legenda?: string }) =>
      chamar<{ key?: { id?: string } }>(
        'POST',
        '/message/sendMedia',
        {
          number: numeroWhatsapp(numero),
          mediatype: m.tipo,
          mimetype: m.mime,
          media: m.base64,
          ...(m.nome ? { fileName: m.nome } : {}),
          ...(m.legenda ? { caption: m.legenda } : {}),
        },
        120_000,
      ),
    /** Áudio como mensagem de voz: a Evolution converte para o formato do WhatsApp. */
    enviarAudio: (numero: string, base64: string) =>
      chamar<{ key?: { id?: string } }>('POST', '/message/sendWhatsAppAudio', { number: numeroWhatsapp(numero), audio: base64 }, 120_000),
    baixarMidia: (origem: OrigemDaMidia) =>
      chamar<{ base64?: string; mimetype?: string }>('POST', '/chat/getBase64FromMediaMessage', { message: origem, convertToMp4: false }, 60_000),
    temWhatsapp: async (numeros: string[]) => {
      const r = await chamar<{ exists: boolean; number: string }[]>('POST', '/chat/whatsappNumbers', {
        numbers: numeros.map(numeroWhatsapp),
      });
      return new Map((Array.isArray(r) ? r : []).map((x) => [x.number.replace(/\D/g, ''), x.exists]));
    },
    // base64: a mídia já vem no webhook, sem uma segunda chamada para baixá-la.
    configurarWebhook: (url: string) =>
      chamar('POST', '/webhook/set', {
        webhook: { enabled: true, url, byEvents: false, base64: true, events: ['MESSAGES_UPSERT'] },
      }),
  };
};

/** A mensagem como o WhatsApp a entregou (sem o base64): o que a Evolution precisa para baixar a mídia. */
export interface OrigemDaMidia {
  key: unknown;
  message?: unknown;
  messageTimestamp?: unknown;
}

export type TipoDeMidia = 'imagem' | 'audio' | 'video' | 'documento' | 'figurinha' | 'localizacao';

export interface MensagemDoWebhook {
  numero: string;
  direcao: 'enviada' | 'recebida';
  texto: string;
  externoId: string | null;
  /** pushName: em mensagem enviada, é o nome da própria operação. */
  nome: string | null;
  /** A mensagem original, para baixar a mídia da Evolution. */
  origem: OrigemDaMidia;
  midia: {
    tipo: TipoDeMidia;
    mime: string | null;
    nome: string | null;
    /** Presente quando o webhook está com base64 ligado. */
    base64: string | null;
    latitude?: number;
    longitude?: number;
  } | null;
}

interface Conteudo {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string; mimetype?: string };
  videoMessage?: { caption?: string; mimetype?: string };
  audioMessage?: { mimetype?: string };
  documentMessage?: { caption?: string; mimetype?: string; fileName?: string; title?: string };
  documentWithCaptionMessage?: { message?: Conteudo };
  stickerMessage?: { mimetype?: string };
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string };
  liveLocationMessage?: { degreesLatitude?: number; degreesLongitude?: number; caption?: string };
  contactMessage?: { displayName?: string };
  ephemeralMessage?: { message?: Conteudo };
  viewOnceMessage?: { message?: Conteudo };
  viewOnceMessageV2?: { message?: Conteudo };
  base64?: string;
}

/** Tira os envelopes (mensagem temporária, visualização única) até o conteúdo. */
const desembrulhar = (m: Conteudo | undefined): Conteudo | undefined => {
  const dentro = m?.ephemeralMessage?.message ?? m?.viewOnceMessage?.message ?? m?.viewOnceMessageV2?.message ?? m?.documentWithCaptionMessage?.message;
  if (!dentro) return m;
  const interno = desembrulhar(dentro);
  return interno ? { ...interno, base64: m?.base64 ?? interno.base64 } : interno;
};

/** A mensagem sem o base64 e sem as miniaturas: fica guardada pequena, e basta para baixar de novo. */
const semBinario = (valor: unknown): unknown => {
  if (Array.isArray(valor)) return valor.map(semBinario);
  if (!valor || typeof valor !== 'object') return valor;
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>)
      .filter(([k]) => k !== 'base64' && k !== 'jpegThumbnail' && k !== 'thumbnail')
      .map(([k, v]) => [k, semBinario(v)]),
  );
};

/** Só o tipo, sem parâmetros (audio/ogg; codecs=opus → audio/ogg). */
export const mimeSimples = (mime: string | undefined | null) => {
  const t = mime?.split(';')[0]?.trim().toLowerCase();
  return t && /^[a-z]+\/[a-z0-9.+-]+$/.test(t) ? t : null;
};

/** O número do contato. Em JID "@lid" (privacidade), o número vem num campo à parte. */
const numeroDoJid = (chave: { remoteJid?: string; remoteJidAlt?: string; senderPn?: string }) => {
  const jid = chave.remoteJid ?? '';
  const real = jid.endsWith('@lid') ? (chave.remoteJidAlt ?? chave.senderPn ?? '') : jid;
  return real.split('@')[0]!.replace(/\D/g, '');
};

/**
 * Mensagem do webhook (evento messages.upsert), ou nulo se não for conversa
 * com uma pessoa: grupo, status, canal, reação e aviso de sistema ficam de fora.
 */
export const lerMensagemDoWebhook = (corpo: unknown): MensagemDoWebhook | null => {
  const c = corpo as {
    event?: string;
    data?: {
      key?: { remoteJid?: string; remoteJidAlt?: string; senderPn?: string; fromMe?: boolean; id?: string };
      pushName?: string;
      message?: Conteudo;
      messageTimestamp?: unknown;
      base64?: string;
    };
  };
  if (!c?.event || !/messages[._]upsert/i.test(c.event)) return null;
  const d = c.data;
  const jid = d?.key?.remoteJid;
  if (!d?.key || !jid || /@(g\.us|broadcast|newsletter)$/.test(jid)) return null;
  const numero = numeroDoJid(d.key);
  if (!/^\d{10,15}$/.test(numero)) return null;

  const m = desembrulhar(d.message);
  if (!m) return null;
  const base64 = m.base64 ?? d.base64 ?? null;
  let texto = m.conversation ?? m.extendedTextMessage?.text ?? '';
  let midia: MensagemDoWebhook['midia'] = null;

  if (m.imageMessage) {
    texto = m.imageMessage.caption ?? '';
    midia = { tipo: 'imagem', mime: mimeSimples(m.imageMessage.mimetype) ?? 'image/jpeg', nome: null, base64 };
  } else if (m.videoMessage) {
    texto = m.videoMessage.caption ?? '';
    midia = { tipo: 'video', mime: mimeSimples(m.videoMessage.mimetype) ?? 'video/mp4', nome: null, base64 };
  } else if (m.audioMessage) {
    midia = { tipo: 'audio', mime: mimeSimples(m.audioMessage.mimetype) ?? 'audio/ogg', nome: null, base64 };
  } else if (m.documentMessage) {
    texto = m.documentMessage.caption ?? '';
    const nome = m.documentMessage.fileName ?? m.documentMessage.title ?? null;
    midia = { tipo: 'documento', mime: mimeSimples(m.documentMessage.mimetype) ?? 'application/octet-stream', nome, base64 };
  } else if (m.stickerMessage) {
    midia = { tipo: 'figurinha', mime: mimeSimples(m.stickerMessage.mimetype) ?? 'image/webp', nome: null, base64 };
  } else if (m.locationMessage ?? m.liveLocationMessage) {
    const l = (m.locationMessage ?? m.liveLocationMessage)!;
    if (typeof l.degreesLatitude !== 'number' || typeof l.degreesLongitude !== 'number') return null;
    texto = [m.locationMessage?.name, m.locationMessage?.address, m.liveLocationMessage?.caption].filter(Boolean).join(' · ');
    midia = { tipo: 'localizacao', mime: null, nome: null, base64: null, latitude: l.degreesLatitude, longitude: l.degreesLongitude };
  } else if (m.contactMessage) {
    texto = `Contato compartilhado: ${m.contactMessage.displayName ?? 'sem nome'}`;
  }
  if (!texto && !midia) return null;

  return {
    numero,
    direcao: d.key.fromMe ? 'enviada' : 'recebida',
    texto,
    externoId: d.key.id ?? null,
    nome: d.pushName ?? null,
    origem: { key: d.key, message: semBinario(d.message), messageTimestamp: d.messageTimestamp },
    midia,
  };
};
