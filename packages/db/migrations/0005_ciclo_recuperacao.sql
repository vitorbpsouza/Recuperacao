-- Fase 2a: o ciclo de vida do caso do Plano A passa a ser imposto pelo banco.
--
-- Até aqui, um caso de recuperação ia de qualquer status a qualquer outro do
-- seu vocabulário. A partir desta migração:
--
--   - as transições permitidas estão em transicao_recuperacao, espelho de
--     TRANSICOES_RECUPERACAO em @workspace/domain (um teste confere);
--   - cada passo que a lei condiciona tem guarda (pendencias_transicao):
--       habilitar para campo  → credor, rito e a prova que o rito exige;
--       retomar               → a mesma prova, mandado expedido e, para devedor
--                               pessoa jurídica, verificação de recuperação
--                               judicial e falência;
--       entregar ao credor    → prazo de purga da mora vencido;
--   - credor, mandato e os registros do rito ganham tabelas próprias;
--   - "Recuperado" sai do vocabulário: misturava retomado com entregue.
--
-- Fundamentos: DL 911/69 (arts. 2º, 3º e 8º-B a 8º-E, com a Lei 14.711/2023);
-- STJ, Tema 1.132 (mora); STF, ADIs 7600, 7601 e 7608 (limites da via
-- extrajudicial); Lei 11.101/2005, arts. 6º e 49 (recuperação judicial).

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------

-- Os prazos correm no fuso da operação, não no do servidor do banco.
create function hoje_operacao() returns date
  language sql stable
  as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- CNPJ normalizado, inclusive o alfanumérico (IN RFB 2.229/2024): cada
-- caractere vale o código ASCII menos 48, módulo 11.
create function cnpj_valido(v text) returns boolean
  language plpgsql immutable
  as $$
declare
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  soma int := 0;
  d1 int;
  d2 int;
begin
  if v is null then return null; end if;
  if v !~ '^[0-9A-Z]{12}[0-9]{2}$' or v ~ '^(.)\1*$' then return false; end if;
  for i in 1..12 loop
    soma := soma + (ascii(substr(v, i, 1)) - 48) * pesos1[i];
  end loop;
  d1 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  soma := d1 * pesos2[13];
  for i in 1..12 loop
    soma := soma + (ascii(substr(v, i, 1)) - 48) * pesos2[i];
  end loop;
  d2 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  return substr(v, 13, 2) = d1::text || d2::text;
end $$;

-- Número único de processo (Res. CNJ 65/2008), com a máscara: o número com o
-- DD movido para o fim, módulo 97, dá 1.
create function cnj_valido(v text) returns boolean
  language sql immutable
  as $$
  select v ~ '^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$'
     and (substr(d, 1, 7) || substr(d, 10, 11) || substr(d, 8, 2))::numeric % 97 = 1
    from (select regexp_replace(v, '\D', '', 'g') as d) n
$$;

-- ---------------------------------------------------------------------------
-- Credor e mandato
-- ---------------------------------------------------------------------------

-- O dono do bem e do contrato. Vale para os dois planos: no A é quem contrata
-- a recuperação; no B, o banco com quem se negocia a quitação.
create table credor (
  id        text primary key default gen_random_uuid()::text,
  tenant_id text not null default app_tenant() references tenant(id),
  nome      text not null check (length(trim(nome)) > 0),
  cnpj      text check (cnpj_valido(cnpj)),
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, cnpj)
);

-- Instrumento pelo qual o credor autoriza a ReCredita a localizar e retomar o
-- bem em nome dele (DL 911/69, art. 8º-C, §§ 4º e 5º). Revogar é registrar a
-- data: o histórico de quem podia agir, e quando, não se apaga.
create table mandato (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null default app_tenant() references tenant(id),
  credor_id   text not null,
  inicio      date not null,
  fim         date not null,
  referencia  text not null check (length(trim(referencia)) >= 3),
  revogado_em timestamptz,
  criado_em   timestamptz not null default now(),
  foreign key (tenant_id, credor_id) references credor(tenant_id, id),
  unique (tenant_id, id),
  check (fim >= inicio)
);
create index idx_mandato_credor on mandato(tenant_id, credor_id);

