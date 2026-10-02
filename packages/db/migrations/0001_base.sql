-- Schema da operação de recuperação (Plano A) e aquisição (Plano B), em Postgres.
--
-- A regra central continua a mesma do SQLite: a ORIGEM de um caso determina sua
-- FINALIDADE, e nenhuma linha pode violar isso. Tipos em TypeScript protegem o
-- código que escrevemos; estas constraints protegem o dado que chega por
-- importação, seed ou correção manual. Nada aqui depende de alguém lembrar da regra.
--
-- O que este porte acrescenta:
-- * tenant: toda tabela de negócio carrega tenant_id e é isolada por RLS. A
--   ReCredita é o primeiro tenant; a plataforma já nasce pronta para outros.
--   Chaves estrangeiras são compostas com tenant_id: FK não passa pelo RLS, e
--   sem isso um caso poderia apontar para o ativo de outro tenant.
-- * canal no banco: a segregação Plano A × Plano B, que antes só a API impunha,
--   também é política de linha. Um operador de um canal não lê o outro nem que
--   uma rota esqueça de filtrar.
-- * caso imutável no que define a fronteira: origem, finalidade e ativo não
--   mudam depois de criados. Antes, um UPDATE convertia um caso de plataforma em
--   aquisição.
-- * ativo de um canal só: o registro do ativo carrega dado pessoal recebido sob
--   a finalidade do seu canal. A mesma placa nos dois canais são dois registros,
--   ligados pela colisão de origem — nunca a mesma linha.
-- * caso_evento: criação e mudança de status são registradas por trigger, com o
--   usuário da sessão. A API não tem permissão de escrever eventos à mão.
-- * vocabulário de status no banco: antes só a rota de mudança de status
--   validava; a criação aceitava qualquer texto.

-- ---------------------------------------------------------------------------
-- Contexto da requisição
-- ---------------------------------------------------------------------------

-- A API abre cada transação com set_config(..., true) e SET LOCAL ROLE
-- recredita_app. Sem contexto, estas funções devolvem nulo/vazio e as
-- políticas não deixam ver nada.
create function app_tenant() returns text
  language sql stable
  as $$ select nullif(current_setting('app.tenant_id', true), '') $$;

create function app_usuario() returns text
  language sql stable
  as $$ select nullif(current_setting('app.usuario_id', true), '') $$;

create function app_canais() returns text[]
  language sql stable
  as $$ select coalesce(string_to_array(nullif(current_setting('app.canais', true), ''), ','), '{}') $$;

-- Papel com que a API consulta. Não é superusuário nem dono das tabelas, então
-- o RLS vale para ele. Em produção o usuário de login da aplicação recebe este
-- papel (GRANT recredita_app TO <login>); em dev e teste a transação faz SET ROLE.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'recredita_app') then
    create role recredita_app nologin;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tenant
-- ---------------------------------------------------------------------------

