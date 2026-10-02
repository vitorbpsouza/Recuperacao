-- Schema da operação de recuperação e aquisição.
--
-- A regra central: a ORIGEM de um caso determina sua FINALIDADE, e nenhuma linha
-- pode violar isso. Tipos em TypeScript protegem o código que escrevemos; estas
-- constraints protegem o dado que chega por importação, seed ou correção manual.
--
-- Nada aqui depende de alguém lembrar da regra.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Fontes de suprimento
-- ---------------------------------------------------------------------------

-- De onde o ativo vem. Hoje a relação é com uma plataforma, não com o credor:
-- modelar isso explicitamente mantém o limite de finalidade visível no dado.
CREATE TABLE IF NOT EXISTS fonte_ativo (
  id                   TEXT PRIMARY KEY,
  nome                 TEXT NOT NULL,
  tipo                 TEXT NOT NULL CHECK (tipo IN ('Plataforma','Credor Direto','Lead Próprio')),
  -- 'Manual' e 'Exportação' respeitam qualquer ToS. 'API' só quando oferecida:
  -- automatizar extração que o termo proíbe custa o acesso à fonte.
  ingestao             TEXT NOT NULL CHECK (ingestao IN ('Manual','Exportação','API')),
  finalidade_permitida TEXT NOT NULL CHECK (finalidade_permitida IN ('recuperacao_para_credor','aquisicao_com_quitacao')),
  termo_de_uso_url     TEXT,
  credor_nome          TEXT,
  ativa                INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0,1))
);

-- ---------------------------------------------------------------------------
-- Identidade e sessão
-- ---------------------------------------------------------------------------

