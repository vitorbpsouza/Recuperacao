/**
 * Cliente HTTP da API.
 *
 * O token fica em `sessionStorage`: sobrevive a um reload e morre quando a aba
 * fecha. Ainda é alcançável por XSS — a proteção real seria cookie httpOnly com
 * CSRF, que exige o servidor e o front na mesma origem. Fica registrado como a
 * próxima melhoria, não como resolvido.
 */
const CHAVE_TOKEN = 'camila.token';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

/** Disparado quando o servidor rejeita a sessão, para o app voltar ao login. */
export const EVENTO_SESSAO_EXPIRADA = 'camila:sessao-expirada';

export const getToken = (): string | null => sessionStorage.getItem(CHAVE_TOKEN);
export const setToken = (token: string): void => sessionStorage.setItem(CHAVE_TOKEN, token);
export const limparToken = (): void => sessionStorage.removeItem(CHAVE_TOKEN);

const requisitar = async <T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> => {
  const token = getToken();
  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  // 401 em qualquer rota significa sessão morta: limpar aqui evita que cada
  // tela precise lembrar de tratar isso.
  if (resposta.status === 401) {
    limparToken();
    window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
    throw new ErroApi(401, 'sessão expirada');
  }

  if (resposta.status === 204) return undefined as T;

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    // A mensagem do servidor é mais precisa que qualquer tradução local —
    // as constraints do banco explicam exatamente o que foi recusado.
    throw new ErroApi(resposta.status, dados?.erro ?? `falha ${resposta.status}`);
  }
  return dados as T;
};

export const api = {
  get: <T>(caminho: string) => requisitar<T>('GET', caminho),
  post: <T>(caminho: string, corpo?: unknown) => requisitar<T>('POST', caminho, corpo),
};
