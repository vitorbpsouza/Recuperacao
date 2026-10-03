import { describe, expect, it } from 'vitest';

import { camposNovos, classificarTelefone, lerEndereco, lerRelatorio } from '../src/relatorio-colado.ts';

// Dados inventados, na estrutura que os fornecedores entregam.
const VEICULO = `--- RADAR (TST1A23): ---

DATA - HORA: 21/07/2026:17:25, PLACA: TST1A23, LOCAL: XX - CIDADE - RUA FICTICIA 100, LATITUDE: -20.0, LONGITUDE: -40.0
DATA - HORA: 22/07/2026:08:02, PLACA: TST1A23, LOCAL: XX - CIDADE - AV TESTE 5, LATITUDE: -20.1, LONGITUDE: -40.2

----------------------------------

🚗 DADOS DO VEÍCULO 🚗
Placa: TST1A23
Chassi: 9BWZZZ377VT004251
Renavam: 1234567890
Situação: EM_CIRCULACAO
Modelo: MARCA/MODELO X
Tipo: AUTOMOVEL
Categoria: PARTICULAR
Cor: BRANCA
Ano Fab/Mod: 2015 / 2016
Cilindradas: 1598
Capacidade de Carga: 0,45

👤 PROPRIETÁRIO 👤
Tipo Pessoa: FISICA
Documento: 012.345.678-90
Nome: PESSOA FICTICIA

⛔ RESTRIÇÕES & INDICADORES ⛔
Restrição 1: RENAINF
Restrição 2: ALIENACAO_FIDUCIARIA_FILE_VEICULOS
Restrição 3: RENAJUD
Restrição 4: SEM RESTRICAO
Renajud: Sim
Roubo/Furto: Não
Leilão: Não

📄 DOCUMENTOS 📄
Ano Licenciamento: 2024
Importador: INEXISTENTE`;

const PESSOA = String.raw`--- DADOS BÁSICOS COMPLETO: ---

Nome Completo: PESSOA FICTICIA
Nome Civil: Não informado
Nome da Mãe: MAE FICTICIA
Nome do Pai: Não informado
CPF: 1234567890
Data de Nascimento: 18/01/1985
Sexo: M
Profissão (CBO): ADMINISTRADOR
Renda: R$ 3.450,00
Faixa de Renda: Mais de R$ 3.000,00 a R$ 4.000,00
Email: Não informado
Signo: CAPRICORNIO
Código Controle: 0000.0000.0000.0000

--- PERFIL & COMPLIANCE: ---

Situacao Cadastral: REGULAR
Renda estimada: ACIMA DE R$ 7.500,00

--- TELEFONES (OPERADORAS) ---

[ANATEL 2026]
  • ANATEL 2026: PESSOA FICTICIA | CPF 012.345.678-90 | (37) 99993-0001

[ANATEL]
  • ANATEL: PESSOA FICTICIA | CPF 012.345.678-90 | (37) 99931-0002
  • ANATEL: PESSOA FICTICIA | CPF 012.345.678-90 | (37) 99993-0001

[Telefonia 2024]
  • Telefonia 2024: Titular n/i | CPF 012.345.678-90 | (37) 99915-0003 | (37) 99993-0001

--- ENDERECOS ---

R MARINGA, Nº 195, BAIRRO FICTICIO, CIDADE TESTE/MG, 35660-179

R MARINGA RES 195 MG - RES 195 MG, BAIRRO FICTICIO, CIDADE TESTE/MG, 35660-179

R MARINGA 195 C - C, BAIRRO FICTICIO, CIDADE TESTE/MG, 35660-179

PC PADRE TESTE 72 LJ 101 - LJ 101, CENTRO, CIDADE TESTE/MG, 35660-015

MARINGA, Nº 195, BAIRRO FICTICIO, CIDADE TESTE/MG, 03566-079

[DATAB - EMAIL] fulano@exemplo.com.br | Ranking 1 | Recência 04-MAY-18
[DATAB - ENDEREÇO] MARINGA 217 - CIDADE TESTE/MG CEP 35660179
[DATAB - TEL] (37) 999310002 Ranking 1
[DATAB - TEL] (37) 32360408 Ranking 1
[SIPNI]
Nome: PESSOA FICTICIA
Nascimento: 1985-01-18
Sexo: M
Óbito: false

[RAIS 2022]  |
--- TELEFONES ---

(37) 32361-169 | 09/10/2019
(99) 9933446 | N/I

--- PARENTES: ---

VINCULO: IRMA(O), NOME: IRMA FICTICIA, CPF: 111.444.777-35

VINCULO: MAE, NOME: MAE FICTICIA, CPF: 222.555.888-46

--- INFORMAÇÕES DE CRÉDITO: ---

RENDA: R$ 6.992,92\nFAIXA DE RENDA: 9

--- MOSAIC: ---

Credito:
  Grupo: Movimentando a economia no interior (B)
Target:
  Grupo: Donos de negócios (D)

--- IMPOSTO DE RENDA (IRPF): ---
Ano: 2020 | Situação: SALDO INEXISTENTE | Banco: Não informada | Data Consulta: 15/08/2020 17:01

--- CREDIT ANALYTICS: ---
Data Atualização: 21/11/2023 17:50:36

PERFIL:
Perfil Mobile: 1

TODOS FLAGS:
Financeiro:
  Fintech: True
Produtos:
  Honda Moto: True

--- HOBBIES: ---

Pesca: SIM

----------------------------------`;