-- Operadores do sistema. A trilha de auditoria só tem valor se o operador for
-- autenticado: `operador_id` vindo do cliente seria autodeclaração.
CREATE TABLE IF NOT EXISTS usuario (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  nome       TEXT NOT NULL,
  -- scrypt no formato `salt:hash`, ambos hex. Senha em claro nunca é gravada.
  senha_hash TEXT NOT NULL,
  papel      TEXT NOT NULL CHECK (papel IN ('admin','operador','auditor')),
  -- Segregação de função: um operador restrito a um canal não lê o outro.
  -- Reforça no nível das pessoas a mesma fronteira que o schema impõe no dado.
  canais     TEXT NOT NULL DEFAULT '[]', -- JSON array de origem
  ativo      INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessao (
  id          TEXT PRIMARY KEY,
  usuario_id  TEXT NOT NULL REFERENCES usuario(id),
  -- Guarda o SHA-256 do token, não o token: um vazamento do banco não concede acesso.
  token_hash  TEXT NOT NULL UNIQUE,
  criada_em   TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em   TEXT NOT NULL,
  revogada_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessao_usuario ON sessao(usuario_id);

-- ---------------------------------------------------------------------------
-- Ativo e rede de campo
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ativo (
  id               TEXT PRIMARY KEY,
  placa            TEXT NOT NULL,
  chassi           TEXT,
  modelo           TEXT,
  ano              INTEGER,
  cor              TEXT,
  -- Dado pessoal do devedor: minimizado por princípio (LGPD art. 6, III).
  -- Só o necessário para identificar o caso; nada de histórico comportamental.
  devedor_nome     TEXT,
  devedor_doc      TEXT,
  credor_nome      TEXT,
  valor_divida     REAL,
  cidade           TEXT,
  uf               TEXT,
  data_recebimento TEXT NOT NULL,
  criado_em        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ativo_placa ON ativo(placa);

CREATE TABLE IF NOT EXISTS recuperador (
  id               TEXT PRIMARY KEY,
  nome             TEXT NOT NULL,
  documento        TEXT,
  telefone         TEXT,
  cidades          TEXT NOT NULL DEFAULT '[]', -- JSON array
  status           TEXT NOT NULL CHECK (status IN ('Ativo','Inativo','Suspenso')),
  score            REAL NOT NULL DEFAULT 0,
  taxa_recuperacao REAL NOT NULL DEFAULT 0,
  data_cadastro    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Caso — a fronteira entre os dois canais
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS caso (
  id         TEXT PRIMARY KEY,
  ativo_id   TEXT NOT NULL REFERENCES ativo(id),
  fonte_id   TEXT NOT NULL REFERENCES fonte_ativo(id),
  origem     TEXT NOT NULL CHECK (origem IN ('plataforma_credor','lead_proprio')),
  finalidade TEXT NOT NULL CHECK (finalidade IN ('recuperacao_para_credor','aquisicao_com_quitacao')),
  status     TEXT NOT NULL,

  -- Plano A: recuperação para o credor
  recuperador_id           TEXT REFERENCES recuperador(id),
  prazo_vinculo            TEXT,
  prazo_maximo             TEXT,

  -- Plano B: aquisição via quitação
  canal_lead               TEXT CHECK (canal_lead IN ('Inbound Site','WhatsApp','Indicação','Parceria','Anúncio')),
  evidencia_lead           TEXT,
  saldo_devedor            REAL,
  valor_quitacao_negociado REAL,
  valor_pago_ao_devedor    REAL,
  anuencia_credor          TEXT CHECK (anuencia_credor IN ('Pendente','Obtida','Negada')),
  renajud_ativo            INTEGER CHECK (renajud_ativo IN (0,1)),
  gravame_baixado          INTEGER CHECK (gravame_baixado IN (0,1)),

  criado_em TEXT NOT NULL DEFAULT (datetime('now')),

  -- A FRONTEIRA: origem determina finalidade. Um caso vindo da plataforma do
  -- credor não pode, em nenhuma circunstância, carregar finalidade de aquisição.
  CONSTRAINT fronteira_origem_finalidade CHECK (
    (origem = 'plataforma_credor' AND finalidade = 'recuperacao_para_credor') OR
    (origem = 'lead_proprio'      AND finalidade = 'aquisicao_com_quitacao')
  ),

  -- Campos de cada canal são obrigatórios no seu canal e proibidos no outro.
  -- Isso impede um caso "híbrido" que acumule dado dos dois lados.
  CONSTRAINT campos_por_finalidade CHECK (
    (finalidade = 'recuperacao_para_credor'
      AND canal_lead IS NULL AND evidencia_lead IS NULL
      AND anuencia_credor IS NULL AND renajud_ativo IS NULL
      AND gravame_baixado IS NULL AND valor_pago_ao_devedor IS NULL)
    OR
    (finalidade = 'aquisicao_com_quitacao'
      -- IS NOT NULL explícito: `length(trim(NULL))` é NULL e CHECK só reprova FALSE.
      AND canal_lead IS NOT NULL
      AND evidencia_lead IS NOT NULL AND length(trim(evidencia_lead)) > 0
      AND anuencia_credor IS NOT NULL AND renajud_ativo IS NOT NULL
      AND gravame_baixado IS NOT NULL
      -- aquisição não é trabalho de campo: não vincula recuperador
      AND recuperador_id IS NULL AND prazo_vinculo IS NULL)
  )
);

-- Uma placa só pode ter um caso aberto por canal.
CREATE UNIQUE INDEX IF NOT EXISTS idx_caso_ativo_origem ON caso(ativo_id, origem);
CREATE INDEX IF NOT EXISTS idx_caso_origem ON caso(origem);

-- ---------------------------------------------------------------------------
-- Colisão de origem
-- ---------------------------------------------------------------------------

-- Mesma placa presente nos dois canais. Sem registro explícito, a situação é
-- indistinguível de desvio de finalidade. Com registro e evidência, é defensável.
CREATE TABLE IF NOT EXISTS colisao_origem (
  id                     TEXT PRIMARY KEY,
  placa                  TEXT NOT NULL,
  caso_plataforma_id     TEXT NOT NULL REFERENCES caso(id),
  lead_proprio_ref       TEXT,
  detectado_em           TEXT NOT NULL DEFAULT (datetime('now')),
  resolucao              TEXT NOT NULL CHECK (resolucao IN ('lead_descartado','prosseguiu_com_origem_independente')),
  justificativa          TEXT NOT NULL CHECK (length(trim(justificativa)) > 0),
  -- Como se prova que o lead não nasceu do dado da plataforma.
  evidencia_independente TEXT,
  operador_id            TEXT NOT NULL REFERENCES usuario(id),

  -- `length(trim(NULL))` é NULL, e CHECK no SQLite só reprova em FALSE: sem o
  -- teste explícito de NULL, uma evidência ausente passaria pela constraint.
  CONSTRAINT evidencia_obrigatoria_para_prosseguir CHECK (
    resolucao = 'lead_descartado'
    OR (evidencia_independente IS NOT NULL AND length(trim(evidencia_independente)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS idx_colisao_placa ON colisao_origem(placa);

-- Abrir aquisição para uma placa que já existe como caso de plataforma exige
-- colisão resolvida com evidência independente. O banco recusa o contrário.
CREATE TRIGGER IF NOT EXISTS trg_colisao_exige_evidencia
BEFORE INSERT ON caso
WHEN NEW.origem = 'lead_proprio'
 AND EXISTS (
   SELECT 1 FROM caso c
     JOIN ativo a ON a.id = c.ativo_id
   WHERE c.origem = 'plataforma_credor'
     AND a.placa = (SELECT placa FROM ativo WHERE id = NEW.ativo_id)
 )
 AND NOT EXISTS (
   SELECT 1 FROM colisao_origem co
   WHERE co.placa = (SELECT placa FROM ativo WHERE id = NEW.ativo_id)
     AND co.resolucao = 'prosseguiu_com_origem_independente'
     AND length(trim(co.evidencia_independente)) > 0
 )
BEGIN
  SELECT RAISE(ABORT, 'colisao_origem: placa ja possui caso de plataforma; registre a colisao com evidencia independente antes de abrir aquisicao');
END;

-- ---------------------------------------------------------------------------
-- Bureaus e trilha de auditoria
-- ---------------------------------------------------------------------------

-- Chave de API NUNCA fica aqui: vive em variável de ambiente / secret manager.
-- O banco guarda a referência do contrato, que é o que a auditoria precisa.
CREATE TABLE IF NOT EXISTS bureau (
  id                     TEXT PRIMARY KEY,
  nome                   TEXT NOT NULL,
  tipo                   TEXT NOT NULL CHECK (tipo IN ('Crédito','Veicular','Localização','Judicial')),
  contrato_fornecedor_id TEXT NOT NULL CHECK (length(trim(contrato_fornecedor_id)) > 0),
  env_var_chave          TEXT NOT NULL,
  custo_consulta         REAL NOT NULL DEFAULT 0,
  ativo                  INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

-- Procedência de cada consulta. O ônus de demonstrar base legal é de quem trata
-- (LGPD art. 6, IX e art. 37): dado sem procedência é dado sem amparo.
-- Append-only — ver triggers abaixo.
CREATE TABLE IF NOT EXISTS consulta_auditoria (
  id                     TEXT PRIMARY KEY,
  caso_id                TEXT NOT NULL REFERENCES caso(id),
  origem_caso            TEXT NOT NULL CHECK (origem_caso IN ('plataforma_credor','lead_proprio')),
  finalidade             TEXT NOT NULL CHECK (finalidade IN ('recuperacao_para_credor','aquisicao_com_quitacao')),
  bureau_id              TEXT NOT NULL REFERENCES bureau(id),
  contrato_fornecedor_id TEXT NOT NULL CHECK (length(trim(contrato_fornecedor_id)) > 0),
  base_legal             TEXT NOT NULL CHECK (base_legal IN ('execucao_contrato','legitimo_interesse','obrigacao_legal','consentimento')),
  justificativa          TEXT NOT NULL CHECK (length(trim(justificativa)) > 0),
  operador_id            TEXT NOT NULL REFERENCES usuario(id),
  consultado_em          TEXT NOT NULL DEFAULT (datetime('now')),
  -- Os campos retornados, não os valores: a auditoria não replica o dado pessoal.
  campos_retornados      TEXT NOT NULL DEFAULT '[]',
  retencao_ate           TEXT NOT NULL,
  custo                  REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_auditoria_caso ON consulta_auditoria(caso_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_retencao ON consulta_auditoria(retencao_ate);

-- A consulta tem de concordar com o caso que ela serve. Sem isto, bastaria
-- declarar outra finalidade na própria linha de auditoria para furar a fronteira.
CREATE TRIGGER IF NOT EXISTS trg_auditoria_coerente_com_caso
BEFORE INSERT ON consulta_auditoria
WHEN (SELECT finalidade FROM caso WHERE id = NEW.caso_id) IS NOT NEW.finalidade
  OR (SELECT origem     FROM caso WHERE id = NEW.caso_id) IS NOT NEW.origem_caso
BEGIN
  SELECT RAISE(ABORT, 'consulta_auditoria: origem/finalidade divergem do caso');
END;

-- Trilha de auditoria é append-only: alterar ou apagar destrói o próprio valor.
CREATE TRIGGER IF NOT EXISTS trg_auditoria_sem_update
BEFORE UPDATE ON consulta_auditoria
BEGIN
  SELECT RAISE(ABORT, 'consulta_auditoria e append-only: UPDATE proibido');
END;

CREATE TRIGGER IF NOT EXISTS trg_auditoria_sem_delete
BEFORE DELETE ON consulta_auditoria
BEGIN
  SELECT RAISE(ABORT, 'consulta_auditoria e append-only: DELETE proibido');
END;

-- ---------------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS repasse (
  id             TEXT PRIMARY KEY,
  recuperador_id TEXT NOT NULL REFERENCES recuperador(id),
  caso_id        TEXT NOT NULL REFERENCES caso(id),
  valor          REAL NOT NULL CHECK (valor > 0),
  data           TEXT NOT NULL DEFAULT (datetime('now')),
  status         TEXT NOT NULL CHECK (status IN ('Pendente','Pago','Cancelado')),
  tipo           TEXT NOT NULL CHECK (tipo IN ('Comissão','Ajuda de Custo','Bônus')),
  observacao     TEXT
);
CREATE INDEX IF NOT EXISTS idx_repasse_status ON repasse(status);
