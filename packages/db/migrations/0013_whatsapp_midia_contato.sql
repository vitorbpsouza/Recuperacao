-- WhatsApp da operação: mídia, nome do contato e veículo da conversa.
--
--   - Mensagem pode ser foto, áudio, vídeo, documento, figurinha ou
--     localização. O arquivo fica no volume (FOTOS_DIR/whatsapp), com SHA-256:
--     o que o recuperador mandou do campo vale como registro.
--   - O webhook passa a gravar também o que a operação mandou direto do
--     celular (fromMe), como mensagem enviada.
--   - contato_whatsapp: o nome que o contato usa no WhatsApp (pushName), o
--     nome dado pela operação e o veículo (caso do Plano A) da conversa.
--     Mensagem nova da conversa já entra ligada a esse caso.

-- ---------------------------------------------------------------------------
-- Mídia na mensagem
-- ---------------------------------------------------------------------------

alter table mensagem_whatsapp drop constraint mensagem_whatsapp_texto_check;
alter table mensagem_whatsapp
  add column midia_tipo    text check (midia_tipo in ('imagem','audio','video','documento','figurinha','localizacao')),
  add column midia_mime    text check (midia_mime is null or midia_mime ~ '^[a-z]+/[a-z0-9.+-]+$'),
  add column midia_nome    text check (midia_nome is null or length(midia_nome) <= 255),
  -- Caminho relativo dentro de FOTOS_DIR. Nulo: o servidor não tem volume ou o download falhou.
  add column midia_arquivo text,
  add column midia_sha256  text check (midia_sha256 ~ '^[0-9a-f]{64}$'),
  add column midia_tamanho integer check (midia_tamanho > 0),
  add column latitude      numeric(9,6) check (latitude between -90 and 90),
  add column longitude     numeric(9,6) check (longitude between -180 and 180),
  -- Texto (ou legenda) até 8000; vazio só quando há mídia.
  add constraint mensagem_tem_conteudo check (length(texto) <= 8000 and (length(texto) >= 1 or midia_tipo is not null)),
  add constraint midia_completa check ((midia_arquivo is null) = (midia_sha256 is null) and (midia_arquivo is null) = (midia_tamanho is null)),
  add constraint localizacao_completa check ((latitude is null) = (longitude is null));

-- ---------------------------------------------------------------------------
-- Contato da conversa
-- ---------------------------------------------------------------------------

create table contato_whatsapp (
  tenant_id     text not null default app_tenant() references tenant(id),
  numero        text not null check (numero ~ '^\d{10,15}$'),
  -- Como o contato se chama no WhatsApp; atualizado a cada mensagem recebida.
  nome_whatsapp text check (nome_whatsapp is null or length(nome_whatsapp) <= 120),
  -- Nome dado pela operação; prevalece sobre o do WhatsApp.
  nome          text check (nome is null or length(trim(nome)) between 2 and 120),
  -- Veículo da conversa: só caso do Plano A (a conversa é com a rede de campo).
  caso_id       text,
  finalidade    text not null default 'recuperacao_para_credor' check (finalidade = 'recuperacao_para_credor'),
  usuario_id    text,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, numero),
  foreign key (tenant_id, caso_id, finalidade) references caso(tenant_id, id, finalidade),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id)
);

create function contato_whatsapp_da_sessao() returns trigger
  language plpgsql
  as $$
begin
  new.usuario_id := coalesce(app_usuario(), new.usuario_id);
  new.atualizado_em := now();
  return new;
end $$;

create trigger trg_contato_whatsapp_da_sessao before insert or update on contato_whatsapp
  for each row execute function contato_whatsapp_da_sessao();

-- Nomes que já chegaram pelo webhook.
insert into contato_whatsapp (tenant_id, numero, nome_whatsapp)
select distinct on (tenant_id, numero) tenant_id, numero, left(trim(nome_contato), 120)
  from mensagem_whatsapp
 where nullif(trim(nome_contato), '') is not null and direcao = 'recebida'
 order by tenant_id, numero, criado_em desc;

-- Mensagem sem caso explícito entra ligada ao veículo da conversa.
create function mensagem_caso_do_contato() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  if new.caso_id is null then
    select k.caso_id into new.caso_id from contato_whatsapp k
     where k.tenant_id = new.tenant_id and k.numero = new.numero;
  end if;
  return new;
end $$;

create trigger trg_mensagem_caso_do_contato before insert on mensagem_whatsapp
  for each row execute function mensagem_caso_do_contato();

-- ---------------------------------------------------------------------------
-- Webhook
-- ---------------------------------------------------------------------------

-- A mídia que não veio no webhook se baixa da Evolution: para isso a API
-- precisa da conexão (credencial cifrada) achada pelo hash do token.
create function webhook_evolution_integracao(p_token_hash text)
  returns table (id text, tenant_id text, base_url text, credenciais_cifradas text, config jsonb)
  language sql stable
  security definer
  set search_path = public, pg_temp
  as $$
    select i.id, i.tenant_id, i.base_url, i.credenciais_cifradas, i.config
      from integracao i
     where i.webhook_token_hash = p_token_hash and i.tipo = 'evolution' and i.ativo
  $$;

drop function webhook_evolution_registrar(text, text, text, text, text);

create function webhook_evolution_registrar(
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
                                 midia_tipo, midia_mime, midia_nome, midia_arquivo, midia_sha256, midia_tamanho, latitude, longitude)
    values (i.tenant_id, i.id, p_numero, recuperador_do_numero(i.tenant_id, p_numero), p_direcao, left(coalesce(p_texto, ''), 8000),
            p_externo_id, case when p_direcao = 'recebida' then nullif(trim(p_nome), '') end,
            m ->> 'tipo', m ->> 'mime', left(m ->> 'nome', 255), m ->> 'arquivo', m ->> 'sha256', (m ->> 'tamanho')::integer,
            (m ->> 'latitude')::numeric, (m ->> 'longitude')::numeric)
    on conflict do nothing;

  -- O pushName de uma mensagem enviada é o da própria operação: só vale o do contato.
  if p_direcao = 'recebida' and nullif(trim(p_nome), '') is not null then
    insert into contato_whatsapp (tenant_id, numero, nome_whatsapp)
      values (i.tenant_id, p_numero, left(trim(p_nome), 120))
      on conflict (tenant_id, numero) do update set nome_whatsapp = excluded.nome_whatsapp;
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------

alter table contato_whatsapp enable row level security;
create policy isolamento_tenant on contato_whatsapp using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy canal on contato_whatsapp as restrictive using ('plataforma_credor' = any (app_canais()));

grant select, insert, update (nome, caso_id) on contato_whatsapp to recredita_app;

revoke execute on function webhook_evolution_integracao(text) from public;
revoke execute on function webhook_evolution_registrar(text, text, text, text, text, text, jsonb) from public;
grant execute on function webhook_evolution_integracao(text) to recredita_app;
grant execute on function webhook_evolution_registrar(text, text, text, text, text, text, jsonb) to recredita_app;
