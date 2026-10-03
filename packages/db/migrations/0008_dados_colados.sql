-- Tudo o que se cola fica guardado.
--
-- Decisão de produto (2026-10-02): o relatório colado na tela (veículo,
-- proprietário, radar e o dossiê da pessoa) é guardado por inteiro. A política
-- anterior, que descartava dono, documento e radar, foi revogada.
--
--   - relatorio_colado: o texto original, imutável, com quem colou e quando.
--     É a garantia de que nada se perde, mesmo que a leitura falhe;
--   - dado_extra: o que o leitor não tem campo próprio para guardar, com a
--     seção e o rótulo de origem. `novo` marca o rótulo que o sistema ainda
--     não conhece: no deploy seguinte ele vira coluna, e a migração copia os
--     valores já guardados (ver docs/PLANO-RECREDITA.md, "Campos novos");
--   - pessoa, com contatos e endereços 1-N (cada número guarda todas as fontes
--     que o citaram) e o papel no caso (devedor, proprietário, parente…);
--   - o veículo ganha os campos do relatório (tipo, categoria, combustível…);
--   - radar vira avistamento (fonte 'radar'), com coordenada, para o mapa.
--
-- Perfil, crédito e IRPF ficam em dado_extra com `sensivel`: a API só os
-- mostra a admin e gestor, e cada abertura vai para acesso_dado_pessoal.

-- ---------------------------------------------------------------------------
-- Papel gestor: opera os dois planos e vê o dado sensível, sem administrar contas
-- ---------------------------------------------------------------------------

alter table usuario drop constraint usuario_papel_check;
alter table usuario add constraint usuario_papel_check check (papel in ('admin','gestor','operador','auditor'));

-- ---------------------------------------------------------------------------
-- Veículo: os campos que os relatórios trazem
-- ---------------------------------------------------------------------------

alter table ativo
  add column marca                  text,
  add column situacao               text,
  add column tipo                   text,
  add column especie                text,
  add column categoria              text,
  add column carroceria             text,
  add column combustivel            text,
  add column potencia               text,
  add column cilindradas            text,
  add column motor                  text,
  add column procedencia            text,
  add column municipio_emplacamento text,
  add column uf_emplacamento        text check (uf_emplacamento ~ '^[A-Z]{2}$'),
  add column ano_fabricacao         integer check (ano_fabricacao between 1900 and 2100);

-- ---------------------------------------------------------------------------
-- Texto colado
-- ---------------------------------------------------------------------------

create table relatorio_colado (
  id          bigint generated always as identity primary key,
  tenant_id   text not null default app_tenant() references tenant(id),
  caso_id     text not null,
  texto       text not null check (length(texto) between 1 and 500000),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Colado na tela ou devolvido por uma integração (API Brasil).
  via         text not null default 'colado' check (via in ('colado','integracao')),
  -- Fornecedor de onde veio, quando informado. Com fornecedor há consulta auditada.
  bureau_id   text,
  consulta_id text references consulta_auditoria(id),
  secoes      text[] not null default '{}',
  -- Contagens do que foi lido (nunca valores): vai para a linha do tempo.
  resumo      jsonb not null default '{}',
  usuario_id  text,
  colado_em   timestamptz not null default now(),
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, bureau_id) references bureau(tenant_id, id),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id)
);
create index idx_relatorio_colado_caso on relatorio_colado(tenant_id, caso_id, colado_em desc);

create function relatorio_da_sessao() returns trigger
  language plpgsql
  as $$
begin
  if app_usuario() is not null then
    new.usuario_id := app_usuario();
  end if;
  new.colado_em := now();
  return new;
end $$;

create trigger trg_relatorio_da_sessao before insert on relatorio_colado
  for each row execute function relatorio_da_sessao();
create trigger trg_relatorio_sem_update before update on relatorio_colado
  for each row execute function recusa_alteracao();
create trigger trg_relatorio_sem_delete before delete on relatorio_colado
  for each row execute function recusa_alteracao();

-- ---------------------------------------------------------------------------
-- Pessoa, contatos, endereços e papel no caso
-- ---------------------------------------------------------------------------

-- Uma pessoa por canal, como o ativo: o dado recebido para recuperar para o
-- credor não serve à aquisição, e vice-versa.
create table pessoa (
  id                 text primary key default gen_random_uuid()::text,
  tenant_id          text not null default app_tenant() references tenant(id),
  origem             text not null check (origem in ('plataforma_credor','lead_proprio')),
  documento          text check (documento ~ '^[0-9A-Z]{11,14}$'),
  tipo_pessoa        text check (tipo_pessoa in ('PF','PJ')),
  nome               text,
  nome_civil         text,
  nome_mae           text,
  nome_pai           text,
  nascimento         date,
  sexo               text,
  estado_civil       text,
  rg                 text,
  rg_orgao           text,
  rg_uf              text,
  titulo_eleitor     text,
  profissao          text,
  nacionalidade      text,
  situacao_cadastral text,
  -- Devedor falecido: o polo passivo passa a ser o espólio.
  obito              boolean,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  unique (tenant_id, id),
  check (documento is not null or nome is not null)
);
create unique index idx_pessoa_documento on pessoa(tenant_id, origem, documento) where documento is not null;

