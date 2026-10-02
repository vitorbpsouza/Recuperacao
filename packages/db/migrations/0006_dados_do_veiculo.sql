-- Dados do veículo vindos de fonte legítima, cada um com sua procedência:
--
--   - valor FIPE (tabela pública), guardado no ativo com código e mês;
--   - verificação veicular de fornecedor contratado: só dados do veículo e
--     restrições, ligada à consulta auditada (fornecedor, contrato, base legal,
--     justificativa). Dono e localização por radar não entram — o parser da
--     tela descarta, e esta tabela não tem onde guardá-los;
--   - avistamentos: onde o bem foi visto, por quem e quando, com a hora do
--     servidor. É a fonte legítima de localização do Plano A.

alter table ativo
  add column renavam            text check (renavam ~ '^\d{11}$'),
  add column valor_fipe         numeric(14,2) check (valor_fipe >= 0),
  add column fipe_codigo        text,
  add column fipe_referencia    text,
  add column fipe_consultado_em timestamptz,
  add constraint fipe_completa check (
    (valor_fipe is null) = (fipe_codigo is null) and (valor_fipe is null) = (fipe_consultado_em is null)
  );

-- ---------------------------------------------------------------------------
-- Verificação veicular (fornecedor contratado)
-- ---------------------------------------------------------------------------

create table verificacao_veicular (
  id                   bigint generated always as identity primary key,
  tenant_id            text not null default app_tenant() references tenant(id),
  caso_id              text not null,
  -- A consulta auditada que trouxe estes dados: sem ela, não há procedência.
  consulta_id          text not null references consulta_auditoria(id),
  situacao             text,
  restricoes           text[] not null default '{}',
  renajud              boolean,
  roubo_furto          boolean,
  leilao               boolean,
  alienacao_fiduciaria boolean,
  ano_licenciamento    integer check (ano_licenciamento between 1950 and 2100),
  usuario_id           text,
  verificado_em        timestamptz not null default now(),
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id)
);
create index idx_verificacao_veicular_caso on verificacao_veicular(tenant_id, caso_id, verificado_em desc);

-- ---------------------------------------------------------------------------
-- Avistamentos (Plano A)
-- ---------------------------------------------------------------------------

create table avistamento (
  id            bigint generated always as identity primary key,
  tenant_id     text not null default app_tenant() references tenant(id),
  caso_id       text not null,
  finalidade    text not null default 'recuperacao_para_credor' check (finalidade = 'recuperacao_para_credor'),
  observado_em  timestamptz not null,
  registrado_em timestamptz not null default now(),
  latitude      numeric(9,6) check (latitude between -90 and 90),
  longitude     numeric(9,6) check (longitude between -180 and 180),
  -- Endereço ou referência: onde estava o veículo (não a pessoa).
  descricao     text not null check (length(trim(descricao)) >= 5),
  fonte         text not null check (fonte in ('equipe_campo','credor','devedor','outro')),
  usuario_id    text,
  foreign key (tenant_id, caso_id, finalidade) references caso(tenant_id, id, finalidade),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id),
  check ((latitude is null) = (longitude is null)),
  check (observado_em <= registrado_em + interval '5 minutes')
);
create index idx_avistamento_caso on avistamento(tenant_id, caso_id, observado_em desc);

-- Quem registrou e quando vêm da sessão e do relógio do servidor.
create function registro_da_sessao() returns trigger
  language plpgsql
  as $$
begin
  if app_usuario() is not null then
    new.usuario_id := app_usuario();
  end if;
  if tg_table_name = 'avistamento' then
    new.registrado_em := now();
  else
    new.verificado_em := now();
  end if;
  return new;
end $$;

create trigger trg_verificacao_veicular_da_sessao before insert on verificacao_veicular
  for each row execute function registro_da_sessao();
create trigger trg_avistamento_da_sessao before insert on avistamento
  for each row execute function registro_da_sessao();

create trigger trg_verificacao_veicular_sem_update before update on verificacao_veicular
  for each row execute function recusa_alteracao();
create trigger trg_verificacao_veicular_sem_delete before delete on verificacao_veicular
  for each row execute function recusa_alteracao();
create trigger trg_avistamento_sem_update before update on avistamento
  for each row execute function recusa_alteracao();
create trigger trg_avistamento_sem_delete before delete on avistamento
  for each row execute function recusa_alteracao();

-- Linha do tempo.
alter table caso_evento drop constraint caso_evento_tipo_check;
alter table caso_evento add constraint caso_evento_tipo_check
  check (tipo in ('criado','status_alterado','distribuido','rito_definido','registro_juridico',
                  'verificacao_veicular','avistamento'));

create function dado_do_veiculo_evento() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  insert into caso_evento (tenant_id, caso_id, tipo, usuario_id, dados)
    values (new.tenant_id, new.caso_id, tg_table_name, app_usuario(),
            jsonb_strip_nulls(to_jsonb(new) - 'tenant_id' - 'caso_id' - 'finalidade' - 'usuario_id' - 'id'));
  return null;
end $$;

create trigger trg_verificacao_veicular_evento after insert on verificacao_veicular
  for each row execute function dado_do_veiculo_evento();
create trigger trg_avistamento_evento after insert on avistamento
  for each row execute function dado_do_veiculo_evento();

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------

alter table verificacao_veicular enable row level security;
alter table avistamento          enable row level security;

create policy isolamento_tenant on verificacao_veicular using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on avistamento          using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());

-- Verificação vale nos dois planos e herda a visibilidade do caso; avistamento é do Plano A.
create policy canal on verificacao_veicular as restrictive
  using (exists (select 1 from caso c where c.id = verificacao_veicular.caso_id));
create policy canal on avistamento as restrictive using ('plataforma_credor' = any (app_canais()));

grant select, insert on verificacao_veicular, avistamento to recredita_app;
