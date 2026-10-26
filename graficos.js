// Gráficos (Chart.js) e grafo de vínculos (Cytoscape). Funções de agregação puras e testáveis em cima;
// a interface usa db, estado, indiceNomes etc. do app.js em tempo de execução.
(() => {
const { normNome } = globalThis.Parser;

// ---------- funções puras (agregação e grafo) ----------
const FAIXAS = [['f0', '< 1 ano'], ['f1', '1 a 5 anos'], ['f5', '5 a 10 anos'], ['f10', '> 10 anos']];
const ROT_FAIXA = Object.fromEntries(FAIXAS);
const faixaDe = a => a == null ? null : a < 1 ? 'f0' : a < 5 ? 'f1' : a < 10 ? 'f5' : 'f10';
const rotuloFaixa = k => ROT_FAIXA[k];

// Contagem por chave preservando a ordem de maior para menor; opcional top N.
function contar(itens, chave, topN) {
  const m = new Map();
  for (const x of itens) { const k = chave(x); if (k == null || k === '') continue; m.set(k, (m.get(k) || 0) + 1); }
  let pares = [...m.entries()].sort((a, b) => b[1] - a[1]);
  if (topN) pares = pares.slice(0, topN);
  return { labels: pares.map(p => p[0]), data: pares.map(p => p[1]) };
}

// registros: [{ cidade, comRel, fiscalizado, abertos, licenca, ctf, sexo:{valor,estimado}, aves:[{especie, ameacada, idade}] }]
// filtros: { municipios:[], especies:[], faixas:[], situacoes:[] }  (vazio = sem restrição)
function dadosGraficos(registros, filtros = {}) {
  const mun = new Set(filtros.municipios || []), esp = new Set(filtros.especies || []), fai = new Set(filtros.faixas || []), sit = new Set(filtros.situacoes || []);
  const filtraAves = esp.size || fai.size;
  const avePassa = a => (!esp.size || esp.has(a.especie)) && (!fai.size || fai.has(faixaDe(a.idade)));
  const satisfaz = { comrel: r => r.comRel, fisc: r => r.fiscalizado, abertos: r => r.abertos > 0,
    licenca: r => r.comRel && r.licenca !== 'regular', ctf: r => r.ctf === 'cancelado', ameacadas: r => r.aves.some(a => a.ameacada) };
  const base = registros.filter(r => (!mun.size || mun.has(r.cidade)) && [...sit].every(s => satisfaz[s]?.(r)));
  const criadores = base.filter(r => !filtraAves || r.aves.some(avePassa));
  const aves = criadores.flatMap(r => r.aves.filter(avePassa));
  const comRel = criadores.filter(r => r.comRel);
  return {
    totais: { criadores: criadores.length, comRel: comRel.length, aves: aves.length, ameacadas: aves.filter(a => a.ameacada).length },
    criadoresPorMunicipio: contar(criadores, r => r.cidade),
    avesPorEspecie: contar(aves, a => a.especie, 15),
    avesPorIdade: { labels: FAIXAS.map(f => f[1]), data: FAIXAS.map(([k]) => aves.filter(a => faixaDe(a.idade) === k).length) },
    licencas: contar(comRel, r => r.licenca || 'sem situação'),
    fiscalizados: { labels: ['Fiscalizados', 'Não fiscalizados'], data: [comRel.filter(r => r.fiscalizado).length, comRel.filter(r => !r.fiscalizado).length] },
    sexos: { labels: ['Masculino', 'Feminino'], data: [criadores.filter(r => r.sexo.valor === 'M').length, criadores.filter(r => r.sexo.valor === 'F').length] },
    ameacadasPorMunicipio: contar(criadores.flatMap(r => r.aves.filter(a => a.ameacada && avePassa(a)).map(() => r)), r => r.cidade),
  };
}

const primeiroNome = nome => String(nome ?? '').trim().split(/\s+/)[0] || '?';
// pares: [{ de:{cpf,nome}, para:{cpf,nome}, recebidas, enviadas }] -> { nodes, edges } para o Cytoscape.
function montarGrafo(pares, centralCpf) {
  const idDe = p => p.cpf || 'n:' + normNome(p.nome);
  const nodes = new Map(), edges = new Map();
  const addNode = p => { const id = idDe(p); if (!nodes.has(id)) nodes.set(id, { id, label: primeiroNome(p.nome), nome: p.nome, registro: p.registro || '', temFicha: !!p.cpf, central: p.cpf === centralCpf && !!p.cpf }); };
  for (const par of pares) {
    addNode(par.de); addNode(par.para);
    const s = idDe(par.de), t = idDe(par.para), k = s + '>' + t;
    const e = edges.get(k) || { id: 'e' + edges.size, source: s, target: t, recebidas: 0, enviadas: 0 };
    e.recebidas += par.recebidas || 0; e.enviadas += par.enviadas || 0;
    edges.set(k, e);
  }
  for (const e of edges.values()) e.label = [e.recebidas && `${e.recebidas} recebida(s)`, e.enviadas && `${e.enviadas} enviada(s)`].filter(Boolean).join(' / ');
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

globalThis.Graf = { faixaDe, rotuloFaixa, FAIXAS, dadosGraficos, primeiroNome, montarGrafo };
if (typeof window === 'undefined') return; // em node (testes), para aqui

// ---------- interface (só no navegador) ----------
const filtroGraf = { municipios: [], especies: [], faixas: [], situacoes: [] };
const CORES = ['#0b5e3a', '#2f9e6a', '#9a6700', '#b42318', '#8a3ffc', '#1570ef', '#157f3b', '#c4320a', '#5925dc', '#0e7090', '#854708', '#b42318'];
let charts = [];

// Monta os registros derivados a partir do estado de cada criador (definido no app.js).
function registrosGraficos() {
  const hoje = new Date(), anos = n => n ? Math.round((hoje - new Date(n.slice(0, 10) + 'T12:00')) / (365.25 * 864e5) * 10) / 10 : null;
  return Object.values(db.criadores).map(c => {
    const e = estado(c);
    const ameacadaKey = {};
    for (const a of e.ameacadas) ameacadaKey[a.anilha] = true;
    const aves = (c.rel?.secoes.Plantel || []).filter(a => /^ativ/i.test(a['Situação'] || '')).map(a => ({
      especie: a['Nome Popular'] || a['Espécie'] || 'Não identificada', ameacada: !!ameacadaKey[a['Código anilha']],
      idade: anos(parseData(a.Nascimento) ? a.Nascimento : ''),
    }));
    return { cpf: c.cpf, cidade: c.cidade || 'Sem cidade', comRel: !!c.rel, fiscalizado: e.fiscalizado, abertos: e.abertos.length,
      licenca: e.lic?.status || '', ctf: e.ctf?.status || '', sexo: e.sexo, aves };
  });
}
const parseData = s => Parser.parseData(s);

const SITUACOES = [['comrel', 'Com relatório'], ['fisc', 'Fiscalizados'], ['abertos', 'Com pendência'], ['licenca', 'Licença irregular'], ['ctf', 'CTF cancelado'], ['ameacadas', 'Com ave ameaçada']];
function multiSelect(id, rotulo, opcoes, sel) {
  return `<details class="ms"><summary>${rotulo}${sel.length ? ` <span class="tag">${sel.length}</span>` : ''}</summary>
    <div class="ms-op">${opcoes.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<label class="chk"><input type="checkbox" data-ms="${id}" value="${esc(v)}" ${sel.includes(v) ? 'checked' : ''}> ${esc(t)}</label>`; }).join('')}</div></details>`;
}

function telaGraficos() {
  const regs = registrosGraficos();
  const cidades = [...new Set(regs.map(r => r.cidade))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const especies = [...new Set(regs.flatMap(r => r.aves.map(a => a.especie)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  app.innerHTML = `<div class="tela-lista">
    <div class="lista-topo"><div class="card"><h1>Gráficos</h1>
      <p class="muted peq">Filtros combináveis. Aves e idades só contam criadores com relatório importado.</p>
      <div class="linha filtros-graf">
        ${multiSelect('municipios', 'Município', cidades, filtroGraf.municipios)}
        ${multiSelect('especies', 'Ave', especies, filtroGraf.especies)}
        ${multiSelect('faixas', 'Idade', Graf.FAIXAS.map(([k, t]) => [k, t]), filtroGraf.faixas)}
        ${multiSelect('situacoes', 'Situação', SITUACOES, filtroGraf.situacoes)}
        <button class="sec" id="g-limpar" type="button">Limpar</button>
      </div>
      <p id="g-tot" class="peq"></p></div></div>
    <div class="rolavel">
    <div class="graf-grade">
      ${[['g1', 'Criadores por município'], ['g2', 'Aves ativas por espécie (top 15)'], ['g3', 'Aves por faixa de idade'],
         ['g4', 'Situação das licenças'], ['g5', 'Fiscalizados x não fiscalizados'], ['g6', 'Sexo dos titulares'],
         ['g7', 'Aves ameaçadas por município']].map(([id, t]) => `<div class="card graf-card"><h2>${t}</h2><div class="graf-box"><canvas id="${id}"></canvas></div></div>`).join('')}
    </div>
    <div class="card"><h2>Grafo de vínculos</h2>
      <p class="muted peq">Busque um criador para ver com quem ele negociou aves. Clique num nó para abrir a ficha.</p>
      <input id="g-grafo-busca" type="search" placeholder="Nome ou CPF do criador, e Enter">
      <p class="muted peq">Digite o nome ou o CPF e tecle Enter. Ou abra a ficha de um criador e use a aba Vínculos.</p></div>
    </div></div>`;
  document.documentElement.style.setProperty('--topo-h', $('.topo').offsetHeight + 'px');
  ligarRecolhiveis('graficos');
  for (const el of document.querySelectorAll('[data-ms]')) el.onchange = () => {
    const id = el.dataset.ms, v = el.value, arr = filtroGraf[id];
    if (el.checked) arr.push(v); else arr.splice(arr.indexOf(v), 1);
    render();
  };
  $('#g-limpar').onclick = () => { for (const k in filtroGraf) filtroGraf[k] = []; telaGraficos(); };
  $('#g-grafo-busca').onchange = e => {
    const q = soDigitos(e.target.value), c = Object.values(db.criadores).find(c => (q.length >= 3 && c.cpf.includes(q)) || norm(e.target.value).startsWith(norm(c.nome)));
    if (c) location.hash = '#/grafo/' + c.cpf;
  };
  const render = () => {
    const d = Graf.dadosGraficos(regs, filtroGraf);
    charts.forEach(c => { try { c.destroy(); } catch { /* já destruído */ } }); charts = [];
    $('#g-tot').innerHTML = `<b>${d.totais.criadores}</b> criador(es), <b>${d.totais.comRel}</b> com relatório, <b>${d.totais.aves}</b> ave(s) ativa(s), <b>${d.totais.ameacadas}</b> ameaçada(s)`;
    desenhar('g1', 'bar', d.criadoresPorMunicipio); desenhar('g2', 'bar', d.avesPorEspecie); desenhar('g3', 'bar', d.avesPorIdade);
    desenhar('g4', 'doughnut', d.licencas); desenhar('g5', 'doughnut', d.fiscalizados); desenhar('g6', 'doughnut', d.sexos);
    desenhar('g7', 'bar', d.ameacadasPorMunicipio);
  };
  render();
}

function desenhar(id, tipo, dados) {
  const cv = $('#' + id);
  if (!cv || !window.Chart) return;
  const escuro = matchMedia('(prefers-color-scheme: dark)').matches;
  const cor = escuro ? '#9aa8a1' : '#5d6b64', grade = escuro ? '#2a3530' : '#dfe5e2';
  const ch = new Chart(cv, {
    type: tipo, data: { labels: dados.labels, datasets: [{ data: dados.data, backgroundColor: tipo === 'bar' ? CORES[0] : dados.labels.map((_, i) => CORES[i % CORES.length]), borderWidth: 0, borderRadius: tipo === 'bar' ? 4 : 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: tipo === 'doughnut', position: 'bottom', labels: { color: cor, boxWidth: 12 } } },
      scales: tipo === 'bar' ? { x: { ticks: { color: cor, autoSkip: false, maxRotation: 60 }, grid: { display: false } }, y: { ticks: { color: cor, precision: 0 }, grid: { color: grade } } } : {} },
  });
  charts.push(ch);
}

// ---------- grafo na ficha e na tela própria ----------
// Pares de transferência confirmada do criador central (um nível), resolvendo nomes a CPF pela base.
function paresDe(cpf, idx, anos) {
  const c = db.criadores[cpf];
  if (!c?.rel) return [];
  const central = { cpf, nome: c.nome, registro: c.registro }, out = [];
  for (const v of vinculos(c.rel, anos)) {
    const achado = (idx[normNome(v.nome)] || []).find(x => x.cpf !== cpf) || null;
    const outro = { cpf: achado?.cpf || '', nome: achado?.nome || v.nome, registro: achado?.registro || '' };
    if (v.recebidas) out.push({ de: outro, para: central, recebidas: v.recebidas, enviadas: 0 });
    if (v.enviadas) out.push({ de: central, para: outro, recebidas: 0, enviadas: v.enviadas });
  }
  return out;
}
let cyInst = null;
function montarCy(containerId, cpf, expandir, anos) {
  const idx = indiceNomes();
  let pares = paresDe(cpf, idx, anos);
  if (expandir) { // mais um nível: vínculos dos vizinhos que estão na base
    const vizinhos = new Set(pares.map(p => (p.de.cpf === cpf ? p.para.cpf : p.de.cpf)).filter(Boolean));
    for (const v of vizinhos) pares = pares.concat(paresDe(v, idx, anos));
  }
  const g = Graf.montarGrafo(pares, cpf);
  const el = $('#' + containerId);
  if (!g.nodes.length) { el.innerHTML = '<p class="muted peq">Sem transferências confirmadas para montar o grafo.</p>'; return; }
  el.innerHTML = '';
  const escuro = matchMedia('(prefers-color-scheme: dark)').matches;
  if (cyInst) cyInst.destroy();
  cyInst = cytoscape({
    container: el, elements: [...g.nodes.map(n => ({ data: n })), ...g.edges.map(e => ({ data: e }))],
    style: [
      { selector: 'node', style: { 'background-color': n => n.data('central') ? '#b42318' : n.data('temFicha') ? '#0b5e3a' : '#9aa8a1',
        label: n => n.data('registro') ? `${n.data('label')}\n${n.data('registro')}` : n.data('label'), 'text-wrap': 'wrap', 'line-height': 1.1,
        color: escuro ? '#e6ece9' : '#16211c', 'font-size': 7, 'text-valign': 'bottom', 'text-margin-y': 2, width: n => n.data('central') ? 24 : 16, height: n => n.data('central') ? 24 : 16 } },
      { selector: 'edge', style: { width: 1.5, 'line-color': escuro ? '#3a4a43' : '#b9c4bd', 'target-arrow-color': escuro ? '#3a4a43' : '#b9c4bd',
        'target-arrow-shape': 'triangle', 'curve-style': 'bezier', label: 'data(label)', 'font-size': 7, color: escuro ? '#9aa8a1' : '#5d6b64', 'text-background-color': escuro ? '#18201c' : '#fff', 'text-background-opacity': 0.8, 'text-background-padding': 2 } },
    ],
    layout: { name: 'concentric', concentric: n => n.data('central') ? 10 : 1, levelWidth: () => 1, minNodeSpacing: 40, padding: 10 },
  });
  globalThis.cyFiscal = cyInst;
  cyInst.on('tap', 'node', ev => { const d = ev.target.data(); location.hash = d.temFicha ? '#/c/' + d.id : '#/?q=' + encodeURIComponent(d.nome); });
}

const anosMarcados = () => [...document.querySelectorAll('.grafo-ano:checked')].map(x => +x.value);
function ligarGrafoFicha(cpf) {
  const cont = $('#grafo-ficha');
  if (!cont) return;
  const remontar = () => montarCy('grafo-ficha', cpf, $('#grafo-exp')?.checked, anosMarcados());
  remontar();
  if ($('#grafo-exp')) $('#grafo-exp').onchange = remontar;
  for (const x of document.querySelectorAll('.grafo-ano')) x.onchange = remontar;
}
function cardGrafo(cpf) {
  const c = db.criadores[cpf];
  const tem = c?.rel && vinculos(c.rel).length;
  const anos = tem ? Parser.anosVinculo(c.rel) : [];
  return `<div class="card"><h2>Grafo de vínculos</h2>
    ${!tem ? '<p class="muted peq">Sem transferências confirmadas no relatório.</p>' : `
    <div class="linha" style="gap:10px">
      <label class="chk" style="margin:0"><input type="checkbox" id="grafo-exp"> Expandir mais um nível</label>
      ${anos.length > 1 ? `<details class="ms"><summary>Ano${anosMarcados().length ? ` <span class="tag">${anosMarcados().length}</span>` : ''}</summary>
        <div class="ms-op">${anos.map(a => `<label class="chk"><input type="checkbox" class="grafo-ano" value="${a}"> ${a}</label>`).join('')}</div></details>` : ''}
    </div>
    <div id="grafo-ficha" class="grafo-box"></div>
    <p class="muted peq">Vermelho: criador atual. Verde: criador na base (clique abre a ficha). Cinza: fora da base (clique busca pelo nome para você conferir e importar). O número abaixo do nome é o cadastro no SISPASS, quando conhecido. Seta: sentido da transferência. Sem ano marcado, mostra todos.</p>`}</div>`;
}

function telaGrafo(cpf) {
  const c = db.criadores[cpf];
  if (!c) { app.innerHTML = '<div class="card">Criador não encontrado. <a href="#/graficos">Voltar</a></div>'; return; }
  app.innerHTML = `<p class="linha"><a href="#/graficos">← Gráficos</a> <a href="#/c/${cpf}">Abrir ficha de ${esc(c.nome)}</a></p>
    <div class="card"><h1>Vínculos de ${esc(c.nome)}</h1>${cardGrafo(cpf)}</div>`;
  ligarGrafoFicha(cpf);
}

globalThis.telaGraficos = telaGraficos;
globalThis.telaGrafo = telaGrafo;
globalThis.cardGrafo = cardGrafo;
globalThis.ligarGrafoFicha = ligarGrafoFicha;
})();