create function mandato_vigente(p_tenant text, p_credor text) returns boolean
  language sql stable
  as $$
  select exists (
    select 1 from mandato m
     where m.tenant_id = p_tenant and m.credor_id = p_credor
       and m.revogado_em is null
       and hoje_operacao() between m.inicio and m.fim)
$$;

-- ---------------------------------------------------------------------------
-- Caso: credor, rito e retomada
-- ---------------------------------------------------------------------------

alter table caso
  add column credor_id text,
  add column rito text check (rito in ('judicial','extrajudicial','amigavel')),
  -- Quando e como o bem chegou às mãos do credor, e a prova disso (auto de
  -- busca e apreensão, certidão do cartório ou termo de entrega voluntária).
  add column retomado_em timestamptz,
  add column modalidade_retomada text
    check (modalidade_retomada in ('apreensao_judicial','apreensao_extrajudicial','entrega_voluntaria')),
  add column comprovante_retomada text,
  -- Até quando o devedor pode purgar a mora. Calculado pela API com o
  -- calendário de @workspace/domain (dias corridos no judicial, úteis no
  -- extrajudicial); o banco garante o piso de 5 dias corridos.
  add column purga_ate timestamptz,
  add foreign key (tenant_id, credor_id) references credor(tenant_id, id),
  -- Para as tabelas do rito apontarem só para casos do Plano A.
  add constraint caso_tenant_id_id_finalidade_key unique (tenant_id, id, finalidade),
  add constraint rito_so_na_recuperacao check (
    finalidade = 'recuperacao_para_credor' or (rito is null and retomado_em is null)
  ),
  add constraint retomada_completa check (
    (retomado_em is null and modalidade_retomada is null and comprovante_retomada is null and purga_ate is null)
    or (retomado_em is not null and modalidade_retomada is not null
        and length(trim(coalesce(comprovante_retomada, ''))) >= 3
        and (modalidade_retomada = 'entrega_voluntaria') = (purga_ate is null)
        and (purga_ate is null or purga_ate >= retomado_em + interval '5 days'))
  );

-- Vocabulário novo. "Recuperado" vira "Entregue ao Credor": era o desfecho
-- que o status antigo queria dizer. O trigger de eventos registra a troca.
alter table caso drop constraint status_do_canal;
update caso set status = 'Entregue ao Credor'
 where finalidade = 'recuperacao_para_credor' and status = 'Recuperado';
alter table caso add constraint status_do_canal check (
  (finalidade = 'recuperacao_para_credor' and status in (
    'Recebido','Em Enriquecimento','Enriquecido','Em Análise','Pronto para Campo',
    'Distribuído','Aceito','Em Campo','Localizado','Retomado','Em Custódia',
    'Entregue ao Credor','Curado','Não Localizado','Suspenso','Removido pelo Banco','Encerrado'))
  or
  (finalidade = 'aquisicao_com_quitacao' and status in (
    'Lead Recebido','Em Contato','Proposta Enviada','Negociando com Credor',
    'Quitação Aprovada','Quitado','Transferido','Encerrado','Desistiu'))
);

-- ---------------------------------------------------------------------------
-- Registros do rito (só casos do Plano A)
-- ---------------------------------------------------------------------------
-- A coluna `finalidade` fixa e a chave estrangeira composta impedem, pela
-- estrutura, que um caso de aquisição ganhe processo, mora ou mandado.

create table processo_judicial (
  tenant_id     text not null default app_tenant() references tenant(id),
  caso_id       text not null,
  finalidade    text not null default 'recuperacao_para_credor' check (finalidade = 'recuperacao_para_credor'),
  numero_cnj    text not null check (cnj_valido(numero_cnj)),
  vara          text,
  comarca       text not null check (length(trim(comarca)) > 0),
  uf            text not null check (uf ~ '^[A-Z]{2}$'),
  ajuizado_em   date,
  liminar       text not null default 'pendente' check (liminar in ('pendente','deferida','indeferida','revogada')),
  liminar_em    date,
  -- Mandado de busca e apreensão: só existe com liminar deferida (e continua
  -- registrado se a liminar for revogada depois).
  mandado_em    date,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, caso_id),
  foreign key (tenant_id, caso_id, finalidade) references caso(tenant_id, id, finalidade),
  check (liminar = 'pendente' or liminar_em is not null),
  check (mandado_em is null or liminar in ('deferida','revogada')),
  check (mandado_em is null or mandado_em >= liminar_em)
);

