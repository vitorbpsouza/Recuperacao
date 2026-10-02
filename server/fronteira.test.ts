/**
 * Verificação da fronteira de finalidade.
 *
 * Prova que as garantias centrais são impostas pelo banco, não por convenção:
 * um caso de plataforma não pode virar aquisição, e a trilha de auditoria não
 * pode ser reescrita. Dados sintéticos; roda em SQLite :memory:.
 *
 * Execução: npx tsx server/fronteira.test.ts
 */
import { autenticar, criarUsuario, revogarSessao, usuarioDoToken } from './auth.js';
import { abrirBanco, registrarConsulta } from './db.js';

const db = abrirBanco(':memory:');

let passou = 0;
let falhou = 0;

// Os helpers aguardam o resultado: sem `await`, um teste async rejeitado
// escaparia como unhandled rejection e seria contado como aprovado.
const deveFalhar = async (nome: string, fn: () => unknown) => {
  try {
    await fn();
    console.log(`  FALHOU  ${nome} — deveria ter sido recusado, mas passou`);
    falhou++;
  } catch (e) {
    console.log(`  ok      ${nome} — recusado: ${(e as Error).message.slice(0, 70)}`);
    passou++;
  }
};

const devePassar = async (nome: string, fn: () => unknown) => {
  try {
    await fn();
    console.log(`  ok      ${nome}`);
    passou++;
  } catch (e) {
    console.log(`  FALHOU  ${nome} — ${(e as Error).message}`);
    falhou++;
  }
};

// --- seed sintético ---------------------------------------------------------
db.exec(`
  INSERT INTO fonte_ativo (id, nome, tipo, ingestao, finalidade_permitida)
    VALUES ('f_plat', 'Plataforma Teste', 'Plataforma', 'Manual', 'recuperacao_para_credor'),
           ('f_lead', 'Inbound Teste',    'Lead Próprio', 'Manual', 'aquisicao_com_quitacao');
  INSERT INTO ativo (id, placa, devedor_nome, devedor_doc, data_recebimento)
    VALUES ('at1', 'TEST001', 'Devedor Sintetico', '00000000000', '2026-01-01T00:00:00.000Z'),
           -- placa sem caso de plataforma: isola as constraints de campo do
           -- trigger de colisão, que senão recusaria antes e mascararia o teste.
           ('at2', 'TEST002', 'Outro Sintetico',   '00000000000', '2026-01-01T00:00:00.000Z');
  INSERT INTO recuperador (id, nome, status) VALUES ('rec1', 'Recuperador Teste', 'Ativo');
  -- operador_id tem FK para usuario: a trilha aponta para uma pessoa real.
  INSERT INTO usuario (id, email, nome, senha_hash, papel, canais)
    VALUES ('op1', 'op1@teste.local', 'Operador Teste', 'x:y', 'admin', '[]');
  INSERT INTO bureau (id, nome, tipo, contrato_fornecedor_id, env_var_chave, custo_consulta)
    VALUES ('b1', 'Bureau Teste', 'Crédito', 'CTR-001', 'BUREAU_TESTE_KEY', 2.5);
`);

console.log('\nfronteira origem -> finalidade');

await devePassar('caso de plataforma com finalidade de recuperação', () =>
  db
    .prepare(
      `INSERT INTO caso (id, ativo_id, fonte_id, origem, finalidade, status, recuperador_id, prazo_vinculo, prazo_maximo)
       VALUES ('c_plat', 'at1', 'f_plat', 'plataforma_credor', 'recuperacao_para_credor', 'Recebido', 'rec1', '2026-02-01', '2026-03-01')`,
    )
    .run(),
);

await deveFalhar('caso de plataforma com finalidade de AQUISIÇÃO', () =>
  db
    .prepare(
      `INSERT INTO caso (id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, evidencia_lead, anuencia_credor, renajud_ativo, gravame_baixado)
       VALUES ('c_x', 'at1', 'f_plat', 'plataforma_credor', 'aquisicao_com_quitacao', 'Novo', 'WhatsApp', 'ev', 'Pendente', 0, 0)`,
    )
    .run(),
);

