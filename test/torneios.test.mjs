import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../parser.js';
import '../torneios.js';
const T = globalThis.Torneios;

test('parse de registro manual', () => {
  const a = T.parseRegistro('TORNEIO: 12/05/2024; Clube Cantar de Imbé; ABC 123, DEF 456');
  assert.equal(a.tipo, 'torneio'); assert.equal(a.local, 'Clube Cantar de Imbé');
  assert.deepEqual(a.anilhas, ['ABC 123', 'DEF 456']); assert.equal(a.data, '2024-05-12');
  const b = T.parseRegistro('transporte: 01/02/2023; Veterinário Tramandaí');
  assert.equal(b.tipo, 'transporte'); assert.equal(b.local, 'Veterinário Tramandaí'); assert.deepEqual(b.anilhas, []);
  assert.equal(T.parseRegistro('TORNEIO: 03/03/2022').local, '');
  assert.equal(T.parseRegistro('observação qualquer'), null);
  assert.equal(T.parseRegistro('TORNEIO: data inválida; Local'), null); // sem data válida
});

const historico = [
  { 'Operação': 'solicitar licença de transporte', 'Data': '10/04/2024 09:00', 'Anilha': 'AVE1' },
  { 'Operação': 'emitir licença de transporte', 'Data': '15/06/2023 10:00', 'Anilha': 'AVE2' },
  { 'Operação': 'confirmar transferência de passeriforme', 'Data': '01/01/2024', 'Anilha': 'AVE3' },
];
test('registros de um criador combinam as três fontes', () => {
  const regs = T.registrosDe({
    cpf: '111', obs: 'TORNEIO: 12/05/2024; Clube X; ABC 123\nnota solta\nTRANSPORTE: 20/05/2024; Clube X',
    historico, observacoesRel: ['Ave levada a torneio em 2024', 'Licença 2017 alterada para regular'],
  });
  assert.equal(regs.filter(r => r.fonte === 'manual').length, 2);
  assert.equal(regs.filter(r => r.fonte === 'historico').length, 2); // 2 licenças de transporte, transferência ignorada
  assert.equal(regs.filter(r => r.fonte === 'observacao').length, 1); // menção a torneio
  assert.ok(regs.every(r => r.cpf === '111'));
  assert.ok(regs.find(r => r.fonte === 'historico').data === '2024-04-10');
});

test('agrega por local e marca local repetido (indício de torneio)', () => {
  const regs = [
    { cpf: 'A', data: '2024-05-12', local: 'Clube X', tipo: 'torneio' },
    { cpf: 'B', data: '2024-05-12', local: 'clube x', tipo: 'torneio' }, // mesmo local, grafia diferente
    { cpf: 'A', data: '2023-06-01', local: 'Clube X', tipo: 'transporte' },
    { cpf: 'C', data: '2024-07-01', local: 'Veterinário', tipo: 'transporte' },
    { cpf: 'A', data: '2024-08-01', local: '', tipo: 'transporte' }, // sem local, fica fora do ranking de locais
  ];
  const locais = T.porLocal(regs);
  const x = locais.find(l => /clube x/i.test(l.local));
  assert.equal(x.registros.length, 3);
  assert.equal(x.criadores.length, 2);
  assert.equal(x.provavelTorneio, true); // repetido
  const vet = locais.find(l => /veterin/i.test(l.local));
  assert.equal(vet.provavelTorneio, false); // só um registro
  assert.equal(locais[0].local.toLowerCase(), 'clube x'); // ordenado por mais registros
  assert.ok(!locais.some(l => l.local === '')); // sem local não entra
});

test('filtra pelos últimos N anos', () => {
  const regs = [{ cpf: 'A', data: '2024-05-12', local: 'X' }, { cpf: 'A', data: '2015-05-12', local: 'Y' }];
  const recentes = T.ultimosAnos(regs, 5, new Date('2026-10-27T12:00:00'));
  assert.equal(recentes.length, 1); assert.equal(recentes[0].local, 'X');
});
