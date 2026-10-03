/**
 * Evolution API (v2): WhatsApp da operação com a rede de campo.
 *
 *   - enviar texto: POST /message/sendText/{instancia} { number, text };
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
  const chamar = async <T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<T> => {
    let resposta: Response;
    try {
      resposta = await executar(`${base}${caminho}/${encodeURIComponent(instancia)}`, {
        method: metodo,
        headers: { 'content-type': 'application/json', apikey: credenciais.apikey },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(20_000),
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
    temWhatsapp: async (numeros: string[]) => {
      const r = await chamar<{ exists: boolean; number: string }[]>('POST', '/chat/whatsappNumbers', {
        numbers: numeros.map(numeroWhatsapp),
      });
      return new Map((Array.isArray(r) ? r : []).map((x) => [x.number.replace(/\D/g, ''), x.exists]));
    },
    configurarWebhook: (url: string) =>
      chamar('POST', '/webhook/set', {
        webhook: { enabled: true, url, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] },
      }),
  };
};

/** Mensagem recebida no webhook (evento messages.upsert), ou nulo se não for texto recebido. */
export const lerMensagemDoWebhook = (corpo: unknown) => {
  const c = corpo as {
    event?: string;
    data?: {
      key?: { remoteJid?: string; fromMe?: boolean; id?: string };
      pushName?: string;
      message?: { conversation?: string; extendedTextMessage?: { text?: string } };
    };
  };
  if (!c?.event || !/messages[._]upsert/i.test(c.event)) return null;
  const d = c.data;
  if (!d?.key?.remoteJid || d.key.fromMe) return null;
  // Grupo não é conversa com a rede de campo.
  if (d.key.remoteJid.endsWith('@g.us')) return null;
  const texto = d.message?.conversation ?? d.message?.extendedTextMessage?.text;
  if (!texto) return null;
  return {
    numero: d.key.remoteJid.split('@')[0]!.replace(/\D/g, ''),
    texto,
    externoId: d.key.id ?? null,
    nome: d.pushName ?? null,
  };
};
