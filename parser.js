// Leitura do "relatório geral" do SISPASS (texto separado por TAB, em seções).

export const soDigitos = s => String(s ?? '').replace(/\D/g, '');

export function parseData(s) {
  const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

const VAZIO = /^(nenhum registro encontrado\.?|erro)$/i;

export function parseRelatorio(texto) {
  const secoes = {};
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
    if (!cab) { cab = cels; continue; }
    const row = {};
    cab.forEach((h, i) => { if (h) row[h] = cels[i] ?? ''; });
    secoes[atual].push(row);
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

const OCORRENCIA = /fuga|roubo|furto|[óo]bito|morte/i;

export function resumo(rel, cfg, hoje = new Date()) {
  const s = rel.secoes;
  const plantel = s['Plantel'] || [];
  const hist = s['Histórico de Operações'] || [];
  const ativas = plantel.filter(a => /^ativ/i.test(a['Situação'] || ''));

  const ocorrencias = hist.filter(h => OCORRENCIA.test(h['Operação'] || ''));
  for (const [titulo, rows] of Object.entries(s)) {
    if (OCORRENCIA.test(titulo)) ocorrencias.push(...rows.map(r => ({ ...r, _secao: titulo })));
  }

  const maisRecente = (rows, col) => rows.map(r => r[col]).filter(parseData)
    .sort((a, b) => parseData(b) - parseData(a))[0]?.slice(0, 10) || '';
  const ultimaLicenca = maisRecente(s['Licenças Verificadas no Sistema'] || [], 'Validade');
  const ultimaOperacao = maisRecente(hist, 'Data');

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