create trigger trg_pessoa_atualizacao before update on pessoa
  for each row execute function carimba_atualizacao();

create table caso_pessoa (
  tenant_id     text not null default app_tenant() references tenant(id),
  caso_id       text not null,
  pessoa_id     text not null,
  papel         text not null check (papel in ('devedor','proprietario','terceiro_possuidor','parente','avalista','outro')),
  -- Parentesco ("IRMA(O)", "MAE") e de quem: só para o papel parente.
  vinculo       text,
  parente_de    text,
  usuario_id    text,
  criado_em     timestamptz not null default now(),
  primary key (tenant_id, caso_id, pessoa_id, papel),
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, pessoa_id) references pessoa(tenant_id, id),
  foreign key (tenant_id, parente_de) references pessoa(tenant_id, id),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id),
  check ((papel = 'parente') = (vinculo is not null))
);
create index idx_caso_pessoa_pessoa on caso_pessoa(tenant_id, pessoa_id);

-- Pessoa e caso do mesmo canal: a fronteira vale também para o vínculo.
create function caso_pessoa_mesmo_canal() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  if (select origem from caso where id = new.caso_id) is distinct from (select origem from pessoa where id = new.pessoa_id) then
    raise exception 'caso_pessoa: pessoa e caso de canais diferentes';
  end if;
  if app_usuario() is not null then
    new.usuario_id := app_usuario();
  end if;
  return new;
end $$;

create trigger trg_caso_pessoa_mesmo_canal before insert or update on caso_pessoa
  for each row execute function caso_pessoa_mesmo_canal();

create table pessoa_contato (
  id                     bigint generated always as identity primary key,
  tenant_id              text not null default app_tenant() references tenant(id),
  pessoa_id              text not null,
  tipo                   text not null check (tipo in ('celular','fixo','email','invalido')),
  -- Só dígitos (DDD + número) ou o e-mail em minúsculas.
  valor                  text not null check (length(valor) > 0),
  original               text,
  valido                 boolean not null,
  -- Nulo: ainda não conferido na Evolution.
  whatsapp               boolean,
  whatsapp_conferido_em  timestamptz,
  -- Cada base que citou o número: [{fonte, data, ranking, titular}].
  fontes                 jsonb not null default '[]' check (jsonb_typeof(fontes) = 'array'),
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  foreign key (tenant_id, pessoa_id) references pessoa(tenant_id, id),
  unique (tenant_id, pessoa_id, tipo, valor)
);

create trigger trg_pessoa_contato_atualizacao before update on pessoa_contato
  for each row execute function carimba_atualizacao();

create table pessoa_endereco (
  id            bigint generated always as identity primary key,
  tenant_id     text not null default app_tenant() references tenant(id),
  pessoa_id     text not null,
  -- Logradouro sem tipo + número + cidade: agrupa as grafias do mesmo endereço.
  chave         text not null,
  logradouro    text not null,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  uf            text check (uf ~ '^[A-Z]{2}$'),
  cep           text check (cep ~ '^\d{5}-\d{3}$'),
  variantes     text[] not null default '{}',
  fontes        text[] not null default '{}',
  latitude      numeric(9,6) check (latitude between -90 and 90),
  longitude     numeric(9,6) check (longitude between -180 and 180),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (tenant_id, pessoa_id) references pessoa(tenant_id, id),
  unique (tenant_id, pessoa_id, chave),
  check ((latitude is null) = (longitude is null))
);

create trigger trg_pessoa_endereco_atualizacao before update on pessoa_endereco
  for each row execute function carimba_atualizacao();

-- ---------------------------------------------------------------------------
-- Dado sem campo próprio
-- ---------------------------------------------------------------------------

