-- Fase 2a: o que acontece sem ninguém lembrar.
--
--   - Tempo real: cada evento da linha do tempo sai em NOTIFY no canal
--     `caso_evento`. A API escuta uma conexão só e repassa por SSE a cada
--     sessão apenas o que é do tenant e dos canais dela.
--   - Recall: caso que sai de campo (recall, cura, retomada, suspensão,
--     encerramento) revoga na hora os links de campo; e o link só resolve com
--     o caso em campo. Apreender bem quitado gera dano moral.
--   - Prazos: varrer_prazos() age sobre os prazos vencidos e deixa rastro na
--     linha do tempo. Idempotente; a API a chama a cada minuto.
--       aceite vencido            → o caso volta à fila de distribuição;
--       prazo máximo vencido      → aviso (redistribuir caso em campo é decisão do gestor);
--       purga da mora encerrada   → aviso: o bem pode ser entregue ao credor;
--       20 dias da notificação extrajudicial sem consolidação → aviso.

-- ---------------------------------------------------------------------------
-- Linha do tempo: novo tipo de evento
-- ---------------------------------------------------------------------------

alter table caso_evento drop constraint caso_evento_tipo_check;
alter table caso_evento add constraint caso_evento_tipo_check
  check (tipo in ('criado','status_alterado','distribuido','rito_definido','registro_juridico',
                  'verificacao_veicular','avistamento','relatorio_colado','prazo_vencido'));

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------

-- O payload leva só o necessário para a tela decidir o que recarregar: nada de
-- devedor, dívida ou endereço. O resto a tela busca pelas rotas, sob o RLS.
create function caso_evento_notifica() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  c record;
begin
  select k.origem, a.placa into c
    from caso k join ativo a on a.tenant_id = k.tenant_id and a.id = k.ativo_id
   where k.tenant_id = new.tenant_id and k.id = new.caso_id;
  perform pg_notify('caso_evento', json_build_object(
    'id', new.id,
    'tenantId', new.tenant_id,
    'casoId', new.caso_id,
    'origem', c.origem,
    'placa', c.placa,
    'tipo', new.tipo,
    'statusDe', new.status_de,
    'statusPara', new.status_para,
    'usuarioId', new.usuario_id,
    'prazo', new.dados ->> 'prazo',
    'automatico', coalesce((new.dados ->> 'automatico')::boolean, false),
    'ocorridoEm', new.ocorrido_em
  )::text);
  return null;
end $$;

create trigger trg_caso_evento_notifica after insert on caso_evento
  for each row execute function caso_evento_notifica();

-- ---------------------------------------------------------------------------
-- Recall e link de campo
-- ---------------------------------------------------------------------------

-- Status em que ainda se procura o bem. Fora deles, link de campo não vale.
create function caso_em_campo(p_status text) returns boolean
  language sql immutable
  as $$ select p_status in ('Pronto para Campo','Distribuído','Aceito','Em Campo','Localizado') $$;

create function caso_revoga_links() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  if new.status is distinct from old.status and not caso_em_campo(new.status) then
    update link_campo set revogado_em = now()
     where tenant_id = new.tenant_id and caso_id = new.id and revogado_em is null;
  end if;
  return null;
end $$;

create trigger trg_caso_revoga_links after update of status on caso
  for each row execute function caso_revoga_links();

-- Mesmo link não revogado (criado antes desta migração, ou caso que voltou à
-- análise) não resolve com o caso fora de campo.
create or replace function link_campo_resolver(p_token_hash text)
  returns table (link_id text, tenant_id text, caso_id text, destinatario text, expira_em timestamptz)
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
begin
  return query
    update link_campo l set usos = l.usos + 1, ultimo_uso_em = now()
      from caso c
     where l.token_hash = p_token_hash and l.revogado_em is null and l.expira_em > now()
       and c.tenant_id = l.tenant_id and c.id = l.caso_id and caso_em_campo(c.status)
    returning l.id, l.tenant_id, l.caso_id, l.destinatario, l.expira_em;
end $$;

-- Links abertos de casos que já saíram de campo.
update link_campo l set revogado_em = now()
  from caso c
 where c.tenant_id = l.tenant_id and c.id = l.caso_id
   and l.revogado_em is null and not caso_em_campo(c.status);

-- ---------------------------------------------------------------------------
-- Prazos
-- ---------------------------------------------------------------------------

-- Aviso de prazo vencido, uma vez por prazo: `referencia` é o prazo em epoch,
-- para que um novo prazo (redistribuição, nova retomada) gere novo aviso.
create function registrar_prazo_vencido(c caso, p_prazo text, p_vencimento timestamptz, p_mensagem text)
  returns boolean
  language plpgsql
  set search_path = public, pg_temp
  as $$
declare
  ref numeric := extract(epoch from p_vencimento);
