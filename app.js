const { nomeProprio, parseRelatorio, serializar, resumo, soDigitos, vinculos, chaveAnilha, normNome, obitos, idadesPorEspecie } = window.Parser;

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

const INDICIOS = { zerado: 'plantel zerado com movimentação', saidaRapida: 'ave recebida e logo baixada', semDestino: 'ave recebida sem destino',
  fugas: 'fugas repetidas', movAlta: 'movimentação alta', semLicenca: 'operação sem licença' };

// ---------- armazenamento criptografado (IndexedDB + AES-GCM) ----------
// Cada criador é um registro cifrado separado: salvar uma anotação regrava só aquele criador.
// "meta" guarda o salt e as configurações (cifradas), e serve para conferir a senha.
function idb() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('fiscal-passeriformes', 3);
    r.onupgradeneeded = () => {
      for (const loja of ['kv', 'criadores', 'abordagens']) if (!r.result.objectStoreNames.contains(loja)) r.result.createObjectStore(loja);
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
const sujosAb = new Set(); // abordagens alteradas ou excluídas
async function salvar() {
  versao++;
  const lote = [...sujos], loteAb = [...sujosAb];
  sujos.clear(); sujosAb.clear();
  for (const cpf of lote) revCriador.set(cpf, (revCriador.get(cpf) || 0) + 1); // invalida só os criadores alterados
  if (idxSujo) { revIdx++; cacheIdx = null; idxSujo = false; } // relatório ou endereço mudou: índices e todos os estados
  const meta = await cifrar(chave, salt, { cfg: db.cfg });
  const regs = await Promise.all(lote.map(async cpf => [cpf, await cifrar(chave, salt, db.criadores[cpf])]));
  const regsAb = await Promise.all(loteAb.map(async id => [id, db.abordagens[id] ? await cifrar(chave, salt, db.abordagens[id]) : null]));
  await tx('criadores', 'readwrite', s => regs.forEach(([cpf, v]) => s.put(v, cpf)));
  if (regsAb.length) await tx('abordagens', 'readwrite', s => regsAb.forEach(([id, v]) => v ? s.put(v, id) : s.delete(id)));
  await tx('kv', 'readwrite', s => s.put(meta, 'meta'));
  marcarNav();
}
async function lerLoja(loja) {
  const d = await idb();
  return new Promise((ok, erro) => {
    const out = [], r = d.transaction(loja).objectStore(loja).openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return ok(out); out.push([c.key, c.value]); c.continue(); };
    r.onerror = () => erro(r.error);
  });
}
async function carregar(meta) {
  db = { cfg: (await decifrar(chave, meta)).cfg, criadores: {}, abordagens: {} };
  // Descriptografa em paralelo (antes era um a um, lento com muitos relatórios).
  const [cri, abs] = await Promise.all([lerLoja('criadores'), lerLoja('abordagens')]);
  (await Promise.all(cri.map(async ([cpf, v]) => [cpf, await decifrar(chave, v)]))).forEach(([cpf, c]) => db.criadores[cpf] = c);
  (await Promise.all(abs.map(async ([id, v]) => [id, await decifrar(chave, v)]))).forEach(([id, a]) => db.abordagens[id] = a);
  for (const c of Object.values(db.criadores)) if (migrar(c)) sujos.add(c.cpf);
  if (sujos.size) await salvar();
}

