-- Integrações configuradas pela tela: API Brasil (consulta veicular paga) e
-- Evolution API (WhatsApp com a rede de campo e terceiros).
--
-- Credenciais ficam cifradas (AES-256-GCM) com a chave do ambiente
-- (CHAVE_SEGREDOS): o banco sozinho não as revela, e a API nunca as devolve —
-- a tela vê só os últimos caracteres.
--
-- O webhook da Evolution chega sem sessão: entra pela função
-- `webhook_evolution_registrar`, que acha a integração pelo SHA-256 do token
-- da URL (como a sessão: vazar o banco não dá o token).

create table integracao (
  id                   text primary key default gen_random_uuid()::text,
  tenant_id            text not null default app_tenant() references tenant(id),
  tipo                 text not null check (tipo in ('apibrasil','evolution')),
  nome                 text not null check (length(trim(nome)) >= 2),
  base_url             text not null check (base_url ~ '^https?://'),
  credenciais_cifradas text not null,
  -- Final das credenciais, para a tela mostrar qual chave está em uso.
  credenciais_final    text not null default '',
  -- evolution: { instancia }; apibrasil: { servico: 'dados' | 'consulta' }.
  config               jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  -- API Brasil: o fornecedor (contrato e custo) que dá procedência à consulta.
  bureau_id            text,
  webhook_token_hash   text unique check (webhook_token_hash ~ '^[0-9a-f]{64}$'),
  ativo                boolean not null default true,
  ultimo_teste_em      timestamptz,
  ultimo_teste_ok      boolean,
  ultimo_teste_detalhe text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, tipo, nome),
  foreign key (tenant_id, bureau_id) references bureau(tenant_id, id),
  check (tipo <> 'apibrasil' or bureau_id is not null)
);

create trigger trg_integracao_atualizacao before update on integracao
  for each row execute function carimba_atualizacao();

-- Conversa com a rede de campo. Mensagem não se edita nem se apaga: é registro
-- do que foi combinado com quem foi a campo.
create table mensagem_whatsapp (
  id             bigint generated always as identity primary key,
  tenant_id      text not null default app_tenant() references tenant(id),
  integracao_id  text not null,
  -- Só dígitos, com DDI (5537999990000).
  numero         text not null check (numero ~ '^\d{10,15}$'),
  recuperador_id text,
  caso_id        text,
  direcao        text not null check (direcao in ('enviada','recebida')),
  texto          text not null check (length(texto) between 1 and 8000),
  externo_id     text,
  nome_contato   text,
  usuario_id     text,
  criado_em      timestamptz not null default now(),
  foreign key (tenant_id, integracao_id) references integracao(tenant_id, id),
  foreign key (tenant_id, recuperador_id) references recuperador(tenant_id, id),
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id)
);
create index idx_mensagem_numero on mensagem_whatsapp(tenant_id, numero, criado_em desc);
create unique index idx_mensagem_externo on mensagem_whatsapp(tenant_id, integracao_id, externo_id) where externo_id is not null;

create function mensagem_da_sessao() returns trigger
  language plpgsql
  as $$
begin
  if app_usuario() is not null then
    new.usuario_id := app_usuario();
  end if;
  new.criado_em := now();
  return new;
end $$;

create trigger trg_mensagem_da_sessao before insert on mensagem_whatsapp
  for each row execute function mensagem_da_sessao();
create trigger trg_mensagem_sem_update before update on mensagem_whatsapp
  for each row execute function recusa_alteracao();
create trigger trg_mensagem_sem_delete before delete on mensagem_whatsapp
  for each row execute function recusa_alteracao();

/** Recuperador pelo telefone: compara os últimos 10 dígitos (DDD + número sem o 9 extra). */
create function recuperador_do_numero(p_tenant text, p_numero text) returns text
  language sql stable
  security definer
  set search_path = public, pg_temp
  as $$
    select r.id from recuperador r
     where r.tenant_id = p_tenant
       and r.telefone is not null
       and right(regexp_replace(r.telefone, '\D', '', 'g'), 8) = right(p_numero, 8)
     order by r.status = 'Ativo' desc
     limit 1
  $$;

-- Webhook sem sessão: acha a integração pelo hash do token e grava a mensagem recebida.
create function webhook_evolution_registrar(
  p_token_hash text, p_numero text, p_texto text, p_externo_id text, p_nome text
) returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  i integracao;
begin
  select * into i from integracao where webhook_token_hash = p_token_hash and tipo = 'evolution' and ativo;
  if not found then
    return false;
  end if;
  insert into mensagem_whatsapp (tenant_id, integracao_id, numero, recuperador_id, direcao, texto, externo_id, nome_contato)
    values (i.tenant_id, i.id, p_numero, recuperador_do_numero(i.tenant_id, p_numero), 'recebida', left(p_texto, 8000),
            p_externo_id, p_nome)
    on conflict do nothing;
  return true;
end $$;

alter table integracao        enable row level security;
alter table mensagem_whatsapp enable row level security;

create policy isolamento_tenant on integracao        using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on mensagem_whatsapp using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
-- A conversa com a rede de campo é do Plano A.
create policy canal on mensagem_whatsapp as restrictive using ('plataforma_credor' = any (app_canais()));

grant select, insert, update on integracao to recredita_app;
grant select, insert on mensagem_whatsapp to recredita_app;
grant execute on function webhook_evolution_registrar(text, text, text, text, text) to recredita_app;
grant execute on function recuperador_do_numero(text, text) to recredita_app;