create table tenant (
  id        text primary key,
  nome      text not null check (length(trim(nome)) > 0),
  -- Sigla do quadrado da marca na interface (ex.: "RC") enquanto não há logo.
  sigla     text not null check (length(sigla) between 1 and 3),
  logo_url  text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fontes de suprimento
-- ---------------------------------------------------------------------------

-- De onde o ativo vem. Hoje a relação é com uma plataforma, não com o credor:
-- modelar isso explicitamente mantém o limite de finalidade visível no dado.
create table fonte_ativo (
  id                   text primary key default gen_random_uuid()::text,
  tenant_id            text not null default app_tenant() references tenant(id),
  nome                 text not null,
  tipo                 text not null check (tipo in ('Plataforma','Credor Direto','Lead Próprio')),
  -- 'Manual' e 'Exportação' respeitam qualquer ToS. 'API' só quando oferecida:
  -- automatizar extração que o termo proíbe custa o acesso à fonte.
  ingestao             text not null check (ingestao in ('Manual','Exportação','API')),
  finalidade_permitida text not null check (finalidade_permitida in ('recuperacao_para_credor','aquisicao_com_quitacao')),
  termo_de_uso_url     text,
  credor_nome          text,
  ativa                boolean not null default true,
  unique (tenant_id, id)
);

-- ---------------------------------------------------------------------------
-- Identidade e sessão
-- ---------------------------------------------------------------------------

-- A trilha de auditoria só tem valor se o operador for autenticado:
-- `operador_id` vindo do cliente seria autodeclaração.
create table usuario (
  id         text primary key default gen_random_uuid()::text,
  tenant_id  text not null default app_tenant() references tenant(id),
  -- Único na plataforma: o login acontece antes de se saber o tenant.
  email      text not null unique check (email = lower(trim(email))),
  nome       text not null,
  -- scrypt no formato `salt:hash`, ambos hex. Senha em claro nunca é gravada.
  senha_hash text not null,
  papel      text not null check (papel in ('admin','operador','auditor')),
  -- Segregação de função: um operador restrito a um canal não lê o outro.
  canais     text[] not null default '{}'
             check (canais <@ array['plataforma_credor','lead_proprio']),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  -- Operador sem canal não consegue fazer nada: é erro de cadastro.
  constraint operador_com_canal check (papel <> 'operador' or cardinality(canais) > 0),
  unique (tenant_id, id)
);

-- Guarda o SHA-256 do token, não o token: um vazamento do banco não concede acesso.
-- A API não lê esta tabela diretamente: só pelas funções auth_* abaixo.
create table sessao (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null references tenant(id),
  usuario_id  text not null,
  token_hash  text not null unique,
  criada_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  revogada_em timestamptz,
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id)
);
create index idx_sessao_usuario on sessao(usuario_id);

-- ---------------------------------------------------------------------------
-- Ativo e rede de campo
-- ---------------------------------------------------------------------------

create table ativo (
  id               text primary key default gen_random_uuid()::text,
  tenant_id        text not null default app_tenant() references tenant(id),
  placa            text not null check (placa = upper(placa) and placa !~ '\s'),
  chassi           text,
  modelo           text,
  ano              integer,
  cor              text,
  -- Dado pessoal do devedor: minimizado por princípio (LGPD art. 6, III).
  -- Só o necessário para identificar o caso; nada de histórico comportamental.
  devedor_nome     text,
  devedor_doc      text,
  credor_nome      text,
  valor_divida     numeric(14,2),
  cidade           text,
  uf               text check (uf ~ '^[A-Z]{2}$'),
  data_recebimento timestamptz not null default now(),
  criado_em        timestamptz not null default now(),
  unique (tenant_id, id)
);
create index idx_ativo_placa on ativo(tenant_id, placa);

create table recuperador (
  id               text primary key default gen_random_uuid()::text,
  tenant_id        text not null default app_tenant() references tenant(id),
  nome             text not null,
  documento        text,
  telefone         text,
  cidades          text[] not null default '{}',
  status           text not null check (status in ('Ativo','Inativo','Suspenso')),
  score            numeric(5,2) not null default 0 check (score between 0 and 100),
  taxa_recuperacao numeric(5,2) not null default 0 check (taxa_recuperacao between 0 and 100),
  data_cadastro    timestamptz not null default now(),
  unique (tenant_id, id)
);

-- ---------------------------------------------------------------------------
-- Caso — a fronteira entre os dois canais
-- ---------------------------------------------------------------------------

