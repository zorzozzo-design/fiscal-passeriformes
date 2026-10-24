import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../parser.js';
import '../graficos.js';
const G = globalThis.Graf;

test('faixa de idade pela idade em anos', () => {
  assert.equal(G.faixaDe(null), null);
  assert.equal(G.faixaDe(0.5), 'f0');
  assert.equal(G.faixaDe(1), 'f1');
  assert.equal(G.faixaDe(4.9), 'f1');
  assert.equal(G.faixaDe(5), 'f5');
  assert.equal(G.faixaDe(10), 'f10');
  assert.equal(G.rotuloFaixa('f5'), '5 a 10 anos');
});

const regs = [
  { cidade: 'Tramandaí', comRel: true, fiscalizado: true, abertos: 0, licenca: 'regular', ctf: 'ativo', sexo: { valor: 'M', estimado: false },
    aves: [{ especie: 'Curió', ameacada: false, idade: 2 }, { especie: 'Cardeal-amarelo', ameacada: true, idade: 8 }] },
  { cidade: 'Imbé', comRel: true, fiscalizado: false, abertos: 3, licenca: 'sem licença', ctf: 'ativo', sexo: { valor: 'F', estimado: true },
    aves: [{ especie: 'Curió', ameacada: false, idade: 0.5 }] },
  { cidade: 'Tramandaí', comRel: false, fiscalizado: false, abertos: 0, licenca: '', ctf: '', sexo: { valor: 'M', estimado: true }, aves: [] },
];

test('agrega sem filtros', () => {
  const d = G.dadosGraficos(regs, {});
  assert.deepEqual(d.totais, { criadores: 3, comRel: 2, aves: 3, ameacadas: 1 });
  assert.deepEqual(d.criadoresPorMunicipio, { labels: ['Tramandaí', 'Imbé'], data: [2, 1] });
  assert.deepEqual(d.avesPorEspecie.labels, ['Curió', 'Cardeal-amarelo']);
  assert.deepEqual(d.avesPorEspecie.data, [2, 1]);
  assert.deepEqual(d.avesPorIdade, { labels: ['< 1 ano', '1 a 5 anos', '5 a 10 anos', '> 10 anos'], data: [1, 1, 1, 0] });
  assert.deepEqual(d.sexos, { labels: ['Masculino', 'Feminino'], data: [2, 1] });
  assert.deepEqual(d.fiscalizados, { labels: ['Fiscalizados', 'Não fiscalizados'], data: [1, 1] }); // só os 2 com relatório
  assert.equal(d.licencas.data[d.licencas.labels.indexOf('sem licença')], 1);
  assert.deepEqual(d.ameacadasPorMunicipio, { labels: ['Tramandaí'], data: [1] });
});

test('filtro por município restringe criadores e aves', () => {
  const d = G.dadosGraficos(regs, { municipios: ['Imbé'] });
  assert.deepEqual(d.criadoresPorMunicipio, { labels: ['Imbé'], data: [1] });
  assert.equal(d.totais.aves, 1);
  assert.deepEqual(d.avesPorEspecie.labels, ['Curió']);
});

test('filtro por espécie conta só a ave e só criadores que a têm', () => {
  const d = G.dadosGraficos(regs, { especies: ['Cardeal-amarelo'] });
  assert.equal(d.totais.criadores, 1);
  assert.equal(d.totais.aves, 1);
  assert.deepEqual(d.avesPorEspecie, { labels: ['Cardeal-amarelo'], data: [1] });
  assert.deepEqual(d.avesPorIdade.data, [0, 0, 1, 0]);
});

test('filtro por faixa de idade', () => {
  const d = G.dadosGraficos(regs, { faixas: ['f0'] });
  assert.equal(d.totais.aves, 1);
  assert.deepEqual(d.avesPorEspecie, { labels: ['Curió'], data: [1] });
});

test('filtro por situação (pendência aberta)', () => {
  const d = G.dadosGraficos(regs, { situacoes: ['abertos'] });
  assert.equal(d.totais.criadores, 1);
  assert.deepEqual(d.criadoresPorMunicipio, { labels: ['Imbé'], data: [1] });
});

// ---------- grafo de vínculos ----------
test('primeiro nome', () => {
  assert.equal(G.primeiroNome('José Carlos Mostardeiro'), 'José');
  assert.equal(G.primeiroNome('  '), '?');
});

test('monta nós e arestas, com e sem ficha', () => {
  const pares = [
    { de: { cpf: '111', nome: 'Ana Maria', registro: '900' }, para: { cpf: '222', nome: 'Bruno Costa', registro: '901' }, recebidas: 0, enviadas: 2 },
    { de: { cpf: '333', nome: 'Carlos Dias', registro: '902' }, para: { cpf: '111', nome: 'Ana Maria', registro: '900' }, recebidas: 0, enviadas: 1 },
    { de: { cpf: '', nome: 'Externo Silva' }, para: { cpf: '111', nome: 'Ana Maria', registro: '900' }, recebidas: 0, enviadas: 1 },
  ];
  const g = G.montarGrafo(pares, '111');
  assert.equal(g.nodes.length, 4);
  const ana = g.nodes.find(n => n.id === '111');
  assert.equal(ana.central, true);
  assert.equal(ana.label, 'Ana');
  assert.equal(ana.registro, '900');
  assert.equal(ana.temFicha, true);
  const ext = g.nodes.find(n => !n.temFicha);
  assert.equal(ext.label, 'Externo');
  assert.equal(ext.registro, '');
  assert.equal(ext.id, 'n:EXTERNO SILVA');
  assert.equal(g.edges.length, 3);
  const e = g.edges.find(x => x.source === '111' && x.target === '222');
  assert.equal(e.enviadas, 2);
  assert.ok(e.label.includes('2'));
});

test('arestas duplicadas somam as transferências', () => {
  const pares = [
    { de: { cpf: 'A', nome: 'X' }, para: { cpf: 'B', nome: 'Y' }, recebidas: 0, enviadas: 1 },
    { de: { cpf: 'A', nome: 'X' }, para: { cpf: 'B', nome: 'Y' }, recebidas: 0, enviadas: 3 },
  ];
  const g = G.montarGrafo(pares, 'A');
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0].enviadas, 4);
});