describe('relatório do veículo', () => {
  const r = lerRelatorio(VEICULO);

  it('lê todos os campos do veículo e as restrições', () => {
    expect(r.veiculo).toMatchObject({
      placa: 'TST1A23',
      chassi: '9BWZZZ377VT004251',
      renavam: '01234567890',
      modelo: 'MARCA/MODELO X',
      tipo: 'AUTOMOVEL',
      categoria: 'PARTICULAR',
      cor: 'BRANCA',
      anoFabricacao: 2015,
      anoModelo: 2016,
      situacao: 'EM_CIRCULACAO',
      cilindradas: '1598',
      renajud: true,
      rouboFurto: false,
      leilao: false,
      anoLicenciamento: 2024,
      restricoes: ['RENAINF', 'ALIENACAO_FIDUCIARIA_FILE_VEICULOS', 'RENAJUD'],
    });
  });

  it('guarda o proprietário, com o documento conferido', () => {
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0]).toMatchObject({ documento: '01234567890', tipoPessoa: 'PF', nome: 'PESSOA FICTICIA', origem: 'proprietario_do_veiculo' });
  });

  it('transforma o radar em pontos com data, local e coordenadas', () => {
    expect(r.radares).toEqual([
      { observadoEm: '2026-07-21T17:25:00-03:00', placa: 'TST1A23', local: 'XX - CIDADE - RUA FICTICIA 100', latitude: -20, longitude: -40 },
      { observadoEm: '2026-07-22T08:02:00-03:00', placa: 'TST1A23', local: 'XX - CIDADE - AV TESTE 5', latitude: -20.1, longitude: -40.2 },
    ]);
  });

  it('não perde campo desconhecido: guarda e marca como novo', () => {
    const novos = camposNovos(r);
    expect(novos.map((n) => n.rotulo)).toEqual(['Capacidade de Carga']);
    expect(novos[0]).toMatchObject({ entidade: 'veiculo', valor: '0,45', secao: 'DADOS DO VEÍCULO' });
    // Conhecido sem coluna própria: guardado, sem alerta.
    expect(r.veiculo!.extras.find((e) => e.rotulo === 'Importador')).toMatchObject({ valor: 'INEXISTENTE', novo: false });
  });
});