create table caso (
  id         text primary key default gen_random_uuid()::text,
  tenant_id  text not null default app_tenant() references tenant(id),
  ativo_id   text not null,
  fonte_id   text not null,
  origem     text not null check (origem in ('plataforma_credor','lead_proprio')),
  finalidade text not null check (finalidade in ('recuperacao_para_credor','aquisicao_com_quitacao')),
  status     text not null,

  -- Plano A: recuperação para o credor
  recuperador_id text,
  prazo_vinculo  timestamptz,
  prazo_maximo   timestamptz,

  -- Plano B: aquisição via quitação
  canal_lead               text check (canal_lead in ('Inbound Site','WhatsApp','Indicação','Parceria','Anúncio')),
  evidencia_lead           text,
  saldo_devedor            numeric(14,2),
  valor_quitacao_negociado numeric(14,2),
  valor_pago_ao_devedor    numeric(14,2),
  anuencia_credor          text check (anuencia_credor in ('Pendente','Obtida','Negada')),
  renajud_ativo            boolean,
  gravame_baixado          boolean,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  foreign key (tenant_id, ativo_id) references ativo(tenant_id, id),
  foreign key (tenant_id, fonte_id) references fonte_ativo(tenant_id, id),
  foreign key (tenant_id, recuperador_id) references recuperador(tenant_id, id),
  unique (tenant_id, id),

  -- A FRONTEIRA: origem determina finalidade. Um caso vindo da plataforma do
  -- credor não pode, em nenhuma circunstância, carregar finalidade de aquisição.
  constraint fronteira_origem_finalidade check (
    (origem = 'plataforma_credor' and finalidade = 'recuperacao_para_credor') or
    (origem = 'lead_proprio'      and finalidade = 'aquisicao_com_quitacao')
  ),

  -- Campos de cada canal são obrigatórios no seu canal e proibidos no outro.
  -- Isso impede um caso "híbrido" que acumule dado dos dois lados.
  constraint campos_por_finalidade check (
    (finalidade = 'recuperacao_para_credor'
      and canal_lead is null and evidencia_lead is null
      and anuencia_credor is null and renajud_ativo is null
      and gravame_baixado is null and valor_pago_ao_devedor is null)
    or
    (finalidade = 'aquisicao_com_quitacao'
      -- `is not null` explícito: length(trim(NULL)) é NULL, e CHECK só reprova FALSE.
      and canal_lead is not null
      and evidencia_lead is not null and length(trim(evidencia_lead)) > 0
      and anuencia_credor is not null and renajud_ativo is not null
      and gravame_baixado is not null
      -- aquisição não é trabalho de campo: não vincula recuperador
      and recuperador_id is null and prazo_vinculo is null)
  ),

  -- Cada canal tem seu ciclo de vida. Espelha STATUS_RECUPERACAO e
  -- STATUS_AQUISICAO de @workspace/domain; um teste garante que os dois
  -- concordam.
  constraint status_do_canal check (
    (finalidade = 'recuperacao_para_credor' and status in (
      'Recebido','Em Enriquecimento','Enriquecido','Em Análise','Distribuído','Aceito',
      'Em Campo','Localizado','Recuperado','Encerrado','Removido pelo Banco'))
    or
    (finalidade = 'aquisicao_com_quitacao' and status in (
      'Lead Recebido','Em Contato','Proposta Enviada','Negociando com Credor',
      'Quitação Aprovada','Quitado','Transferido','Encerrado','Desistiu'))
  )
);

-- Uma placa só pode ter um caso aberto por canal.
create unique index idx_caso_ativo_origem on caso(ativo_id, origem);
create index idx_caso_tenant_origem on caso(tenant_id, origem, criado_em desc);

-- Origem, finalidade, ativo e tenant definem a fronteira: não mudam depois de criados.
create function caso_fronteira_imutavel() returns trigger
  language plpgsql
  as $$
begin
  if new.origem is distinct from old.origem
     or new.finalidade is distinct from old.finalidade
     or new.ativo_id is distinct from old.ativo_id
     or new.tenant_id is distinct from old.tenant_id then
    raise exception 'fronteira: origem, finalidade, ativo e tenant de um caso nao mudam depois de criados';
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger trg_caso_fronteira_imutavel
  before update on caso
  for each row execute function caso_fronteira_imutavel();

