const { parseRelatorio, serializar, resumo, soDigitos } = window.Parser;

// ---------- utilitários ----------
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fmtCpf = c => c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c;
const agora = () => new Date().toISOString();
const fmtDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
// Converte em blocos: espalhar o array inteiro em fromCharCode estoura a pilha com bases grandes.
const b64 = buf => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const STATUS = { '': 'Não visitado', regular: 'Visitado: regular', irregular: 'Visitado: irregular', naoloc: 'Não localizado' };

// ---------- armazenamento criptografado (IndexedDB + AES-GCM) ----------
// Cada criador é um registro cifrado separado: salvar uma anotação regrava só aquele criador.
// "meta" guarda o salt e as configurações (cifradas), e serve para conferir a senha.
function idb() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('fiscal-passeriformes', 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
      r.result.createObjectStore('criadores');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
async function tx(loja, modo, fn) {
  const d = await idb();
  return new Promise((ok, erro) => {
    const t = d.transaction(loja, modo);
    const r = fn(t.objectStore(loja));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => erro(t.error);
  });
}
const apagarTudo = () => new Promise(ok => {
  const r = indexedDB.deleteDatabase('fiscal-passeriformes');
  r.onsuccess = r.onerror = r.onblocked = () => ok();
});

async function derivar(senha, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function cifrar(chave, salt, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(JSON.stringify(obj)));
  return { app: 'fiscal-passeriformes', v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
async function decifrar(chave, cofre) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(cofre.iv) }, chave, unb64(cofre.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

let chave = null, salt = null, db = null;
const sujos = new Set(); // CPFs alterados desde o último salvamento
async function salvar() {
  const lote = [...sujos];
  sujos.clear();
  const meta = await cifrar(chave, salt, { cfg: db.cfg });
  const regs = await Promise.all(lote.map(async cpf => [cpf, await cifrar(chave, salt, db.criadores[cpf])]));
  await tx('criadores', 'readwrite', s => regs.forEach(([cpf, v]) => s.put(v, cpf)));
  await tx('kv', 'readwrite', s => s.put(meta, 'meta'));
}
async function carregar(meta) {
  db = { cfg: (await decifrar(chave, meta)).cfg, criadores: {} };
  const d = await idb();
  const pares = await new Promise((ok, erro) => {
    const out = [], r = d.transaction('criadores').objectStore('criadores').openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return ok(out); out.push([c.key, c.value]); c.continue(); };
    r.onerror = () => erro(r.error);
  });
  for (const [cpf, v] of pares) db.criadores[cpf] = await decifrar(chave, v);
}

// ---------- tela de senha ----------
async function telaSenha() {
  const meta = await tx('kv', 'readonly', s => s.get('meta'));
  const antigo = meta ? null : await tx('kv', 'readonly', s => s.get('cofre')); // formato da v1.0 a v1.2
  const existe = meta || antigo;
  app.innerHTML = `<div class="card centro">
    <h1>${existe ? 'Desbloquear' : 'Criar senha'}</h1>
    <p class="muted peq">${existe ? 'Os dados ficam criptografados neste aparelho.'
      : 'Os dados ficam só neste aparelho, criptografados com esta senha. Sem ela não há como recuperar.'}</p>
    <form id="f">
      <label for="s1">Senha</label><input id="s1" type="password" autocomplete="current-password" required minlength="6">
      ${existe ? '' : '<label for="s2">Repita a senha</label><input id="s2" type="password" required minlength="6">'}
      <p><button>${existe ? 'Entrar' : 'Criar'}</button></p>
      <p id="m" class="msg erro"></p>
    </form>
    ${existe ? '<p class="peq"><a href="#" id="esqueci">Esqueci a senha (apaga tudo)</a></p>' : ''}
  </div>`;
  $('#s1').focus();
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const s1 = $('#s1').value;
    try {
      if (existe) {
        salt = unb64(existe.salt);
        chave = await derivar(s1, salt);
        if (meta) await carregar(meta);
        else {
          db = await decifrar(chave, antigo);
          Object.keys(db.criadores).forEach(cpf => sujos.add(cpf));
          await salvar();
          await tx('kv', 'readwrite', s => s.delete('cofre'));
        }
      } else {
        if (s1 !== $('#s2').value) throw new Error('As senhas não conferem.');
        salt = crypto.getRandomValues(new Uint8Array(16));
        chave = await derivar(s1, salt);
        db = { cfg: { idadeMax: 20, anosSemMov: 10 }, criadores: {} };
        await salvar();
      }
      $('#nav').hidden = false;
      rotear();
    } catch (err) {
      chave = null;
      $('#m').textContent = err.message?.includes('conferem') ? err.message : 'Senha incorreta.';
    }
  };
  $('#esqueci')?.addEventListener('click', async e => {
    e.preventDefault();
    if (confirm('Apagar todos os dados deste aparelho?')) { await apagarTudo(); location.reload(); }
  });
}

// ---------- lista ----------
const filtro = { q: '', cidade: '', status: '' };
let rolagem = 0;

function resumoDe(c) { return c.rel ? resumo(c.rel, db.cfg) : null; }

function telaLista() {
  const todos = Object.values(db.criadores).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!todos.length) {
    app.innerHTML = `<div class="card"><h1>Nenhum criador ainda</h1>
      <p>Importe a planilha de criadores e os relatórios gerais do SISPASS em <a href="#/dados">Dados</a>.</p></div>`;
    return;
  }
  const cidades = [...new Set(todos.map(c => c.cidade).filter(Boolean))].sort();
  app.innerHTML = `
    <div class="filtros">
      <input id="q" type="search" placeholder="Nome, CPF, registro, anilha ou endereço" value="${esc(filtro.q)}">
      <select id="cidade"><option value="">Todas as cidades</option>
        ${cidades.map(c => `<option ${c === filtro.cidade ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="status">
        ${[['', 'Todos'], ['semrel', 'Sem relatório'], ['alerta', 'Com alerta'], ['ocorr', 'Com fuga/roubo/óbito'],
           ['pendente', 'Não visitados'], ['visitado', 'Visitados']]
          .map(([v, t]) => `<option value="${v}" ${v === filtro.status ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <p id="cont" class="muted peq"></p>
    <ul id="lista" class="lista card" style="padding:0"></ul>`;
  const desenhar = () => {
    const q = norm(filtro.q), qd = soDigitos(filtro.q);
    const vis = todos.filter(c => {
      if (filtro.cidade && c.cidade !== filtro.cidade) return false;
      const r = resumoDe(c);
      if (filtro.status === 'semrel' && c.rel) return false;
      if (filtro.status === 'alerta' && !r?.alertas.length) return false;
      if (filtro.status === 'ocorr' && !r?.ocorrencias.length) return false;
      if (filtro.status === 'pendente' && c.fisc?.status) return false;
      if (filtro.status === 'visitado' && !c.fisc?.status) return false;
      if (!q) return true;
      if (qd.length >= 3 && (c.cpf.includes(qd) || String(c.registro).includes(qd))) return true;
      const anilhas = c.rel?.secoes.Plantel?.map(a => a['Código anilha']).join(' ') || '';
      return norm(`${c.nome} ${c.endereco} ${c.bairro} ${anilhas}`).includes(q);
    });
    $('#cont').textContent = `${vis.length} de ${todos.length} criadores`;
    $('#lista').innerHTML = vis.map(c => {
      const r = resumoDe(c);
      const tags = [
        r ? `<span class="tag">${r.ativas} ave(s) ativa(s)</span>` : '<span class="tag aviso">sem relatório</span>',
        r?.alertas.length ? `<span class="tag alerta">${r.alertas.length} alerta(s)</span>` : '',
        r?.ocorrencias.length ? `<span class="tag alerta">${r.ocorrencias.length} fuga/roubo/óbito</span>` : '',
        c.fisc?.status ? `<span class="tag ${c.fisc.status === 'irregular' ? 'alerta' : 'ok'}">${STATUS[c.fisc.status]}</span>` : '',
      ].join('');
      return `<li><a href="#/c/${c.cpf}"><div class="nome">${esc(c.nome)}</div>
        <div class="muted peq">${esc(fmtCpf(c.cpf))} · Reg. ${esc(c.registro)} · ${esc(c.cidade)}${c.bairro ? ' · ' + esc(c.bairro) : ''}</div>
        <div>${tags}</div></a></li>`;
    }).join('');
  };
  $('#q').oninput = e => { filtro.q = e.target.value; desenhar(); };
  $('#cidade').onchange = e => { filtro.cidade = e.target.value; desenhar(); };
  $('#status').onchange = e => { filtro.status = e.target.value; desenhar(); };
  desenhar();
  window.scrollTo(0, rolagem);
}

// ---------- ficha ----------
function tabela(rows, cols) {
  if (!rows?.length) return '<p class="muted peq">Nenhum registro.</p>';
  cols ||= [...new Set(rows.flatMap(Object.keys))].filter(k => !k.startsWith('_'));
  return `<div class="tabela"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r => `<tr class="${/^inativ/i.test(r['Situação'] || '') ? 'inativa' : ''}">${cols.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}
const COLS_PLANTEL = ['Situação', 'Nome Popular', 'Espécie', 'Sexo', 'Nascimento', 'Código anilha', 'Diâmetro anilha', 'Marcação', 'ULTIMA_OPERACAO', 'DATA_OPERACAO'];
const PRINCIPAIS = ['Dados do Criador', 'Plantel', 'Histórico de Operações'];

function telaFicha(cpf) {
  const c = db.criadores[cpf];
  if (!c) { app.innerHTML = '<div class="card">Criador não encontrado. <a href="#/">Voltar</a></div>'; return; }
  const r = resumoDe(c);
  const end = [c.endereco, c.bairro, c.cidade, 'RS'].filter(Boolean).join(', ');
  const outras = c.rel ? Object.entries(c.rel.secoes).filter(([t]) => !PRINCIPAIS.includes(t)) : [];
  app.innerHTML = `
    <p><a href="#/">← Criadores</a></p>
    <div class="card">
      <h1>${esc(c.nome)}</h1>
      <div class="grade">
        <div><span>CPF</span>${esc(fmtCpf(c.cpf))}</div>
        <div><span>Registro</span>${esc(c.registro)}</div>
        <div><span>Cidade</span>${esc(c.cidade)}</div>
        <div><span>Bairro</span>${esc(c.bairro)}</div>
      </div>
      <p><span class="muted peq">Endereço</span><br>${esc(c.endereco)}</p>
      ${c.rel && norm(c.rel.criador.endereco) !== norm(c.endereco) ? `<p class="peq"><span class="muted">Endereço no SISPASS:</span> ${esc(c.rel.criador.endereco)}, ${esc(c.rel.criador.bairro)}, ${esc(c.rel.criador.municipio)}</p>` : ''}
      <div class="linha">
        <a class="btn sec" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}">Abrir no mapa</a>
        <button class="sec" id="copiar" type="button">Copiar CPF</button>
      </div>
    </div>

    <div class="card">
      <h2>Fiscalização</h2>
      <label for="st">Situação</label>
      <select id="st">${Object.entries(STATUS).map(([v, t]) => `<option value="${v}" ${v === (c.fisc?.status || '') ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label for="obs">Observações</label>
      <textarea id="obs">${esc(c.fisc?.obs)}</textarea>
      <div class="linha" style="margin-top:8px"><button id="salvar" type="button">Salvar</button>
        <span id="salvo" class="muted peq">${c.fisc?.atualizadoEm ? 'Atualizado em ' + fmtDH(c.fisc.atualizadoEm) : ''}</span></div>
    </div>

    ${!r ? `<div class="card"><h2>Sem relatório do SISPASS</h2>
      <p class="muted">Gere o relatório geral deste CPF no SISPASS e importe em <a href="#/dados">Dados</a>.</p></div>` : `
    <div class="card">
      <h2>Resumo do SISPASS</h2>
      <div class="grade">
        <div><span>Aves ativas</span>${r.ativas} de ${r.total}</div>
        <div><span>Última licença (validade)</span>${esc(r.ultimaLicenca || '—')}</div>
        <div><span>Última operação</span>${esc(r.ultimaOperacao || '—')}</div>
        <div><span>Relatório importado</span>${fmtDH(c.rel.importadoEm)}</div>
      </div>
      ${r.alertas.map(a => `<div class="alerta-box">${esc(a.texto)}</div>`).join('')}
    </div>
    <div class="card"><h2>Plantel</h2>${tabela(c.rel.secoes.Plantel, COLS_PLANTEL)}</div>
    <div class="card"><h2>Fugas, roubos/furtos e óbitos</h2>${tabela(r.ocorrencias)}</div>
    <div class="card"><h2>Histórico de operações</h2>${tabela(c.rel.secoes['Histórico de Operações'])}</div>
    <div class="card"><h2>Outras seções do relatório</h2>
      ${outras.map(([t, rows]) => `<details><summary>${esc(t)} <span class="muted peq">(${rows.length})</span></summary>${tabela(rows)}</details>`).join('')}
    </div>`}`;
  $('#copiar').onclick = async () => {
    try { await navigator.clipboard.writeText(c.cpf); $('#copiar').textContent = 'CPF copiado'; } catch { $('#copiar').textContent = c.cpf; }
  };
  $('#salvar').onclick = async () => {
    c.fisc = { status: $('#st').value, obs: $('#obs').value, atualizadoEm: agora() };
    sujos.add(c.cpf);
    await salvar();
    $('#salvo').textContent = 'Salvo em ' + fmtDH(c.fisc.atualizadoEm);
  };
  window.scrollTo(0, 0);
}

// ---------- importação ----------
const chaveCol = s => norm(s).replace(/[^a-z]/g, '');

function importarPlanilha(buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  if (wb.Sheets.Criadores && wb.Sheets._relatorios) return restaurarPlanilha(wb);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
  let novos = 0, atualizados = 0;
  for (const linha of rows) {
    const l = Object.fromEntries(Object.entries(linha).map(([k, v]) => [chaveCol(k), String(v).trim()]));
    const cpf = soDigitos(l.cpf);
    if (cpf.length !== 11) continue;
    const base = { cpf, registro: l.registro || l.cadastro || '', nome: l.criador || l.nome || '',
      bairro: l.bairro || '', endereco: l.endereco || '', cidade: l.cidade || l.municipio || '' };
    const atual = db.criadores[cpf];
    if (atual) { Object.assign(atual, base); atualizados++; } else { db.criadores[cpf] = { ...base, rel: null, fisc: null }; novos++; }
    sujos.add(cpf);
  }
  return `${novos} criador(es) novo(s), ${atualizados} atualizado(s).`;
}

function importarRelatorio(texto) {
  const rel = parseRelatorio(texto);
  const d = rel.criador;
  db.criadores[rel.cpf] ||= { cpf: rel.cpf, registro: d.cadastro, nome: d.nome, bairro: d.bairro,
    endereco: d.endereco, cidade: d.municipio.replace(/\/RS$/i, ''), rel: null, fisc: null };
  db.criadores[rel.cpf].rel = { importadoEm: agora(), criador: d, secoes: rel.secoes };
  sujos.add(rel.cpf);
  return db.criadores[rel.cpf].nome;
}

// ---------- planilha de recuperação ----------
const PARTE = 30000; // limite de caracteres por célula do Excel é 32.767
const comCriador = (c, rows) => (rows || []).map(r => {
  const { _secao, ...resto } = r;
  return { CPF: fmtCpf(c.cpf), Criador: c.nome, ...(_secao ? { 'Seção': _secao } : {}), ...resto };
});

function exportarPlanilha() {
  const todos = Object.values(db.criadores).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const criadores = todos.map(c => {
    const r = resumoDe(c);
    return {
      CPF: fmtCpf(c.cpf), Registro: String(c.registro), Nome: c.nome, Cidade: c.cidade, Bairro: c.bairro, 'Endereço': c.endereco,
      'Situação fiscalização': STATUS[c.fisc?.status || ''], 'Observações': c.fisc?.obs || '', 'Atualizado em': c.fisc?.atualizadoEm || '',
      'Relatório importado em': c.rel?.importadoEm || '', 'Aves ativas': r ? r.ativas : '', 'Total de aves': r ? r.total : '',
      'Alertas': r ? r.alertas.map(a => a.texto).join(' | ') : '', 'Fugas/roubos/óbitos': r ? r.ocorrencias.length : '',
      'Última licença': r?.ultimaLicenca || '', 'Última operação': r?.ultimaOperacao || '',
    };
  });
  const comRel = todos.filter(c => c.rel);
  const relatorios = comRel.map(c => {
    const texto = serializar(c.rel.secoes), linha = { CPF: fmtCpf(c.cpf), 'Importado em': c.rel.importadoEm };
    for (let i = 0; i * PARTE < texto.length; i++) linha[`Parte ${i + 1}`] = texto.slice(i * PARTE, (i + 1) * PARTE);
    return linha;
  });
  const wb = XLSX.utils.book_new();
  const aba = (nome, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), nome);
  aba('Criadores', criadores);
  aba('Plantel', comRel.flatMap(c => comCriador(c, c.rel.secoes.Plantel)));
  aba('Fugas-Roubos-Óbitos', comRel.flatMap(c => comCriador(c, resumoDe(c).ocorrencias)));
  aba('Histórico', comRel.flatMap(c => comCriador(c, c.rel.secoes['Histórico de Operações'])));
  aba('_relatorios', relatorios);
  XLSX.writeFile(wb, `fiscal-passeriformes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return `Planilha exportada: ${todos.length} criadores, ${comRel.length} com relatório.`;
}

function restaurarPlanilha(wb) {
  const ler = nome => XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: '', raw: false });
  const statusDe = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k]));
  const outro = { criadores: {} };
  for (const l of ler('Criadores')) {
    const cpf = soDigitos(l.CPF);
    if (cpf.length !== 11) continue;
    const status = statusDe[l['Situação fiscalização']] || '';
    outro.criadores[cpf] = { cpf, registro: l.Registro, nome: l.Nome, cidade: l.Cidade, bairro: l.Bairro, endereco: l['Endereço'], rel: null,
      fisc: status || l['Observações'] ? { status, obs: l['Observações'], atualizadoEm: l['Atualizado em'] } : null };
  }
  for (const l of ler('_relatorios')) {
    const texto = Object.keys(l).filter(k => k.startsWith('Parte ')).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6))).map(k => l[k]).join('');
    const rel = parseRelatorio(texto);
    outro.criadores[rel.cpf] ||= { cpf: rel.cpf, registro: rel.criador.cadastro, nome: rel.criador.nome, bairro: rel.criador.bairro,
      endereco: rel.criador.endereco, cidade: rel.criador.municipio.replace(/\/RS$/i, ''), rel: null, fisc: null };
    outro.criadores[rel.cpf].rel = { importadoEm: l['Importado em'], criador: rel.criador, secoes: rel.secoes };
  }
  return `Planilha de recuperação importada: ${mesclar(outro)} alteração(ões).`;
}