describe('dossiê da pessoa', () => {
  const r = lerRelatorio(PESSOA);
  const p = r.pessoas[0]!;

  it('lê os dados cadastrais, completando o zero do CPF cortado', () => {
    expect(r.pessoas).toHaveLength(1);
    expect(p).toMatchObject({
      documento: '01234567890',
      nome: 'PESSOA FICTICIA',
      nomeMae: 'MAE FICTICIA',
      nascimento: '1985-01-18',
      sexo: 'M',
      profissao: 'ADMINISTRADOR',
      situacaoCadastral: 'REGULAR',
      obito: false,
    });
    expect(p.nomePai).toBeUndefined();
  });

  it('junta o mesmo telefone citado por várias fontes, guardando cada fonte', () => {
    const celular = p.contatos.find((c) => c.valor === '37999930001')!;
    expect(celular.tipo).toBe('celular');
    expect(celular.fontes.map((f) => f.fonte)).toEqual(['ANATEL 2026', 'ANATEL', 'Telefonia 2024']);
    expect(celular.fontes[0]!.titular).toBe('PESSOA FICTICIA');
    expect(p.contatos.find((c) => c.valor === '37999310002')!.fontes.map((f) => f.fonte)).toEqual(['ANATEL', 'DATAB']);
  });

  it('separa celular e fixo e marca o inválido sem apagar', () => {
    expect(p.contatos.find((c) => c.valor === '3732360408')).toMatchObject({ tipo: 'fixo', valido: true });
    // "(37) 32361-169" é o fixo (37) 3236-1169 com o hífen no lugar errado.
    expect(p.contatos.find((c) => c.valor === '3732361169')).toMatchObject({ tipo: 'fixo', fontes: [{ fonte: 'TELEFONES', data: '09/10/2019' }] });
    expect(p.contatos.find((c) => c.valor === '999933446')).toMatchObject({ tipo: 'invalido', valido: false });
    expect(p.contatos.find((c) => c.tipo === 'email')).toMatchObject({ valor: 'fulano@exemplo.com.br', fontes: [{ fonte: 'DATAB', ranking: 1, data: '04-MAY-18' }] });
  });

  it('agrupa as grafias do mesmo endereço e corrige o CEP pela maioria', () => {
    const maringa = p.enderecos.find((e) => e.chave === 'maringa|195|cidade teste')!;
    expect(maringa.variantes).toHaveLength(4);
    expect(maringa).toMatchObject({ logradouro: 'R MARINGA', numero: '195', bairro: 'BAIRRO FICTICIO', uf: 'MG', cep: '35660-179' });
    expect(p.enderecos.map((e) => e.chave).sort()).toEqual(['maringa|195|cidade teste', 'maringa|217|cidade teste', 'padre teste|72|cidade teste']);
    expect(p.enderecos.find((e) => e.chave === 'maringa|217|cidade teste')).toMatchObject({ cep: '35660-179', fontes: ['DATAB'] });
  });

  it('lê os parentes com documento', () => {
    expect(p.parentes).toEqual([
      { vinculo: 'IRMA(O)', nome: 'IRMA FICTICIA', documento: '11144477735' },
      { vinculo: 'MAE', nome: 'MAE FICTICIA', documento: '22255588846' },
    ]);
  });

  it('guarda perfil e crédito como dado sensível, com o caminho dos grupos', () => {
    const sensiveis = p.extras.filter((e) => e.sensivel);
    const rotulos = sensiveis.map((e) => `${e.secao} :: ${e.rotulo} = ${e.valor}`);
    expect(rotulos).toEqual(
      expect.arrayContaining([
        'DADOS BÁSICOS COMPLETO :: Renda = R$ 3.450,00',
        'INFORMAÇÕES DE CRÉDITO :: RENDA = R$ 6.992,92',
        'INFORMAÇÕES DE CRÉDITO :: FAIXA DE RENDA = 9',
        'MOSAIC :: Credito › Grupo = Movimentando a economia no interior (B)',
        'MOSAIC :: Target › Grupo = Donos de negócios (D)',
        'IMPOSTO DE RENDA (IRPF) :: Ano 2020 = Situação: SALDO INEXISTENTE | Banco: Não informada | Data Consulta: 15/08/2020 17:01',
        'CREDIT ANALYTICS :: PERFIL › Perfil Mobile = 1',
        'CREDIT ANALYTICS :: TODOS FLAGS › Financeiro › Fintech = True',
        'CREDIT ANALYTICS :: TODOS FLAGS › Produtos › Honda Moto = True',
      ]),
    );
    expect(sensiveis.every((e) => !e.novo)).toBe(true);
  });

  it('marca como novo o rótulo desconhecido e a seção desconhecida', () => {
    expect(camposNovos(r).map((e) => `${e.secao} :: ${e.rotulo}`)).toEqual([
      'DADOS BÁSICOS COMPLETO :: Signo',
      'HOBBIES :: Pesca',
    ]);
  });
});