-- ---------------------------------------------------------------------------
-- Colisão de origem
-- ---------------------------------------------------------------------------

-- Mesma placa presente nos dois canais. Sem registro explícito, a situação é
-- indistinguível de desvio de finalidade. Com registro e evidência, é defensável.
create table colisao_origem (
  id                     text primary key default gen_random_uuid()::text,
  tenant_id              text not null default app_tenant() references tenant(id),
  placa                  text not null,
  caso_plataforma_id     text not null,
  lead_proprio_ref       text,
  detectado_em           timestamptz not null default now(),
  resolucao              text not null check (resolucao in ('lead_descartado','prosseguiu_com_origem_independente')),
  justificativa          text not null check (length(trim(justificativa)) > 0),
  -- Como se prova que o lead não nasceu do dado da plataforma.
  evidencia_independente text,
  operador_id            text not null,
  foreign key (tenant_id, caso_plataforma_id) references caso(tenant_id, id),
  foreign key (tenant_id, operador_id) references usuario(tenant_id, id),

  -- `length(trim(NULL))` é NULL, e CHECK só reprova FALSE: sem o teste
  -- explícito de NULL, uma evidência ausente passaria pela constraint.
  constraint evidencia_obrigatoria_para_prosseguir check (
    resolucao = 'lead_descartado'
    or (evidencia_independente is not null and length(trim(evidencia_independente)) > 0)
  )
);
create index idx_colisao_placa on colisao_origem(tenant_id, placa);

-- A colisão só vale contra um caso de plataforma da mesma placa — senão bastaria
-- apontar para qualquer caso para destravar uma aquisição. O operador é o da
-- sessão sempre que houver sessão: o cliente não declara quem fez o ato.
create function colisao_valida() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  if app_usuario() is not null then
    new.operador_id := app_usuario();
  end if;
  if not exists (
    select 1 from caso c join ativo a on a.id = c.ativo_id
     where c.tenant_id = new.tenant_id
       and c.id = new.caso_plataforma_id
       and c.origem = 'plataforma_credor'
       and a.placa = new.placa
  ) then
    raise exception 'colisao_origem: o caso informado nao e um caso de plataforma desta placa';
  end if;
  return new;
end $$;

create trigger trg_colisao_valida
  before insert on colisao_origem
  for each row execute function colisao_valida();

-- Abrir um caso exige:
-- 1. ativo de um canal só — o registro carrega dado recebido sob a finalidade do
--    seu canal;
-- 2. para aquisição numa placa que já é caso de plataforma, colisão resolvida
--    com evidência independente.
-- SECURITY DEFINER: a checagem precisa enxergar os casos do outro canal, que o
-- RLS esconde de quem está abrindo o caso.
create function caso_exige_fronteira() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  v_placa text;
begin
  if exists (select 1 from caso c where c.ativo_id = new.ativo_id and c.origem <> new.origem) then
    raise exception 'fronteira: este ativo ja pertence ao outro canal; cadastre o veiculo a partir da origem independente';
  end if;

  if new.origem = 'lead_proprio' then
    select placa into v_placa from ativo where id = new.ativo_id;
    if exists (
         select 1 from caso c join ativo a on a.id = c.ativo_id
          where c.tenant_id = new.tenant_id
            and c.origem = 'plataforma_credor'
            and a.placa = v_placa)
       and not exists (
         select 1 from colisao_origem co
          where co.tenant_id = new.tenant_id
            and co.placa = v_placa
            and co.resolucao = 'prosseguiu_com_origem_independente'
            and length(trim(co.evidencia_independente)) > 0)
    then
      raise exception 'colisao_origem: placa ja possui caso de plataforma; registre a colisao com evidencia independente antes de abrir aquisicao';
    end if;
  end if;
  return new;
end $$;

create trigger trg_caso_exige_fronteira
  before insert on caso
  for each row execute function caso_exige_fronteira();

