-- Quem viu o dado pessoal de quem, quando e por quê.
--
-- A consulta a bureau já deixa trilha (consulta_auditoria). Abrir a ficha e
-- revelar nome e documento do devedor também precisa deixar: o ônus de
-- demonstrar o tratamento é de quem trata (LGPD art. 6, X e art. 37). As listas
-- não mostram esses campos; a ficha mostra sob demanda, e cada revelação
-- registra o operador, os campos e a finalidade declarada.

create table acesso_dado_pessoal (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null default app_tenant() references tenant(id),
  caso_id     text not null,
  usuario_id  text not null,
  campos      text[] not null check (cardinality(campos) > 0),
  finalidade  text not null check (length(trim(finalidade)) > 0),
  acessado_em timestamptz not null default now(),
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id)
);
create index idx_acesso_caso on acesso_dado_pessoal(caso_id, acessado_em);

-- O usuário é o da sessão, sempre: quem revela não declara quem revelou.
create function acesso_usuario_da_sessao() returns trigger
  language plpgsql
  as $$
begin
  if app_usuario() is not null then
    new.usuario_id := app_usuario();
  end if;
  return new;
end $$;

create trigger trg_acesso_usuario_da_sessao
  before insert on acesso_dado_pessoal
  for each row execute function acesso_usuario_da_sessao();

-- Append-only, como as outras trilhas.
create trigger trg_acesso_sem_update before update on acesso_dado_pessoal
  for each row execute function recusa_alteracao();
create trigger trg_acesso_sem_delete before delete on acesso_dado_pessoal
  for each row execute function recusa_alteracao();

alter table acesso_dado_pessoal enable row level security;
create policy isolamento_tenant on acesso_dado_pessoal
  using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
-- Herda a visibilidade do caso: ninguém registra nem lê acesso a caso de outro canal.
create policy canal on acesso_dado_pessoal as restrictive
  using (exists (select 1 from caso c where c.id = acesso_dado_pessoal.caso_id));

grant select, insert on acesso_dado_pessoal to recredita_app;
