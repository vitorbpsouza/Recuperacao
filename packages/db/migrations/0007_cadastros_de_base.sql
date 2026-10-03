-- Cadastros de base para o primeiro uso em produção.
--
-- Até aqui, fontes só existiam no seed sintético, que não roda em produção:
-- o banco novo ficava sem nenhuma fonte e nenhum caso podia ser cadastrado.
-- As duas fontes abaixo são os dois canais da ReCredita — dado de base, como
-- o tenant —, com os mesmos ids que o seed e os testes usam.

insert into fonte_ativo (id, tenant_id, nome, tipo, ingestao, finalidade_permitida) values
  ('fonte-plataforma', 'recredita', 'Carteira do credor',                     'Credor Direto', 'Manual', 'recuperacao_para_credor'),
  ('fonte-inbound',    'recredita', 'Lead próprio (site, WhatsApp, indicação)', 'Lead Próprio',  'Manual', 'aquisicao_com_quitacao')
on conflict (id) do update set
  nome = excluded.nome, tipo = excluded.tipo, ingestao = excluded.ingestao, termo_de_uso_url = null;

-- Fornecedor de consulta cujo relatório é colado na tela não tem chave de
-- integração: o contrato continua obrigatório, a variável de ambiente não.
alter table bureau alter column env_var_chave drop not null;