create table procedimento_extrajudicial (
  tenant_id         text not null default app_tenant() references tenant(id),
  caso_id           text not null,
  finalidade        text not null default 'recuperacao_para_credor' check (finalidade = 'recuperacao_para_credor'),
  via               text not null check (via in ('rtd','detran')),
  orgao             text not null check (length(trim(orgao)) > 0),
  -- A via extrajudicial só cabe com previsão expressa em cláusula em destaque (art. 8º-B).
  clausula_destaque boolean not null,
  notificado_em     date,
  consolidado_em    date,
  -- Certidão de busca e apreensão e restrição no Renavam (art. 8º-C).
  certidao_em       date,
  atualizado_em     timestamptz not null default now(),
  primary key (tenant_id, caso_id),
  foreign key (tenant_id, caso_id, finalidade) references caso(tenant_id, id, finalidade),
  -- A consolidação só vem depois dos 20 dias da notificação.
  check (consolidado_em is null or (notificado_em is not null and consolidado_em > notificado_em + 20)),
  check (certidao_em is null or (consolidado_em is not null and certidao_em >= consolidado_em))
);

-- Prova da mora: basta o envio ao endereço do contrato, sem prova do
-- recebimento (STJ, Tema 1.132). O protesto também comprova.
create table prova_mora (
  tenant_id            text not null default app_tenant() references tenant(id),
  caso_id              text not null,
  finalidade           text not null default 'recuperacao_para_credor' check (finalidade = 'recuperacao_para_credor'),
  meio                 text not null check (meio in ('carta_ar','cartorio','protesto','eletronico')),
  enviada_em           date not null,
  endereco_do_contrato boolean not null,
  comprovante          text not null check (length(trim(comprovante)) >= 3),
  atualizado_em        timestamptz not null default now(),
  primary key (tenant_id, caso_id),
  foreign key (tenant_id, caso_id, finalidade) references caso(tenant_id, id, finalidade)
);

-- Devedor pessoa jurídica: recuperação judicial ou falência mudam o que se
-- pode fazer com o bem (Lei 11.101, arts. 6º e 49, § 3º). Append-only: cada
-- verificação fica, e vale a mais recente.
create table verificacao_rj (
  id                     bigint generated always as identity primary key,
  tenant_id              text not null default app_tenant() references tenant(id),
  caso_id                text not null,
  finalidade             text not null default 'recuperacao_para_credor' check (finalidade = 'recuperacao_para_credor'),
  resultado              text not null check (resultado in ('sem_registro','recuperacao_judicial','falencia')),
  fonte                  text not null check (length(trim(fonte)) >= 3),
  detalhe                text,
  liberado_pelo_juridico boolean not null default false,
  justificativa          text,
  usuario_id             text,
  verificado_em          timestamptz not null default now(),
  foreign key (tenant_id, caso_id, finalidade) references caso(tenant_id, id, finalidade),
  foreign key (tenant_id, usuario_id) references usuario(tenant_id, id),
  -- Liberação só existe na recuperação judicial, e sempre com o porquê.
  check (not liberado_pelo_juridico or resultado = 'recuperacao_judicial'),
  check (not liberado_pelo_juridico or length(trim(coalesce(justificativa, ''))) >= 10)
);
create index idx_verificacao_rj_caso on verificacao_rj(tenant_id, caso_id, verificado_em desc);

-- Quem verificou e quando vêm da sessão, nunca do corpo da requisição.
create function verificacao_rj_da_sessao() returns trigger
  language plpgsql
  as $$
begin
  if app_usuario() is not null then
    new.usuario_id := app_usuario();
  end if;
  new.verificado_em := now();
  return new;
