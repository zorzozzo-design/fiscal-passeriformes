import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../parser.js';
import '../normas.js';
const { parseRelatorio } = globalThis.Parser;
const N = globalThis.Normas;

test('espécie pelos Anexos da IN SEMA 04/2022, com nomes antigos do SISPASS', () => {
  const curio = N.especie('Oryzoborus angolensis');
  assert.equal(curio.anexo, 'I');
  assert.deepEqual(curio.diametros, [2.6]);
  assert.equal(curio.genotipagem, true);
  assert.deepEqual(N.especie('Sicalis flaveola').diametros.sort(), [2.6, 2.8]);
  assert.deepEqual(N.especie('Sicalis flaveola pelzelni').diametros, [2.6]);
  assert.equal(N.especie('Molothrus bonariensis').anexo, 'II');
  assert.equal(N.especie('Passer domesticus'), null);
  assert.equal(N.especie('Thraupis sayaca').anexo, 'I');
});

test('ameaçadas: Decreto RS 51.797/2014 e Portaria MMA 444/2014 (redação 1.704/2026)', () => {
  assert.deepEqual(N.ameaca('Oryzoborus angolensis'), { rs: 'EN', br: null });
  assert.deepEqual(N.ameaca('Gubernatrix cristata'), { rs: 'CR', br: 'CR' });
  assert.deepEqual(N.ameaca('Oryzoborus maximiliani'), { rs: null, br: 'CR' });
  assert.deepEqual(N.ameaca('Sporophila maximiliani atrirostris'), { rs: null, br: 'CR' });
  assert.deepEqual(N.ameaca('Carduelis yarrellii'), { rs: null, br: 'VU' });
  assert.deepEqual(N.ameaca('Xolmis dominicanus'), { rs: 'VU', br: 'VU' });
  assert.equal(N.ameaca('Saltator similis'), null);
  assert.equal(N.ameaca(''), null);
});

test('período de licença vai de 1º de agosto a 31 de julho', () => {
  assert.equal(N.periodo(new Date(2026, 9, 18)).rotulo, '2026/2027');
  assert.equal(N.periodo(new Date(2026, 6, 31)).rotulo, '2025/2026');
  assert.equal(N.periodo(new Date(2026, 7, 1)).rotulo, '2026/2027');
});

const rel = (secoes) => parseRelatorio(['Dados do Criador', 'Cadastro\tNome Criador\tCPF\tEndereço\tBairro\tMunicípio',
  '1\tTeste\t333.666.999-57\tRua A, 10\tCentro\tTRAMANDAI/RS', ' ', ...secoes].join('\n'));
const CTF = (cancelado, termino) => ['Categorias no CTF', 'Categoria\tDetalhe\tInício\tTérmino\tCancelado\tDES_OBSERVACOES',
  'Atividades não relacionadas\tCriação amadorista de passeriformes da fauna silvestre - IN IBAMA nº 10/2011\t01/10/2003\t' + termino + '\t' + cancelado + '\tAtividade inserida',
  'Uso de Recursos Naturais\tcriação de passeriformes silvestres nativos\t01/10/2003\t\tNão\tAtividade encerrada nos termos da IN IBAMA Nº11/2018', ' '];

test('situação do CTF: a categoria antiga "encerrada" na migração de 2019 não conta como cancelamento', () => {
  assert.equal(N.situacaoCTF(rel(CTF('Não', ''))).status, 'ativo');
  assert.equal(N.situacaoCTF(rel(CTF('Sim', ''))).status, 'cancelado');
  assert.equal(N.situacaoCTF(rel(CTF('Não', '01/01/2025'))).status, 'cancelado');
  assert.equal(N.situacaoCTF(rel([])).status, 'não encontrado');
});

const LIC = ['Licenças Verificadas no Sistema', 'Número\tData emissão\tValidade\tSituação',
  '300\t01/08/2026\t31/07/2027\tpendente', '200\t01/08/2025\t31/07/2026\tpendente', '100\t01/08/2024\t31/07/2025\tregular', ' '];

test('licença do período vigente e licenças inadimplentes', () => {
  const s = N.situacaoLicenca(rel(LIC), new Date(2026, 9, 18));
  assert.equal(s.status, 'pendente');
  assert.equal(s.numero, '300');
  assert.equal(s.pendentes, 2);
  assert.equal(N.situacaoLicenca(rel(LIC), new Date(2028, 0, 1)).status, 'sem licença');
});

