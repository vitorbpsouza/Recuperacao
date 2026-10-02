-- A linha do tempo passa a registrar também a distribuição.
--
-- Redistribuir um caso para outro recuperador não muda o status ("Distribuído"
-- continua "Distribuído"), então o trigger anterior não deixava rastro. Quem
-- estava com o caso, e desde quando, é exatamente o que se pergunta numa
-- disputa com o credor ou entre recuperadores.

alter table caso_evento drop constraint caso_evento_tipo_check;
alter table caso_evento add constraint caso_evento_tipo_check
  check (tipo in ('criado', 'status_alterado', 'distribuido'));

create or replace function caso_registra_evento() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  if tg_op = 'INSERT' then
    insert into caso_evento (tenant_id, caso_id, tipo, status_para, usuario_id)
      values (new.tenant_id, new.id, 'criado', new.status, app_usuario());
    return null;
  end if;

  if new.recuperador_id is distinct from old.recuperador_id and new.recuperador_id is not null then
    insert into caso_evento (tenant_id, caso_id, tipo, usuario_id, dados)
      values (
        new.tenant_id, new.id, 'distribuido', app_usuario(),
        jsonb_build_object(
          'recuperador', (select nome from recuperador where id = new.recuperador_id),
          'anterior', (select nome from recuperador where id = old.recuperador_id),
          'prazo_vinculo', new.prazo_vinculo,
          'prazo_maximo', new.prazo_maximo
        )
      );
  end if;

  if new.status is distinct from old.status then
    insert into caso_evento (tenant_id, caso_id, tipo, status_de, status_para, usuario_id)
      values (new.tenant_id, new.id, 'status_alterado', old.status, new.status, app_usuario());
  end if;
  return null;
end $$;