end $$;

create trigger trg_verificacao_rj_da_sessao before insert on verificacao_rj
  for each row execute function verificacao_rj_da_sessao();
create trigger trg_verificacao_rj_sem_update before update on verificacao_rj
  for each row execute function recusa_alteracao();
create trigger trg_verificacao_rj_sem_delete before delete on verificacao_rj
  for each row execute function recusa_alteracao();

-- Registros do rito não se apagam: corrigem-se, e a linha do tempo guarda o antes.
create trigger trg_processo_sem_delete before delete on processo_judicial
  for each row execute function recusa_alteracao();
create trigger trg_extrajudicial_sem_delete before delete on procedimento_extrajudicial
  for each row execute function recusa_alteracao();
create trigger trg_mora_sem_delete before delete on prova_mora
  for each row execute function recusa_alteracao();
create trigger trg_mandato_sem_delete before delete on mandato
  for each row execute function recusa_alteracao();

-- ---------------------------------------------------------------------------
-- Guardas
-- ---------------------------------------------------------------------------

-- O que falta para o caso `c` chegar a `p_para`. Vazio: pode. É a mesma função
-- que o trigger usa para recusar e a API usa para explicar na tela.
create function pendencias_transicao(c caso, p_para text) returns text[]
  language plpgsql stable
  set search_path = public, pg_temp
  as $$
declare
  p text[] := '{}';
  doc text;
  proc processo_judicial;
  extra procedimento_extrajudicial;
  mora prova_mora;
  rj verificacao_rj;
