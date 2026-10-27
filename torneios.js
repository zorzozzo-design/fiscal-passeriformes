// Torneios e transporte de aves: extrai registros das observações de campo, do Histórico de Operações
// (licenças de transporte) e da seção Observações do relatório, e cruza por local.
// Funções puras testáveis em cima; a interface (telaTorneios) usa db/estado em tempo de execução.
(() => {
const { parseData } = globalThis.Parser;

const iso = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Uma linha "TORNEIO: dd/mm/aaaa; Local; anilhas" ou "TRANSPORTE: ..." -> registro, ou null.
function parseRegistro(linha) {
  const m = /^\s*(TORNEIO|TRANSPORTE)\s*:\s*(.+)$/i.exec(String(linha ?? ''));
  if (!m) return null;
  const partes = m[2].split(';').map(x => x.trim());
  const d = parseData(partes[0]);
  if (!d) return null;
  return { tipo: m[1].toLowerCase(), data: iso(d), local: partes[1] || '', anilhas: (partes[2] || '').split(',').map(x => x.trim()).filter(Boolean) };
}

const RE_TRANSPORTE = /transporte/i; // "licença de transporte" (não casa "transferência")
const RE_EVENTO = /torneio|competi|campeonato|exposi|transporte/i;

// Combina as três fontes de um criador em registros normalizados.
// dados: { cpf, obs (texto das observações de campo), historico ([{Operação,Data,Anilha}]), observacoesRel ([string]) }
function registrosDe(dados) {
  const out = [], cpf = dados.cpf;
  for (const l of String(dados.obs || '').split('\n')) { const r = parseRegistro(l); if (r) out.push({ ...r, cpf, fonte: 'manual' }); }
  for (const h of dados.historico || []) if (RE_TRANSPORTE.test(h['Operação'] || '')) {
    const d = parseData(h['Data']); out.push({ cpf, fonte: 'historico', tipo: 'transporte', data: iso(d), local: '', anilhas: h['Anilha'] ? [h['Anilha']] : [], texto: h['Operação'] });
  }
  for (const o of dados.observacoesRel || []) if (RE_EVENTO.test(o)) {
    const d = parseData((/(\d{2}\/\d{2}\/\d{4})/.exec(o) || [])[1] || '');
    out.push({ cpf, fonte: 'observacao', tipo: /torneio|competi|campeonato|exposi/i.test(o) ? 'torneio' : 'transporte', data: iso(d), local: '', anilhas: [], texto: o.trim() });
  }
  return out;
}

const ultimosAnos = (regs, anos, hoje = new Date()) => {
  const limite = new Date(hoje); limite.setFullYear(limite.getFullYear() - anos);
  const corte = iso(limite);
  return regs.filter(r => r.data && r.data >= corte);
};

// Agrupa por local (ignora registros sem local). provavelTorneio = o mesmo local em 2+ registros.
function porLocal(regs) {
  const m = new Map();
  for (const r of regs) {
    const k = semAcento(r.local); if (!k) continue;
    const g = m.get(k) || { local: r.local, chave: k, registros: [], criadores: new Set(), datas: new Set() };
    g.registros.push(r); g.criadores.add(r.cpf); if (r.data) g.datas.add(r.data);
    m.set(k, g);
  }
  return [...m.values()].map(g => ({ local: g.local, chave: g.chave, registros: g.registros,
    criadores: [...g.criadores], datas: [...g.datas].sort(), provavelTorneio: g.registros.length >= 2 }))
    .sort((a, b) => b.registros.length - a.registros.length || b.criadores.length - a.criadores.length);
}

globalThis.Torneios = { parseRegistro, registrosDe, ultimosAnos, porLocal };
if (typeof window === 'undefined') return;

// ---------- interface ----------
const fmtBr = iso => iso ? iso.split('-').reverse().join('/') : '';
const filtroTorn = { anos: 5, municipio: '', q: '' };

// Observações da seção "Observações:" do relatório, como textos (junta as células de cada linha).
function obsRel(rel) {
  const linhas = rel?.secoes?.['Observações:'] || rel?.secoes?.['Observações'] || [];
  return linhas.map(r => Object.values(r).filter(v => v && !/^\(?\d{2}\/\d{2}\/\d{4}/.test(v)).join(' ')).filter(Boolean);
}
function todosRegistros() {
  const out = [];
  for (const c of Object.values(db.criadores)) {
    const regs = Torneios.registrosDe({ cpf: c.cpf, obs: c.obs, historico: c.rel?.secoes?.['Histórico de Operações'] || [], observacoesRel: obsRel(c.rel) });
    for (const r of regs) { r.nome = c.nome; r.cidade = c.cidade; out.push(r); }
  }
  return out;
}

function telaTorneios() {
  const base = todosRegistros();
  const cidades = [...new Set(Object.values(db.criadores).map(c => c.cidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  app.innerHTML = `<div class="tela-lista">
    <div class="lista-topo">
      <div class="card"><h1>Torneios e transporte</h1>
        <p class="muted peq">Registros de transporte e torneio dos últimos <b>${filtroTorn.anos}</b> ano(s). Um mesmo local repetido é o indício forte de ponto de torneio.
        Registre em Observações de campo do criador, uma linha por evento: <code>TORNEIO: dd/mm/aaaa; Local; anilhas</code> ou <code>TRANSPORTE: dd/mm/aaaa; Local</code>.</p>
        <div class="linha">
          <select id="t-anos">${[3, 5, 10].map(a => `<option value="${a}" ${a === filtroTorn.anos ? 'selected' : ''}>Últimos ${a} anos</option>`).join('')}</select>
          <select id="t-cid"><option value="">Todas as cidades</option>${cidades.map(c => `<option ${c === filtroTorn.municipio ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <input id="t-q" type="search" placeholder="Local ou criador" value="${esc(filtroTorn.q)}">
        </div>
        <p id="t-tot" class="peq"></p></div>
    </div>
    <div class="rolavel" id="t-corpo"></div>
  </div>`;
  document.documentElement.style.setProperty('--topo-h', $('.topo').offsetHeight + 'px');
  const desenhar = () => {
    let regs = Torneios.ultimosAnos(base, filtroTorn.anos);
    if (filtroTorn.municipio) regs = regs.filter(r => r.cidade === filtroTorn.municipio);
    const q = norm(filtroTorn.q);
    if (q) regs = regs.filter(r => norm(`${r.local} ${r.nome}`).includes(q));
    const locais = Torneios.porLocal(regs);
    const porCriador = {};
    for (const r of regs) (porCriador[r.cpf] ||= { nome: r.nome, cidade: r.cidade, n: 0, torneios: 0, locais: new Set() }).n++,
      r.tipo === 'torneio' && porCriador[r.cpf].torneios++, r.local && porCriador[r.cpf].locais.add(semAccLocal(r.local));
    $('#t-tot').innerHTML = `<b>${regs.length}</b> registro(s), <b>${locais.length}</b> local(is), <b>${locais.filter(l => l.provavelTorneio).length}</b> provável(is) ponto(s) de torneio`;
    $('#t-corpo').innerHTML = `
      <div class="card"><h2>Locais mais visados</h2>
        ${!locais.length ? '<p class="muted peq">Nenhum registro no período. Registre nas observações do criador ou importe relatórios com licença de transporte.</p>'
          : locais.map(l => `<details class="t-local"><summary><b>${esc(l.local)}</b> ${l.provavelTorneio ? '<span class="tag alerta">provável torneio</span>' : '<span class="tag">transporte</span>'}
              <span class="muted peq">${l.registros.length} registro(s) · ${l.criadores.length} criador(es) · ${l.datas.length} data(s)</span></summary>
            <div class="peq">${l.registros.slice().sort((a, b) => b.data.localeCompare(a.data)).map(r => `${fmtBr(r.data) || 's/ data'} — <a href="#/c/${r.cpf}">${esc(r.nome)}</a> <span class="muted">(${esc(r.tipo)}, ${esc(r.fonte)})</span>${r.anilhas?.length ? ' · ' + esc(r.anilhas.join(', ')) : ''}</div>`).join('')}</div></details>`).join('')}</div>
      <div class="card"><h2>Criadores que mais transportam</h2>
        ${!Object.keys(porCriador).length ? '<p class="muted peq">Sem registros.</p>' : `<div class="tabela"><table><thead><tr><th>Criador</th><th>Cidade</th><th>Registros</th><th>Torneios</th><th>Locais</th></tr></thead><tbody>
          ${Object.entries(porCriador).sort((a, b) => b[1].n - a[1].n).slice(0, 100).map(([cpf, x]) => `<tr><td><a href="#/c/${cpf}">${esc(x.nome)}</a></td><td>${esc(x.cidade)}</td><td>${x.n}</td><td>${x.torneios}</td><td>${x.locais.size}</td></tr>`).join('')}
          </tbody></table></div>`}</div>`;
  };
  $('#t-anos').onchange = e => { filtroTorn.anos = +e.target.value; telaTorneios(); };
  $('#t-cid').onchange = e => { filtroTorn.municipio = e.target.value; desenhar(); };
  $('#t-q').oninput = e => { filtroTorn.q = e.target.value; desenhar(); };
  desenhar();
}
const semAccLocal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

globalThis.telaTorneios = telaTorneios;
})();