// ---------- tela de senha ----------
async function telaSenha() {
  const meta = await tx('kv', 'readonly', s => s.get('meta'));
  const antigo = meta ? null : await tx('kv', 'readonly', s => s.get('cofre')); // formato da v1.0 a v1.2
  const existe = meta || antigo;
  app.innerHTML = `<div class="card centro">
    <h1>${existe ? 'Desbloquear' : 'Criar senha'}</h1>
    <p class="muted peq">${existe ? 'Seus dados estão criptografados neste aparelho.'
      : 'Seus dados ficam só neste aparelho. Esta senha protege os dados. Sem a senha, você não recupera os dados.'}</p>
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
    mostrarCarregando(true); // derivar a chave e abrir os dados pode demorar
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // deixa o passarinho aparecer
    try {
      if (existe) {
        salt = unb64(existe.salt);
        chave = await derivar(s1, salt);
        if (meta) await carregar(meta);
        else {
          db = await decifrar(chave, antigo);
          db.abordagens ||= {};
          Object.values(db.criadores).forEach(migrar);
          Object.keys(db.criadores).forEach(cpf => sujos.add(cpf));
          await salvar();
          await tx('kv', 'readwrite', s => s.delete('cofre'));
        }
      } else {
        if (s1 !== $('#s2').value) throw new Error('As senhas não conferem.');
        salt = crypto.getRandomValues(new Uint8Array(16));
        chave = await derivar(s1, salt);
        db = { cfg: { idadeMax: 20, anosSemMov: 10 }, criadores: {}, abordagens: {} };
        await salvar();
      }
      $('#nav').hidden = false;
      rotear();
    } catch (err) {
      chave = null;
      $('#m').textContent = err.message?.includes('conferem') ? err.message : 'Senha incorreta.';
    } finally {
      mostrarCarregando(false);
    }
  };
  $('#esqueci')?.addEventListener('click', async e => {
    e.preventDefault();
    if (confirm('Apagar todos os dados deste aparelho?')) { await apagarTudo(); location.reload(); }
  });
}

// ---------- lista ----------
const FILTROS = [['', 'Todos'], ['abertos', 'Com pendência em aberto'], ['ameacadas', 'Com ave ameaçada'], ['naofisc', 'Não fiscalizados no período'],
  ['fisc', 'Fiscalizados no período'], ['irregular', 'Última vistoria irregular'], ['naoloc', 'Não localizados'], ['suspensa', 'Licença suspensa por você'],
  ['ctf', 'CTF cancelado'], ['licenca', 'Licença do período irregular'], ['semrel', 'Sem relatório'], ['ocorr', 'Com fuga/roubo/óbito'],
  ['vinculo', 'Com e-mail/telefone compartilhado'], ['F', 'Titular mulher'], ['M', 'Titular homem'], ['fachada', 'Titular não maneja as aves'],
  ...Object.entries(INDICIOS).filter(([k]) => !['zerado', 'fugas'].includes(k)).map(([k, t]) => ['ind:' + k, 'Indício: ' + t])];
function passaFiltro(c, f) {
  const e = estado(c);
  switch (f) {
    case 'abertos': return e.abertos.length > 0;
    case 'ameacadas': return e.ameacadas.length > 0;
    case 'naofisc': return !e.fiscalizado;
    case 'fisc': return e.fiscalizado;
    case 'irregular': return e.ultima?.resultado === 'irregular';
    case 'naoloc': return e.ultima?.resultado === 'naoloc';
    case 'suspensa': return Object.keys(c.acoes || {}).some(k => k.startsWith('suspender:'));
    case 'ctf': return e.ctf?.status === 'cancelado';
    case 'licenca': return !!e.lic && e.lic.status !== 'regular';
    case 'semrel': return !c.rel;
    case 'ocorr': return !!e.r?.ocorrencias.length;
    case 'vinculo': return e.vinc.email.length > 0 || e.vinc.fone.length > 0;
    case 'F': case 'M': return e.sexo.valor === f;
    case 'fachada': return e.vistorias.some(v => v.maneja === 'outro');
    default: return f.startsWith('ind:') ? e.itens.some(i => i.id === f && i.aberto) : f.startsWith('item:') ? e.abertos.some(i => chaveItem(i) === f.slice(5)) : true;
  }
}
const filtro = { q: '', cidade: '', status: '' };
let rolagem = 0;

function resumoDe(c) { return c.rel ? resumo(c.rel, db.cfg) : null; }

// CPFs da última lista exibida, na ordem, para navegar entre fichas (anterior/próximo).
let sequencia = [];
function telaLista() {
  const todos = Object.values(db.criadores).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!todos.length) {
    app.innerHTML = `<div class="card"><h1>Nenhum criador ainda</h1>
      <p>Importe a planilha de criadores e os relatórios gerais do SISPASS em <a href="#/dados">Dados</a>.</p></div>`;
    return;
  }
  const especies = [...new Set(todos.flatMap(c => (c.rel?.secoes.Plantel || []).map(a => a['Nome Popular'])).filter(Boolean))].sort();
  const cidades = [...new Set(todos.map(c => c.cidade).filter(Boolean))].sort();
  app.innerHTML = `
    <div class="tela-lista">
      <div class="lista-topo">
        <div class="filtros">
          <input id="q" type="search" list="especies" placeholder="Nome, CPF, anilha, endereço ou ave (ex.: cardeal-amarelo)" value="${esc(filtro.q)}">
          <datalist id="especies">${especies.map(e => `<option value="${esc(e)}">`).join('')}</datalist>
          <select id="cidade"><option value="">Todas as cidades</option>
            ${cidades.map(c => `<option ${c === filtro.cidade ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <select id="status">
            ${(filtro.status && !FILTROS.some(([v]) => v === filtro.status) ? [[filtro.status, 'Pendência: ' + (ROTULO_ITEM[filtro.status.slice(5)] || filtro.status)], ...FILTROS] : FILTROS)
              .map(([v, t]) => `<option value="${v}" ${v === filtro.status ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <p id="cont" class="muted peq"></p>
      </div>
      <ul id="lista" class="lista card" style="padding:0"></ul>
    </div>`;
  const desenhar = () => {
    const q = norm(filtro.q), qd = soDigitos(filtro.q);
    // Aves ativas cuja espécie (nome popular ou científico) contém o termo buscado.
    const avesDe = c => q.length < 3 ? [] : (c.rel?.secoes.Plantel || [])
      .filter(a => /^ativ/i.test(a['Situação'] || '') && norm(`${a['Nome Popular']} ${a['Espécie']}`).includes(q));
    const vis = todos.filter(c => {
      if (filtro.cidade && c.cidade !== filtro.cidade) return false;
      if (filtro.status && !passaFiltro(c, filtro.status)) return false;
      if (!q) return true;
      if (qd.length >= 3 && (c.cpf.includes(qd) || String(c.registro).includes(qd))) return true;
      const anilhas = c.rel?.secoes.Plantel?.map(a => a['Código anilha']).join(' ') || '';
      return avesDe(c).length > 0 || norm(`${c.nome} ${c.endereco} ${c.bairro} ${anilhas}`).includes(q);
    });
    sequencia = vis.map(c => c.cpf);
    const comAve = vis.filter(c => avesDe(c).length), totalAves = comAve.reduce((n, c) => n + avesDe(c).length, 0);
    $('#cont').innerHTML = `${vis.length} de ${todos.length} criadores` + (totalAves
      ? `<br><b>${comAve.length} criador(es) com ${totalAves} ave(s) ativa(s) de "${esc(filtro.q)}"</b> <span class="muted">(só entre os ${todos.filter(c => c.rel).length} com relatório importado)</span>` : '');
    $('#lista').innerHTML = vis.map(c => {
      const e = estado(c), r = e.r;
      const porEspecie = {};
      for (const a of avesDe(c)) porEspecie[a['Nome Popular']] = (porEspecie[a['Nome Popular']] || 0) + 1;
      const tags = [
        ...Object.entries(porEspecie).map(([e, n]) => `<span class="tag ok"><b>${n}× ${esc(e)}</b></span>`),
        r ? `<span class="tag">${r.ativas} ave(s) ativa(s)</span>` : '<span class="tag aviso">sem relatório</span>',
        e.ameacadas.length ? `<span class="tag ameaca">${e.ameacadas.length} ameaçada(s)</span>` : '',
        e.abertos.length ? `<span class="tag alerta">${e.abertos.length} pendência(s)</span>` : '',
        ctfCanceladoDe(c, e) ? `<span class="tag alerta">CTF cancelado · ${r ? r.ativas + ' ave(s) no plantel' : 'sem relatório'}</span>` : '',
        e.ultima ? `<span class="tag ${e.ultima.resultado === 'irregular' ? 'alerta' : 'ok'}">Vistoria ${Normas.fmt(new Date(e.ultima.data + 'T12:00'))}: ${RESULTADO[e.ultima.resultado]}</span>` : '',
      ].join('');
      return `<li><a href="#/c/${c.cpf}" class="${e.ameacadas.length ? 'ameacado' : ''}"><div class="nome ${ctfCanceladoDe(c, e) ? 'tachado' : ''}">${esc(c.nome)}</div>
        <div class="muted peq">${esc(fmtCpf(c.cpf))} · Reg. ${esc(c.registro)} · ${esc(c.cidade)}${c.bairro ? ' · ' + esc(c.bairro) : ''}</div>
        <div>${tags}</div></a></li>`;
    }).join('');
  };
  $('#q').oninput = e => { filtro.q = e.target.value; desenhar(); };
  $('#cidade').onchange = e => { filtro.cidade = e.target.value; desenhar(); };
  $('#status').onchange = e => { filtro.status = e.target.value; desenhar(); };
  desenhar();
  document.documentElement.style.setProperty('--topo-h', $('.topo').offsetHeight + 'px');
  $('#lista').scrollTop = rolagem;
}

// ---------- ficha ----------
// ---------- cruzamento entre criadores (por nome) e aves (por anilha) ----------
const COLS_NOME = ['Nome do Doador', 'Nome do Receptor', 'Receptor'];
const COLS_ANILHA = ['Código anilha', 'Anilha'];
function indiceNomes() {
  const idx = {};
  for (const c of Object.values(db.criadores)) {
    for (const n of new Set([normNome(c.nome), normNome(c.rel?.criador.nome)])) if (n) (idx[n] ||= []).push(c);
  }
  return idx;
}
let idxNomes = {};
function linkNome(nome) {
  if (!nome) return '';
  const achados = idxNomes[normNome(nome)] || [];
  if (!achados.length) return `${esc(nomeProprio(nome))} <span class="tag">fora da base</span>`;
  return achados.map(c => `<a href="#/c/${c.cpf}">${esc(c.nome)}</a>${achados.length > 1 ? ` <span class="muted peq">(${esc(fmtCpf(c.cpf))})</span>` : ''}`).join('<br>');
}
const linkAnilha = a => a ? `<a href="#/anilha/${encodeURIComponent(chaveAnilha(a))}">${esc(a)}</a>` : '';

function tabela(rows, cols) {
  if (!rows?.length) return '<p class="muted peq">Nenhum registro.</p>';
  cols ||= [...new Set(rows.flatMap(Object.keys))].filter(k => !k.startsWith('_'));
  const celula = (r, c) => c === 'Ameaça' ? (r[c] ? `<span class="tag ameaca">${esc(r[c])}</span>` : '')
    : COLS_NOME.includes(c) ? linkNome(r[c]) : COLS_ANILHA.includes(c) ? linkAnilha(r[c]) : esc(r[c]);
  return `<div class="tabela"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r => `<tr class="${/^inativ/i.test(r['Situação'] || '') ? 'inativa' : ''}">${cols.map(c => `<td>${celula(r, c)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

const obitosDaBase = () => obitos(Object.values(db.criadores).filter(c => c.rel).map(c => ({ cpf: c.cpf, rel: c.rel })));
const fmtIdade = i => i === null ? 'desconhecida' : `${String(i).replace('.', ',')} anos`;
const tabelaObitos = lista => !lista.length ? '<p class="muted peq">Nenhum óbito declarado.</p>' : `
  <div class="tabela"><table><thead><tr><th>Data do óbito</th><th>Criador</th><th>Anilha</th><th>Ave</th><th>Nascimento</th><th>Idade</th></tr></thead><tbody>
  ${lista.map(o => `<tr><td>${esc(o.data)}</td><td><a href="#/c/${o.cpf}">${esc(db.criadores[o.cpf]?.nome)}</a></td><td>${linkAnilha(o.anilha)}</td>
    <td>${esc(o.nomePopular || '?')}${o.especie ? ` <span class="muted">(${esc(o.especie)})</span>` : ''}</td><td>${esc(o.nascimento || '?')}</td><td>${fmtIdade(o.idadeAnos)}</td></tr>`).join('')}
  </tbody></table></div>`;

function telaIdades() {
  const o = obitosDaBase().sort((a, b) => Parser.parseData(b.data) - Parser.parseData(a.data));
  const e = idadesPorEspecie(o);
  const comIdade = o.filter(x => x.idadeAnos !== null);
  const media = comIdade.length ? Math.round(comIdade.reduce((n, x) => n + x.idadeAnos, 0) / comIdade.length * 10) / 10 : null;
  const n = v => v === null ? '—' : String(v).replace('.', ',');
  app.innerHTML = `<div class="card"><h1>Idade das aves no óbito</h1>
      <div class="grade"><div><span>Óbitos declarados</span>${o.length}</div><div><span>Com idade conhecida</span>${comIdade.length}</div>
        <div><span>Idade média geral</span>${media === null ? '—' : fmtIdade(media)}</div>
        <div><span>Criadores com relatório</span>${Object.values(db.criadores).filter(c => c.rel).length}</div></div>
      <p class="peq muted">Calculado só com os relatórios importados. A idade usa o nascimento do Plantel, procurado pela anilha em toda a base; sem nascimento, a ave fica fora da média.</p></div>
    <div class="card"><h2>Por espécie</h2>${!e.length ? '<p class="muted peq">Nenhum óbito declarado.</p>' : `
      <div class="tabela"><table><thead><tr><th>Espécie</th><th>Óbitos</th><th>Com idade</th><th>Média (anos)</th><th>Mín.</th><th>Máx.</th></tr></thead><tbody>
      ${e.map(x => `<tr><td>${esc(x.especie)}</td><td>${x.obitos}</td><td>${x.comIdade}</td><td>${n(x.media)}</td><td>${n(x.min)}</td><td>${n(x.max)}</td></tr>`).join('')}
      </tbody></table></div>`}</div>
    <div class="card"><h2>Óbitos</h2>${tabelaObitos(o)}</div>`;
  window.scrollTo(0, 0);
}

const COLS_DATA = ['Data', 'DATA_OPERACAO', 'Data do Recebimento', 'Data Recebimento', 'Data da Doação'];
function telaAnilha(chave) {
  idxNomes = indiceNomes();
  const regs = [];
  let especie = '', nomeAnilha = '';
  for (const c of Object.values(db.criadores)) {
    for (const [secao, rows] of Object.entries(c.rel?.secoes || {})) {
      for (const r of rows) {
        const col = COLS_ANILHA.find(k => chaveAnilha(r[k]) === chave && r[k]);
        if (!col) continue;
        nomeAnilha ||= r[col];
        if (r['Nome Popular']) especie = `${r['Nome Popular']} (${r['Espécie']})`;
        const data = COLS_DATA.map(k => r[k]).find(v => Parser.parseData(v)) || '';
        const detalhe = r['Operação'] || r['ULTIMA_OPERACAO'] || r['Operação do Receptor'] || '';
        const outro = r['Nome do Doador'] ? `de ${linkNome(r['Nome do Doador'])}` : r['Nome do Receptor'] || r.Receptor ? `para ${linkNome(r['Nome do Receptor'] || r.Receptor)}` : '';
        regs.push({ data, c, secao, detalhe, outro, situacao: r['Situação'] || '' });
      }
    }
  }
  regs.sort((a, b) => (Parser.parseData(a.data) || 0) - (Parser.parseData(b.data) || 0));
  app.innerHTML = `<p><a href="javascript:history.back()">← Voltar</a></p>
    <div class="card"><h1>Anilha ${esc(nomeAnilha || chave)}</h1>
      <p class="muted">${esc(especie || 'Espécie não identificada nos relatórios importados')}</p>
      <p class="peq muted">Trajetória montada só com os relatórios já importados na sua base.</p></div>
    <div class="card"><h2>Registros (${regs.length})</h2>${!regs.length ? '<p class="muted peq">Nenhum registro.</p>' : `
      <div class="tabela"><table><thead><tr><th>Data</th><th>Criador</th><th>Onde</th><th>Operação</th><th>Contraparte</th></tr></thead><tbody>
      ${regs.map(g => `<tr><td>${esc(g.data)}</td><td><a href="#/c/${g.c.cpf}">${esc(g.c.nome)}</a></td>
        <td>${esc(g.secao)}${g.situacao ? ` (${esc(g.situacao)})` : ''}</td><td>${esc(g.detalhe)}</td><td>${g.outro}</td></tr>`).join('')}
      </tbody></table></div>`}</div>`;
  window.scrollTo(0, 0);
}

// ---------- fiscalização: estado derivado de cada criador ----------
// Cache granular: cada criador guarda o estado derivado e só recalcula quando ELE muda (revCriador)
// ou quando os índices da base mudam (revIdx: relatório importado, endereço alterado). Evita recalcular
// todos os criadores a cada salvamento, que travava com muitos relatórios.
let versao = 0, cacheIdx = null, revIdx = 0, idxSujo = false;
const revCriador = new Map();
const estCache = new Map();
const chaveEstado = cpf => `${revCriador.get(cpf) || 0}:${revIdx}`;
const RESULTADO = { regular: 'Regular', irregular: 'Irregular', naoloc: 'Não localizado' };
const GRAVES = [ // IN SEMA 04/2022, art. 62, §2º
  ['I', 'Abuso de licença'], ['II', 'Obtenção de vantagem pecuniária'], ['III', 'Animais silvestres sem origem legal (aves sem anilha)'],
  ['IV', 'Abuso e maus-tratos (art. 41)'], ['V', 'Soltura de animais durante a abordagem'], ['VI', 'Tentativa comprovada de burlar o sistema'],
  ['VII', 'Falsificação de documentos, informações ou anilhas'], ['VIII', 'Impedir ou dificultar a fiscalização']];
const DESTINOS = ['SISPASS', 'SEMA', 'Notificação', 'Campo'];
const DESTINO_TXT = { SISPASS: 'No SISPASS (você)', SEMA: 'Comunicar a SEMA/DIFAU', 'Notificação': 'Notificar o criador', Campo: 'Conferir em campo' };

function chaveEndereco(c) {
  const e = norm(`${c.endereco} ${c.cidade}`).replace(/\b(rua|r|av|avenida|travessa|tv|n|no|nro|numero|casa)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  return /\d/.test(e) ? e : '';
}
function indices() {
  if (cacheIdx?.v === revIdx) return cacheIdx;
  const nasc = {}, grupos = { endereco: {}, email: {}, fone: {}, ip: {} };
  const por = (tipo, chave, c) => { if (chave) (grupos[tipo][chave] ||= new Set()).add(c.cpf); };
  for (const c of Object.values(db.criadores)) {
    por('endereco', chaveEndereco(c), c);
    if (!c.rel) continue;
    for (const a of c.rel.secoes.Plantel || []) { const k = chaveAnilha(a['Código anilha']); if (k && !nasc[k] && Parser.parseData(a.Nascimento)) nasc[k] = a; }
    const alt = c.rel.secoes['Alterações de Cadastro'] || [];
    for (const e of [c.rel.criador.email, ...alt.map(r => r['E-mail'])]) if (String(e).includes('@')) por('email', String(e).trim().toLowerCase(), c);
    for (const f of [c.rel.criador.fone, ...alt.map(r => r.Telefone)]) { const d = soDigitos(f).slice(-8); if (d.length === 8 && !/^0+$/.test(d)) por('fone', d, c); }
    for (const r of c.rel.secoes['Acesso ao Sispass'] || []) for (const ip of String(r['Endereco IP Cliente'] || '').split(',')) por('ip', ip.trim(), c);
  }
  for (const g of Object.values(grupos)) for (const k of Object.keys(g)) if (g[k].size < 2) delete g[k];
  return (cacheIdx = { v: revIdx, nasc, grupos });
}
function vinculosCadastro(cpf) {
  const { grupos } = indices(), out = {};
  for (const [tipo, g] of Object.entries(grupos)) out[tipo] = Object.entries(g).filter(([, s]) => s.has(cpf)).map(([chave, s]) => ({ chave, outros: [...s].filter(x => x !== cpf) }));
  return out;
}

// Sexo do titular: informado na ficha ou estimado pelo primeiro nome (sempre marcado como estimativa).
function sexoEstimado(nome) {
  const p = norm(String(nome).split(/\s+/)[0]);
  if (!p) return '';
  if (/(a|ane|ene|ine|ice|ete|ilde|ele|ise|ide|iz|ith|uth|ani|arli|ilia|ely|elly)$/.test(p) && !/^(luca|nicola|joshua|jonata|elias|isaias|matias|tobias|josue|davi)$/.test(p)) return 'F';
  return 'M';
}
const sexoDe = c => c.sexo ? { valor: c.sexo, estimado: false } : { valor: sexoEstimado(c.nome), estimado: true };

function estado(c) {
  if (estCache.get(c.cpf)?.chave === chaveEstado(c.cpf)) return estCache.get(c.cpf);
  const hoje = new Date(), per = Normas.periodo(hoje), ix = indices(), vinc = vinculosCadastro(c.cpf);
  const nomes = cpfs => cpfs.map(x => db.criadores[x]?.nome).filter(Boolean);
  const itens = c.rel ? Normas.verificar(c.rel, { hoje, cfg: db.cfg, nascimentos: ix.nasc, outrosNoEndereco: nomes(vinc.endereco.flatMap(v => v.outros)) }) : [];
  const vinculo = (id, tipo, rotulo, base) => {
    if (!vinc[tipo].length) return;
    itens.push({ id, grupo: 'campo', tipo: 'indicio', titulo: rotulo, destino: 'Campo', base, data: '',
      texto: vinc[tipo].map(v => `${v.chave}: também em ${nomes(v.outros).join(', ')}`).join('; '),
      providencia: 'Verificar se associação ou terceiro opera o SISPASS deste criador (senha pessoal; associação só com procuração específica).' });
  };
  vinculo('vincEmail', 'email', 'E-mail compartilhado com outros criadores', 'IN SEMA 04/2022, art. 15, §1º; IN IBAMA 10/2011, art. 60');
  vinculo('vincFone', 'fone', 'Telefone compartilhado com outros criadores', 'IN SEMA 04/2022, art. 15, §1º');
  vinculo('vincIp', 'ip', 'Mesmo IP de acesso ao SISPASS que outros criadores', 'IN SEMA 04/2022, art. 15, §1º (indício fraco: IP pode ser da operadora)');
  const vist = [...(c.vistorias || [])].sort((a, b) => b.data.localeCompare(a.data));
  const lic = c.rel ? Normas.situacaoLicenca(c.rel, hoje) : null;
  for (const v of vist) {
    const dt = new Date(v.data + 'T12:00');
    if (v.graves?.length) itens.push({ id: `suspender:${v.id}`, grupo: 'sispass', tipo: 'nc', destino: 'SISPASS', data: Normas.fmt(dt),
      titulo: `Suspender licença (vistoria de ${Normas.fmt(dt)})`, base: 'IN SEMA 04/2022, art. 62',
      texto: Normas.textoSuspensao(dt, v.graves.map(g => GRAVES.find(x => x[0] === g)[1]), v.graves.map(g => `art. 62, §2º, ${g}`))
        + obsSemGraves(v),
      providencia: `No SISPASS: alterar a licença${lic?.numero ? ' nº ' + lic.numero : ' do período'} de regular para suspensa e colar a observação acima.` });
    if (v.notificacao?.ciencia) {
      const venc = Normas.somarDias(v.notificacao.ciencia, +v.notificacao.prazo), sp = Normas.situacaoPrazo(venc, hojeIso());
      itens.push({ id: `prazo:${v.id}`, grupo: 'prazo', tipo: 'conferir', destino: 'Campo', data: Normas.fmt(dt), desde: v.data, vencimento: venc, vencido: sp.vencido,
        titulo: `Prazo da notificação: ${sp.texto}`, base: 'IN SEMA 04/2022, art. 64', texto: Normas.textoNotificacao(v.notificacao),
        providencia: 'Retornar e verificar se regularizou. Se não regularizou, caracteriza a infração (art. 64).' });
    }
    if (v.maneja === 'outro') itens.push({ id: `fachada:${v.id}`, grupo: 'sispass', tipo: 'indicio', destino: 'Campo', data: Normas.fmt(dt),
      titulo: 'Titular não é quem maneja as aves', base: 'IN SEMA 04/2022, arts. 11 e 62, §2º, I e VI',
      texto: `Na vistoria de ${Normas.fmt(dt)}, as aves eram manejadas por ${v.manejaNome || 'outra pessoa'}.`,
      providencia: 'Apurar se o cadastro está em nome de terceiro para burlar limites ou impedimentos.' });
  }
  for (const i of itens) {
    const fato = i.data ? Parser.parseData(i.data) : null;
    const cobre = v => !fato || new Date(v.data + 'T12:00') >= fato;
    i.irregularEm = vist.find(v => v.irregular?.includes(i.id) && cobre(v))?.data;
    i.verificadoEm = i.grupo === 'campo' && !i.irregularEm ? vist.find(v => v.ok?.includes(i.id) && cobre(v))?.data : undefined;
    i.feito = c.acoes?.[i.id];
    if (i.grupo === 'prazo') i.verificadoEm = vist.filter(v => v.data > i.desde).at(-1)?.data; // vistoria de retorno
    i.aberto = !i.verificadoEm && !i.feito;
  }
  const e = { chave: chaveEstado(c.cpf), itens, abertos: itens.filter(i => i.aberto), r: c.rel ? resumo(c.rel, db.cfg) : null,
    ctf: c.rel ? Normas.situacaoCTF(c.rel) : null, lic, ameacadas: c.rel ? Normas.ameacadasDoPlantel(c.rel) : [],
    ultima: vist[0], vistorias: vist, sexo: sexoDe(c), vinc,
    fiscalizado: vist.some(v => v.resultado !== 'naoloc' && new Date(v.data + 'T12:00') >= per.inicio) };
  estCache.set(c.cpf, e);
  return e;
}

// Dados antigos (até a v1.7) guardavam só a "situação" da fiscalização; vira uma vistoria com a data em que foi salva.
function migrar(c) {
  const nome = nomeProprio(c.nome), cidade = c.cidade && c.cidade === c.cidade.toUpperCase() ? cidadeDe(c.cidade) : c.cidade;
  if (nome !== c.nome || cidade !== c.cidade) { c.nome = nome; c.cidade = cidade; if (!c.fisc) return true; }
  if (!c.fisc) return false;
  if (c.fisc.status) (c.vistorias ||= []).push({ id: 'mig-' + c.cpf, data: (c.fisc.atualizadoEm || agora()).slice(0, 10), resultado: c.fisc.status,
    obs: c.fisc.obs || '', ok: [], irregular: [], graves: [] });
  else if (c.fisc.obs) c.notas = c.fisc.obs;
  delete c.fisc;
  return true;
}

const chip = (txt, cls = '') => `<span class="tag ${cls}">${esc(txt)}</span>`;
const chipAmeaca = a => chip(`Ameaçada: ${[a.rs && 'RS ' + a.rs, a.br && 'BR ' + a.br].filter(Boolean).join(' · ')}`, 'ameaca');
// CTF cancelado: pelo relatório ou mencionado nas observações do fiscal (notas, vistorias, providências).
const ctfCanceladoDe = (c, e) => Normas.ctfCancelado(e.ctf?.status, [c.notas, ...(c.vistorias || []).map(v => v.obs), ...Object.values(c.acoes || {}).map(a => a.obs)]);

function htmlItem(c, i, comCriador = false) {
  const estadoTxt = i.feito ? `Providência feita em ${Normas.fmt(new Date(i.feito.data + 'T12:00'))}${i.feito.obs ? ': ' + esc(i.feito.obs) : ''}`
    : i.verificadoEm ? `Verificado em vistoria de ${Normas.fmt(new Date(i.verificadoEm + 'T12:00'))}`
    : i.irregularEm ? `Constatado irregular em ${Normas.fmt(new Date(i.irregularEm + 'T12:00'))}` : '';
  return `<div class="item ${i.tipo}" data-id="${esc(i.id)}" data-cpf="${c.cpf}">
    <div class="linha"><span class="tag dest">${esc(i.destino)}</span>${i.grupo === 'prazo' ? chip(i.vencido ? 'prazo vencido' : 'prazo', i.vencido && i.aberto ? 'alerta' : 'aviso')
      : chip(i.tipo === 'nc' ? 'não conformidade' : i.tipo === 'indicio' ? 'indício' : 'conferir', i.tipo === 'nc' ? 'alerta' : 'aviso')}
      ${comCriador ? `<a href="#/c/${c.cpf}"><b>${esc(c.nome)}</b></a> <span class="muted peq">${esc(c.cidade)}</span>` : ''}</div>
    <b>${esc(i.titulo)}</b><div class="peq">${esc(i.texto)}</div>
    <div class="peq muted">${esc(i.base)}${i.data ? ' · fato em ' + esc(i.data) : ''}</div>
    <div class="peq"><b>Providência:</b> ${esc(i.providencia)}</div>
    ${i.destino === 'SISPASS' && i.id.startsWith('suspender:') ? `<button class="sec b-copiar-txt" type="button" data-txt="${esc(i.texto)}">Copiar observação</button>` : ''}
    ${estadoTxt ? `<div class="peq ok-txt">${estadoTxt}</div>` : ''}
    ${i.aberto && i.vencimento ? `<button class="sec b-agenda" type="button" data-uid="${esc(i.id + c.cpf)}" data-data="${i.vencimento}"
      data-titulo="${esc('Prazo notificação: ' + c.nome)}" data-desc="${esc(i.texto + '\n' + [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', '))}">Adicionar à agenda</button>` : ''}
    ${i.aberto ? `<button class="sec b-feito" type="button">${i.id.startsWith('suspender:') ? 'Licença suspensa no SISPASS' : i.grupo === 'prazo' ? 'Regularizou' : 'Marcar providência feita'}</button>`
      : i.feito ? '<button class="sec b-desfazer" type="button">Desfazer</button>' : ''}
  </div>`;
}
// Preferências de tela, guardadas só neste navegador.
const lerPref = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
const gravarPref = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } };
// Abas da ficha: mostra uma de cada vez e lembra a última escolhida (só conveniência).
function ligarAbas() {
  // aberta: mostra o conteúdo da aba k; fechada (k vazio): só a barra de abas. Guarda a aba e se está aberta.
  const mostrar = (k, aberta) => {
    for (const b of document.querySelectorAll('.aba-b')) b.setAttribute('aria-selected', aberta && b.dataset.aba === k);
    for (const a of document.querySelectorAll('.aba')) a.hidden = !(aberta && a.dataset.aba === k);
    $('.conteudo').classList.toggle('recolhida', !aberta);
    gravarPref('fp-aba', k);
    gravarPref('fp-aba-aberta', aberta);
    if (aberta) document.querySelector(`.aba-b[data-aba="${k}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  };
  const atual = document.querySelector('.aba-b[aria-selected="true"]');
  if (atual) $('.abas').scrollLeft = atual.offsetLeft - $('.abas').clientWidth / 2 + atual.clientWidth / 2;
  for (const b of document.querySelectorAll('.aba-b')) b.onclick = () => {
    const jaAberta = b.getAttribute('aria-selected') === 'true';
    mostrar(b.dataset.aba, !jaAberta); // clicar na aba aberta recolhe; em outra, abre aquela
    if (!jaAberta) { const topo = $('.abas').getBoundingClientRect().top; if (topo < 0 || topo > innerHeight / 2) $('.conteudo').scrollIntoView({ block: 'start' }); }
  };
}
// Cards recolhíveis: clicar no título recolhe/expande. Começam abertos; lembra os fechados (por contexto + título).
function ligarRecolhiveis(ctx) {
  const fechados = lerPref('fp-rec', {});
  for (const card of app.querySelectorAll('.card')) {
    if (card.closest('.lista-topo') || card.id === 'topo-ficha' || card.classList.contains('card-dobra')) continue;
    const cab = card.querySelector(':scope > h1, :scope > h2');
    if (!cab) continue;
    card.classList.add('recolhivel'); cab.classList.add('rec-cab');
    const chave = ctx + '|' + cab.textContent.trim().replace(/\s+/g, ' ');
    if (fechados[chave]) card.classList.add('recolhido');
    cab.addEventListener('click', e => {
      if (e.target.closest('a, button, input, select, textarea, label')) return;
      const rec = card.classList.toggle('recolhido');
      const f = lerPref('fp-rec', {}); if (rec) f[chave] = 1; else delete f[chave]; gravarPref('fp-rec', f);
    });
  }
}
// Card do topo fixado: fica preso no alto, compacto (só nome e indicadores).
function ligarFixar() {
  const card = $('#topo-ficha'), b = $('#b-fixar');
  if (!card || !b) return;
  const aplicar = f => {
    card.classList.toggle('fixado', f);
    b.setAttribute('aria-pressed', f);
    b.textContent = f ? '📌 Soltar' : '📌 Fixar';
    const raiz = document.documentElement.style;
    raiz.setProperty('--topo-h', $('.topo').offsetHeight + 'px');
    // No celular, as abas param logo abaixo do card fixado.
    const perfil = $('.perfil');
    raiz.setProperty('--fixo-h', f && perfil && getComputedStyle(perfil).position === 'sticky' && innerWidth < 960 ? perfil.offsetHeight + 'px' : '0px');
  };
  aplicar(lerPref('fp-fixar', false));
  b.onclick = () => { const f = !card.classList.contains('fixado'); gravarPref('fp-fixar', f); aplicar(f); };
}

// Botões dos itens (ficha e pendências): marcam/desfazem a providência.
function ligarItens(depois) {
  for (const b of document.querySelectorAll('.b-copiar-txt')) b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.txt); b.textContent = 'Copiado'; } catch { b.textContent = 'Selecione e copie o texto acima'; }
  };
  ligarAgenda();
  for (const b of document.querySelectorAll('.b-feito, .b-desfazer')) b.onclick = async () => {
    const el = b.closest('.item'), c = db.criadores[el.dataset.cpf], id = el.dataset.id;
    c.acoes ||= {};
    const desfazer = b.classList.contains('b-desfazer');
    if (desfazer) delete c.acoes[id];
    else c.acoes[id] = { data: hojeIso(), obs: prompt('Observação (opcional):') || '' };
    sujos.add(c.cpf);
    await salvar();
    aviso(desfazer ? 'Ação desfeita.' : 'Providência registrada.');
    depois();
  };
}


// ---------- mensagens prontas (SISPASS, SEMA, notificação) ----------
const MODELOS = {
  sema: { rot: 'Comunicação à SEMA/DIFAU', destinos: ['SEMA', 'SISPASS'], assunto: c => `Fiscalização de criador amador de passeriformes: ${c.nome}` },
  sispass: { rot: 'Observação para o SISPASS', destinos: ['SISPASS'] },
  notificacao: { rot: 'Notificação ao criador', destinos: ['Notificação'], assunto: () => 'Notificação: criação amadora de passeriformes' },
};
function textoMensagem(c, e, modelo, itens) {
  const hoje = Normas.fmt(new Date()), vist = e.ultima ? Normas.fmt(new Date(e.ultima.data + 'T12:00')) : '';
  const assinatura = db.cfg.assinatura ? `\n\n${db.cfg.assinatura}` : '';
  const lista = itens.map((i, n) => `${n + 1}. ${i.titulo}: ${i.texto} (${i.base}).`).join('\n');
  if (modelo === 'sispass') {
    const susp = itens.find(i => i.id.startsWith('suspender:'));
    if (susp && itens.length === 1) return susp.texto;
    return `Fiscalização PATRAM/BM em ${vist || hoje}. ${itens.map(i => i.id.startsWith('suspender:') ? i.texto : `${i.titulo} (${i.base}).`).join(' ')}`;
  }
  const ident = `Nome: ${c.nome}\nCPF: ${fmtCpf(c.cpf)}\nRegistro SISPASS: ${c.registro || '-'}\nEndereço: ${[c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ')}`;
  if (modelo === 'notificacao') return `NOTIFICAÇÃO\n\nSr(a). ${c.nome}, CPF ${fmtCpf(c.cpf)}, criador(a) amador(a) de passeriformes, fica NOTIFICADO(A) quanto ao seguinte:\n\n${lista}\n\nProvidências exigidas:\n${itens.map((i, n) => `${n + 1}. ${i.providencia}`).join('\n')}\n\nFundamento: IN SEMA nº 04/2022. O não atendimento no prazo poderá caracterizar infração administrativa (art. 64).\n\n${[c.cidade, hoje].filter(Boolean).join(', ')}.${assinatura}`;
  return `À SEMA/DIFAU,\n\nComunico, para conhecimento e providências, situação verificada pela Patrulha Ambiental (PATRAM/BM) referente a criador amador de passeriformes:\n\n${ident}\n${vist ? `Última vistoria: ${vist} (${RESULTADO[e.ultima.resultado]})\n` : ''}\nConstatações:\n${lista}\n\nProvidências sugeridas:\n${itens.map((i, n) => `${n + 1}. ${i.providencia}`).join('\n')}\n\nAtenciosamente,${assinatura || '\n'}`;
}
function cardMensagens(c, e) {
  if (!e.itens.length) return '';
  return `<div class="card"><h2>Mensagens (SISPASS, SEMA, notificação)</h2>
    <label for="m-modelo">Modelo</label>
    <select id="m-modelo">${Object.entries(MODELOS).map(([k, m]) => `<option value="${k}">${m.rot}</option>`).join('')}</select>
    <label>Itens incluídos</label>
    <div id="m-itens">${e.itens.map(i => `<label class="chk"><input type="checkbox" class="m-item" value="${esc(i.id)}"> <span>${esc(i.titulo)} <span class="muted peq">(${esc(i.destino)}${i.aberto ? '' : ', resolvido'})</span></span></label>`).join('')}</div>
    <label for="m-texto">Texto (pode editar)</label>
    <textarea id="m-texto" rows="12"></textarea>
    <div class="linha" style="margin-top:8px">
      <button id="m-copiar" type="button">Copiar</button>
      <a class="btn sec" id="m-whats" target="_blank" rel="noopener noreferrer" href="#">WhatsApp</a>
      <a class="btn sec" id="m-email" href="#">E-mail</a>
    </div>
    ${db.cfg.assinatura ? '' : '<p class="muted peq">Configure a sua assinatura em Dados, item 4.</p>'}
  </div>`;
}
function ligarMensagens(c, e) {
  if (!$('#m-modelo')) return;
  const marcar = () => {
    const m = MODELOS[$('#m-modelo').value];
    for (const x of document.querySelectorAll('.m-item')) { const i = e.itens.find(i => i.id === x.value); x.checked = i.aberto && m.destinos.includes(i.destino); }
  };
  const gerar = () => {
    const modelo = $('#m-modelo').value, ids = [...document.querySelectorAll('.m-item:checked')].map(x => x.value);
    $('#m-texto').value = ids.length ? textoMensagem(c, e, modelo, e.itens.filter(i => ids.includes(i.id))) : '';
    atualizarLinks();
  };
  const atualizarLinks = () => {
    const t = $('#m-texto').value, assunto = MODELOS[$('#m-modelo').value].assunto?.(c) || 'Fiscalização PATRAM/BM';
    $('#m-whats').href = 'https://wa.me/?text=' + encodeURIComponent(t);
    $('#m-email').href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(t)}`;
  };
  $('#m-modelo').onchange = () => { marcar(); gerar(); };
  for (const x of document.querySelectorAll('.m-item')) x.onchange = gerar;
  $('#m-texto').oninput = atualizarLinks;
  $('#m-copiar').onclick = async () => {
    try { await navigator.clipboard.writeText($('#m-texto').value); $('#m-copiar').textContent = 'Copiado'; }
    catch { $('#m-texto').select(); $('#m-copiar').textContent = 'Use Ctrl+C'; }
  };
  marcar();
  gerar();
}

const fraseGrave = g => `Infração grave: ${GRAVES.find(x => x[0] === g)[1]} (IN SEMA 04/2022, art. 62, §2º, ${g}).`;
// Observação da vistoria para o SISPASS, sem repetir as infrações que já estão no "Motivo".
const obsSemGraves = v => { const o = GRAVES.reduce((t, [g]) => t.split(fraseGrave(g)).join(''), v.obs || '').replace(/\s+/g, ' ').trim(); return o ? ` Obs.: ${o}` : ''; };
// Frases prontas para a observação da vistoria (um clique acrescenta ao texto).
const FRASES = [
  'Plantel físico confere com o plantel do SISPASS.',
  'Ave(s) sem anilha ou com anilha violada/adulterada.',
  'Ave(s) do plantel do SISPASS ausente(s) no local.',
  'Ave(s) no local que não constam no plantel do SISPASS.',
  'Diâmetro de anilha incompatível com a espécie.',
  'Relação de passeriformes atualizada não apresentada (IN SEMA 04/2022, art. 40, III).',
  'Gaiolas sem identificação com código da anilha e CPF.',
  'Condições inadequadas de manutenção (água, alimento, higiene ou poleiros) (art. 41).',
  'Aves mantidas fora do endereço cadastrado (art. 40, I).',
  'Criador não localizado no endereço cadastrado.',
  'Aves manejadas por terceiro; titular não reside no local.',
  'Notificado(a) a regularizar no prazo de 15 dias (art. 64).',
];

// Data local (toISOString usa UTC e vira o dia depois das 21h no RS).
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const avesAtivas = c => (c.rel?.secoes.Plantel || []).filter(a => /^ativ/i.test(a['Situação'] || ''));
// Linhas "espécie e sexo; anilha" das aves encontradas sem registro no plantel.
const lerExtras = t => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [d, a] = l.split(';'); return { descricao: d.trim(), anilha: (a || '').trim() }; });
function formConferencia(c) {
  const aves = avesAtivas(c);
  const opc = `<option value="">Não conferida</option>${Object.entries(Normas.CONF).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}`;
  return `<h2 style="margin-top:12px">Conferência do plantel (${aves.length} ativas)</h2>
    ${!aves.length ? '<p class="muted peq">Sem plantel importado. Use só o campo de aves sem registro, se for o caso.</p>' : `
    <div class="linha"><button class="sec" id="v-todas" type="button">Marcar todas como conferidas</button> <span id="v-conf-cont" class="muted peq"></span></div>
    <details id="v-conf" open><summary>Ave por ave</summary>
    ${aves.map(a => `<div class="conf"><b>${esc(a['Nome Popular'] || a['Espécie'])}</b> <span class="peq">${esc(a.Sexo || '')} · anilha ${esc(a['Código anilha'])}${a['Diâmetro anilha'] ? ' · ' + esc(a['Diâmetro anilha']) + ' mm' : ''}</span>
      <select class="v-ave" data-k="${esc(chaveAnilha(a['Código anilha']))}">${opc}</select></div>`).join('')}</details>`}
    <label for="v-extras">Aves no local sem registro no plantel (uma por linha: espécie e sexo; anilha)</label>
    <textarea id="v-extras" rows="2" placeholder="Ex.: Pintassilgo macho; sem anilha"></textarea>`;
}

function formVistoria(c, e) {
  const campo = e.itens.filter(i => i.grupo === 'campo' && i.aberto);
  return `<div class="card"><h2>Registrar vistoria</h2>
    <div class="grade">
      <div><label for="v-data">Data</label><input id="v-data" type="date" value="${hojeIso()}"></div>
      <div><label for="v-res">Resultado</label><select id="v-res">${Object.entries(RESULTADO).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
      <div><label for="v-maneja">Quem maneja as aves</label><select id="v-maneja"><option value="titular">O titular</option><option value="outro">Outra pessoa</option><option value="">Não verificado</option></select></div>
      <div><label for="v-maneja-nome">Se outra pessoa: nome e vínculo</label><input id="v-maneja-nome" placeholder="Ex.: marido, João da Silva"></div>
    </div>
    <label for="v-end">Endereço conferido</label><input id="v-end" value="${esc(c.enderecoAtual || c.endereco)}">
    ${formConferencia(c)}
    ${campo.length ? `<h2 style="margin-top:12px">Itens a conferir (${campo.length})</h2><p class="muted peq">O app já marca estes itens como verificados. Mude só o que você constatou irregular ou não conferiu.</p>
      ${campo.map(i => `<div class="conf"><b>${esc(i.titulo)}</b><div class="peq muted">${esc(i.texto)}</div>
        <select class="v-item" data-id="${esc(i.id)}"><option value="ok">Verificado, regular</option><option value="irregular">Irregular</option><option value="">Não conferido</option></select></div>`).join('')}` : ''}
    <h2 style="margin-top:12px">Infração grave constatada (art. 62, §2º)</h2>
    <p class="muted peq">Ao marcar, o app gera o texto de suspensão da licença para o SISPASS.</p>
    ${GRAVES.map(([k, t]) => `<label class="chk"><input type="checkbox" class="v-grave" value="${k}"> ${k}: ${esc(t)}</label>`).join('')}
    <h2 style="margin-top:12px">Notificação (art. 64)</h2>
    <label class="chk"><input type="checkbox" id="v-notif"> Criador notificado a regularizar no prazo</label>
    <div id="v-notif-campos" hidden>
      <div class="grade"><div><label for="v-notif-ciencia">Data da ciência</label><input id="v-notif-ciencia" type="date" value="${hojeIso()}"></div>
        <div><label for="v-notif-prazo">Prazo (dias corridos)</label><input id="v-notif-prazo" type="number" min="1" value="15"></div></div>
      <label for="v-notif-objeto">O que deve regularizar</label><input id="v-notif-objeto" placeholder="Ex.: identificar as gaiolas e apresentar a relação do plantel">
    </div>
    <label for="v-obs">Observações</label>
    <div class="frases">${FRASES.map(f => `<button class="sec chip-txt" type="button">${esc(f)}</button>`).join('')}</div>
    <textarea id="v-obs" rows="5" placeholder="Toque nas frases acima e complete o texto"></textarea>
    <div class="linha"><button class="sec" id="v-obs-copiar" type="button">Copiar</button>
      <a class="btn sec" id="v-obs-whats" target="_blank" rel="noopener noreferrer" href="https://wa.me/">WhatsApp</a></div>
    <p><button id="b-vistoria" type="button">Salvar vistoria</button> <span id="m-vist" class="msg"></span></p>
  </div>`;
}

function resumoConfHtml(c, v) {
  if (!v.aves && !v.extras?.length) return '';
  const r = Normas.resumoConferencia(avesAtivas(c), v);
  const n = (rot, arr) => arr.length ? `${rot}: ${arr.length}` : '';
  return `<div class="peq ${r.irregular ? 'erro-txt' : ''}">Conferência: ${[n('conferidas', r.conferidas), n('ausentes', r.ausentes), n('anilha divergente', r.anilha),
    n('espécie/sexo divergente', r.divergente), n('sem registro', r.extras), n('não conferidas', r.naoConferidas)].filter(Boolean).join(' · ')}</div>`;
}
// Texto do relatório de uma vistoria: identificação, conferência, constatações com base legal e providências já tomadas.
function textoRelatorioVistoria(c, e, v) {
  const graves = (v.graves || []).map(g => `Infração grave: ${GRAVES.find(x => x[0] === g)[1]} (IN SEMA 04/2022, art. 62, §2º, ${g})`);
  const constatacoes = e.itens.filter(i => (v.irregular || []).includes(i.id) || (i.aberto && i.tipo === 'nc' && !/^(suspender|fachada):/.test(i.id)))
    .map(i => ({ titulo: i.titulo, texto: i.texto, base: i.base }));
  const conf = Normas.resumoConferencia(avesAtivas(c), v);
  if (conf.ausentes.length) constatacoes.push({ titulo: 'Aves do plantel ausentes no local', texto: conf.ausentes.join('; ') + '.', base: 'IN SEMA 04/2022, arts. 35, §3º, e 40, I' });
  if (conf.anilha.length) constatacoes.push({ titulo: 'Anilha divergente, violada ou adulterada', texto: conf.anilha.join('; ') + '.', base: 'IN SEMA 04/2022, art. 40, II' });
  if (conf.divergente.length) constatacoes.push({ titulo: 'Espécie ou sexo divergente do registro no SISPASS', texto: conf.divergente.join('; ') + '.', base: '' });
  if (conf.extras.length) constatacoes.push({ titulo: 'Aves sem registro no plantel do SISPASS', texto: conf.extras.join('; ') + '.', base: 'IN SEMA 04/2022, art. 62, §2º, III' });
  const providencias = Object.entries(c.acoes || {}).filter(([k, a]) => a.data >= v.data)
    .map(([k, a]) => { const i = e.itens.find(x => x.id === k); return `${k.startsWith('suspender:') ? 'Licença suspensa no SISPASS' : (i?.titulo || k)} em ${Normas.fmt(new Date(a.data + 'T12:00'))}${a.obs ? ': ' + a.obs : ''}`; });
  return Normas.textoRelatorio({
    criador: { nome: c.nome, cpf: fmtCpf(c.cpf), registro: c.registro, endereco: [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ') },
    vistoria: v, resultado: RESULTADO[v.resultado] || v.resultado,
    ctf: e.ctf?.status || '', licenca: e.lic ? `Licença ${e.lic.periodo}: ${e.lic.status}${e.lic.numero ? ' (nº ' + e.lic.numero + ')' : ''}` : '',
    conf: (v.aves || v.extras?.length) ? conf : null, graves, constatacoes, providencias, assinatura: db.cfg.assinatura || '',
  });
}
function imprimirTexto(t) { imprimirArea(d => d.textContent = t); }
function imprimirHTML(html, orientacao) { imprimirArea(d => { d.className = 'doc-html'; d.innerHTML = html; }, orientacao); }
// Documento oficial (Notificação, Termo de Apreensão, Regularização): A4 retrato com margem 8mm.
function imprimirDoc(html) { imprimirArea(d => { d.className = 'doc-html doc-oficial'; d.innerHTML = html; }, 'portrait', '8mm'); }
function imprimirArea(preencher, orientacao, margem) {
  const d = document.createElement('div');
  d.id = 'area-print'; preencher(d);
  const estilo = orientacao ? Object.assign(document.createElement('style'), { textContent: `@page { size: A4 ${orientacao}; ${margem ? 'margin: ' + margem + ';' : ''} }` }) : null;
  if (estilo) document.head.append(estilo);
  document.body.append(d); document.body.classList.add('imprimindo');
  const fim = () => { d.remove(); estilo?.remove(); document.body.classList.remove('imprimindo'); removeEventListener('afterprint', fim); };
  addEventListener('afterprint', fim);
  window.print();
}
// Lê uma imagem e devolve um PNG reduzido (até 300 px) como data URL, para o cabeçalho dos documentos.
const lerImagem = arq => new Promise((ok, erro) => {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 300 / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    ok(c.toDataURL('image/png'));
  };
  img.onerror = () => erro(new Error('Imagem inválida.'));
  img.src = URL.createObjectURL(arq);
});
// Monta e imprime a ficha básica do criador (dados, situação e plantel ativo).
function imprimirFicha(c, e) {
  const r = e.r, ameacaDe = {};
  for (const a of e.ameacadas) ameacaDe[a.anilha] = [a.rs && 'RS ' + a.rs, a.br && 'BR ' + a.br].filter(Boolean).join(' · ');
  const aves = (c.rel?.secoes.Plantel || []).filter(a => /^ativ/i.test(a['Situação'] || '')).map(a => ({
    situacao: a['Situação'], popular: a['Nome Popular'], especie: a['Espécie'], sexo: a.Sexo, nascimento: a.Nascimento,
    anilha: a['Código anilha'], diametro: a['Diâmetro anilha'], ameaca: ameacaDe[a['Código anilha']] || '' }));
  imprimirHTML(Normas.fichaImpressaoHTML({
    criador: { nome: c.nome, cpf: fmtCpf(c.cpf), registro: c.registro, enderecoCadastrado: [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', '),
      enderecoAtual: c.enderecoAtual, bairro: c.bairro, cidade: c.cidade },
    ctf: e.ctf?.status || '', licenca: e.lic ? { periodo: e.lic.periodo, status: e.lic.status, numero: e.lic.numero, validade: e.lic.validade } : null,
    aves, impressoEm: Normas.fmt(new Date()),
  }), 'landscape');
}

const COLS_PLANTEL = ['Situação', 'Nome Popular', 'Espécie', 'Sexo', 'Nascimento', 'Código anilha', 'Diâmetro anilha', 'Marcação', 'ULTIMA_OPERACAO', 'DATA_OPERACAO'];
const PRINCIPAIS = ['Dados do Criador', 'Plantel', 'Histórico de Operações', 'Transferências Recebidas', 'Transferências Solicitadas'];

function navSequencia(cpf) {
  const i = sequencia.indexOf(cpf);
  if (i < 0 || sequencia.length < 2) return '';
  const ir = (j, t) => j >= 0 && j < sequencia.length ? `<a class="btn sec" id="nav-${t}" href="#/c/${sequencia[j]}">${t === 'ant' ? '← Anterior' : 'Próximo →'}</a>` : '';
  return `<span class="nav-seq">${ir(i - 1, 'ant')} <span class="muted peq">${i + 1} de ${sequencia.length} da lista</span> ${ir(i + 1, 'prox')}</span>`;
}

function telaFicha(cpf) {
  const c = db.criadores[cpf];
  if (!c) { app.innerHTML = '<div class="card">Criador não encontrado. <a href="#/">Voltar</a></div>'; return; }
  idxNomes = indiceNomes();
  const e = estado(c), r = e.r;
  const end = c.enderecoAtual ? c.enderecoAtual + ', RS' : [c.endereco, c.bairro, c.cidade, 'RS'].filter(Boolean).join(', ');
  const outras = c.rel ? Object.entries(c.rel.secoes).filter(([t]) => !PRINCIPAIS.includes(t)) : [];
  const ameacaDe = {};
  for (const a of e.ameacadas) ameacaDe[a.anilha] = [a.rs && 'RS ' + a.rs, a.br && 'BR ' + a.br].filter(Boolean).join(' · ');
  const plantel = (c.rel?.secoes.Plantel || []).map(a => ({ ...a, 'Ameaça': ameacaDe[a['Código anilha']] || '' }));
  const sit = (rot, val, cls) => `<div class="sit ${cls}"><span>${rot}</span>${val}</div>`;
  const licCls = !e.lic ? '' : e.lic.status === 'regular' ? 'bom' : 'ruim';
  const abertos = e.abertos, resolvidos = e.itens.filter(i => !i.aberto);
  const vincTxt = Object.entries({ email: 'E-mail', fone: 'Telefone', ip: 'IP de acesso', endereco: 'Endereço' })
    .flatMap(([t, rot]) => e.vinc[t].map(v => `<div class="peq"><b>${rot} ${esc(v.chave)}</b>: ${v.outros.map(x => `<a href="#/c/${x}">${esc(db.criadores[x]?.nome)}</a>`).join(', ')}</div>`)).join('');
  const semRel = `<div class="card"><h2>Sem relatório do SISPASS</h2>
      <p class="muted">Gere o relatório geral deste CPF no SISPASS e importe em <a href="#/dados">Dados</a>.</p></div>`;
  const card = (titulo, corpo) => `<div class="card"><h2>${titulo}</h2>${corpo}</div>`;
  const verif = `<div class="card"><h2>Verificação normativa (${abertos.length} em aberto)</h2>
      ${!c.rel ? '<p class="muted">Importe o relatório do SISPASS para verificar.</p>' : !abertos.length ? '<p class="muted">Nenhuma pendência em aberto.</p>' : ''}
      ${DESTINOS.map(d => abertos.filter(i => i.destino === d)).filter(l => l.length)
        .map(l => `<h2 class="dest-tit">${esc(DESTINO_TXT[l[0].destino])}</h2>${l.map(i => htmlItem(c, i)).join('')}`).join('')}
      ${resolvidos.length ? `<details><summary>Verificados ou resolvidos (${resolvidos.length})</summary>${resolvidos.map(i => htmlItem(c, i)).join('')}</details>` : ''}
    </div>`;
  const vistorias = !e.vistorias.length ? '' : card(`Vistorias (${e.vistorias.length})`, e.vistorias.map(v => `<div class="item">
      <b>${Normas.fmt(new Date(v.data + 'T12:00'))}: ${RESULTADO[v.resultado] || v.resultado}</b>
      ${v.maneja === 'outro' ? `<div class="peq">Aves manejadas por: ${esc(v.manejaNome || 'outra pessoa')}</div>` : v.maneja === 'titular' ? '<div class="peq">Titular maneja as aves</div>' : ''}
      ${v.graves?.length ? `<div class="peq">Infração grave: art. 62, §2º, ${v.graves.join(', ')}</div>` : ''}
      ${v.irregular?.length ? `<div class="peq">${v.irregular.length} item(ns) constatado(s) irregular(es)</div>` : ''}
      ${resumoConfHtml(c, v)}
      ${v.obs ? `<div class="peq" style="white-space:pre-wrap">${esc(v.obs)}</div><button class="sec b-copiar-txt" type="button" data-txt="${esc(v.obs)}">Copiar observação</button>` : ''}
      <div class="linha"><button class="sec b-rel" type="button" data-id="${esc(v.id)}">Relatório</button>
      <button class="sec b-del-vist" type="button" data-id="${esc(v.id)}">Excluir</button></div>
      <div class="rel-caixa" id="rel-${esc(v.id)}" hidden><textarea rows="16"></textarea>
        <div class="linha"><button class="b-rel-copiar" type="button">Copiar</button><button class="sec b-rel-imprimir" type="button">Imprimir / PDF</button></div></div></div>`).join(''));
  const transf = r ? (c.rel.secoes['Transferências Recebidas'] || []).length + (c.rel.secoes['Transferências Solicitadas'] || []).length : '';
  // Abas da coluna direita: [chave, rótulo, contador, conteúdo]
  const ABAS = [
    ['verif', 'Verificação', abertos.length, verif],
    ['vistoria', 'Vistoria', e.vistorias.length, formVistoria(c, e) + vistorias + cardAbordagensDoCpf(c.cpf) + (c.notas ? card('Anotações antigas', `<p class="peq">${esc(c.notas)}</p>`) : '')],
    ['msg', 'Mensagens', '', cardMensagens(c, e) || card('Mensagens', '<p class="muted">Sem itens para montar mensagem.</p>')],
    ['plantel', 'Plantel', r ? r.ativas : '', !r ? semRel : card('Resumo do SISPASS', `<div class="grade">
        <div><span>Aves ativas</span>${r.ativas} de ${r.total}</div>
        <div><span>Última licença (validade)</span>${esc(r.ultimaLicenca || '—')}</div>
        <div><span>Última operação</span>${esc(r.ultimaOperacao || '—')}</div>
        <div><span>Relatório importado</span>${fmtDH(c.rel.importadoEm)}</div></div>`) + card('Plantel', tabela(plantel, ['Ameaça', ...COLS_PLANTEL]))],
    ['mov', 'Movimentação', transf, !r ? semRel : card('Negociou com (transferências confirmadas)', tabela(vinculos(c.rel).map(v => ({
        'Nome do Doador': v.nome, 'Recebeu dele': v.recebidas, 'Enviou para ele': v.enviadas, 'Última': v.ultima }))).replace('<th>Nome do Doador</th>', '<th>Criador</th>'))
      + card('Transferências recebidas', tabela(c.rel.secoes['Transferências Recebidas']))
      + card('Transferências solicitadas (enviadas)', tabela(c.rel.secoes['Transferências Solicitadas']))],
    ['vinc', 'Vínculos', r ? vinculos(c.rel).length : '', cardGrafo(c.cpf)],
    ['ocorr', 'Ocorrências', r ? r.ocorrencias.length : '', !r ? semRel : card('Fugas, roubos/furtos e óbitos', tabela(r.ocorrencias))
      + card('Óbitos e idade da ave', tabelaObitos(obitosDaBase().filter(o => o.cpf === c.cpf)))],
    ['hist', 'Histórico', r ? (c.rel.secoes['Histórico de Operações'] || []).length : '',
      (c.obs ? card('Observações', `<p style="white-space:pre-wrap">${esc(c.obs)}</p><p class="muted peq">Edite este texto na coluna à esquerda.</p>`) : '')
      + (!r ? (c.obs ? '' : semRel) : card('Histórico de operações', tabela(c.rel.secoes['Histórico de Operações']))
      + card('Outras seções do relatório', outras.map(([t, rows]) => `<details><summary>${esc(t)} <span class="muted peq">(${rows.length})</span></summary>${tabela(rows)}</details>`).join('')))],
  ];
  const abaAtual = ABAS.some(a => a[0] === lerPref('fp-aba', '')) ? lerPref('fp-aba', '') : 'verif';
  const abaAberta = lerPref('fp-aba-aberta', false); // padrão: abas recolhidas
  app.innerHTML = `
    <p class="linha"><a href="#/">← Criadores</a> <a href="javascript:history.back()">← Voltar</a>${navSequencia(cpf)}</p>
    <div class="ficha">
      <aside class="perfil">
    <div class="card ${e.ameacadas.length ? 'ameacado' : ''}" id="topo-ficha">
      <div class="linha"><h1 style="flex:1" class="${ctfCanceladoDe(c, e) ? 'tachado' : ''}">${esc(c.nome)}</h1><button class="sec" id="b-fixar" type="button" aria-pressed="false">📌 Fixar</button></div>
      ${ctfCanceladoDe(c, e) ? `<p>${chip(`CTF cancelado · ${r ? r.ativas + ' ave(s) no plantel' : 'sem relatório'}`, 'alerta')}</p>` : ''}
      ${e.ameacadas.length ? `<p>${chip(`${e.ameacadas.length} ave(s) de espécie ameaçada`, 'ameaca')}</p>` : ''}
      <div class="sits">
        ${sit('CTF', e.ctf ? esc(e.ctf.status) : '—', e.ctf ? (e.ctf.status === 'ativo' ? 'bom' : 'ruim') : '')}
        ${sit(`Licença ${e.lic?.periodo || ''}`, e.lic ? esc(e.lic.status) + (e.lic.numero ? ` <span class="peq">nº ${esc(e.lic.numero)}</span>` : '') : '—', licCls)}
        ${sit('Última vistoria', e.ultima ? `${Normas.fmt(new Date(e.ultima.data + 'T12:00'))} <span class="peq">${RESULTADO[e.ultima.resultado]}</span>` : 'nunca', e.ultima ? (e.ultima.resultado === 'irregular' ? 'ruim' : 'bom') : '')}
        ${sit('Pendências abertas', abertos.length, abertos.length ? 'ruim' : 'bom')}
        ${c.acoes && Object.keys(c.acoes).some(k => k.startsWith('suspender:')) ? sit('Licença', 'suspensa por você', 'ruim') : ''}
      </div>
      <div class="det"><div class="grade" style="margin-top:10px">
        <div><span>CPF</span>${esc(fmtCpf(c.cpf))}</div>
        <div><span>Registro</span>${esc(c.registro)}</div>
        <div><span>Cidade</span>${esc(c.cidade)}</div>
        <div><span>Bairro</span>${esc(c.bairro)}</div>
        <div><label for="sexo" style="margin:0;font-weight:400;font-size:.8rem" class="muted">Sexo do titular${e.sexo.estimado ? ' (estimado pelo nome)' : ''}</label>
          <select id="sexo"><option value="">Estimado: ${e.sexo.valor === 'F' ? 'feminino' : 'masculino'}</option>
            <option value="F" ${c.sexo === 'F' ? 'selected' : ''}>Feminino (confirmado)</option><option value="M" ${c.sexo === 'M' ? 'selected' : ''}>Masculino (confirmado)</option></select></div>
      </div>
      <p><span class="muted peq">Endereço${c.enderecoAtual ? ' cadastrado' : ''}</span><br>${esc(c.endereco)}</p>
      ${c.rel && norm(c.rel.criador.endereco) !== norm(c.endereco) ? `<p class="peq"><span class="muted">Endereço no SISPASS:</span> ${esc(c.rel.criador.endereco)}, ${esc(c.rel.criador.bairro)}, ${esc(c.rel.criador.municipio)}</p>` : ''}
      ${c.enderecoAtual ? `<p class="aviso-box"><b>Endereço atual:</b> ${esc(c.enderecoAtual)}</p>` : ''}
      <details class="end-atual" ${c.enderecoAtual ? '' : ''}><summary class="peq muted">${c.enderecoAtual ? 'Editar endereço atual' : 'Informar endereço atual (mudança)'}</summary>
        <input id="end-atual" value="${esc(c.enderecoAtual || '')}" placeholder="Rua, nº, bairro, cidade">
        <span id="end-atual-m" class="peq muted"></span></details>
      <label for="obs-campo" style="margin-top:8px">Observações de campo</label>
      <textarea id="obs-campo" rows="3" placeholder="Constatações e observações da fiscalização">${esc(c.obs || '')}</textarea>
      <span id="obs-campo-m" class="peq muted"></span>
      ${c.rel?.criador.email ? `<p class="peq"><span class="muted">E-mail no SISPASS:</span> ${esc(c.rel.criador.email)}</p>` : ''}
      <div class="linha">
        <a class="btn sec" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}">Abrir no mapa</a>
        <button class="sec" id="copiar" type="button">Copiar CPF</button>
        <button class="sec" id="imprimir-ficha" type="button">Imprimir ficha (PDF)</button>
        <button class="sec" id="doc-regular" type="button">Regularizar plantel</button>
        <button class="sec" id="doc-notif" type="button">Notificação</button>
      </div></div>
    </div>

    ${e.ameacadas.length ? `<div class="card ameacado"><h2>Aves de espécies ameaçadas</h2>
      ${e.ameacadas.map(a => `<div class="peq">${chipAmeaca(a)} <b>${esc(a.popular)}</b> <i>${esc(a.especie)}</i> · ${linkAnilha(a.anilha)}</div>`).join('')}
      <p class="muted peq">RS: Decreto 51.797/2014. BR: Portaria MMA 444/2014 (redação da Portaria MMA 1.704/2026).</p></div>` : ''}

    ${vincTxt ? `<details class="card card-dobra"><summary><b>Vínculos de cadastro com outros criadores</b></summary><div style="margin-top:8px">${vincTxt}</div></details>` : ''}
      </aside>
      <section class="conteudo ${abaAberta ? '' : 'recolhida'}">
        <div class="abas" role="tablist">${ABAS.map(([k, t, n]) => `<button role="tab" type="button" class="aba-b" data-aba="${k}" aria-selected="${abaAberta && k === abaAtual}">${t}${n !== '' ? ` <span class="cont">${n}</span>` : ''}</button>`).join('')}</div>
        ${ABAS.map(([k, , , h]) => `<div class="aba" data-aba="${k}" role="tabpanel" ${abaAberta && k === abaAtual ? '' : 'hidden'}>${h}</div>`).join('')}
      </section>
    </div>`;
  const recarregar = () => { const y = window.scrollY; telaFicha(cpf); window.scrollTo(0, y); };
  ligarAbas();
  ligarFixar();
  ligarRecolhiveis('ficha');
  ligarMensagens(c, e);
  const bVinc = $('.aba-b[data-aba="vinc"]'); // o grafo só monta com a aba visível (precisa de tamanho)
  if (bVinc) { bVinc.addEventListener('click', () => { if (!$('.aba[data-aba="vinc"]').hidden) ligarGrafoFicha(c.cpf); }); if (!$('.aba[data-aba="vinc"]').hidden) ligarGrafoFicha(c.cpf); }
  const obsLink = () => { $('#v-obs-whats').href = 'https://wa.me/?text=' + encodeURIComponent($('#v-obs').value); };
  const acrescentar = t => { const o = $('#v-obs'); if (!o.value.includes(t)) o.value = (o.value.trim() ? o.value.trim() + ' ' : '') + t; obsLink(); };
  $('#v-obs').oninput = obsLink;
  for (const b of document.querySelectorAll('.chip-txt')) b.onclick = () => acrescentar(b.textContent);
  for (const g of document.querySelectorAll('.v-grave')) g.onchange = () => {
    if (g.checked) acrescentar(fraseGrave(g.value));
  };
  $('#v-obs-copiar').onclick = async () => {
    try { await navigator.clipboard.writeText($('#v-obs').value); $('#v-obs-copiar').textContent = 'Copiado'; }
    catch { $('#v-obs').select(); $('#v-obs-copiar').textContent = 'Use Ctrl+C'; }
  };
  ligarItens(recarregar);
  const contarConf = () => { const s = [...document.querySelectorAll('.v-ave')]; if ($('#v-conf-cont')) $('#v-conf-cont').textContent = `${s.filter(x => x.value).length} de ${s.length} conferidas`; };
  for (const s of document.querySelectorAll('.v-ave')) s.onchange = contarConf;
  $('#v-notif').onchange = e => { $('#v-notif-campos').hidden = !e.target.checked; };
  if ($('#v-todas')) $('#v-todas').onclick = () => { for (const s of document.querySelectorAll('.v-ave')) if (!s.value) s.value = 'ok'; contarConf(); };
  contarConf();
  for (const b of document.querySelectorAll('.b-rel')) b.onclick = () => {
    const caixa = $(`#rel-${b.dataset.id}`);
    if (!caixa.hidden) { caixa.hidden = true; return; }
    caixa.querySelector('textarea').value = textoRelatorioVistoria(c, e, e.vistorias.find(v => v.id === b.dataset.id));
    caixa.hidden = false;
  };
  for (const b of document.querySelectorAll('.b-rel-copiar')) b.onclick = async () => {
    const t = b.closest('.rel-caixa').querySelector('textarea');
    try { await navigator.clipboard.writeText(t.value); b.textContent = 'Copiado'; } catch { t.select(); b.textContent = 'Use Ctrl+C'; }
  };
  for (const b of document.querySelectorAll('.b-rel-imprimir')) b.onclick = () => imprimirTexto(b.closest('.rel-caixa').querySelector('textarea').value);
  $('#copiar').onclick = async () => {
    try { await navigator.clipboard.writeText(c.cpf); $('#copiar').textContent = 'CPF copiado'; } catch { $('#copiar').textContent = c.cpf; }
  };
  $('#imprimir-ficha').onclick = () => imprimirFicha(c, e);
  const semAgente = () => !db.cfg.agente?.nome && (aviso('Preencha o nome do agente em Dados, item 4.'), true);
  const itensRegular = () => e.abertos.filter(i => i.destino !== 'Campo' && i.tipo === 'nc').map(i => `${i.titulo}${i.base ? ' (' + i.base + ')' : ''}`);
  $('#doc-regular').onclick = () => {
    if (semAgente()) return;
    const limite = Normas.somarDias(hojeIso(), 15);
    imprimirDoc(Docs.regularizacaoPlantel({
      criador: { nome: c.nome, cpf: c.cpf, registro: c.registro, endereco: [c.enderecoAtual || c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ') },
      itens: itensRegular(), prazo: 15, dataLimite: Normas.fmt(new Date(limite + 'T12:00')), ciencia: Normas.fmt(new Date()),
    }, db.cfg));
  };
  $('#doc-notif').onclick = () => {
    if (semAgente()) return;
    const motivo = itensRegular().join(' ') || 'Irregularidades constatadas na criação amadora de passeriformes.';
    const lo = { endereco: c.enderecoAtual || c.endereco, bairro: c.bairro, cidade: c.cidade };
    imprimirDoc(Docs.notificacao({ data: new Date().toISOString().slice(0, 16), pessoa: { nome: c.nome, cpf: c.cpf, endereco: lo.endereco, bairro: c.bairro, cidade: c.cidade },
      local: lo, notificacao: { motivo, comparecimento: db.cfg.comparecimento || '' } }, db.cfg));
  };
  $('#sexo').onchange = async ev => { c.sexo = ev.target.value || undefined; sujos.add(c.cpf); await salvar(); aviso('Sexo salvo.'); recarregar(); };
  if ($('#end-atual')) $('#end-atual').onchange = async ev => {
    const novo = ev.target.value.trim();
    if (novo === (c.enderecoAtual || '')) return;
    c.enderecoAtual = novo || undefined; sujos.add(c.cpf); await salvar(); aviso('Endereço atual salvo.');
    const y = window.scrollY; telaFicha(cpf); window.scrollTo(0, y);
  };
  if ($('#obs-campo')) $('#obs-campo').onchange = async ev => {
    const novo = ev.target.value.trim();
    if (novo === (c.obs || '')) return;
    c.obs = novo || undefined; sujos.add(c.cpf); await salvar(); aviso('Observações salvas.');
    const y = window.scrollY; telaFicha(cpf); window.scrollTo(0, y); // reflete na aba Histórico
  };
  $('#b-vistoria').onclick = async () => {
    const v = { id: Date.now().toString(36), data: $('#v-data').value || hojeIso(), resultado: $('#v-res').value,
      maneja: $('#v-maneja').value, manejaNome: $('#v-maneja-nome').value.trim(), endereco: $('#v-end').value.trim(), obs: $('#v-obs').value.trim(),
      ok: [], irregular: [], graves: [...document.querySelectorAll('.v-grave:checked')].map(x => x.value) };
    for (const s of document.querySelectorAll('.v-item')) if (s.value) v[s.value].push(s.dataset.id);
    v.aves = {};
    for (const s of document.querySelectorAll('.v-ave')) if (s.value) v.aves[s.dataset.k] = s.value;
    v.extras = lerExtras($('#v-extras').value);
    if ($('#v-notif').checked) v.notificacao = { ciencia: $('#v-notif-ciencia').value || v.data, prazo: Math.max(1, parseInt($('#v-notif-prazo').value) || 15), objeto: $('#v-notif-objeto').value.trim() };
    const conf = Normas.resumoConferencia(avesAtivas(c), v);
    if (v.resultado === 'regular' && (v.irregular.length || v.graves.length || conf.irregular)) v.resultado = 'irregular';
    if (v.endereco && v.endereco !== c.endereco) { c.endereco = v.endereco; idxSujo = true; }
    (c.vistorias ||= []).push(v);
    sujos.add(c.cpf);
    await salvar();
    aviso('Vistoria salva.');
    recarregar();
  };
  for (const b of document.querySelectorAll('.b-del-vist')) b.onclick = async () => {
    if (!confirm('Excluir esta vistoria?')) return;
    c.vistorias = c.vistorias.filter(v => v.id !== b.dataset.id);
    sujos.add(c.cpf);
    await salvar();
    aviso('Vistoria excluída.');
    recarregar();
  };
  window.scrollTo(0, 0);
}


// ---------- prazos (notificações em vistoria e retornos de abordagem) ----------
function prazosAbertos() {
  const hoje = hojeIso(), out = [];
  for (const c of Object.values(db.criadores)) if (c.vistorias?.some(v => v.notificacao)) for (const i of estado(c).abertos) if (i.grupo === 'prazo') out.push({ venc: i.vencimento, c, i });
  for (const ab of Object.values(db.abordagens)) if (ab.prazo?.data && ab.prazo.situacao !== 'concluido') out.push({ venc: ab.prazo.data, ab });
  for (const p of out) p.sit = Normas.situacaoPrazo(p.venc, hoje);
  return out.sort((a, b) => a.venc.localeCompare(b.venc));
}
function cardPrazos() {
  const l = prazosAbertos();
  if (!l.length) return '';
  const vencidos = l.filter(p => p.sit.vencido).length;
  return `<div class="card ${vencidos ? 'prazo-vencido' : ''}"><h2>Prazos em aberto (${l.length}${vencidos ? `, ${vencidos} vencido(s)` : ''})</h2>
    ${l.map(p => p.c ? htmlItem(p.c, p.i, true) : `<div class="item">
      <div class="linha">${chip('Abordagem')}${chip(p.sit.vencido ? 'prazo vencido' : 'prazo', p.sit.vencido ? 'alerta' : 'aviso')}
        <a href="#/ab/${p.ab.id}"><b>${esc(p.ab.pessoa?.nome || 'Abordado não identificado')}</b></a> <span class="muted peq">${esc(p.ab.local?.cidade || '')}</span></div>
      <b>Retorno: ${esc(p.sit.texto)}</b><div class="peq">${esc(p.ab.prazo.motivo || '')}</div>
      <div class="linha">${botaoAgendaAb(p.ab)}<button class="sec b-ab-concluir" type="button" data-id="${p.ab.id}">Concluído</button></div></div>`).join('')}</div>`;
}
const botaoAgendaAb = ab => `<button class="sec b-agenda" type="button" data-uid="ab-${esc(ab.id)}" data-data="${esc(ab.prazo.data)}"
  data-titulo="${esc('Retorno: ' + (ab.pessoa?.nome || ab.local?.endereco || 'abordagem'))}" data-desc="${esc([ab.prazo.motivo, [ab.local?.endereco, ab.local?.bairro, ab.local?.cidade].filter(Boolean).join(', ')].filter(Boolean).join('\n'))}">Adicionar à agenda</button>`;
// Baixa um .ics; no celular, abrir o arquivo oferece incluir o evento (com alarme na véspera) na agenda.
function ligarAgenda() {
  for (const b of document.querySelectorAll('.b-agenda')) b.onclick = () => {
    const t = Normas.ics({ uid: b.dataset.uid, data: b.dataset.data, titulo: b.dataset.titulo, descricao: b.dataset.desc });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([t], { type: 'text/calendar' })), download: `prazo-${b.dataset.data}.ics` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}
// Menu: quantidade de prazos vencidos ao lado de "Pendências".
// Qual item do menu corresponde ao hash atual (ficha e sub-rotas contam para a seção de origem).
function secaoAtual(h) {
  if (h === '#/dados') return '#/dados';
  if (h === '#/pendencias') return '#/pendencias';
  if (h === '#/painel') return '#/painel';
  if (h === '#/graficos' || h.startsWith('#/grafo/')) return '#/graficos';
  if (h === '#/abordagens' || h.startsWith('#/ab/')) return '#/abordagens';
  if (h === '#/' || h.startsWith('#/?') || h.startsWith('#/c/') || h.startsWith('#/anilha/')) return '#/';
  return '';
}
function marcarNav() {
  const a = $('#nav a[href="#/pendencias"]');
  if (!a || !db) return;
  const n = prazosAbertos().filter(p => p.sit.vencido).length;
  a.innerHTML = 'Pendências' + (n ? ` <span class="tag alerta" title="prazos vencidos">${n}</span>` : '');
  const atual = secaoAtual(location.hash);
  for (const l of document.querySelectorAll('#nav a')) {
    const ativo = l.getAttribute('href') === atual;
    l.classList.toggle('ativo', ativo);
    if (ativo) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
  }
}

// ---------- pendências (fila de trabalho) ----------
const filtroPend = { destino: 'acoes', cidade: '', tipo: '' };
function telaPendencias() {
  const todos = Object.values(db.criadores).filter(c => c.rel || c.vistorias?.length);
  const cidades = [...new Set(todos.map(c => c.cidade).filter(Boolean))].sort();
  const lista = todos.filter(c => !filtroPend.cidade || c.cidade === filtroPend.cidade)
    .flatMap(c => estado(c).abertos.filter(i => i.grupo !== 'prazo').map(i => ({ c, i })))
    .filter(({ i }) => filtroPend.destino === 'todas' || (filtroPend.destino === 'acoes' ? i.destino !== 'Campo' : i.destino === filtroPend.destino))
    .filter(({ i }) => !filtroPend.tipo || i.tipo === filtroPend.tipo)
    .sort((a, b) => (Parser.parseData(b.i.data) || 0) - (Parser.parseData(a.i.data) || 0));
  const porDestino = d => todos.reduce((n, c) => n + estado(c).abertos.filter(i => i.destino === d).length, 0);
  app.innerHTML = `<div class="tela-lista">
    <div class="lista-topo">
      <div class="card"><h1>Pendências</h1>
        <div class="sits">${DESTINOS.map(d => `<div class="sit ${porDestino(d) ? 'ruim' : 'bom'}"><span>${esc(DESTINO_TXT[d])}</span>${porDestino(d)}</div>`).join('')}</div></div>
      <div class="filtros">
        <select id="p-dest">${[['acoes', 'SISPASS, SEMA e notificações'], ['todas', 'Todas'], ...DESTINOS.map(d => [d, DESTINO_TXT[d]])]
          .map(([v, t]) => `<option value="${v}" ${v === filtroPend.destino ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select id="p-cid"><option value="">Todas as cidades</option>${cidades.map(c => `<option ${c === filtroPend.cidade ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select id="p-tipo">${[['', 'Todos os tipos'], ['nc', 'Não conformidades'], ['conferir', 'Conferências'], ['indicio', 'Indícios']]
          .map(([v, t]) => `<option value="${v}" ${v === filtroPend.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <p class="muted peq" id="cont">${lista.length} pendência(s). A lista mostra só criadores com relatório importado ou com vistoria registrada.</p>
    </div>
    <div class="rolavel card" style="padding:0 14px">
      ${cardPrazos()}
      ${lista.slice(0, 300).map(({ c, i }) => htmlItem(c, i, true)).join('') || '<p class="muted">Nenhuma pendência.</p>'}
      ${lista.length > 300 ? '<p class="muted peq">Mostrando as 300 mais recentes. Use os filtros.</p>' : ''}
    </div>
  </div>`;
  document.documentElement.style.setProperty('--topo-h', $('.topo').offsetHeight + 'px');
  $('#p-dest').onchange = ev => { filtroPend.destino = ev.target.value; telaPendencias(); };
  $('#p-cid').onchange = ev => { filtroPend.cidade = ev.target.value; telaPendencias(); };
  $('#p-tipo').onchange = ev => { filtroPend.tipo = ev.target.value; telaPendencias(); };
  ligarItens(() => { const y = $('.rolavel')?.scrollTop || 0; telaPendencias(); const r = $('.rolavel'); if (r) r.scrollTop = y; });
  for (const b of document.querySelectorAll('.b-ab-concluir')) b.onclick = async () => {
    const ab = db.abordagens[b.dataset.id]; ab.prazo.situacao = 'concluido'; ab.atualizadoEm = new Date().toISOString();
    sujosAb.add(ab.id); await salvar(); aviso('Prazo concluído.'); telaPendencias();
  };
}

// ---------- vínculos de cadastro (e-mail, telefone, IP e endereço compartilhados) ----------
function telaVinculos() {
  const { grupos } = indices();
  const bloco = (tipo, titulo, nota) => {
    const g = Object.entries(grupos[tipo]).sort((a, b) => b[1].size - a[1].size);
    return `<div class="card"><h2>${titulo} (${g.length})</h2><p class="muted peq">${nota}</p>
      ${!g.length ? '<p class="muted peq">Nenhum compartilhado.</p>' : `<div class="tabela"><table><thead><tr><th>${titulo.split(' ')[0]}</th><th>Criadores</th><th>Quem</th></tr></thead><tbody>
      ${g.map(([k, s]) => `<tr><td>${esc(k)}</td><td>${s.size}</td><td style="white-space:normal">${[...s].map(x => `<a href="#/c/${x}">${esc(db.criadores[x]?.nome)}</a> <span class="muted">(${esc(db.criadores[x]?.cidade)})</span>`).join('<br>')}</td></tr>`).join('')}
      </tbody></table></div>`}</div>`;
  };
  app.innerHTML = `<div class="card"><h1>Vínculos de cadastro</h1>
    <p class="muted peq">O mesmo dado em criadores diferentes pode indicar duas situações. Uma associação ou um terceiro opera o SISPASS (a senha é pessoal: IN SEMA 04/2022, art. 15, §1º; a associação precisa de procuração específica: IN IBAMA 10/2011, art. 60). Ou mais de um criador mora na mesma casa (art. 11, §2º). A tela usa só relatórios importados. Inclui e-mails e telefones antigos das alterações de cadastro.</p></div>
    ${bloco('email', 'E-mails compartilhados', 'Sinal forte. O mesmo e-mail aparece em cadastros diferentes.')}
    ${bloco('fone', 'Telefones compartilhados', 'O app compara os 8 últimos dígitos.')}
    ${bloco('endereco', 'Endereços compartilhados', 'Vem da planilha de criadores. O app pode não detectar grafias diferentes do mesmo endereço.')}
    ${bloco('ip', 'IPs de acesso compartilhados', 'Sinal fraco. As operadoras de internet compartilham o mesmo IP entre clientes.')}`;
}


// ---------- painel gerencial ----------
const ROTULO_ITEM = { licenca: 'Licença do período irregular', inadimplentes: '2+ licenças inadimplentes', ctf: 'CTF cancelado', zerado: 'Plantel zerado',
  plantel50: 'Mais de 50 aves', transf35: 'Mais de 35 transferências', transf90: 'Repasse antes de 90 dias', idade35: 'Transferida com < 35 dias',
  anexoII: 'Espécie do Anexo II transacionada', foraAnexo: 'Espécie fora dos Anexos', diametro: 'Diâmetro de anilha divergente',
  longevidade: 'Ave muito velha', art71: 'Ameaçada CR (ART)', genotipagem: 'Genotipagem obrigatória', reiteradas: 'Fugas/roubos reiterados',
  baixa30: 'Baixas > 30% do plantel', nasc35: 'Mais de 35 nascimentos', bo: 'B.O. a conferir', anilhaObito: 'Anilha de óbito a conferir',
  mesmoEndereco: 'Mais de um criador no endereço', sol: 'Autorização SOL a conferir', vincEmail: 'E-mail compartilhado', vincFone: 'Telefone compartilhado',
  vincIp: 'IP compartilhado', prazo: 'Prazo de notificação', suspender: 'Suspender licença no SISPASS', fachada: 'Titular não maneja as aves',
  'ind:saidaRapida': 'Indício: recebida e logo baixada', 'ind:semDestino': 'Indício: recebida sem destino', 'ind:movAlta': 'Indício: movimentação alta',
  'ind:semLicenca': 'Indício: operações bloqueadas', 'ind:semMov': 'Indício: sem movimentação' };
const chaveItem = i => i.id.startsWith('ind:') ? i.id : i.id.split(':')[0];

function barras(linhas, opts = {}) { // linhas: [{rotulo, valor, total?, href?, extra?}]
  const max = Math.max(1, ...linhas.map(l => l.total ?? l.valor));
  if (!linhas.length) return '<p class="muted peq">Sem dados.</p>';
  return `<div class="barras">${linhas.map(l => {
    const dica = `${l.rotulo}: ${l.valor}${l.total !== undefined ? ` de ${l.total}` : ''}`;
    const conteudo = `<span class="b-rot">${esc(l.rotulo)}${l.extra || ''}</span>
      <span class="b-trilho" title="${esc(dica)}">${l.total !== undefined ? `<span class="b-total" style="width:${l.total / max * 100}%"></span>` : ''}
        <span class="b-valor" style="width:${l.valor / max * 100}%"></span></span>
      <span class="b-num">${l.valor}${l.total !== undefined ? `<span class="muted">/${l.total}</span>` : ''}</span>`;
    return l.href ? `<a class="barra" href="${l.href}">${conteudo}</a>` : `<div class="barra">${conteudo}</div>`;
  }).join('')}</div>${opts.nota ? `<p class="muted peq">${opts.nota}</p>` : ''}`;
}

function telaPainel() {
  const todos = Object.values(db.criadores), comRel = todos.filter(c => c.rel), hoje = new Date(), per = Normas.periodo(hoje);
  const E = new Map(todos.map(c => [c.cpf, estado(c)]));
  const conta = f => todos.filter(c => passaFiltro(c, f)).length;
  const card = (rot, val, href, cls = '', sub = '') => `<a class="kpi ${cls}" href="${href}"><span>${rot}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</a>`;
  const pct = (a, b) => b ? ` (${Math.round(a / b * 100)}%)` : '';

  // Aves e movimentação (só relatórios importados)
  let ativas = 0, ameacadas = 0, anexoII = 0;
  const especies = {}, mov = {}, ultimosPer = [];
  for (let k = 5; k >= 0; k--) ultimosPer.push(Normas.periodo(new Date(per.inicio.getFullYear() - k, 7, 1)).rotulo);
  const somaMov = (data, campo) => { const d = Parser.parseData(data); if (!d) return; const p = Normas.periodo(d).rotulo; ((mov[p] ||= {})[campo] = (mov[p][campo] || 0) + 1); };
  const confirmada = r => /confirmar/i.test(r['Operação do Receptor'] || '');
  for (const c of comRel) {
    const s = c.rel.secoes;
    for (const a of s.Plantel || []) {
      if (!/^ativ/i.test(a['Situação'] || '')) continue;
      ativas++;
      const nome = a['Nome Popular'] || a['Espécie'];
      const am = Normas.ameaca(a['Espécie']);
      (especies[nome] ||= { n: 0, am });
      especies[nome].n++;
      if (am) ameacadas++;
      if (Normas.especie(a['Espécie'])?.anexo === 'II') anexoII++;
    }
    for (const r of (s['Transferências Recebidas'] || []).filter(confirmada)) somaMov(r['Data do Recebimento'], 'Recebidas');
    for (const r of (s['Transferências Solicitadas'] || []).filter(confirmada)) somaMov(r.Data, 'Enviadas');
    for (const h of s['Histórico de Operações'] || []) {
      const op = h['Operação'] || '';
      if (/nasc/i.test(op)) somaMov(h.Data, 'Nascimentos');
      else if (/fuga/i.test(op)) somaMov(h.Data, 'Fugas');
      else if (/roubo|furto/i.test(op)) somaMov(h.Data, 'Roubos/furtos');
      else if (/(ó|o|\?|ã³)bito/i.test(op)) somaMov(h.Data, 'Óbitos');
    }
  }
  const totMov = campo => Object.values(mov).reduce((n, m) => n + (m[campo] || 0), 0);
  const MOVS = ['Recebidas', 'Enviadas', 'Nascimentos', 'Fugas', 'Roubos/furtos', 'Óbitos'];

  // Pendências por tipo e vistorias por mês
  const pend = {};
  for (const e of E.values()) for (const i of e.abertos) pend[chaveItem(i)] = (pend[chaveItem(i)] || 0) + 1;
  const meses = [];
  for (let k = 11; k >= 0; k--) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1); meses.push(d.toISOString().slice(0, 7)); }
  const vistMes = Object.fromEntries(meses.map(m => [m, 0]));
  for (const c of todos) for (const v of c.vistorias || []) if (v.data.slice(0, 7) in vistMes) vistMes[v.data.slice(0, 7)]++;

  const cidades = [...new Set(todos.map(c => c.cidade).filter(Boolean))].sort();
  const sexoConf = s => todos.filter(c => c.sexo === s).length;
  const grupos = indices().grupos;

  app.innerHTML = `<div class="tela-lista">
    <div class="lista-topo"><div class="card"><h1>Painel</h1>
      <p class="muted peq">Período de licença ${per.rotulo}. Os números de aves, movimentação e pendências usam só os ${comRel.length} de ${todos.length} criadores com relatório importado${pct(comRel.length, todos.length)}.</p></div></div>
    <div class="rolavel">
    <h2 class="sec-tit">Criadores e fiscalização</h2>
    <div class="kpis">
      ${card('Criadores na base', todos.length, '#/?f=')}
      ${card('Com relatório importado', comRel.length, '#/?f=semrel', '', `faltam ${todos.length - comRel.length}`)}
      ${card(`Fiscalizados em ${per.rotulo}`, conta('fisc'), '#/?f=fisc', 'bom', pct(conta('fisc'), todos.length).trim())}
      ${card('Não fiscalizados', conta('naofisc'), '#/?f=naofisc')}
      ${card('Última vistoria irregular', conta('irregular'), '#/?f=irregular', conta('irregular') ? 'ruim' : '')}
      ${card('Não localizados', conta('naoloc'), '#/?f=naoloc', conta('naoloc') ? 'ruim' : '')}
      ${card('Licenças suspensas por você', conta('suspensa'), '#/?f=suspensa')}
      ${card('CTF cancelado', conta('ctf'), '#/?f=ctf', conta('ctf') ? 'ruim' : '')}
      ${card(`Licença ${per.rotulo} irregular`, conta('licenca'), '#/?f=licenca', conta('licenca') ? 'ruim' : '')}
      ${card('Com pendência em aberto', conta('abertos'), '#/pendencias', conta('abertos') ? 'ruim' : '')}
      ${(() => { const p = prazosAbertos(), v = p.filter(x => x.sit.vencido).length; return card('Prazos vencidos', v, '#/pendencias', v ? 'ruim' : '', `${p.length} prazo(s) em aberto`); })()}
    </div>

    ${kpisAbordagens(card)}

    <h2 class="sec-tit">Titulares</h2>
    <div class="kpis">
      ${card('Mulheres', conta('F'), '#/?f=F', '', `${sexoConf('F')} confirmadas; demais estimadas pelo nome`)}
      ${card('Homens', conta('M'), '#/?f=M', '', `${sexoConf('M')} confirmados; demais estimados pelo nome`)}
      ${card('Titular não maneja as aves', conta('fachada'), '#/?f=fachada', conta('fachada') ? 'ruim' : '', 'constatado em vistoria')}
      ${card('E-mails compartilhados', Object.keys(grupos.email).length, '#/vinculos', '', `${conta('vinculo')} criadores com e-mail/telefone em comum`)}
      ${card('Endereços com 2+ criadores', Object.keys(grupos.endereco).length, '#/vinculos')}
    </div>

    <h2 class="sec-tit">Aves</h2>
    <div class="kpis">
      ${card('Aves ativas', ativas, '#/?f=')}
      ${card('De espécies ameaçadas', ameacadas, '#/?f=ameacadas', ameacadas ? 'ameaca' : '', `${conta('ameacadas')} criadores`)}
      ${card('Do Anexo II (proibidas de transacionar)', anexoII, '#/?f=')}
      ${card('Óbitos declarados', totMov('Óbitos'), '#/idades', '', 'ver idades')}
      ${card('Fugas declaradas', totMov('Fugas'), '#/?f=ocorr')}
      ${card('Roubos/furtos', totMov('Roubos/furtos'), '#/?f=ocorr')}
      ${card('Transferências recebidas', totMov('Recebidas'), '#/?f=')}
      ${card('Nascimentos declarados', totMov('Nascimentos'), '#/?f=')}
    </div>

    <div class="card"><h2>Fiscalização por município (${per.rotulo})</h2>
      ${barras(cidades.map(cid => { const cs = todos.filter(c => c.cidade === cid); return { rotulo: cid, valor: cs.filter(c => E.get(c.cpf).fiscalizado).length, total: cs.length,
        href: `#/?f=naofisc&cidade=${encodeURIComponent(cid)}` }; }), { nota: 'A barra escura mostra os fiscalizados. Toque para ver os não fiscalizados da cidade.' })}</div>

    <div class="card"><h2>Pendências em aberto por tipo</h2>
      ${barras(Object.entries(pend).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ rotulo: ROTULO_ITEM[k] || k, valor: n, href: `#/?f=item:${encodeURIComponent(k)}` })))}</div>

    <div class="card"><h2>Movimentação por período de licença</h2>
      <div class="tabela"><table><thead><tr><th>Período</th>${MOVS.map(m => `<th>${m}</th>`).join('')}</tr></thead><tbody>
      ${ultimosPer.map(p => `<tr><td>${p}</td>${MOVS.map(m => `<td>${mov[p]?.[m] || 0}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="muted peq">Usa as transferências confirmadas e os eventos do histórico dos relatórios importados. Uma transferência entre dois criadores da base aparece como enviada em um e recebida no outro.</p></div>

    <div class="card"><h2>Espécies com mais aves ativas</h2>
      ${barras(Object.entries(especies).sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([nome, x]) => ({ rotulo: nome, valor: x.n,
        extra: x.am ? ` <span class="tag ameaca">${[x.am.rs && 'RS ' + x.am.rs, x.am.br && 'BR ' + x.am.br].filter(Boolean).join(' · ')}</span>` : '',
        href: `#/?f=&q=${encodeURIComponent(nome)}` })))}</div>

    <div class="card"><h2>Vistorias por mês</h2>
      ${barras(meses.map(m => ({ rotulo: `${m.slice(5)}/${m.slice(0, 4)}`, valor: vistMes[m] })))}</div>
    </div></div>`;
  document.documentElement.style.setProperty('--topo-h', $('.topo').offsetHeight + 'px');
  ligarRecolhiveis('painel');
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
    const base = { cpf, registro: l.registro || l.cadastro || '', nome: nomeProprio(l.criador || l.nome || ''),
      bairro: l.bairro || '', endereco: l.endereco || '', cidade: l.cidade || l.municipio || '' };
    const atual = db.criadores[cpf];
    if (atual) { Object.assign(atual, base); atualizados++; } else { db.criadores[cpf] = { ...base, rel: null, fisc: null }; novos++; }
    sujos.add(cpf);
  }
  idxSujo = true;
  return `${novos} criador(es) novo(s), ${atualizados} atualizado(s).`;
}

// Cidade vinda do SISPASS ("TRAMANDAI/RS") usa a grafia já existente na base ("Tramandaí"), se houver.
function cidadeDe(municipio) {
  const m = String(municipio).replace(/\/[A-Z]{2}$/i, '').trim();
  return Object.values(db.criadores).map(c => c.cidade).find(x => x && x !== x.toUpperCase() && norm(x) === norm(m)) || nomeProprio(m);
}

function importarRelatorio(texto) {
  const rel = parseRelatorio(texto);
  const d = rel.criador;
  db.criadores[rel.cpf] ||= { cpf: rel.cpf, registro: d.cadastro, nome: nomeProprio(d.nome), bairro: d.bairro,
    endereco: d.endereco, cidade: cidadeDe(d.municipio), rel: null };
  db.criadores[rel.cpf].rel = { importadoEm: agora(), criador: d, secoes: rel.secoes };
  sujos.add(rel.cpf);
  idxSujo = true;
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
    const e = estado(c), r = e.r;
    return {
      CPF: fmtCpf(c.cpf), Registro: String(c.registro), Nome: c.nome, Sexo: (e.sexo.valor === 'F' ? 'Feminino' : 'Masculino') + (e.sexo.estimado ? ' (estimado)' : ''),
      Cidade: c.cidade, Bairro: c.bairro, 'Endereço': c.endereco, 'Endereço atual': c.enderecoAtual || '', 'Observações de campo': c.obs || '', 'E-mail SISPASS': c.rel?.criador.email || '',
      CTF: e.ctf?.status || '', [`Licença ${Normas.periodo(new Date()).rotulo}`]: e.lic?.status || '', 'Aves ameaçadas': e.ameacadas.length,
      'Última vistoria': e.ultima?.data || '', Resultado: e.ultima ? RESULTADO[e.ultima.resultado] : '', 'Fiscalizado no período': e.fiscalizado ? 'Sim' : 'Não',
      'Pendências abertas': e.abertos.length, 'Relatório importado em': c.rel?.importadoEm || '', 'Aves ativas': r ? r.ativas : '', 'Total de aves': r ? r.total : '',
      'Fugas/roubos/óbitos': r ? r.ocorrencias.length : '', 'Última operação': r?.ultimaOperacao || '',
      _estado: JSON.stringify({ sexo: c.sexo, enderecoAtual: c.enderecoAtual, obs: c.obs, vistorias: c.vistorias, acoes: c.acoes, notas: c.notas }),
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
  aba('Óbitos-Idades', obitosDaBase().map(o => ({ CPF: fmtCpf(o.cpf), Criador: db.criadores[o.cpf]?.nome, 'Data do óbito': o.data,
    Anilha: o.anilha, Ave: o.nomePopular, 'Espécie': o.especie, Nascimento: o.nascimento, 'Idade (anos)': o.idadeAnos ?? '' })));
  aba('Histórico', comRel.flatMap(c => comCriador(c, c.rel.secoes['Histórico de Operações'])));
  aba('Vistorias', todos.flatMap(c => (c.vistorias || []).map(v => ({ CPF: fmtCpf(c.cpf), Criador: c.nome, Data: v.data, Resultado: RESULTADO[v.resultado],
    'Quem maneja': v.maneja === 'outro' ? `Outra pessoa: ${v.manejaNome}` : v.maneja === 'titular' ? 'Titular' : '',
    'Infração grave (art. 62, §2º)': (v.graves || []).join(', '), 'Itens irregulares': (v.irregular || []).length, 'Observações': v.obs }))));
  aba('Pendências', todos.flatMap(c => estado(c).abertos.map(i => ({ CPF: fmtCpf(c.cpf), Criador: c.nome, Cidade: c.cidade, Destino: i.destino,
    Tipo: i.tipo, Item: i.titulo, Detalhe: i.texto, Base: i.base, 'Providência': i.providencia, 'Data do fato': i.data }))));
  const abs = Object.values(db.abordagens);
  aba('Abordagens', abs.map(linhaAbordagem));
  aba('Abordagens-Aves', abs.flatMap(ab => Normas.resumoAbordagem(ab).linhas.map(l => ({ Abordagem: ab.data || ab.denuncia?.data || '', Abordado: ab.pessoa?.nome || '',
    Cidade: ab.local?.cidade || '', Quantidade: l.qtd, Ave: l.comum || l.especie, 'Espécie': l.cientifico, Sexo: l.sexo || '', Anilha: l.anilha || '',
    Estado: l.estado || '', Destino: Normas.DESTINO_AVE[l.destino] || '', 'Ameaçada': l.ameaca ? [l.ameaca.rs && 'RS ' + l.ameaca.rs, l.ameaca.br && 'BR ' + l.ameaca.br].filter(Boolean).join(', ') : '' }))));
  aba('_abordagens', abs.map(ab => ({ id: ab.id, dados: JSON.stringify(ab) })));
  aba('_relatorios', relatorios);
  XLSX.writeFile(wb, `fiscal-passeriformes-${hojeIso()}.xlsx`);
  return `Planilha exportada: ${todos.length} criadores, ${comRel.length} com relatório.`;
}

function restaurarPlanilha(wb) {
  const ler = nome => XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: '', raw: false });
  const statusDe = { 'Visitado: regular': 'regular', 'Visitado: irregular': 'irregular', 'Não localizado': 'naoloc' }; // planilhas até a v1.7
  const outro = { criadores: {} };
  for (const l of ler('Criadores')) {
    const cpf = soDigitos(l.CPF);
    if (cpf.length !== 11) continue;
    let est = {};
    try { est = l._estado ? JSON.parse(l._estado) : {}; } catch { /* coluna ausente ou editada à mão */ }
    const c = outro.criadores[cpf] = { cpf, registro: l.Registro, nome: nomeProprio(l.Nome), cidade: l.Cidade, bairro: l.Bairro, endereco: l['Endereço'], rel: null, ...est };
    const status = statusDe[l['Situação fiscalização']] || '';
    if (status || l['Observações']) { c.fisc = { status, obs: l['Observações'], atualizadoEm: l['Atualizado em'] }; migrar(c); }
  }
  for (const l of ler('_relatorios')) {
    const texto = Object.keys(l).filter(k => k.startsWith('Parte ')).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6))).map(k => l[k]).join('');
    const rel = parseRelatorio(texto);
    outro.criadores[rel.cpf] ||= { cpf: rel.cpf, registro: rel.criador.cadastro, nome: nomeProprio(rel.criador.nome), bairro: rel.criador.bairro,
      endereco: rel.criador.endereco, cidade: cidadeDe(rel.criador.municipio), rel: null };
    outro.criadores[rel.cpf].rel = { importadoEm: l['Importado em'], criador: rel.criador, secoes: rel.secoes };
  }
  outro.abordagens = {};
  for (const l of wb.Sheets._abordagens ? ler('_abordagens') : []) { try { const ab = JSON.parse(l.dados); if (ab.id) outro.abordagens[ab.id] = ab; } catch { /* linha editada à mão */ } }
  return `Planilha de recuperação importada: ${mesclar(outro)} alteração(ões).`;
}

async function lerTexto(arquivo) {
  const buf = await arquivo.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

// Junta dados de outro aparelho ou da planilha: relatório mais recente, união das vistorias, providência mais recente.
function mesclar(outro) {
  let n = 0;
  for (const [cpf, b] of Object.entries(outro.criadores || {})) {
    migrar(b);
    const a = db.criadores[cpf];
    if (!a) { db.criadores[cpf] = b; sujos.add(cpf); n++; continue; }
    const antes = JSON.stringify(a);
    if (b.rel && (!a.rel || b.rel.importadoEm > a.rel.importadoEm)) a.rel = b.rel;
    const ids = new Set((a.vistorias || []).map(v => v.id));
    for (const v of b.vistorias || []) if (!ids.has(v.id)) (a.vistorias ||= []).push(v);
    for (const [k, v] of Object.entries(b.acoes || {})) if (!a.acoes?.[k] || v.data > a.acoes[k].data) (a.acoes ||= {})[k] = v;
    if (b.sexo && !a.sexo) a.sexo = b.sexo;
    if (b.enderecoAtual && !a.enderecoAtual) a.enderecoAtual = b.enderecoAtual;
    if (b.obs && !a.obs) a.obs = b.obs;
    if (b.notas && !a.notas) a.notas = b.notas;
    if (JSON.stringify(a) !== antes) { sujos.add(cpf); n++; }
  }
  if (n) idxSujo = true;
  for (const [id, b] of Object.entries(outro.abordagens || {})) { // vale a versão editada por último
    const a = db.abordagens[id];
    if (!a || (b.atualizadoEm || '') > (a.atualizadoEm || '')) { db.abordagens[id] = b; sujosAb.add(id); n++; }
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
      <p class="muted peq"><b>Planilha (.xlsx):</b> a planilha abre no Excel. Contém criadores, plantel, fugas, roubos, óbitos e histórico. A aba _relatorios guarda os relatórios completos. Para recuperar tudo, importe esta planilha no item 1. Atenção: a planilha não é criptografada.</p>
      <div class="linha"><button id="b-xlsx" type="button">Exportar planilha</button></div>
      <p id="m-xlsx" class="msg"></p>
      <p class="muted peq"><b>Backup criptografado (.json):</b> a sua senha protege o backup. No outro aparelho, importe o arquivo. O app mescla os dados. Para cada criador, o app mantém o relatório e a anotação mais recentes.</p>
      <div class="linha"><button id="b-nuvem" type="button">Enviar para a nuvem</button>
        <button class="sec" id="b-exp" type="button">Baixar backup</button>
        <label class="btn sec" style="margin:0">Importar backup<input type="file" id="f-bak" accept=".json,application/json" hidden></label></div>
      <p id="m-bak" class="msg"></p>
      <p class="muted peq"><b>Google Drive / OneDrive:</b> no celular, toque em "Enviar para a nuvem" e escolha o Drive ou o OneDrive. No computador, toque em "Baixar backup" e salve o arquivo na pasta do Drive ou do OneDrive. Para trazer de volta, toque em "Importar backup" e escolha o arquivo. O app guarda os dados no aparelho e funciona na rua, sem internet. A nuvem guarda o backup e passa os dados entre aparelhos.</p></div>

    <div class="card"><h2>4. Alertas, indícios e assinatura</h2>
      <div class="grade">
        <div><label for="c-idade">Ave ativa com mais de (anos)</label><input id="c-idade" type="number" min="1" value="${db.cfg.idadeMax}"></div>
        <div><label for="c-mov">Sem operações há mais de (anos)</label><input id="c-mov" type="number" min="1" value="${db.cfg.anosSemMov}"></div>
        <div><label for="c-saida">Ave recebida e baixada em até (dias)</label><input id="c-saida" type="number" min="1" value="${db.cfg.diasSaida ?? 30}"></div>
        <div><label for="c-ano">Movimentação alta a partir de (transferências/ano)</label><input id="c-ano" type="number" min="1" value="${db.cfg.transfAno ?? 10}"></div>
      </div>
      <label for="c-assin">Assinatura das mensagens</label>
      <textarea id="c-assin" rows="3" placeholder="Ex.: Nome, posto/graduação, PATRAM, pelotão, telefone">${esc(db.cfg.assinatura || '')}</textarea>
      <h3 style="margin:14px 0 4px;font-size:1rem">Documentos oficiais (notificação, apreensão, regularização)</h3>
      <div class="grade">
        <div><label for="g-nome">Nome do agente</label><input id="g-nome" value="${esc(db.cfg.agente?.nome || '')}" placeholder="Ex.: Sd PM Fulano de Tal"></div>
        <div><label for="g-id">Id Func.</label><input id="g-id" value="${esc(db.cfg.agente?.idFunc || '')}"></div>
        <div><label for="g-fr">Fração</label><input id="g-fr" value="${esc(db.cfg.agente?.fracao || '')}" placeholder="Ex.: 4º Pel / 1º BABM"></div>
      </div>
      <div class="grade" style="margin-top:6px">
        <div><label for="g-bras">Brasão (imagem)</label><input id="g-bras" type="file" accept="image/*"><span id="v-bras"></span></div>
        <div><label for="g-cmd">Logo do Comando (imagem)</label><input id="g-cmd" type="file" accept="image/*"><span id="v-cmd"></span></div>
      </div>
      <p class="muted peq">As imagens entram no cabeçalho dos documentos. Ficam salvas neste aparelho.</p>
      <p><button id="b-cfg" type="button">Salvar</button> <span id="m-cfg" class="muted peq"></span></p></div>

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
  // A tela pode ter mudado enquanto o salvamento terminava.
  const msg = (id, t, erro) => { const m = $(id); if (m) { m.textContent = t; m.className = 'msg' + (erro ? ' erro' : ''); } };

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
  const baixarBlob = (blob, nome) => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportarBackup = async enviar => {
    const nome = `backup-passeriformes-${hojeIso()}.json`;
    const blob = new Blob([JSON.stringify(await cifrar(chave, salt, db))], { type: 'application/json' });
    // No celular, "Enviar para a nuvem" abre o menu de compartilhar (Google Drive, OneDrive, etc.).
    if (enviar && navigator.canShare) {
      const arq = new File([blob], nome, { type: 'application/json' });
      if (navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq], title: nome }); return msg('#m-bak', 'Backup enviado. Salve no Google Drive ou OneDrive.'); }
        catch (err) { if (err.name === 'AbortError') return; } // fallback para download
      }
    }
    baixarBlob(blob, nome);
    msg('#m-bak', enviar ? 'Compartilhar indisponível neste aparelho: backup baixado. Salve o arquivo na pasta do Drive/OneDrive.' : 'Backup exportado.');
  };
  $('#b-exp').onclick = () => exportarBackup(false);
  if ($('#b-nuvem')) $('#b-nuvem').onclick = () => exportarBackup(true);
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
  const logos = { ...(db.cfg.logos || {}) };
  const verLogos = () => {
    $('#v-bras').innerHTML = logos.brasao ? `<img src="${esc(logos.brasao)}" alt="" style="height:48px;margin-left:8px;vertical-align:middle">` : '';
    $('#v-cmd').innerHTML = logos.comando ? `<img src="${esc(logos.comando)}" alt="" style="height:48px;margin-left:8px;vertical-align:middle">` : '';
  };
  verLogos();
  $('#g-bras').onchange = async e => { if (e.target.files[0]) { logos.brasao = await lerImagem(e.target.files[0]); verLogos(); } };
  $('#g-cmd').onchange = async e => { if (e.target.files[0]) { logos.comando = await lerImagem(e.target.files[0]); verLogos(); } };
  $('#b-cfg').onclick = async () => {
    db.cfg.idadeMax = Math.max(1, +$('#c-idade').value || 20);
    db.cfg.anosSemMov = Math.max(1, +$('#c-mov').value || 10);
    db.cfg.diasSaida = Math.max(1, +$('#c-saida').value || 30);
    db.cfg.transfAno = Math.max(1, +$('#c-ano').value || 10);
    db.cfg.assinatura = $('#c-assin').value.trim();
    db.cfg.agente = { nome: $('#g-nome').value.trim(), idFunc: $('#g-id').value.trim(), fracao: $('#g-fr').value.trim() };
    db.cfg.logos = logos;
    await salvar();
    msg('#m-cfg', 'Salvo.');
    aviso('Configurações salvas.');
  };
  $('#b-apagar').onclick = async () => {
    if (confirm('Apagar todos os dados deste aparelho?')) { await apagarTudo(); location.reload(); }
  };
}

// ---------- roteamento e bloqueio ----------
// Passarinho voando enquanto a tela monta (telas que varrem toda a base podem demorar).
// Passarinho amarelo da logo; a asa (cg-asa) bate enquanto a página carrega.
const PASSARINHO = '<svg viewBox="90 150 350 250" aria-hidden="true">'
  + '<path d="M150 300c0-80 60-140 140-140 30 0 52 10 70 26l62-14-38 48c4 14 6 28 6 44 0 80-64 136-150 136h-60l-60 40 20-70c-30-18-50-42-50-70z" fill="#f6c343"/>'
  + '<path class="cg-asa" d="M250 252 Q300 150 345 250 Q300 230 250 252 Z" fill="#e0a82e"/>'
  + '<circle cx="318" cy="216" r="16" fill="#0b2a1c"/>'
  + '</svg>';
function mostrarCarregando(on) {
  let el = document.getElementById('carregando');
  if (on) { if (!el) { el = document.createElement('div'); el.id = 'carregando'; el.innerHTML = `<div class="cg-cena"><div class="cg-voo">${PASSARINHO}</div></div><span>Carregando…</span>`; document.body.append(el); } el.classList.add('ativo'); }
  else if (el) el.classList.remove('ativo');
}
// Aviso curto de ação concluída (ex.: "Registro salvo."). Fica fora de #app, sobrevive ao re-render.
let toastT = null;
function aviso(texto) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = texto; el.classList.add('ativo');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('ativo'), 2200);
}
let navToken = 0;
function rotear() {
  if (!db) return telaSenha();
  const token = ++navToken; // cancela o loader de uma navegação anterior
  marcarNav();
  const h = location.hash;
  // Tela pesada: mostra o passarinho, deixa o navegador pintá-lo e só então renderiza.
  const pesada = render => { mostrarCarregando(true); requestAnimationFrame(() => requestAnimationFrame(() => {
    if (token !== navToken) return; try { render(); } finally { if (token === navToken) mostrarCarregando(false); } })); };
  const direta = render => { mostrarCarregando(false); render(); };
  if (h.startsWith('#/c/')) return direta(() => telaFicha(h.slice(4)));
  if (h === '#/dados') return direta(telaDados);
  if (h === '#/idades') return pesada(telaIdades);
  if (h === '#/pendencias') return pesada(telaPendencias);
  if (h === '#/vinculos') return pesada(telaVinculos);
  if (h === '#/painel') return pesada(telaPainel);
  if (h === '#/graficos') return pesada(telaGraficos);
  if (h.startsWith('#/grafo/')) return direta(() => telaGrafo(h.slice(8)));
  if (h === '#/abordagens') return direta(telaAbordagens);
  if (h.startsWith('#/ab/')) return direta(() => telaAbordagem(h.slice(5)));
  if (h.startsWith('#/?')) { // atalho vindo do painel: #/?f=filtro&cidade=X
    const q = new URLSearchParams(h.slice(3));
    filtro.status = q.get('f') || ''; filtro.cidade = q.get('cidade') || ''; filtro.q = q.get('q') || ''; rolagem = 0;
    return pesada(telaLista);
  }
  if (h.startsWith('#/anilha/')) return direta(() => telaAnilha(decodeURIComponent(h.slice(9))));
  return pesada(telaLista);
}
window.addEventListener('hashchange', rotear);
window.addEventListener('click', e => {
  if (e.target.closest?.('#lista a')) rolagem = $('#lista')?.scrollTop || 0;
});
$('#btn-bloquear').onclick = () => location.reload();

// Salvamento automático: grava o que estiver pendente a cada 30 s e ao sair/esconder o app.
async function autosalvar() {
  if (chave && db && (sujos.size || sujosAb.size)) { try { await salvar(); } catch { /* tenta no próximo ciclo */ } }
}
setInterval(autosalvar, 30000);
let escondidoEm = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { escondidoEm = Date.now(); autosalvar(); }
  else if (db && escondidoEm && Date.now() - escondidoEm > 5 * 60e3) location.reload();
});
addEventListener('pagehide', autosalvar);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js');
rotear();
