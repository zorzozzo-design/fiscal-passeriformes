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

// Gera de volta o texto no formato do relatório (usado para guardar na planilha e recuperar depois).
function serializar(secoes) {
  return Object.entries(secoes).map(([titulo, rows]) => {
    if (!rows.length) return `${titulo}\nNenhum registro encontrado.`;
    const cab = Object.keys(rows[0]);
    return [titulo, cab.join('\t'), ...rows.map(r => cab.map(h => String(r[h] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t'))].join('\n');
  }).join('\n \n');
}

const OCORRENCIA =/fuga|roubo|furto|[óo]bito|morte/i;

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

  return { ativas: ativas.length, total: plantel.length, ocorrencias, ultimaLicenca, ultimaOperacao, alertas };
}

globalThis.Parser = { parseRelatorio, serializar, resumo, soDigitos, parseData };
})();