begin
  if exists (select 1 from caso_evento e
              where e.tenant_id = c.tenant_id and e.caso_id = c.id and e.tipo = 'prazo_vencido'
                and e.dados ->> 'prazo' = p_prazo and (e.dados ->> 'referencia')::numeric = ref) then
    return false;
  end if;
  insert into caso_evento (tenant_id, caso_id, tipo, dados)
    values (c.tenant_id, c.id, 'prazo_vencido', jsonb_build_object(
      'prazo', p_prazo, 'referencia', ref, 'venceu_em', p_vencimento,
      'mensagem', p_mensagem, 'automatico', true));
  return true;
end $$;

-- Roda como dono (atravessa os tenants) e só faz o que o próprio prazo manda.
-- As guardas do ciclo continuam valendo: a volta à fila passa pelos mesmos
-- triggers que uma mudança feita na tela.
create function varrer_prazos()
  returns table (tenant_id text, caso_id text, acao text)
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  c caso;
  quem text;
  destino text;
  quando text;
begin
  -- Várias instâncias da API: uma varre, as outras saem sem esperar.
  if not pg_try_advisory_xact_lock(2026100301) then
    return;
  end if;
  perform set_config('app.usuario_id', '', true);

  -- 1. Aceite vencido: o recuperador não aceitou a tempo, o caso volta à fila.
  for c in
    select * from caso k
     where k.finalidade = 'recuperacao_para_credor' and k.status = 'Distribuído' and k.prazo_vinculo < now()
     order by k.prazo_vinculo
     for update skip locked
  loop
    begin
      select r.nome into quem from recuperador r where r.tenant_id = c.tenant_id and r.id = c.recuperador_id;
      quando := to_char(c.prazo_vinculo at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');
      -- Se a habilitação deixou de valer (mandato vencido, por exemplo), volta à análise.
      destino := case when cardinality(pendencias_transicao(c, 'Pronto para Campo')) = 0
                      then 'Pronto para Campo' else 'Em Análise' end;
      perform set_config('app.tenant_id', c.tenant_id, true);
      perform set_config('app.evento', jsonb_build_object(
        'motivo', format('Aceite vencido: %s não aceitou até %s. O caso voltou para %s.',
                         coalesce(quem, 'o recuperador'), quando,
                         case destino when 'Pronto para Campo' then 'a fila de distribuição' else 'análise' end),
        'automatico', true, 'prazo', 'aceite')::text, true);
      update caso k set status = destino, recuperador_id = null, prazo_vinculo = null, prazo_maximo = null
       where k.tenant_id = c.tenant_id and k.id = c.id;
      perform set_config('app.evento', '', true);
      tenant_id := c.tenant_id; caso_id := c.id; acao := 'aceite_vencido';
      return next;
    exception when others then
      perform set_config('app.evento', '', true);
      tenant_id := c.tenant_id; caso_id := c.id; acao := 'erro: ' || sqlerrm;
      return next;
    end;
  end loop;

  -- 2. Prazo máximo vencido com o caso em campo.
  for c in
    select * from caso k
     where k.finalidade = 'recuperacao_para_credor' and k.status in ('Aceito','Em Campo','Localizado')
       and k.prazo_maximo < now()
  loop
    if registrar_prazo_vencido(c, 'maximo', c.prazo_maximo,
         'Prazo máximo do recuperador vencido com o caso em andamento: redistribua ou renove o prazo.') then
      tenant_id := c.tenant_id; caso_id := c.id; acao := 'prazo_maximo_vencido';
      return next;
    end if;
  end loop;

  -- 3. Purga da mora encerrada: o bem pode ir ao credor.
  for c in
    select * from caso k
     where k.finalidade = 'recuperacao_para_credor' and k.status in ('Retomado','Em Custódia')
       and k.purga_ate < now()
  loop
    if registrar_prazo_vencido(c, 'purga', c.purga_ate,
         'Prazo de purga da mora encerrado: o bem pode ser entregue ao credor.') then
      tenant_id := c.tenant_id; caso_id := c.id; acao := 'purga_encerrada';
      return next;
    end if;
  end loop;

  -- 4. Notificação extrajudicial: 20 dias corridos sem consolidação averbada.
  for c in
    select k.* from caso k
      join procedimento_extrajudicial p on p.tenant_id = k.tenant_id and p.caso_id = k.id
     where k.status not in ('Curado','Removido pelo Banco','Encerrado','Entregue ao Credor','Não Localizado')
       and p.notificado_em is not null and p.consolidado_em is null
       and hoje_operacao() > p.notificado_em + 20
  loop
    if registrar_prazo_vencido(c,
         'notificacao_extrajudicial',
         ((select p.notificado_em + 21 from procedimento_extrajudicial p
            where p.tenant_id = c.tenant_id and p.caso_id = c.id)::timestamp at time zone 'America/Sao_Paulo'),
         'Passaram os 20 dias da notificação extrajudicial: confira se houve pagamento e peça a averbação da consolidação.') then
      tenant_id := c.tenant_id; caso_id := c.id; acao := 'notificacao_extrajudicial_vencida';
      return next;
    end if;
  end loop;
end $$;

revoke execute on function varrer_prazos() from public;
revoke execute on function registrar_prazo_vencido(caso, text, timestamptz, text) from public;
grant execute on function varrer_prazos() to recredita_app;
