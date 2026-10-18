import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../parser.js';
const { parseRelatorio, resumo, soDigitos, parseData } = globalThis.Parser;

const txt = readFileSync(new URL('./relatorio-ficticio.txt', import.meta.url), 'utf8');

test('separa seções, cabeçalhos e linhas', () => {
  const r = parseRelatorio(txt);
  assert.deepEqual(Object.keys(r.secoes), [
    'Dados do Criador', 'Dados do Criadouro', 'Licenças Verificadas no Sistema',
    'Plantel', 'Tela de Solic. Anilha', 'Histórico de Operações',
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
  assert.equal(s.ultimaLicenca, '31/07/2011');
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
