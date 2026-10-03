-- Campo novo vira campo oficial na hora, sem deploy (decisão de 2026-10-03).
--
-- Criar coluna a partir de texto colado exigiria dar à API permissão de
-- alterar tabelas — e um relatório malformado mudaria o banco sem revisão.
-- Em vez disso, o rótulo novo entra num catálogo (campo_dinamico) e passa a
-- ser mostrado como campo da ficha, dos relatórios e do CSV; o valor continua
-- em dado_extra. A tela de campos renomeia, oculta e junta sinônimos. Se um
-- campo ficar muito usado em filtro, vira coluna de verdade num deploy.

-- ---------------------------------------------------------------------------
-- Correção: seções do relatório do veículo que o leitor antigo deu à pessoa
-- ("IMPORTAÇÃO" e "ℹ OUTROS ℹ", vindas logo depois do veículo).
-- ---------------------------------------------------------------------------

update dado_extra
   set entidade  = 'veiculo',
       pessoa_id = null,
       secao     = case when secao ~* 'outros' then 'OUTROS' else secao end,
       chave     = regexp_replace(chave, '^ℹ outros ℹ', 'outros')
 where entidade = 'pessoa'
   and novo
   -- 'ℹ OUTROS ℹ': o ℹ é letra para o Postgres, então vale o tamanho curto do título.
   and (secao ~* 'importa' or (secao ~* 'outros' and length(secao) <= 12));

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table campo_dinamico (
  id              bigint generated always as identity primary key,
  tenant_id       text not null default app_tenant() references tenant(id),
  entidade        text not null check (entidade in ('veiculo','pessoa','caso')),
  -- A chave do dado_extra (seção e rótulo normalizados).
  chave           text not null,
  secao           text not null,
  rotulo_original text not null,
  -- Como aparece na tela; editável.
  rotulo          text not null check (length(trim(rotulo)) >= 1),
  oculto          boolean not null default false,
  -- Sinônimo: os valores deste campo aparecem no campo indicado.
  junto_de        bigint references campo_dinamico(id),
  ordem           integer not null default 100,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (tenant_id, entidade, chave),
  check (junto_de is distinct from id)
);

create trigger trg_campo_dinamico_atualizacao before update on campo_dinamico
  for each row execute function carimba_atualizacao();

-- O que já chegou como campo novo vira campo, com o rótulo de origem.
insert into campo_dinamico (tenant_id, entidade, chave, secao, rotulo_original, rotulo)
select distinct on (tenant_id, entidade, chave) tenant_id, entidade, chave, secao, rotulo, rotulo
  from dado_extra
 where novo and not sensivel
 order by tenant_id, entidade, chave, id;

alter table campo_dinamico enable row level security;
create policy isolamento_tenant on campo_dinamico using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());

grant select, insert on campo_dinamico to recredita_app;
grant update (rotulo, oculto, junto_de, ordem) on campo_dinamico to recredita_app;