begin
  if c.finalidade <> 'recuperacao_para_credor' then
    return p;
  end if;

  if p_para in ('Pronto para Campo', 'Retomado') then
    if c.credor_id is null then
      p := p || 'credor do contrato não informado'::text;
    end if;
    if c.rito is null then
      p := p || 'rito não definido (judicial, extrajudicial ou amigável)'::text;
    end if;

    if c.rito in ('judicial', 'extrajudicial') then
      select * into mora from prova_mora where tenant_id = c.tenant_id and caso_id = c.id;
      if not found then
        p := p || 'mora não comprovada: registre a notificação enviada ao endereço do contrato (STJ, Tema 1.132)'::text;
      elsif not mora.endereco_do_contrato and mora.meio <> 'protesto' then
        p := p || 'a notificação da mora precisa ter ido ao endereço do contrato (STJ, Tema 1.132)'::text;
      end if;
    end if;

    if c.rito in ('extrajudicial', 'amigavel') and c.credor_id is not null
       and not mandato_vigente(c.tenant_id, c.credor_id) then
      p := p || 'sem mandato vigente do credor para a ReCredita agir em nome dele'::text;
    end if;

    if c.rito = 'judicial' then
      select * into proc from processo_judicial where tenant_id = c.tenant_id and caso_id = c.id;
      if not found then
        p := p || 'processo judicial não registrado'::text;
      elsif proc.liminar = 'pendente' then
        p := p || 'liminar de busca e apreensão ainda não deferida'::text;
      elsif proc.liminar <> 'deferida' then
        p := p || format('liminar %s', proc.liminar);
      end if;
    elsif c.rito = 'extrajudicial' then
      select * into extra from procedimento_extrajudicial where tenant_id = c.tenant_id and caso_id = c.id;
      if not found then
        p := p || 'procedimento extrajudicial não registrado'::text;
      else
        if not extra.clausula_destaque then
          p := p || 'cláusula em destaque não conferida no contrato (DL 911/69, art. 8º-B)'::text;
        end if;
        if extra.certidao_em is null then
          p := p || format('certidão de busca e apreensão ainda não expedida pelo %s',
                           case extra.via when 'rtd' then 'cartório' else 'Detran' end);
        end if;
      end if;
    end if;
  end if;

  if p_para = 'Retomado' then
    if c.rito = 'judicial' and proc.liminar = 'deferida' and proc.mandado_em is null then
      p := p || 'mandado de busca e apreensão ainda não expedido'::text;
    end if;

    select upper(regexp_replace(coalesce(a.devedor_doc, ''), '[^0-9A-Za-z]', '', 'g')) into doc
      from ativo a where a.tenant_id = c.tenant_id and a.id = c.ativo_id;
    if coalesce(doc, '') = '' then
      p := p || 'documento do devedor não informado: sem ele não se sabe se é empresa em recuperação judicial'::text;
    elsif length(doc) = 14 then
      select * into rj from verificacao_rj
       where tenant_id = c.tenant_id and caso_id = c.id
       order by verificado_em desc, id desc limit 1;
      if not found then
        p := p || 'devedor pessoa jurídica: verifique recuperação judicial e falência antes de retomar (Lei 11.101)'::text;
      elsif rj.verificado_em < now() - interval '30 days' then
        p := p || 'a verificação de recuperação judicial tem mais de 30 dias: refaça antes de retomar'::text;
      elsif rj.resultado = 'falencia' then
        p := p || 'devedor em falência: o caminho é o pedido de restituição, não a retomada'::text;
      elsif rj.resultado = 'recuperacao_judicial' and not rj.liberado_pelo_juridico then
        p := p || 'devedor em recuperação judicial: bem essencial não sai no stay period — o jurídico precisa liberar'::text;
      end if;
    end if;
  end if;

  if p_para = 'Entregue ao Credor' and c.purga_ate is not null and now() <= c.purga_ate then
    p := p || format('o devedor ainda pode purgar a mora até %s',
                     to_char(c.purga_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI'));
  end if;

  return p;
end $$;

-- Transições permitidas (espelho de TRANSICOES_RECUPERACAO).
create table transicao_recuperacao (
  de   text not null,
  para text not null,
  primary key (de, para)
);

insert into transicao_recuperacao (de, para)
select de, unnest(paras) from (values
  ('Recebido',           array['Em Enriquecimento','Em Análise','Suspenso','Curado','Removido pelo Banco','Encerrado']),
  ('Em Enriquecimento',  array['Enriquecido','Em Análise','Suspenso','Curado','Removido pelo Banco','Encerrado']),
  ('Enriquecido',        array['Em Análise','Suspenso','Curado','Removido pelo Banco','Encerrado']),
  ('Em Análise',         array['Pronto para Campo','Em Enriquecimento','Suspenso','Curado','Removido pelo Banco','Encerrado']),
  ('Pronto para Campo',  array['Distribuído','Em Análise','Suspenso','Curado','Removido pelo Banco','Encerrado']),
  ('Distribuído',        array['Aceito','Pronto para Campo','Em Análise','Suspenso','Curado','Removido pelo Banco','Encerrado']),
  ('Aceito',             array['Em Campo','Distribuído','Em Análise','Suspenso','Curado','Removido pelo Banco','Encerrado']),
  ('Em Campo',           array['Localizado','Retomado','Distribuído','Não Localizado','Em Análise','Suspenso','Curado','Removido pelo Banco','Encerrado']),
  ('Localizado',         array['Retomado','Em Campo','Distribuído','Em Análise','Suspenso','Curado','Removido pelo Banco','Encerrado']),
  ('Retomado',           array['Em Custódia','Entregue ao Credor','Curado','Removido pelo Banco','Encerrado']),
  ('Em Custódia',        array['Entregue ao Credor','Curado','Removido pelo Banco','Encerrado']),
  ('Suspenso',           array['Em Análise','Curado','Removido pelo Banco','Encerrado'])
) as t(de, paras);

-- Caso do Plano A criado pela aplicação entra no começo do ciclo. Carga de
-- dados como dono (seed, migração) fica de fora: ela traz casos já andados.
create function caso_valida_entrada() returns trigger
  language plpgsql
  as $$
begin
  if new.finalidade = 'recuperacao_para_credor' and current_user = 'recredita_app' then
    if new.status <> 'Recebido' then
      raise exception 'caso do Plano A entra como "Recebido"; o resto do ciclo se faz pelas transições';
    end if;
    if new.retomado_em is not null or new.rito is not null then
      raise exception 'rito e retomada se registram depois, pelas rotas próprias';
    end if;
  end if;
  return new;
end $$;

create trigger trg_caso_valida_entrada before insert on caso
  for each row execute function caso_valida_entrada();

-- A mudança de status no Plano A passa por aqui. Dados que a linha do tempo
-- precisa (motivo, pátio, declaração de conduta) chegam em app.evento, que a
-- API define na mesma transação.
create function caso_valida_ciclo() returns trigger
  language plpgsql
  set search_path = public, pg_temp
  as $$
declare
  pend text[];
  evento jsonb := coalesce(nullif(current_setting('app.evento', true), '')::jsonb, '{}'::jsonb);
begin
  if new.finalidade <> 'recuperacao_para_credor' then
    return new;
  end if;

  -- Rito e credor só mudam no preparo (a conversão por resistência volta à análise).
  if (new.rito is distinct from old.rito or new.credor_id is distinct from old.credor_id)
     and new.status not in ('Recebido','Em Enriquecimento','Enriquecido','Em Análise') then
    raise exception 'rito e credor só mudam com o caso em preparo (está em "%")', new.status;
  end if;

  -- A retomada se registra uma vez, junto com a mudança para "Retomado".
  if (new.retomado_em, new.modalidade_retomada, new.comprovante_retomada, new.purga_ate)
       is distinct from (old.retomado_em, old.modalidade_retomada, old.comprovante_retomada, old.purga_ate)
     and not (new.status = 'Retomado' and old.status is distinct from 'Retomado' and old.retomado_em is null) then
    raise exception 'os dados da retomada só se registram ao retomar o bem';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if not exists (select 1 from transicao_recuperacao where de = old.status and para = new.status) then
    raise exception 'transição de "%" para "%" não é permitida', old.status, new.status;
  end if;

  if new.status in ('Suspenso','Curado','Removido pelo Banco','Não Localizado','Encerrado')
     and length(trim(coalesce(evento ->> 'motivo', ''))) < 10 then
    raise exception 'informe o motivo para levar o caso a "%"', new.status;
  end if;

  if new.status = 'Em Custódia' and length(trim(coalesce(evento ->> 'local', ''))) < 3 then
    raise exception 'informe o pátio onde o bem fica sob custódia';
  end if;

  if new.status = 'Retomado' then
    if new.retomado_em is null then
      raise exception 'informe quando e como o bem foi retomado';
    end if;
    if new.retomado_em > now() + interval '5 minutes' then
      raise exception 'a retomada não pode estar no futuro';
    end if;
    if new.retomado_em < old.criado_em then
      raise exception 'a retomada não pode ser anterior ao recebimento do caso';
    end if;
    if not new.modalidade_retomada = any (case new.rito
         when 'judicial' then array['apreensao_judicial','entrega_voluntaria']
         when 'extrajudicial' then array['apreensao_extrajudicial','entrega_voluntaria']
         else array['entrega_voluntaria'] end) then
      raise exception 'a modalidade "%" não cabe no rito %', new.modalidade_retomada, coalesce(new.rito, 'indefinido');
    end if;
    if new.modalidade_retomada = 'apreensao_extrajudicial'
       and coalesce((evento ->> 'conduta_conforme')::boolean, false) is not true then
      raise exception 'na apreensão extrajudicial, declare que não houve violência, ingresso em domicílio nem exposição do devedor (STF, ADIs 7600, 7601 e 7608)';
    end if;
  end if;

  pend := pendencias_transicao(new, new.status);
  if cardinality(pend) > 0 then
    raise exception '%', array_to_string(pend, '; ');
  end if;

  return new;
end $$;

create trigger trg_caso_valida_ciclo before update on caso
  for each row execute function caso_valida_ciclo();

-- ---------------------------------------------------------------------------
-- Linha do tempo
-- ---------------------------------------------------------------------------

alter table caso_evento drop constraint caso_evento_tipo_check;
alter table caso_evento add constraint caso_evento_tipo_check
  check (tipo in ('criado','status_alterado','distribuido','rito_definido','registro_juridico'));

create or replace function caso_registra_evento() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  evento jsonb := coalesce(nullif(current_setting('app.evento', true), '')::jsonb, '{}'::jsonb);
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

  if new.rito is distinct from old.rito or new.credor_id is distinct from old.credor_id then
    insert into caso_evento (tenant_id, caso_id, tipo, usuario_id, dados)
      values (
        new.tenant_id, new.id, 'rito_definido', app_usuario(),
        jsonb_strip_nulls(jsonb_build_object(
          'rito', new.rito,
          'rito_anterior', old.rito,
          'credor', (select nome from credor where id = new.credor_id),
          'motivo', evento ->> 'motivo'
        ))
      );
  end if;

  if new.status is distinct from old.status then
    insert into caso_evento (tenant_id, caso_id, tipo, status_de, status_para, usuario_id, dados)
      values (
        new.tenant_id, new.id, 'status_alterado', old.status, new.status, app_usuario(),
        evento || jsonb_strip_nulls(jsonb_build_object(
          'modalidade', case when new.status = 'Retomado' then new.modalidade_retomada end,
          'comprovante', case when new.status = 'Retomado' then new.comprovante_retomada end,
          'purga_ate', case when new.status = 'Retomado' then new.purga_ate end
        ))
      );
  end if;
  return null;
end $$;

-- Cada registro do rito deixa rastro: o que foi informado, por quem e quando.
create function registro_juridico_evento() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
declare
  dados jsonb := to_jsonb(new) - 'tenant_id' - 'caso_id' - 'finalidade' - 'atualizado_em' - 'usuario_id' - 'id';
begin
  insert into caso_evento (tenant_id, caso_id, tipo, usuario_id, dados)
    values (new.tenant_id, new.caso_id, 'registro_juridico', app_usuario(),
            jsonb_build_object('registro', tg_argv[0], 'operacao', lower(tg_op)) || jsonb_strip_nulls(dados));
  return null;
end $$;

create trigger trg_processo_evento after insert or update on processo_judicial
  for each row execute function registro_juridico_evento('processo_judicial');
create trigger trg_extrajudicial_evento after insert or update on procedimento_extrajudicial
  for each row execute function registro_juridico_evento('procedimento_extrajudicial');
create trigger trg_mora_evento after insert or update on prova_mora
  for each row execute function registro_juridico_evento('prova_mora');
create trigger trg_verificacao_rj_evento after insert on verificacao_rj
  for each row execute function registro_juridico_evento('verificacao_rj');

-- Correção atualiza o carimbo de tempo.
create function carimba_atualizacao() returns trigger
  language plpgsql
  as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger trg_processo_carimbo before update on processo_judicial
  for each row execute function carimba_atualizacao();
create trigger trg_extrajudicial_carimbo before update on procedimento_extrajudicial
  for each row execute function carimba_atualizacao();
create trigger trg_mora_carimbo before update on prova_mora
  for each row execute function carimba_atualizacao();

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------

alter table credor                     enable row level security;
alter table mandato                    enable row level security;
alter table processo_judicial          enable row level security;
alter table procedimento_extrajudicial enable row level security;
alter table prova_mora                 enable row level security;
alter table verificacao_rj             enable row level security;

create policy isolamento_tenant on credor                     using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on mandato                    using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on processo_judicial          using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on procedimento_extrajudicial using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on prova_mora                 using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy isolamento_tenant on verificacao_rj             using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());

-- Mandato e registros do rito são do Plano A. Credor vale para os dois.
create policy canal on mandato                    as restrictive using ('plataforma_credor' = any (app_canais()));
create policy canal on processo_judicial          as restrictive using ('plataforma_credor' = any (app_canais()));
create policy canal on procedimento_extrajudicial as restrictive using ('plataforma_credor' = any (app_canais()));
create policy canal on prova_mora                 as restrictive using ('plataforma_credor' = any (app_canais()));
create policy canal on verificacao_rj             as restrictive using ('plataforma_credor' = any (app_canais()));

grant select, insert, update on credor, mandato, processo_judicial, procedimento_extrajudicial, prova_mora
  to recredita_app;
grant select, insert on verificacao_rj to recredita_app;
grant select on transicao_recuperacao to recredita_app;