-- ---------------------------------------------------------------------------
-- Linha do tempo do caso
-- ---------------------------------------------------------------------------

-- Append-only e escrita só por trigger: a API tem SELECT, não INSERT. Um evento
-- forjado pela aplicação seria tão inútil quanto nenhum evento.
create table caso_evento (
  id          bigint generated always as identity primary key,
  tenant_id   text not null,
  caso_id     text not null,
  tipo        text not null check (tipo in ('criado','status_alterado')),
  status_de   text,
  status_para text,
  -- Nulo quando a mudança vem de carga ou seed, sem sessão.
  usuario_id  text,
  ocorrido_em timestamptz not null default now(),
  dados       jsonb not null default '{}',
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id)
);
create index idx_caso_evento_caso on caso_evento(caso_id, ocorrido_em);

create function caso_registra_evento() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  if tg_op = 'INSERT' then
    insert into caso_evento (tenant_id, caso_id, tipo, status_para, usuario_id)
      values (new.tenant_id, new.id, 'criado', new.status, app_usuario());
  elsif new.status is distinct from old.status then
    insert into caso_evento (tenant_id, caso_id, tipo, status_de, status_para, usuario_id)
      values (new.tenant_id, new.id, 'status_alterado', old.status, new.status, app_usuario());
  end if;
  return null;
end $$;

create trigger trg_caso_registra_evento
  after insert or update on caso
  for each row execute function caso_registra_evento();

-- ---------------------------------------------------------------------------
-- Bureaus e trilha de auditoria
-- ---------------------------------------------------------------------------

-- Chave de API NUNCA fica aqui: vive em variável de ambiente / secret manager.
-- O banco guarda a referência do contrato, que é o que a auditoria precisa.
create table bureau (
  id                     text primary key default gen_random_uuid()::text,
  tenant_id              text not null default app_tenant() references tenant(id),
  nome                   text not null,
  tipo                   text not null check (tipo in ('Crédito','Veicular','Localização','Judicial')),
  contrato_fornecedor_id text not null check (length(trim(contrato_fornecedor_id)) > 0),
  env_var_chave          text not null,
  custo_consulta         numeric(10,2) not null default 0 check (custo_consulta >= 0),
  ativo                  boolean not null default true,
  unique (tenant_id, id)
);

-- Procedência de cada consulta. O ônus de demonstrar base legal é de quem trata
-- (LGPD art. 6, IX e art. 37): dado sem procedência é dado sem amparo.
create table consulta_auditoria (
  id                     text primary key default gen_random_uuid()::text,
  tenant_id              text not null default app_tenant() references tenant(id),
  caso_id                text not null,
  origem_caso            text not null check (origem_caso in ('plataforma_credor','lead_proprio')),
  finalidade             text not null check (finalidade in ('recuperacao_para_credor','aquisicao_com_quitacao')),
  bureau_id              text not null,
  contrato_fornecedor_id text not null check (length(trim(contrato_fornecedor_id)) > 0),
  base_legal             text not null check (base_legal in ('execucao_contrato','legitimo_interesse','obrigacao_legal','consentimento')),
  justificativa          text not null check (length(trim(justificativa)) > 0),
  operador_id            text not null,
  consultado_em          timestamptz not null default now(),
  -- Os campos retornados, não os valores: a auditoria não replica o dado pessoal.
  campos_retornados      text[] not null default '{}',
  retencao_ate           timestamptz not null,
  custo                  numeric(10,2) not null default 0,
  foreign key (tenant_id, caso_id) references caso(tenant_id, id),
  foreign key (tenant_id, bureau_id) references bureau(tenant_id, id),
  foreign key (tenant_id, operador_id) references usuario(tenant_id, id)
);
create index idx_auditoria_caso on consulta_auditoria(caso_id);
create index idx_auditoria_retencao on consulta_auditoria(retencao_ate);