describe('peças do leitor', () => {
  it('classifica telefones pelos dígitos', () => {
    expect(classificarTelefone('(37) 99993-3446')).toEqual({ tipo: 'celular', valor: '37999933446', valido: true });
    expect(classificarTelefone('+55 37 3236-0006')).toEqual({ tipo: 'fixo', valor: '3732360006', valido: true });
    expect(classificarTelefone('(20) 99999-0000').valido).toBe(false);
  });

  it('não confunde nome de rua com número', () => {
    expect(lerEndereco('R 7 DE SETEMBRO 100, CENTRO, CIDADE/SP, 01000-000')).toMatchObject({ logradouro: 'R 7 DE SETEMBRO', numero: '100', bairro: 'CENTRO' });
    expect(lerEndereco('PC FRANCISCO VALADARES 18 14 - 14, CENTRO, CIDADE/MG, 35660-172')).toMatchObject({ numero: '18', complemento: '14' });
  });

  it('veículo e dossiê do mesmo documento viram uma pessoa só', () => {
    const r = lerRelatorio(`${VEICULO}\n\n${PESSOA}`);
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0]).toMatchObject({ documento: '01234567890', origem: 'proprietario_do_veiculo', nomeMae: 'MAE FICTICIA' });
    expect(r.veiculo?.placa).toBe('TST1A23');
    expect(r.radares).toHaveLength(2);
  });
});

describe('relatório só do veículo', () => {
  it('não inventa uma "pessoa sem nome" com rótulos de DOCUMENTOS', () => {
    const r = lerRelatorio(`🚗 DADOS DO VEÍCULO 🚗
Placa: QUW5C78
⛔ RESTRIÇÕES & INDICADORES ⛔
Renajud: Sim
👤 PROPRIETÁRIO 👤
Documento: 012.345.678-90
Nome: PESSOA FICTICIA
📄 DOCUMENTOS 📄
Ano Licenciamento: 2026
CRV: 123456789
Exercício: 2026`);
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0]).toMatchObject({ origem: 'proprietario_do_veiculo', nome: 'PESSOA FICTICIA' });
    expect(r.veiculo!.extras.map((e) => e.rotulo)).toEqual(expect.arrayContaining(['CRV', 'Exercício']));
  });
});

describe('seções do veículo que o leitor não conhecia', () => {
  // Estrutura do relatório real (rótulos de 2026-10-02), com valores fictícios.
  const texto = `🚗 DADOS DO VEÍCULO 🚗
Placa: TST1A23
Emplacamento: PARA DE MINAS/MG
Lotação: 5

⛔ RESTRIÇÕES & INDICADORES ⛔
Alarme: Não
Comunicação Venda: Não

📦 IMPORTAÇÃO 📦
Importador: INEXISTENTE
Doc Importador:
  País Transferência: INEXISTENTE
  Processo: 0

ℹ OUTROS ℹ
Financeira: BANCO FICTICIO
Restrição RFB: INEXISTENTE

--- DADOS BÁSICOS ---
Nome: PESSOA FICTICIA
CPF: 012.345.678-90
Signo: CAPRICORNIO`;
  const r = lerRelatorio(texto);

  it('emplacamento preenche município e UF', () => {
    expect(r.veiculo).toMatchObject({ municipio: 'PARA DE MINAS', uf: 'MG' });
  });

  it('importação e "outros" logo depois do veículo são do veículo, com o grupo no rótulo', () => {
    const doVeiculo = r.veiculo!.extras.map((e) => `${e.secao} :: ${e.rotulo}`);
    expect(doVeiculo).toEqual(
      expect.arrayContaining([
        'IMPORTAÇÃO :: Importador',
        'IMPORTAÇÃO :: Doc Importador › País Transferência',
        'IMPORTAÇÃO :: Doc Importador › Processo',
        'OUTROS :: Financeira',
        'OUTROS :: Restrição RFB',
        'DADOS DO VEÍCULO :: Lotação',
      ]),
    );
    expect(r.pessoas[0]!.extras.map((e) => e.rotulo)).toEqual(['Signo']);
  });
});
