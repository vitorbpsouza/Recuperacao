-- Mídia do WhatsApp que não chegou a ser guardada pode ser baixada depois.
--
-- A Evolution só acha a mídia pelo id quando guarda as mensagens no banco
-- dela. Com a mensagem original (chave de mídia, caminho no WhatsApp), ela
-- baixa direto do WhatsApp. Por isso o webhook passa a guardar essa origem
-- (sem o base64 e sem a miniatura) e o motivo da falha, e a mensagem aceita
-- uma única correção: completar o arquivo que faltava. Texto, direção, número
-- e data continuam imutáveis.

alter table mensagem_whatsapp
  add column midia_origem jsonb check (midia_origem is null or jsonb_typeof(midia_origem) = 'object'),
  add column midia_falha  text check (midia_falha is null or length(midia_falha) <= 500);

drop trigger trg_mensagem_sem_update on mensagem_whatsapp;

create function mensagem_whatsapp_completa_midia() returns trigger
  language plpgsql
  as $$
declare
  campos text[] := array['midia_arquivo','midia_sha256','midia_tamanho','midia_mime','midia_falha'];
begin
  if old.midia_arquivo is null and old.midia_tipo is not null
     and (to_jsonb(new) - campos) is not distinct from (to_jsonb(old) - campos) then
    return new;
  end if;
  raise exception 'mensagem_whatsapp e append-only: só se completa a mídia que faltava';
end $$;

create trigger trg_mensagem_so_completa_midia before update on mensagem_whatsapp
  for each row execute function mensagem_whatsapp_completa_midia();

create or replace function webhook_evolution_registrar(
  p_token_hash text, p_numero text, p_direcao text, p_texto text, p_externo_id text, p_nome text, p_midia jsonb
) returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  i integracao;
  m jsonb := coalesce(p_midia, '{}'::jsonb);
begin
  select * into i from integracao where webhook_token_hash = p_token_hash and tipo = 'evolution' and ativo;
  if not found then
    return false;
  end if;

  insert into mensagem_whatsapp (tenant_id, integracao_id, numero, recuperador_id, direcao, texto, externo_id, nome_contato,
                                 midia_tipo, midia_mime, midia_nome, midia_arquivo, midia_sha256, midia_tamanho, latitude, longitude,
                                 midia_origem, midia_falha)
    values (i.tenant_id, i.id, p_numero, recuperador_do_numero(i.tenant_id, p_numero), p_direcao, left(coalesce(p_texto, ''), 8000),
            p_externo_id, case when p_direcao = 'recebida' then nullif(trim(p_nome), '') end,
            m ->> 'tipo', m ->> 'mime', left(m ->> 'nome', 255), m ->> 'arquivo', m ->> 'sha256', (m ->> 'tamanho')::integer,
            (m ->> 'latitude')::numeric, (m ->> 'longitude')::numeric,
            m -> 'origem', left(m ->> 'falha', 500))
    on conflict do nothing;

  -- O pushName de uma mensagem enviada é o da própria operação: só vale o do contato.
  if p_direcao = 'recebida' and nullif(trim(p_nome), '') is not null then
    insert into contato_whatsapp (tenant_id, numero, nome_whatsapp)
      values (i.tenant_id, p_numero, left(trim(p_nome), 120))
      on conflict (tenant_id, numero) do update set nome_whatsapp = excluded.nome_whatsapp;
  end if;
  return true;
end $$;

grant update (midia_arquivo, midia_sha256, midia_tamanho, midia_mime, midia_falha) on mensagem_whatsapp to recredita_app;