-- A consulta tem de concordar com o caso que ela serve. Sem isto, bastaria
-- declarar outra finalidade na própria linha de auditoria para furar a fronteira.
create function auditoria_coerente_com_caso() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  if app_usuario() is not null then
    new.operador_id := app_usuario();
  end if;
  if (select finalidade from caso where id = new.caso_id) is distinct from new.finalidade
     or (select origem from caso where id = new.caso_id) is distinct from new.origem_caso then
    raise exception 'consulta_auditoria: origem/finalidade divergem do caso';
  end if;
  return new;
end $$;

create trigger trg_auditoria_coerente_com_caso
  before insert on consulta_auditoria
  for each row execute function auditoria_coerente_com_caso();

-- Trilha de auditoria é append-only: alterar ou apagar destrói o próprio valor.
create function recusa_alteracao() returns trigger
  language plpgsql
  as $$
begin
  raise exception '% e append-only: % proibido', tg_table_name, tg_op;
end $$;

create trigger trg_auditoria_sem_update before update on consulta_auditoria
  for each row execute function recusa_alteracao();
create trigger trg_auditoria_sem_delete before delete on consulta_auditoria
  for each row execute function recusa_alteracao();
create trigger trg_evento_sem_update before update on caso_evento
  for each row execute function recusa_alteracao();
create trigger trg_evento_sem_delete before delete on caso_evento
  for each row execute function recusa_alteracao();

-- ---------------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------------

create table repasse (
  id             text primary key default gen_random_uuid()::text,
  tenant_id      text not null default app_tenant() references tenant(id),
  recuperador_id text not null,
  caso_id        text not null,
  valor          numeric(14,2) not null check (valor > 0),
  data           timestamptz not null default now(),
  status         text not null check (status in ('Pendente','Pago','Cancelado')),
  tipo           text not null check (tipo in ('Comissão','Ajuda de Custo','Bônus')),
  observacao     text,
  foreign key (tenant_id, recuperador_id) references recuperador(tenant_id, id),
  foreign key (tenant_id, caso_id) references caso(tenant_id, id)
);
create index idx_repasse_status on repasse(status);

-- Repasse remunera trabalho de campo, que só existe no Plano A.
create function repasse_so_recuperacao() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  if (select finalidade from caso where id = new.caso_id) <> 'recuperacao_para_credor' then
    raise exception 'repasse: so casos de recuperacao para o credor geram repasse a recuperador';
  end if;
  return new;
end $$;

create trigger trg_repasse_so_recuperacao
  before insert or update on repasse
  for each row execute function repasse_so_recuperacao();

-- ---------------------------------------------------------------------------
-- Autenticação — o único caminho da API até usuario e sessao
-- ---------------------------------------------------------------------------

-- O login acontece antes de existir tenant na sessão, então estas funções rodam
-- como dono das tabelas. Devolvem só o necessário para cada passo.
create function auth_usuario_por_email(p_email text)
  returns table (id text, tenant_id text, email text, nome text, senha_hash text,
                 papel text, canais text[], ativo boolean)
  language sql stable
  security definer
  set search_path = public, pg_temp
  as $$
    select u.id, u.tenant_id, u.email, u.nome, u.senha_hash, u.papel, u.canais, u.ativo
      from usuario u
     where u.email = lower(trim(p_email))
  $$;

create function auth_abrir_sessao(p_usuario_id text, p_token_hash text, p_expira_em timestamptz)
  returns text
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  v_id text;
begin
  insert into sessao (tenant_id, usuario_id, token_hash, expira_em)
    select u.tenant_id, u.id, p_token_hash, p_expira_em
      from usuario u
     where u.id = p_usuario_id and u.ativo
  returning id into v_id;
  if v_id is null then
    raise exception 'auth: usuario inexistente ou inativo';
  end if;
  return v_id;
end $$;

