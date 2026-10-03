/**
 * Varredura de prazos do Plano A. A regra mora no banco (varrer_prazos(),
 * migração 0012): aceite vencido devolve o caso à fila; prazo máximo, purga
 * e notificação extrajudicial vencidos viram aviso na linha do tempo — e,
 * pelo NOTIFY, aviso ao vivo na central.
 *
 * A função é idempotente e tem trava própria: com várias instâncias da API,
 * só uma varre por vez e chamar de novo não repete nada. Por isso um timer
 * simples basta, sem fila de jobs.
 */
import type { Executor } from '@workspace/db';

export interface AcaoDePrazo {
  tenant_id: string;
  caso_id: string;
  acao: string;
}

export const varrerPrazos = (bruta: Pick<Executor, 'query'>) =>
  bruta.query<AcaoDePrazo>('select tenant_id, caso_id, acao from varrer_prazos()');

export interface Registro {
  info(dados: object, mensagem: string): void;
  error(dados: object, mensagem: string): void;
}

/** Varre agora e a cada `intervaloMs`. Devolve a função que para. */
export const iniciarVarreduraDePrazos = (bruta: Pick<Executor, 'query'>, intervaloMs: number, log: Registro) => {
  let rodando = false;
  const rodar = async () => {
    if (rodando) return;
    rodando = true;
    try {
      const acoes = await varrerPrazos(bruta);
      for (const a of acoes) {
        const dados = { casoId: a.caso_id, tenantId: a.tenant_id, acao: a.acao };
        if (a.acao.startsWith('erro')) log.error(dados, 'varredura de prazos falhou num caso');
        else log.info(dados, 'prazo vencido tratado');
      }
    } catch (erro) {
      log.error({ err: erro }, 'varredura de prazos falhou');
    } finally {
      rodando = false;
    }
  };
  void rodar();
  const timer = setInterval(() => void rodar(), intervaloMs);
  timer.unref();
  return () => clearInterval(timer);
};
