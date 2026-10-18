import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../parser.js';
const { parseRelatorio, serializar, resumo, soDigitos, parseData, vinculos, chaveAnilha, obitos, idadesPorEspecie } = globalThis.Parser;

const txt = readFileSync(new URL('./relatorio-ficticio.txt', import.meta.url), 'utf8');

test('separa seções, cabeçalhos e linhas', () => {
  const r = parseRelatorio(txt);
  assert.deepEqual(Object.keys(r.secoes), [
    'Dados do Criador', 'Dados do Criadouro', 'Licenças Verificadas no Sistema',
    'Plantel', 'Tela de Solic. Anilha', 'Histórico de Operações',
    'Transferências Solicitadas', 'Mensagens de Erro', 'Transferências Recebidas',
  ]);
  assert.equal(r.secoes['Dados do Criadouro'].length, 0);
  assert.equal(r.secoes['Tela de Solic. Anilha'].length, 0);
  assert.equal(r.secoes['Plantel'].length, 3);
  assert.equal(r.secoes['Plantel'][0]['Código anilha'], 'AAA-BBB-1-001/95');
});

test('extrai criador pelo CPF', () => {
  const r = parseRelatorio(txt);
  assert.equal(r.cpf, '11144477735');
  assert.equal(r.criador.nome, 'Fulano de Teste');
  assert.equal(r.criador.cadastro, '100001');
});

test('resumo: aves ativas, ocorrências, última licença e alertas', () => {
  const r = parseRelatorio(txt);
  const hoje = new Date(2026, 9, 18);
  const s = resumo(r, { idadeMax: 20, anosSemMov: 10 }, hoje);
  assert.equal(s.ativas, 2);
  assert.equal(s.ocorrencias.length, 1);
  assert.match(s.ocorrencias[0].Operação, /fuga/);
  assert.equal(s.ultimaLicenca, '31/07/2011 (regular)');
  assert.equal(s.ultimaOperacao, '06/05/2022');
  assert.deepEqual(s.alertas.map(a => a.tipo), ['idade']);
});

test('sem movimentação gera alerta', () => {
  const r = parseRelatorio(txt);
  const s = resumo(r, { idadeMax: 99, anosSemMov: 2 }, new Date(2026, 9, 18));
  assert.deepEqual(s.alertas.map(a => a.tipo), ['semMov']);
});

test('relatório sem Dados do Criador é rejeitado', () => {
  assert.throws(() => parseRelatorio('Plantel\nA\tB\n1\t2'), /Dados do Criador/);
});

test('utilitários', () => {
  assert.equal(soDigitos('350.744.850-53'), '35074485053');
  assert.equal(parseData('09/12/2003 11:44').getFullYear(), 2003);
  assert.equal(parseData(''), null);
});

test('linha mais curta que o cabeçalho é alinhada à direita', () => {
  const [t1] = parseRelatorio(txt).secoes['Transferências Solicitadas'];
  assert.equal(t1['Funcionário'], '');
  assert.equal(t1.Data, '10/04/2017');
  assert.equal(t1.Anilha, 'GGG-HHH-1-004/16');
  assert.equal(t1['Nome do Receptor'], 'BELTRANO DE TESTE');
});

test('mensagem quebrada em duas linhas vira uma linha só', () => {
  const m = parseRelatorio(txt).secoes['Mensagens de Erro'];
  assert.equal(m.length, 2);
  assert.equal(m[0].Mensagem, 'Primeira parte da mensagem. Segunda parte da mensagem.');
  assert.equal(m[0]['Data do erro'], '15/10/2014 20:58:03');
  assert.equal(m[1].Mensagem, 'Licença não emitida.');
});

test('serializar e ler de novo devolve o mesmo relatório', () => {
  const r = parseRelatorio(txt);
  assert.deepEqual(parseRelatorio(serializar(r.secoes)), r);
});

test('vínculos: só transferências confirmadas, agrupadas por nome', () => {
  const v = vinculos(parseRelatorio(txt));
  assert.deepEqual(v, [
    { nome: 'BELTRANO DE TESTE', recebidas: 0, enviadas: 1, ultima: '11/04/2017' },
    { nome: 'Ciclano Exemplo', recebidas: 1, enviadas: 0, ultima: '01/03/2016' },
  ]);
});

test('chave de anilha ignora espaços, pontuação e caixa', () => {
  assert.equal(chaveAnilha('IBAMA OA 3,5 159443'), chaveAnilha('ibama oa 3.5  159443'));
  assert.notEqual(chaveAnilha('IBAMA OA 3,5 159443'), chaveAnilha('IBAMA OA 3,5 159444'));
});

// Dois criadores fictícios: a ave X nasceu no plantel de A e morreu no plantel de B.
const relObito = (cpf, plantel, hist) => parseRelatorio([
  'Dados do Criador', 'Cadastro\tNome Criador\tCPF', `1\tTeste\t${cpf}`, ' ',
  'Plantel', 'Situação\tEspécie\tNome Popular\tSexo\tNascimento\tCódigo anilha', ...plantel, ' ',
  'Histórico de Operações', 'Número\tOperação\tData\tAnilha\tReceptor\tFeito por', ...hist,
].join('\n'));
const A = relObito('11144477735', ['Inativa\tSaltator similis\tTrinca-ferro\tM\t10/01/2015\tXXX 3,5 000001'], []);
const B = relObito('22255588846', ['Ativa\tSaltator similis\tTrinca-ferro\tF\t01/01/2020\tXXX 3,5 000002'], [
  '1\tdeclarar óbito de passeriforme\t10/07/2025 10:00\tXXX 3,5 000001\t\tTeste',
  '2\tdeclarar óbito de passeriforme\t01/01/2024 10:00\tXXX 3,5 000002\t\tTeste',
  '3\tdeclarar óbito de passeriforme\t01/01/2024 10:00\tYYY 2,6 999999\t\tTeste',
  '4\tdeclarar fuga de passeriforme\t01/02/2024 10:00\tXXX 3,5 000002\t\tTeste',
]);

test('óbitos: idade pela data de nascimento achada em qualquer relatório', () => {
  const o = obitos([{ cpf: 'A', rel: A }, { cpf: 'B', rel: B }]);
  assert.equal(o.length, 3);
  const x1 = o.find(x => x.anilha === 'XXX 3,5 000001');
  assert.equal(x1.cpf, 'B');
  assert.equal(x1.nomePopular, 'Trinca-ferro');
  assert.equal(x1.nascimento, '10/01/2015');
  assert.equal(x1.idadeAnos, 10.5);
  assert.equal(o.find(x => x.anilha === 'XXX 3,5 000002').idadeAnos, 4);
  const sem = o.find(x => x.anilha === 'YYY 2,6 999999');
  assert.equal(sem.idadeAnos, null);
  assert.equal(sem.nomePopular, '');
});

test('idade média por espécie ignora idade desconhecida', () => {
  const e = idadesPorEspecie(obitos([{ cpf: 'A', rel: A }, { cpf: 'B', rel: B }]));
  assert.deepEqual(e, [
    { especie: 'Trinca-ferro', obitos: 2, comIdade: 2, media: 7.3, min: 4, max: 10.5 },
    { especie: 'Espécie não identificada', obitos: 1, comIdade: 0, media: null, min: null, max: null },
  ]);
});