create table dado_extra (
  id           bigint generated always as identity primary key,
  tenant_id    text not null default app_tenant() references tenant(id),
  caso_id      text not null,
  relatorio_id bigint not null references relatorio_colado(id),
  entidade     text not null check (entidade in ('veiculo','pessoa','caso')),
  pessoa_id    text,
  secao        text not null,
  chave        text not null,
  rotulo       text not null,
  valor        text not null,
  sensivel     boolean not null default false,
  novo         boolean not null default false,
  -- Preenchido pela migração que criou a coluna e copiou o valor.
  promovido_em timestamptz,
  criado_em    timestamptz not null default now(),
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, pessoa_id) references pessoa(tenant_id, id),
  check ((entidade = 'pessoa') = (pessoa_id is not null))
);
create index idx_dado_extra_caso on dado_extra(tenant_id, caso_id);
-- Colar o mesmo relatório duas vezes não duplica o dado.
create unique index idx_dado_extra_unico on dado_extra(tenant_id, caso_id, entidade, coalesce(pessoa_id, ''), chave, md5(valor));
create index idx_dado_extra_novo on dado_extra(tenant_id, chave) where novo and promovido_em is null;

create trigger trg_dado_extra_sem_delete before delete on dado_extra
  for each row execute function recusa_alteracao();

-- ---------------------------------------------------------------------------
-- Verificação veicular e avistamento: também vindos do texto colado
-- ---------------------------------------------------------------------------

alter table verificacao_veicular
  alter column consulta_id drop not null,
  add column relatorio_id bigint references relatorio_colado(id),
  add constraint verificacao_com_procedencia check (consulta_id is not null or relatorio_id is not null);

alter table avistamento drop constraint avistamento_fonte_check;
alter table avistamento
  add constraint avistamento_fonte_check check (fonte in ('equipe_campo','credor','devedor','outro','radar')),
  add column relatorio_id bigint references relatorio_colado(id),
  add constraint radar_do_relatorio check (fonte <> 'radar' or relatorio_id is not null);
-- A mesma passagem de radar colada duas vezes é um ponto só.
create unique index idx_avistamento_radar on avistamento(tenant_id, caso_id, observado_em, descricao) where fonte = 'radar';

-- Radar entra às dezenas: a linha do tempo registra o relatório, não cada passagem.
create or replace function dado_do_veiculo_evento() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  -- Aninhado: o PL/pgSQL não faz curto-circuito, e verificacao_veicular não tem `fonte`.
  if tg_table_name = 'avistamento' then
    if new.fonte = 'radar' then
      return null;
    end if;
  end if;
  insert into caso_evento (tenant_id, caso_id, tipo, usuario_id, dados)
    values (new.tenant_id, new.caso_id, tg_table_name, app_usuario(),
            jsonb_strip_nulls(to_jsonb(new) - 'tenant_id' - 'caso_id' - 'finalidade' - 'usuario_id' - 'id' - 'relatorio_id'));
  return null;
end $$;

alter table caso_evento drop constraint caso_evento_tipo_check;
alter table caso_evento add constraint caso_evento_tipo_check
  check (tipo in ('criado','status_alterado','distribuido','rito_definido','registro_juridico',
                  'verificacao_veicular','avistamento','relatorio_colado'));

create function relatorio_colado_evento() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  insert into caso_evento (tenant_id, caso_id, tipo, usuario_id, dados)
    values (new.tenant_id, new.caso_id, 'relatorio_colado', app_usuario(),
            jsonb_build_object('via', new.via, 'secoes', to_jsonb(new.secoes)) || new.resumo);
  return null;
end $$;

create trigger trg_relatorio_colado_evento after insert on relatorio_colado
  for each row execute function relatorio_colado_evento();

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------

alter table relatorio_colado enable row level security;
alter table pessoa           enable row level security;
alter table caso_pessoa      enable row level security;
alter table pessoa_contato   enable row level security;
alter table pessoa_endereco  enable row level security;
alter table dado_extra       enable row level security;

create policy isolamento_tenant on relatorio_colado using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on pessoa           using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on caso_pessoa      using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on pessoa_contato   using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on pessoa_endereco  using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on dado_extra       using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());

-- O que pertence ao caso herda a visibilidade dele; a pessoa, a do seu canal.
create policy canal on relatorio_colado as restrictive using (exists (select 1 from caso c where c.id = relatorio_colado.caso_id));
create policy canal on caso_pessoa      as restrictive using (exists (select 1 from caso c where c.id = caso_pessoa.caso_id));
create policy canal on dado_extra       as restrictive using (exists (select 1 from caso c where c.id = dado_extra.caso_id));
create policy canal on pessoa           as restrictive using (origem = any (app_canais()));
create policy canal on pessoa_contato   as restrictive using (exists (select 1 from pessoa p where p.id = pessoa_contato.pessoa_id));
create policy canal on pessoa_endereco  as restrictive using (exists (select 1 from pessoa p where p.id = pessoa_endereco.pessoa_id));

grant select, insert on relatorio_colado, dado_extra to recredita_app;
grant select, insert, update on pessoa, caso_pessoa, pessoa_contato, pessoa_endereco to recredita_app;