// Criador fictício com várias situações previstas na IN.
const r = rel([...CTF('Não', ''), ...LIC,
  'Plantel', 'Situação\tEspécie\tNome Popular\tSexo\tNascimento\tDiâmetro anilha\tCódigo anilha',
  'Ativa\tOryzoborus angolensis\tCurió\tM\t01/01/2000\t2,8\tC1',
  'Ativa\tGubernatrix cristata\tCardeal-amarelo\tM\t01/01/2020\t3,8\tG1',
  'Ativa\tPasser domesticus\tPardal\tM\t01/01/2020\t2,6\tP1', ' ',
  'Transferências Recebidas', 'Data da Doação\tNome do Doador\tOperação do Doador\tAnilha\tData do Recebimento\tOperação do Receptor',
  '01/03/2025\tFULANO\tsolicitar\tR1\t01/03/2025\tconfirmar transferência de passeriforme',
  '01/04/2025\tFULANO\tsolicitar\tM1\t01/04/2025\tconfirmar transferência de passeriforme', ' ',
  'Transferências Solicitadas', 'Funcionário\tObservação\tData\toperação Doador\tAnilha\tNome do Receptor\tData Recebimento\tOperação do Receptor',
  '20/03/2025\tsolicitar transferência de passeriforme\tR1\tBELTRANO\t21/03/2025\tconfirmar transferência de passeriforme',
  '20/03/2025\tsolicitar transferência de passeriforme\tR7\tBELTRANO\t21/03/2025\tconfirmar transferência de passeriforme', ' ',
  'Histórico de Operações', 'Número\tOperação\tData\tAnilha\tReceptor\tFeito por',
  '1\tdeclarar fuga de passeriforme\t10/09/2026 10:00\tF1\t\tTeste',
  '2\tdeclarar fuga de passeriforme\t12/09/2026 10:00\tF2\t\tTeste',
]);
// Nascimento de aves que já saíram do plantel (vem de outros relatórios da base).
const nascimentos = {
  R7: { 'Nascimento': '01/03/2025', 'Espécie': 'Saltator similis' },
  M1: { 'Nascimento': '01/01/2020', 'Espécie': 'Molothrus bonariensis' },
};

test('verificação normativa: cada item tem base legal, providência e data do fato', () => {
  const itens = N.verificar(r, { hoje: new Date(2026, 9, 18), cfg: { idadeMax: 20 }, nascimentos });
  const ids = itens.map(i => i.id);
  for (const id of ['licenca', 'inadimplentes', 'transf90:R1', 'idade35:R7', 'anexoII:M1', 'diametro:C1',
    'foraAnexo:P1', 'reiteradas', 'longevidade:C1', 'art71:G1', 'genotipagem', 'sol', 'bo:F1', 'bo:F2']) {
    assert.ok(ids.includes(id), `faltou ${id}`);
  }
  assert.ok(!ids.includes('zerado'));
  assert.ok(!ids.includes('diametro:G1'));
  for (const i of itens) {
    assert.ok(i.base, `${i.id} sem base`);
    assert.ok(['SISPASS', 'SEMA', 'Notificação', 'Campo'].includes(i.destino), `${i.id} destino ${i.destino}`);
    assert.ok(['sispass', 'campo'].includes(i.grupo), `${i.id} grupo`);
  }
  assert.match(itens.find(i => i.id === 'transf90:R1').texto, /19 dias/);
  assert.equal(itens.find(i => i.id === 'reiteradas').data, '12/09/2026');
});

test('plantel zerado e CTF cancelado viram itens do grupo SISPASS', () => {
  const z = rel([...CTF('Sim', ''), 'Plantel', 'Situação\tEspécie\tNome Popular\tSexo\tNascimento\tDiâmetro anilha\tCódigo anilha', ' ']);
  const itens = N.verificar(z, { hoje: new Date(2026, 9, 18), cfg: { idadeMax: 20 }, nascimentos: {} });
  assert.equal(itens.find(i => i.id === 'zerado').grupo, 'sispass');
  assert.equal(itens.find(i => i.id === 'ctf').grupo, 'sispass');
});

test('aves ameaçadas do plantel', () => {
  const a = N.ameacadasDoPlantel(r);
  assert.deepEqual(a.map(x => [x.anilha, x.rs, x.br]), [['C1', 'EN', null], ['G1', 'CR', 'CR']]);
});

test('texto de suspensão para o SISPASS', () => {
  assert.equal(N.textoSuspensao(new Date(2026, 9, 18), ['Aves sem anilha ou sem origem legal'], ['art. 62, §2º, III']),
    'Suspensa em 18/10/2026 por fiscalização PATRAM/BM. Motivo: Aves sem anilha ou sem origem legal. Base: IN SEMA 04/2022, art. 62, §2º, III.');
});
