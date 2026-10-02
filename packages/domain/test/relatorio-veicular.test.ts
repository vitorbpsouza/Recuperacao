import { describe, expect, it } from 'vitest';

import { lerRelatorioVeicular } from '../src/relatorio-veicular.ts';

// Dados inventados, no formato que os fornecedores costumam entregar.
const RELATORIO = `--- RADAR (TST1A23): ---

DATA - HORA: 21/07/2026:17:25, PLACA: TST1A23, LOCAL: XX - CIDADE - RUA FICTICIA 100, LATITUDE: -20.0, LONGITUDE: -40.0

----------------------------------

🚗 DADOS DO VEÍCULO 🚗
Placa: TST1A23
Chassi: 9BWZZZ377VT004251
Renavam: 01234567890
Situação: EM_CIRCULACAO
Modelo: MARCA/MODELO X
Cor: BRANCA
Ano Fab/Mod: 2015 / 2016

👤 PROPRIETÁRIO 👤
Tipo Pessoa: FISICA
Documento: 00000000000
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

describe('relatório veicular', () => {
  const r = lerRelatorioVeicular(RELATORIO);

  it('lê os dados do veículo e as restrições', () => {
    expect(r).toMatchObject({
      placa: 'TST1A23',
      chassi: '9BWZZZ377VT004251',
      renavam: '01234567890',
      modelo: 'MARCA/MODELO X',
      cor: 'BRANCA',
      anoFabricacao: 2015,
      anoModelo: 2016,
      situacao: 'EM_CIRCULACAO',
      renajud: true,
      rouboFurto: false,
      leilao: false,
      alienacaoFiduciaria: true,
      anoLicenciamento: 2024,
    });
    expect(r.restricoes).toEqual(['RENAINF', 'ALIENACAO_FIDUCIARIA_FILE_VEICULOS', 'RENAJUD']);
  });

  it('descarta dono e radar, sem guardar os valores', () => {
    expect(r.descartados).toEqual(expect.arrayContaining(['dados do proprietário', 'localização por radar']));
    const tudo = JSON.stringify(r);
    expect(tudo).not.toContain('PESSOA FICTICIA');
    expect(tudo).not.toContain('00000000000');
    expect(tudo).not.toContain('-40.0');
    expect(tudo).not.toContain('RUA FICTICIA');
  });
});