await deveFalhar('caso híbrido: recuperação carregando campos de aquisição', () =>
  db
    .prepare(
      `INSERT INTO caso (id, ativo_id, fonte_id, origem, finalidade, status, anuencia_credor)
       VALUES ('c_y', 'at1', 'f_plat', 'plataforma_credor', 'recuperacao_para_credor', 'Recebido', 'Obtida')`,
    )
    .run(),
);

await deveFalhar('aquisição sem evidência de lead (NULL)', () =>
  db
    .prepare(
      `INSERT INTO caso (id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, anuencia_credor, renajud_ativo, gravame_baixado)
       VALUES ('c_z', 'at2', 'f_lead', 'lead_proprio', 'aquisicao_com_quitacao', 'Novo', 'WhatsApp', 'Pendente', 0, 0)`,
    )
    .run(),
);

console.log('\ncolisão de origem');

await deveFalhar('aquisição na mesma placa, sem colisão registrada', () =>
  db
    .prepare(
      `INSERT INTO caso (id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, evidencia_lead, anuencia_credor, renajud_ativo, gravame_baixado)
       VALUES ('c_aq', 'at1', 'f_lead', 'lead_proprio', 'aquisicao_com_quitacao', 'Novo', 'Inbound Site', 'form #123', 'Pendente', 1, 0)`,
    )
    .run(),
);

await deveFalhar('colisão "prosseguiu" sem evidência independente', () =>
  db
    .prepare(
      `INSERT INTO colisao_origem (id, placa, caso_plataforma_id, resolucao, justificativa, operador_id)
       VALUES ('col_x', 'TEST001', 'c_plat', 'prosseguiu_com_origem_independente', 'achei que podia', 'op1')`,
    )
    .run(),
);

await devePassar('colisão registrada com evidência independente', () =>
  db
    .prepare(
      `INSERT INTO colisao_origem (id, placa, caso_plataforma_id, resolucao, justificativa, evidencia_independente, operador_id)
       VALUES ('col1', 'TEST001', 'c_plat', 'prosseguiu_com_origem_independente', 'devedor procurou pelo site antes do ativo entrar na plataforma', 'form inbound #123 datado de 2026-01-05, anterior ao recebimento', 'op1')`,
    )
    .run(),
);

await devePassar('aquisição liberada após colisão documentada', () =>
  db
    .prepare(
      `INSERT INTO caso (id, ativo_id, fonte_id, origem, finalidade, status, canal_lead, evidencia_lead, anuencia_credor, renajud_ativo, gravame_baixado)
       VALUES ('c_aq', 'at1', 'f_lead', 'lead_proprio', 'aquisicao_com_quitacao', 'Novo', 'Inbound Site', 'form #123', 'Pendente', 1, 0)`,
    )
    .run(),
);

console.log('\ntrilha de auditoria');

await devePassar('consulta registrada com procedência derivada do caso', () => {
  const l = registrarConsulta(db, {
    casoId: 'c_plat',
    bureauId: 'b1',
    baseLegal: 'legitimo_interesse',
    justificativa: 'localização para recuperação do ativo',
    operadorId: 'op1',
    camposRetornados: ['telefone', 'endereco'],
  });
  if (l.finalidade !== 'recuperacao_para_credor') throw new Error('finalidade não derivada do caso');
  if (l.contratoFornecedorId !== 'CTR-001') throw new Error('contrato não derivado do bureau');
});

await deveFalhar('consulta declarando finalidade divergente do caso', () =>
  db
    .prepare(
      `INSERT INTO consulta_auditoria (id, caso_id, origem_caso, finalidade, bureau_id, contrato_fornecedor_id, base_legal, justificativa, operador_id, retencao_ate)
       VALUES ('ca_x', 'c_plat', 'plataforma_credor', 'aquisicao_com_quitacao', 'b1', 'CTR-001', 'legitimo_interesse', 'tentativa', 'op1', '2027-01-01')`,
    )
    .run(),
);

