// Leitura do "relatório geral" do SISPASS (texto separado por TAB, em seções).
// Script comum (sem módulos) para funcionar também aberto direto do arquivo (file://).
(() => {

const soDigitos = s => String(s ?? '').replace(/\D/g, '');

function parseData(s) {
  const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

const VAZIO = /^(nenhum registro encontrado\.?|erro)$/i;

function parseRelatorio(texto) {
  const secoes = {}, brutas = {};
  let atual = null, cab = null;
  for (const bruta of String(texto).split(/\r?\n/)) {
    const linha = bruta.replace(/ /g, ' ');
    if (!linha.trim()) continue;
    if (!linha.includes('\t')) {
      if (VAZIO.test(linha.trim())) continue;
      atual = linha.trim();
      secoes[atual] = [];
      cab = null;
      continue;
    }
    if (!atual) continue;
    const cels = linha.split('\t').map(c => c.trim());
    if (!cab) { cab = cels; brutas[atual] = { cab, linhas: [] }; continue; }
    const linhas = brutas[atual].linhas, ant = linhas[linhas.length - 1];
    // Texto com quebra de linha dentro de uma célula: a continuação vem numa linha própria.
    if (ant && ant.length < cab.length && cels.length < cab.length && ant.length + cels.length - 1 <= cab.length) {
      ant[ant.length - 1] = `${ant[ant.length - 1]} ${cels[0]}`.trim();
      ant.push(...cels.slice(1));
      continue;
    }
    linhas.push(cels);
  }
  for (const [titulo, { cab, linhas }] of Object.entries(brutas)) {
    secoes[titulo] = linhas.map(cels => {
      // Linha com menos colunas que o cabeçalho: o SISPASS omite as primeiras colunas vazias.
      const desloc = Math.max(0, cab.length - cels.length);
      const row = {};
      cab.forEach((h, i) => { if (h) row[h] = cels[i - desloc] ?? ''; });
      return row;
    });
  }
  const d = secoes['Dados do Criador']?.[0];
  if (!d || !soDigitos(d.CPF)) throw new Error('Arquivo sem a seção "Dados do Criador" com CPF.');
  return {
    cpf: soDigitos(d.CPF),
    criador: {
      cadastro: d.Cadastro || '', nome: d['Nome Criador'] || '', email: d.Email || '',
      endereco: d['Endereço'] || '', bairro: d.Bairro || '', municipio: d['Município'] || '',
      cep: d.CEP || '', fone: d.Fone || '',
    },
    secoes,
  };
}

const normNome = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const chaveAnilha = s => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

// Criadores com quem houve transferência confirmada (o relatório traz só o nome, sem CPF).
function vinculos(rel) {
  const mapa = {};
  const somar = (nome, campo, data) => {
    if (!nome) return;
    const v = mapa[normNome(nome)] ||= { nome, recebidas: 0, enviadas: 0, ultima: '' };
    v[campo]++;
    if (!v.ultima || parseData(data) > parseData(v.ultima)) v.ultima = data;
  };
  const confirmada = r => /confirmar/i.test(r['Operação do Receptor'] || '');
  for (const r of rel.secoes['Transferências Recebidas'] || []) if (confirmada(r)) somar(r['Nome do Doador'], 'recebidas', r['Data do Recebimento']);
  for (const r of rel.secoes['Transferências Solicitadas'] || []) if (confirmada(r)) somar(r['Nome do Receptor'], 'enviadas', r['Data Recebimento']);
  return Object.values(mapa).sort((a, b) => normNome(a.nome).localeCompare(normNome(b.nome)));
}

// Óbitos declarados no Histórico, com a idade calculada pela data de nascimento do Plantel.
// A ave pode ter nascido em outro criador, então o nascimento é procurado em todos os relatórios (lista de { cpf, rel }).
const anosEntre = (a, b) => Math.round((b - a) / (365.25 * 864e5) * 10) / 10;
function obitos(lista) {
  const nasc = {};
  for (const { rel } of lista) for (const a of rel.secoes.Plantel || []) {
    const k = chaveAnilha(a['Código anilha']);
    if (k && parseData(a.Nascimento) && !nasc[k]) nasc[k] = a;
  }
  const out = [];
  for (const { cpf, rel } of lista) for (const h of rel.secoes['Histórico de Operações'] || []) {
    if (!OBITO.test(h['Operação'] || '') || !h.Anilha) continue;
    const proprio = (rel.secoes.Plantel || []).find(a => chaveAnilha(a['Código anilha']) === chaveAnilha(h.Anilha) && parseData(a.Nascimento));
    const ave = proprio || nasc[chaveAnilha(h.Anilha)];
    out.push({
      cpf, anilha: h.Anilha, data: h.Data.slice(0, 10),
      nomePopular: ave?.['Nome Popular'] || '', especie: ave?.['Espécie'] || '', nascimento: ave?.Nascimento || '',
      idadeAnos: ave ? anosEntre(parseData(ave.Nascimento), parseData(h.Data)) : null,
    });
  }
  return out;
}
function idadesPorEspecie(lista) {
  const g = {};
  for (const o of lista) (g[o.nomePopular || 'Espécie não identificada'] ||= []).push(o.idadeAnos);
  return Object.entries(g).map(([especie, idades]) => {
    const ok = idades.filter(i => i !== null);
    return { especie, obitos: idades.length, comIdade: ok.length,
      media: ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length * 10) / 10 : null,
      min: ok.length ? Math.min(...ok) : null, max: ok.length ? Math.max(...ok) : null };
  }).sort((a, b) => b.obitos - a.obitos || a.especie.localeCompare(b.especie));
}

// Indícios para verificação (não são prova de fraude). cfg: { diasSaida, transfAno }.
function indicios(rel, cfg) {
  const s = rel.secoes, out = [];
  const diasSaida = cfg.diasSaida ?? 30, transfAno = cfg.transfAno ?? 10;
  const dias = (a, b) => Math.round((parseData(b) - parseData(a)) / 864e5);
  const confirmada = r => /confirmar/i.test(r['Operação do Receptor'] || '');
  const entradas = (s['Transferências Recebidas'] || []).filter(confirmada)
    .map(r => ({ anilha: r.Anilha, data: r['Data do Recebimento'] || r['Data da Doação'] }));
  const hist = s['Histórico de Operações'] || [];
  const baixas = hist.filter(h => h.Anilha && OCORRENCIA.test(h['Operação'] || ''))
    .map(h => ({ anilha: h.Anilha, data: h.Data, tipo: OBITO.test(h['Operação']) ? 'óbito' : h['Operação'].match(OCORRENCIA)[0].toLowerCase() }));
  const saidas = [...(s['Transferências Solicitadas'] || []).filter(confirmada)
    .map(r => ({ anilha: r.Anilha, data: r.Data, tipo: 'transferência' })), ...baixas];
  const noPlantel = new Set((s.Plantel || []).map(a => chaveAnilha(a['Código anilha'])));
  const ativas = (s.Plantel || []).filter(a => /^ativ/i.test(a['Situação'] || '')).length;

  const rapidas = [];
  for (const e of entradas) {
    const sa = saidas.find(x => chaveAnilha(x.anilha) === chaveAnilha(e.anilha) && parseData(x.data) && dias(e.data, x.data) >= 0 && dias(e.data, x.data) <= diasSaida);
    if (sa) rapidas.push(`${e.anilha} (recebida ${e.data.slice(0, 10)}, ${sa.tipo} em ${dias(e.data, sa.data)} dias)`);
  }
  if (rapidas.length) out.push({ tipo: 'saidaRapida', texto: `Ave recebida e baixada/repassada em até ${diasSaida} dias: ${rapidas.join('; ')}` });

  const semDestino = entradas.filter(e => !noPlantel.has(chaveAnilha(e.anilha)) && !saidas.some(x => chaveAnilha(x.anilha) === chaveAnilha(e.anilha)));
  if (semDestino.length) out.push({ tipo: 'semDestino', texto: `Ave recebida que não está no plantel e sem saída registrada: ${semDestino.map(e => `${e.anilha} (recebida ${e.data.slice(0, 10)})`).join('; ')}` });

  const fugas = baixas.filter(b => b.tipo === 'fuga');
  if (fugas.length >= 2) out.push({ tipo: 'fugas', texto: `${fugas.length} fugas declaradas: ${fugas.map(f => `${f.anilha} (${f.data.slice(0, 10)})`).join('; ')}` });

  const porAno = {};
  for (const x of [...entradas, ...saidas.filter(x => x.tipo === 'transferência')]) {
    const d = parseData(x.data);
    if (d) porAno[d.getFullYear()] = (porAno[d.getFullYear()] || 0) + 1;
  }
  const altos = Object.entries(porAno).filter(([, n]) => n >= transfAno);
  if (altos.length) out.push({ tipo: 'movAlta', texto: `Movimentação alta (${transfAno}+ transferências confirmadas no ano): ${altos.map(([a, n]) => `${a}: ${n}`).join('; ')}` });

  const bloqueios = (s['Mensagens de Erro'] || []).filter(m => /licen[cç]a (n[aã]o emitida|pendente)/i.test(m.Mensagem || ''));
  if (bloqueios.length) out.push({ tipo: 'semLicenca', texto: `${bloqueios.length} tentativa(s) de operação bloqueada(s) por licença não emitida/pendente (última: ${bloqueios.map(m => m['Data do erro']).filter(parseData).sort((a, b) => parseData(b) - parseData(a))[0]?.slice(0, 10) || '?'})` });

  const movs = [...entradas, ...saidas];
  if (!ativas && movs.length) {
    const ultima = movs.map(m => m.data).filter(parseData).sort((a, b) => parseData(b) - parseData(a))[0]?.slice(0, 10);
    out.push({ tipo: 'zerado', texto: `Plantel sem aves ativas, mas com ${movs.length} movimentação(ões) registrada(s) (última: ${ultima || '?'})` });
  }
  return out;
}

// Gera de volta o texto no formato do relatório (usado para guardar na planilha e recuperar depois).
function serializar(secoes) {
  return Object.entries(secoes).map(([titulo, rows]) => {
    if (!rows.length) return `${titulo}\nNenhum registro encontrado.`;
    const cab = Object.keys(rows[0]);
    return [titulo, cab.join('\t'), ...rows.map(r => cab.map(h => String(r[h] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t'))].join('\n');
  }).join('\n \n');
}

// O SISPASS às vezes troca acentos por "?" (ex.: "n?o"), então "óbito" pode vir como "?bito" ou "Ã³bito".
const OBITO = /(ó|o|\?|ã³)bito/i;
const OCORRENCIA = /fuga|roubo|furto|(ó|o|\?|ã³)bito|morte/i;

function resumo(rel, cfg, hoje = new Date()) {
  const s = rel.secoes;
  const plantel = s['Plantel'] || [];
  const hist = s['Histórico de Operações'] || [];
  const ativas = plantel.filter(a => /^ativ/i.test(a['Situação'] || ''));

  const ocorrencias = hist.filter(h => OCORRENCIA.test(h['Operação'] || ''));
  for (const [titulo, rows] of Object.entries(s)) {
    if (OCORRENCIA.test(titulo)) ocorrencias.push(...rows.map(r => ({ ...r, _secao: titulo })));
  }

  const maisRecente = (rows, col) => rows.filter(r => parseData(r[col]))
    .sort((a, b) => parseData(b[col]) - parseData(a[col]))[0];
  const lic = maisRecente(s['Licenças Verificadas no Sistema'] || [], 'Validade');
  const ultimaLicenca = lic ? `${lic.Validade.slice(0, 10)}${lic['Situação'] ? ` (${lic['Situação']})` : ''}` : '';
  const ultimaOperacao = maisRecente(hist, 'Data')?.Data.slice(0, 10) || '';

  const anos = d => (hoje - d) / (365.25 * 864e5);
  const alertas = [];
  const velhas = ativas.filter(a => parseData(a.Nascimento) && anos(parseData(a.Nascimento)) > cfg.idadeMax);
  if (velhas.length) alertas.push({
    tipo: 'idade',
    texto: `${velhas.length} ave(s) ativa(s) com mais de ${cfg.idadeMax} anos: ` +
      velhas.map(a => `${a['Nome Popular']} ${a['Código anilha']} (${Math.floor(anos(parseData(a.Nascimento)))} anos)`).join('; '),
  });
  if (ativas.length && ultimaOperacao && anos(parseData(ultimaOperacao)) > cfg.anosSemMov) alertas.push({
    tipo: 'semMov',
    texto: `Sem operações há mais de ${cfg.anosSemMov} anos (última: ${ultimaOperacao})`,
  });

  alertas.push(...indicios(rel, cfg));
  return { ativas: ativas.length, total: plantel.length, ocorrencias, ultimaLicenca, ultimaOperacao, alertas };
}

globalThis.Parser = { parseRelatorio, serializar, resumo, soDigitos, parseData, vinculos, chaveAnilha, normNome, obitos, idadesPorEspecie, indicios };
})();
