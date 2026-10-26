import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../docs.js';
const D = globalThis.Docs;

const cfg = { agente: { nome: 'Sd PM Fulano de Tal', idFunc: '1234567', fracao: '4º Pel / 1º BABM' }, logos: {} };
const ab = {
  data: '2026-10-26T09:30', local: { endereco: 'Rua B, 20', bairro: 'Centro', cidade: 'Tramandaí', referencia: 'casa verde', lat: -29.98012, lon: -50.13455 },
  pessoa: { nome: 'beltrano da silva', cpf: '52998224725', rg: '1234567890', telefone: '51 99999-0000', endereco: 'Rua B, 20', bairro: 'Centro', cidade: 'Tramandaí' },
  aves: [
    { especie: 'cardeal-amarelo (Gubernatrix cristata)', qtd: 1, sexo: 'M', anilha: '', estado: 'viva', destino: 'apreendida' },
    { especie: 'Trinca-ferro', qtd: 3, sexo: '', anilha: 'ABC 123', estado: 'viva', destino: 'apreendida' },
    { especie: 'Tico-tico', qtd: 1, sexo: 'F', anilha: '', estado: 'viva', destino: 'soltura' },
  ],
  petrechos: [{ item: 'gaiola', qtd: 5 }, { item: 'alçapão', qtd: 1 }],
  apreensao: { docTipo: 'BA', docNumero: '2026/555', destinacao: 'Recolhimento (CETAS/CRAF-LN)',
    fiel: { nome: 'Fulano Guarda', rg: '999', cpf: '11122233344', telefone: '51 98888', endereco: 'Rua C, 3', municipioUf: 'Tramandaí/RS' } },
  notificacao: { motivo: 'Mantém aves sem licença e sem anilha.', comparecimento: 'PATRAM, Av. X, Tramandaí' },
};

test('cabeçalho institucional', () => {
  const h = D.cabecalho(cfg, 'TESTE');
  for (const x of ['BRIGADA MILITAR', 'COMANDO AMBIENTAL', 'RIO GRANDE DO SUL', 'TESTE']) assert.ok(h.includes(x), 'faltou ' + x);
});

test('itens da apreensão: só aves apreendidas e petrechos', () => {
  const itens = D.itensApreensao(ab);
  assert.equal(itens.length, 2 + 2); // 2 aves apreendidas + 2 petrechos (tico-tico foi solto)
  assert.ok(itens.some(i => /cardeal-amarelo/i.test(i.descricao) && i.quantidade === 1));
  assert.ok(itens.some(i => /Trinca-ferro/i.test(i.descricao) && /ABC 123/.test(i.descricao) && i.quantidade === 3));
  assert.ok(itens.some(i => /gaiola/i.test(i.descricao) && i.quantidade === 5));
  assert.ok(!itens.some(i => /Tico-tico/i.test(i.descricao)));
});

test('termo de apreensão e fiel depositário', () => {
  const t = D.termoApreensao(ab, cfg);
  for (const x of ['TERMO DE APREENSÃO E FIEL DEPOSITÁRIO', 'Beltrano da Silva', '529.982.247-25', 'BA nº', '2026/555',
    'cardeal-amarelo', 'gaiola', 'FIEL DEPOSITÁRIO', 'Art. 640', '652', 'Fulano Guarda', 'DADOS DO AGENTE', 'Sd PM Fulano de Tal',
    '( X ) Recolhimento (CETAS/CRAF-LN)', 'Decreto 6.514/2008, arts. 101, 102 e 105 a 107', '1ª via']) assert.ok(t.includes(x), 'faltou: ' + x);
  assert.ok(!t.includes('undefined'));
});

test('notificação ambiental', () => {
  const n = D.notificacao(ab, cfg);
  for (const x of ['NOTIFICAÇÃO AMBIENTAL', 'precaução e da prevenção', 'artigo 225', 'art. 64 da IN SEMA 04/2022',
    'Beltrano da Silva', 'Mantém aves sem licença', 'ARTIGO 330 DO CÓDIGO PENAL', 'Latitude', '-29,98012', 'WGS 84',
    'Sd PM Fulano de Tal', 'PATRAM, Av. X']) assert.ok(n.includes(x), 'faltou: ' + x);
  assert.ok(!n.includes('undefined'));
});

test('regularização de plantel', () => {
  const r = D.regularizacaoPlantel({
    criador: { nome: 'Beltrano da Silva', cpf: '529.982.247-25', registro: '77', endereco: 'Rua B, 20, Centro, Tramandaí' },
    itens: ['Licença 2026/2027 sem pagamento', 'Ave sem anilha'], prazo: 15, dataLimite: '10/11/2026', ciencia: '26/10/2026',
  }, cfg);
  for (const x of ['REGULARIZAÇÃO DE PLANTEL', 'Beltrano da Silva', 'Registro SISPASS:', '77', 'Licença 2026/2027 sem pagamento', 'Ave sem anilha',
    '15 (quinze) dias', '10/11/2026', 'art. 64', 'Sd PM Fulano de Tal']) assert.ok(r.includes(x), 'faltou: ' + x);
  assert.ok(!r.includes('undefined'));
});