await deveFalhar('consulta sem justificativa', () =>
  db
    .prepare(
      `INSERT INTO consulta_auditoria (id, caso_id, origem_caso, finalidade, bureau_id, contrato_fornecedor_id, base_legal, justificativa, operador_id, retencao_ate)
       VALUES ('ca_y', 'c_plat', 'plataforma_credor', 'recuperacao_para_credor', 'b1', 'CTR-001', 'legitimo_interesse', '   ', 'op1', '2027-01-01')`,
    )
    .run(),
);

await deveFalhar('UPDATE na trilha de auditoria', () =>
  db.prepare(`UPDATE consulta_auditoria SET justificativa = 'reescrito'`).run(),
);

await deveFalhar('DELETE na trilha de auditoria', () =>
  db.prepare(`DELETE FROM consulta_auditoria`).run(),
);

await deveFalhar('consulta atribuída a operador inexistente', () =>
  db
    .prepare(
      `INSERT INTO consulta_auditoria (id, caso_id, origem_caso, finalidade, bureau_id, contrato_fornecedor_id, base_legal, justificativa, operador_id, retencao_ate)
       VALUES ('ca_z', 'c_plat', 'plataforma_credor', 'recuperacao_para_credor', 'b1', 'CTR-001', 'legitimo_interesse', 'ato sem autor', 'fantasma', '2027-01-01')`,
    )
    .run(),
);

console.log('\nautenticação');

const senhaBoa = 'senha-bem-longa-123';

await devePassar('usuário criado e senha confere', async () => {
  const u = await criarUsuario(db, {
    email: 'Novo@Teste.Local',
    nome: 'Novo',
    senha: senhaBoa,
    papel: 'operador',
    canais: ['plataforma_credor'],
  });
  // E-mail normalizado: login não deve depender de caixa.
  if (u.email !== 'novo@teste.local') throw new Error(`email não normalizado: ${u.email}`);

  const s = await autenticar(db, 'NOVO@teste.local', senhaBoa);
  if (!s) throw new Error('login falhou com a senha correta');
  if (s.usuario.canais[0] !== 'plataforma_credor') throw new Error('canais não preservados');

  // A senha em claro não pode aparecer em lugar nenhum da tabela.
  const linha = db.prepare('SELECT senha_hash FROM usuario WHERE id = ?').get(u.id) as {
    senha_hash: string;
  };
  if (linha.senha_hash.includes(senhaBoa)) throw new Error('senha gravada em claro');

  // O token entregue ao cliente não pode estar no banco — só o seu SHA-256.
  const achouToken = db
    .prepare('SELECT COUNT(*) AS n FROM sessao WHERE token_hash = ?')
    .get(s.token) as { n: number };
  if (achouToken.n > 0) throw new Error('token gravado em claro na sessão');

  if (!usuarioDoToken(db, s.token)) throw new Error('token válido não resolveu');

  revogarSessao(db, s.token);
  if (usuarioDoToken(db, s.token)) throw new Error('token revogado continuou válido');
});

await devePassar('senha errada é recusada', async () => {
  const s = await autenticar(db, 'novo@teste.local', 'senha-errada-aqui');
  if (s) throw new Error('autenticou com senha errada');
});

await devePassar('usuário inexistente é recusado', async () => {
  const s = await autenticar(db, 'ninguem@teste.local', senhaBoa);
  if (s) throw new Error('autenticou usuário inexistente');
});

await devePassar('senha curta é rejeitada', async () => {
  try {
    await criarUsuario(db, {
      email: 'curta@teste.local',
      nome: 'Curta',
      senha: 'curta',
      papel: 'admin',
      canais: [],
    });
    throw new Error('aceitou senha curta');
  } catch (e) {
    if (!(e as Error).message.includes('12 caracteres')) throw e;
  }
});

await devePassar('operador sem canal é rejeitado', async () => {
  try {
    await criarUsuario(db, {
      email: 'semcanal@teste.local',
      nome: 'Sem Canal',
      senha: senhaBoa,
      papel: 'operador',
      canais: [],
    });
    throw new Error('aceitou operador sem canal');
  } catch (e) {
    if (!(e as Error).message.includes('canal')) throw e;
  }
});

console.log(`\n${passou} ok, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