create function auth_resolver_sessao(p_token_hash text)
  returns table (sessao_id text, id text, tenant_id text, email text, nome text,
                 papel text, canais text[])
  language sql stable
  security definer
  set search_path = public, pg_temp
  as $$
    select s.id, u.id, u.tenant_id, u.email, u.nome, u.papel, u.canais
      from sessao s
      join usuario u on u.id = s.usuario_id
     where s.token_hash = p_token_hash
       and s.revogada_em is null
       and s.expira_em > now()
       and u.ativo
  $$;

create function auth_revogar_sessao(p_token_hash text)
  returns void
  language sql
  security definer
  set search_path = public, pg_temp
  as $$
    update sessao set revogada_em = now()
     where token_hash = p_token_hash and revogada_em is null
  $$;

-- Visibilidade do ativo: some quando o ativo tem caso num canal que a sessão
-- não vê. SECURITY DEFINER porque precisa enxergar justamente esses casos.
create function ativo_visivel(p_ativo_id text)
  returns boolean
  language sql stable
  security definer
  set search_path = public, pg_temp
  as $$
    select not exists (
      select 1 from caso c
       where c.ativo_id = p_ativo_id
         and not (c.origem = any (app_canais()))
    )
  $$;

-- ---------------------------------------------------------------------------
-- RLS: tenant e canal
-- ---------------------------------------------------------------------------

alter table tenant             enable row level security;
alter table fonte_ativo        enable row level security;
alter table usuario            enable row level security;
alter table sessao             enable row level security;
alter table ativo              enable row level security;
alter table recuperador        enable row level security;
alter table caso               enable row level security;
alter table colisao_origem     enable row level security;
alter table caso_evento        enable row level security;
alter table bureau             enable row level security;
alter table consulta_auditoria enable row level security;
alter table repasse            enable row level security;

create policy tenant_proprio on tenant using (id = app_tenant());

create policy isolamento_tenant on fonte_ativo        using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on usuario            using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on ativo              using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on recuperador        using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on caso               using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on colisao_origem     using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on caso_evento        using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on bureau             using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on consulta_auditoria using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on repasse            using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
-- sessao fica sem política permissiva: só as funções auth_* a acessam.

-- Canal: políticas restritivas, somadas (AND) ao isolamento de tenant.
create policy canal on caso as restrictive
  using (origem = any (app_canais()));

create policy canal on consulta_auditoria as restrictive
  using (origem_caso = any (app_canais()));

-- Evento herda a visibilidade do caso: a subconsulta já passa pelo RLS de caso.
create policy canal on caso_evento as restrictive
  using (exists (select 1 from caso c where c.id = caso_evento.caso_id));

create policy canal on ativo as restrictive
  using (ativo_visivel(id));

create policy canal on fonte_ativo as restrictive
  using (case finalidade_permitida
           when 'recuperacao_para_credor' then 'plataforma_credor' = any (app_canais())
           else 'lead_proprio' = any (app_canais())
         end);

-- Rede de campo e repasses são do Plano A.
create policy canal on recuperador as restrictive
  using ('plataforma_credor' = any (app_canais()));

create policy canal on repasse as restrictive
  using ('plataforma_credor' = any (app_canais()));

-- Colisão cruza os dois canais por definição: só quem enxerga os dois a vê.
create policy canal on colisao_origem as restrictive
  using (app_canais() @> array['plataforma_credor','lead_proprio']);

-- ---------------------------------------------------------------------------
-- Permissões do papel da aplicação
-- ---------------------------------------------------------------------------

grant usage on schema public to recredita_app;
grant select on tenant to recredita_app;
grant select, insert, update on fonte_ativo, usuario, ativo, recuperador, caso,
  colisao_origem, bureau, repasse to recredita_app;
-- Append-only: inserir sim, alterar e apagar nunca.
grant select, insert on consulta_auditoria to recredita_app;
-- Só o trigger escreve eventos.
grant select on caso_evento to recredita_app;
-- sessao: nenhuma permissão direta; o acesso é pelas funções auth_*.