async function lerTexto(arquivo) {
  const buf = await arquivo.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

function mesclar(outro) {
  let n = 0;
  for (const [cpf, b] of Object.entries(outro.criadores || {})) {
    const a = db.criadores[cpf];
    if (!a) { db.criadores[cpf] = b; sujos.add(cpf); n++; continue; }
    if (b.rel && (!a.rel || b.rel.importadoEm > a.rel.importadoEm)) { a.rel = b.rel; sujos.add(cpf); n++; }
    if (b.fisc && (!a.fisc || b.fisc.atualizadoEm > a.fisc.atualizadoEm)) { a.fisc = b.fisc; sujos.add(cpf); n++; }
  }
  return n;
}

function telaDados() {
  const lista = Object.values(db.criadores);
  const comRel = lista.filter(c => c.rel).length;
  app.innerHTML = `
    <div class="card"><h1>Dados</h1>
      <p class="muted">${lista.length} criadores · ${comRel} com relatório · ${lista.length - comRel} sem relatório</p></div>

    <div class="card"><h2>1. Planilha de criadores (.xlsx ou .csv)</h2>
      <p class="muted peq">Colunas esperadas: REGISTRO, CPF, CRIADOR, BAIRRO, ENDEREÇO, Cidade. Não apaga relatórios nem anotações. Também aceita a planilha exportada pelo app (item 3) para recuperar os dados.</p>
      <input type="file" id="f-planilha" accept=".xlsx,.xls,.csv">
      <p id="m-planilha" class="msg"></p></div>

    <div class="card"><h2>2. Relatórios gerais do SISPASS</h2>
      <p class="muted peq">Selecione um ou vários arquivos .txt, ou cole o texto do relatório abaixo. O criador é identificado pelo CPF.</p>
      <div id="fila" class="card" style="background:var(--bg)"></div>
      <input type="file" id="f-rel" accept=".txt,text/plain" multiple>
      <label for="t-rel">Ou cole o relatório</label>
      <textarea id="t-rel" placeholder="Cole aqui o relatório geral copiado do SISPASS"></textarea>
      <p><button id="b-colar" type="button">Importar texto colado</button></p>
      <p id="m-rel" class="msg"></p></div>

    <div class="card"><h2>3. Backup, planilha e sincronização</h2>
      <p class="muted peq"><b>Planilha (.xlsx):</b> criadores, plantel, fugas/roubos/óbitos e histórico, legível no Excel. Guarda também os relatórios completos na aba _relatorios, para recuperar tudo importando a planilha no item 1. Atenção: a planilha não é criptografada.</p>
      <div class="linha"><button id="b-xlsx" type="button">Exportar planilha</button></div>
      <p id="m-xlsx" class="msg"></p>
      <p class="muted peq"><b>Backup criptografado (.json):</b> o backup sai criptografado com a sua senha atual. No outro aparelho, importe o arquivo: os dados são mesclados (vale o relatório e a anotação mais recentes de cada criador).</p>
      <div class="linha"><button id="b-exp" type="button">Exportar backup</button>
        <label class="btn sec" style="margin:0">Importar backup<input type="file" id="f-bak" accept=".json,application/json" hidden></label></div>
      <p id="m-bak" class="msg"></p></div>

    <div class="card"><h2>4. Alertas</h2>
      <div class="grade">
        <div><label for="c-idade">Ave ativa com mais de (anos)</label><input id="c-idade" type="number" min="1" value="${db.cfg.idadeMax}"></div>
        <div><label for="c-mov">Sem operações há mais de (anos)</label><input id="c-mov" type="number" min="1" value="${db.cfg.anosSemMov}"></div>
      </div>
      <p><button id="b-cfg" type="button">Salvar alertas</button> <span id="m-cfg" class="muted peq"></span></p></div>

    <div class="card"><h2>Apagar</h2>
      <p class="muted peq">Remove todos os dados deste aparelho. Exporte um backup antes.</p>
      <button class="perigo" id="b-apagar" type="button">Apagar todos os dados</button></div>`;

  const desenharFila = () => {
    const pend = Object.values(db.criadores).filter(c => !c.rel && (!filtro.cidade || c.cidade === filtro.cidade))
      .sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
    const c = pend[0];
    $('#fila').innerHTML = !c ? `<b>Nenhum criador sem relatório${filtro.cidade ? ' em ' + esc(filtro.cidade) : ''}.</b>` : `
      <span class="muted peq">Próximo sem relatório (faltam ${pend.length}${filtro.cidade ? ' em ' + esc(filtro.cidade) : ''})</span>
      <div class="nome"><b>${esc(c.nome)}</b></div>
      <div class="linha"><span>${esc(fmtCpf(c.cpf))} · ${esc(c.cidade)}</span>
        <button class="sec" id="b-fila-cpf" type="button">Copiar CPF</button></div>`;
    $('#b-fila-cpf')?.addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(c.cpf); e.target.textContent = 'CPF copiado'; } catch { e.target.textContent = c.cpf; }
    });
  };
  desenharFila();
  const msg = (id, t, erro) => { const m = $(id); m.textContent = t; m.className = 'msg' + (erro ? ' erro' : ''); };

  $('#f-planilha').onchange = async e => {
    try { const t = importarPlanilha(await e.target.files[0].arrayBuffer()); await salvar(); msg('#m-planilha', t); }
    catch (err) { msg('#m-planilha', 'Erro ao ler a planilha: ' + err.message, true); }
    e.target.value = '';
  };
  $('#f-rel').onchange = async e => {
    const ok = [], falhas = [];
    for (const f of e.target.files) {
      try { ok.push(importarRelatorio(await lerTexto(f))); } catch (err) { falhas.push(`${f.name}: ${err.message}`); }
    }
    if (ok.length) await salvar();
    desenharFila();
    msg('#m-rel', `${ok.length} relatório(s) importado(s).${falhas.length ? ' Falhas: ' + falhas.join(' | ') : ''}`, falhas.length && !ok.length);
    e.target.value = '';
  };
  $('#b-colar').onclick = async () => {
    try { const nome = importarRelatorio($('#t-rel').value); await salvar(); $('#t-rel').value = ''; msg('#m-rel', `Relatório de ${nome} importado.`); desenharFila(); }
    catch (err) { msg('#m-rel', err.message, true); }
  };
  $('#b-xlsx').onclick = () => {
    try { msg('#m-xlsx', exportarPlanilha()); } catch (err) { msg('#m-xlsx', 'Erro ao exportar: ' + err.message, true); }
  };
  $('#b-exp').onclick = async () => {
    const blob = new Blob([JSON.stringify(await cifrar(chave, salt, db))], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob),
      download: `backup-passeriformes-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
    msg('#m-bak', 'Backup exportado.');
  };
  $('#f-bak').onchange = async e => {
    try {
      const cofre = JSON.parse(await e.target.files[0].text());
      if (cofre.app !== 'fiscal-passeriformes') throw new Error('Arquivo não é um backup deste app.');
      const senha = prompt('Senha usada no aparelho que gerou o backup:');
      if (!senha) return;
      let outro;
      try { outro = await decifrar(await derivar(senha, unb64(cofre.salt)), cofre); } catch { throw new Error('Senha do backup incorreta.'); }
      const n = mesclar(outro);
      await salvar();
      msg('#m-bak', `Backup mesclado (${n} alteração(ões)).`);
    } catch (err) { msg('#m-bak', err.message, true); }
    e.target.value = '';
  };
  $('#b-cfg').onclick = async () => {
    db.cfg.idadeMax = Math.max(1, +$('#c-idade').value || 20);
    db.cfg.anosSemMov = Math.max(1, +$('#c-mov').value || 10);
    await salvar();
    $('#m-cfg').textContent = 'Salvo.';
  };
  $('#b-apagar').onclick = async () => {
    if (confirm('Apagar todos os dados deste aparelho?')) { await apagarTudo(); location.reload(); }
  };
}

// ---------- roteamento e bloqueio ----------
function rotear() {
  if (!db) return telaSenha();
  const h = location.hash;
  if (h.startsWith('#/c/')) return telaFicha(h.slice(4));
  if (h === '#/dados') return telaDados();
  return telaLista();
}
window.addEventListener('hashchange', rotear);
window.addEventListener('click', e => {
  if (e.target.closest?.('#lista a')) rolagem = window.scrollY;
});
$('#btn-bloquear').onclick = () => location.reload();

let escondidoEm = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) escondidoEm = Date.now();
  else if (db && escondidoEm && Date.now() - escondidoEm > 5 * 60e3) location.reload();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js');
rotear();
