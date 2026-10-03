-- Inteligência de localização: fotos de campo, link para terceiros, câmera
-- como fonte de avistamento e endereços no mapa.
--
--   - foto: a imagem original fica no volume do servidor (FOTOS_DIR); o banco
--     guarda o SHA-256 (cadeia de custódia: prova de que a imagem não mudou),
--     os metadados EXIF, a coordenada e de onde ela veio, e a leitura da placa;
--   - link_campo: o recuperador terceiro recebe pelo WhatsApp um link que só
--     vale para um caso e expira. O token fica só em hash, como a sessão;
--   - avistamento ganha as fontes 'camera' (câmera de terceiro) e 'foto', e
--     guarda de onde veio a coordenada e a precisão;
--   - endereço da pessoa ganha coordenada geocodificada, com a precisão.

-- ---------------------------------------------------------------------------
-- Link de campo (terceiro, sem login)
-- ---------------------------------------------------------------------------

create table link_campo (
  id             text primary key default gen_random_uuid()::text,
  tenant_id      text not null default app_tenant() references tenant(id),
  caso_id        text not null,
  token_hash     text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  recuperador_id text,
  -- Para quem foi (nome ou telefone): aparece em cada envio feito pelo link.
  destinatario   text not null check (length(trim(destinatario)) >= 2),
  expira_em      timestamptz not null,
  revogado_em    timestamptz,
  usos           integer not null default 0,
  ultimo_uso_em  timestamptz,
  usuario_id     text,
  criado_em      timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, recuperador_id) references recuperador(tenant_id, id),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id),
  check (expira_em > criado_em)
);
create index idx_link_campo_caso on link_campo(tenant_id, caso_id, criado_em desc);

create function link_campo_da_sessao() returns trigger
  language plpgsql
  as $$
begin
  if app_usuario() is not null then
    new.usuario_id := app_usuario();
  end if;
  return new;
end $$;

create trigger trg_link_campo_da_sessao before insert on link_campo
  for each row execute function link_campo_da_sessao();

-- O link chega sem sessão: esta função acha o caso pelo hash do token, só
-- se o link estiver vigente, e conta o uso.
create function link_campo_resolver(p_token_hash text)
  returns table (link_id text, tenant_id text, caso_id text, destinatario text, expira_em timestamptz)
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  return query
    update link_campo l set usos = l.usos + 1, ultimo_uso_em = now()
     where l.token_hash = p_token_hash and l.revogado_em is null and l.expira_em > now()
    returning l.id, l.tenant_id, l.caso_id, l.destinatario, l.expira_em;
end $$;

-- ---------------------------------------------------------------------------
-- Fotos
-- ---------------------------------------------------------------------------

create table foto (
  id                 bigint generated always as identity primary key,
  tenant_id          text not null default app_tenant() references tenant(id),
  caso_id            text not null,
  -- Caminho relativo dentro de FOTOS_DIR.
  arquivo            text not null,
  sha256             text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  tipo_mime          text not null check (tipo_mime in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  tamanho_bytes      integer not null check (tamanho_bytes > 0),
  -- Metadados lidos do arquivo no servidor (não os que o navegador declarou).
  exif               jsonb not null default '{}',
  tirada_em          timestamptz,
  latitude           numeric(9,6) check (latitude between -90 and 90),
  longitude          numeric(9,6) check (longitude between -180 and 180),
  precisao_m         numeric(8,1),
  origem_coordenada  text check (origem_coordenada in ('exif','aparelho')),
  -- Leitura da placa (Gemini Vision): placa, cor, modelo, confiança.
  placa_lida         text,
  placa_confere      boolean,
  ocr                jsonb,
  ocr_status         text not null default 'pendente' check (ocr_status in ('pendente','lida','ilegivel','sem_modelo','erro')),
  descricao          text,
  usuario_id         text,
  link_id            text,
  enviado_em         timestamptz not null default now(),
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id),
  foreign key (tenant_id, link_id) references link_campo(tenant_id, id),
  check ((latitude is null) = (longitude is null)),
  check (usuario_id is not null or link_id is not null)
);
create index idx_foto_caso on foto(tenant_id, caso_id, enviado_em desc);
-- A mesma imagem enviada duas vezes no mesmo caso é uma foto só.
create unique index idx_foto_hash on foto(tenant_id, caso_id, sha256);

create function foto_da_sessao() returns trigger
  language plpgsql
  as $$
begin
  if app_usuario() is not null then
    new.usuario_id := app_usuario();
  end if;
  new.enviado_em := now();
  return new;
end $$;

create trigger trg_foto_da_sessao before insert on foto
  for each row execute function foto_da_sessao();
create trigger trg_foto_sem_delete before delete on foto
  for each row execute function recusa_alteracao();

-- Só a leitura da placa muda depois do envio (o OCR roda logo após gravar).
create function foto_so_ocr_muda() returns trigger
  language plpgsql
  as $$
begin
  if (to_jsonb(new) - array['placa_lida','placa_confere','ocr','ocr_status'])
     is distinct from (to_jsonb(old) - array['placa_lida','placa_confere','ocr','ocr_status']) then
    raise exception 'foto: só a leitura da placa pode mudar depois do envio';
  end if;
  return new;
end $$;

create trigger trg_foto_so_ocr_muda before update on foto
  for each row execute function foto_so_ocr_muda();

-- ---------------------------------------------------------------------------
-- Avistamento: câmera, foto e procedência da coordenada
-- ---------------------------------------------------------------------------

alter table avistamento drop constraint avistamento_fonte_check;
alter table avistamento
  add constraint avistamento_fonte_check check (fonte in ('equipe_campo','credor','devedor','outro','radar','camera','foto')),
  add column origem_coordenada text check (origem_coordenada in ('aparelho','exif','radar','manual')),
  add column precisao_m        numeric(8,1),
  add column foto_id           bigint references foto(id),
  add column link_id           text,
  add constraint avistamento_link_fk foreign key (tenant_id, link_id) references link_campo(tenant_id, id),
  add constraint foto_tem_foto check (fonte <> 'foto' or foto_id is not null);

-- ---------------------------------------------------------------------------
-- Endereço no mapa
-- ---------------------------------------------------------------------------

alter table pessoa_endereco
  add column precisao               text check (precisao in ('numero','rua','cep','cidade')),
  add column geocodificado_em       timestamptz,
  add column geocodificacao_fonte   text,
  add column geocodificacao_falhou  boolean not null default false;

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------

alter table link_campo enable row level security;
alter table foto       enable row level security;

create policy isolamento_tenant on link_campo using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on foto       using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy canal on link_campo as restrictive using (exists (select 1 from caso c where c.id = link_campo.caso_id));
create policy canal on foto       as restrictive using (exists (select 1 from caso c where c.id = foto.caso_id));

grant select, insert on link_campo, foto to recredita_app;
grant update (revogado_em) on link_campo to recredita_app;
grant update (placa_lida, placa_confere, ocr, ocr_status) on foto to recredita_app;
grant execute on function link_campo_resolver(text) to recredita_app;
