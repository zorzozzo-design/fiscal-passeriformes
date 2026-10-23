// Abordagens: fila de denúncias e registro de fiscalização em campo de qualquer pessoa (com ou sem cadastro no SISPASS).
// Script comum carregado antes do app.js; usa db, salvar, sujosAb, esc, $ e demais utilitários de lá (só em tempo de execução).
const STATUS_AB = { aberta: 'Denúncia aguardando atendimento', atendida: 'Atendida', improcedente: 'Atendida, sem constatação' };
const ORIGENS = ['Denúncia anônima', 'Disque-denúncia 181', 'Ministério Público', 'SEMA/IBAMA', 'Prefeitura', 'Patrulhamento', 'Operação'];
const PETRECHOS = ['gaiola', 'alçapão', 'gaiola de chama', 'visgo', 'rede de neblina', 'viveiro', 'comedouro/ceva'];
const FRASES_AB = [
  'No local, o abordado não apresentou licença, cadastro no SISPASS ou qualquer autorização para manter as aves.',
  'As aves estavam em gaiolas no pátio da residência.',
  'O abordado declarou ter capturado as aves na natureza.',
  'O abordado declarou ter adquirido as aves de terceiros, sem documentação.',
  'O abordado entregou as aves espontaneamente.',
  'Aves encaminhadas ao CETAS/CRAF para triagem e destinação.',
  'Aves com sinais de maus-tratos (gaiolas sujas, sem água ou alimento).',
  'Ninguém foi localizado no endereço da denúncia.',
  'Nada foi constatado no endereço da denúncia.',
];
const filtroAb = { status: '', q: '' };
const dataAb = ab => ab.data || ab.denuncia?.data || ab.criadoEm || '';
const agoraLocal = () => { const d = new Date(); return `${hojeIso()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const fmtDataAb = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] : ''}` : ''; };
// Troca o HTML só se mudou (evita perder um clique quando o campo perde o foco e dispara "change").
const porHtml = (el, h) => { if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } };
const criadorDoAbordado = ab => db.criadores[soDigitos(ab.pessoa?.cpf || '')] || null;

async function novaAbordagem(status) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), agora = new Date().toISOString();
  db.abordagens[id] = { id, status, criadoEm: agora, atualizadoEm: agora, data: status === 'atendida' ? agoraLocal() : '',
    denuncia: { data: status === 'aberta' ? hojeIso() : '', origem: '', protocolo: '', texto: '' },
    local: {}, pessoa: {}, documentacao: '', aves: [], petrechos: [], docs: {}, relato: '', equipe: db.cfg.equipe || '' };
  sujosAb.add(id);
  await salvar();
  location.hash = '#/ab/' + id;
}

function itemAbordagem(ab) {
  const r = Normas.resumoAbordagem(ab), lo = ab.local || {};
  return `<li><a href="#/ab/${ab.id}" class="${r.ameacadas ? 'ameacado' : ''}">
    <div class="nome">${esc(ab.pessoa?.nome || 'Abordado não identificado')}</div>
    <div class="muted peq">${esc(fmtDataAb(dataAb(ab)))} · ${esc([lo.endereco, lo.bairro, lo.cidade].filter(Boolean).join(', ') || 'local não informado')}</div>
    <div>${chip(STATUS_AB[ab.status] || ab.status, ab.status === 'aberta' ? 'aviso' : 'ok')}
      ${ab.denuncia?.protocolo ? chip('Denúncia ' + ab.denuncia.protocolo) : ''}
      ${r.aves ? chip(`${r.aves} ave(s)`) : ''}${r.ameacadas ? chip(`${r.ameacadas} ameaçada(s)`, 'ameaca') : ''}
      ${criadorDoAbordado(ab) ? chip('Criador do SISPASS') : ''}</div></a></li>`;
}

function telaAbordagens() {
  const todas = Object.values(db.abordagens).sort((a, b) => dataAb(b).localeCompare(dataAb(a)));
  const abertas = todas.filter(a => a.status === 'aberta').length;
  app.innerHTML = `<div class="card"><h1>Abordagens</h1>
      <p class="muted peq">Denúncias recebidas e fiscalizações em campo de qualquer pessoa, com ou sem cadastro no SISPASS.</p>
      <div class="linha"><button id="ab-nova-den" type="button">+ Nova denúncia</button><button class="sec" id="ab-nova" type="button">+ Abordagem sem denúncia</button></div></div>
    <div class="filtros">
      <input id="ab-q" type="search" placeholder="Nome, CPF, endereço, protocolo ou ave" value="${esc(filtroAb.q)}">
      <select id="ab-st"><option value="">Todas (${todas.length})</option>
        ${Object.entries(STATUS_AB).map(([k, t]) => `<option value="${k}" ${k === filtroAb.status ? 'selected' : ''}>${t}${k === 'aberta' ? ` (${abertas})` : ''}</option>`).join('')}</select>
    </div>
    <ul id="ab-lista" class="lista card" style="padding:0"></ul>`;
  const desenhar = () => {
    const q = norm(filtroAb.q);
    const vis = todas.filter(a => (!filtroAb.status || a.status === filtroAb.status)
      && (!q || norm(JSON.stringify([a.pessoa, a.local, a.denuncia?.protocolo, a.aves])).includes(q) || (soDigitos(q).length >= 3 && soDigitos(a.pessoa?.cpf || '').includes(soDigitos(q)))));
    $('#ab-lista').innerHTML = vis.map(itemAbordagem).join('') || '<li class="muted" style="padding:12px">Nenhuma abordagem.</li>';
  };
  $('#ab-q').oninput = e => { filtroAb.q = e.target.value; desenhar(); };
  $('#ab-st').onchange = e => { filtroAb.status = e.target.value; desenhar(); };
  $('#ab-nova-den').onclick = () => novaAbordagem('aberta');
  $('#ab-nova').onclick = () => novaAbordagem('atendida');
  desenhar();
}

function telaAbordagem(id) {
  const ab = db.abordagens[id];
  if (!ab) { app.innerHTML = '<div class="card">Abordagem não encontrada. <a href="#/abordagens">Voltar</a></div>'; return; }
  const val = k => k.split('.').reduce((o, p) => o?.[p], ab) ?? '';
  const idDe = k => 'ab-' + k.replace(/\./g, '-');
  const campo = (k, rot, tipo = 'text', extra = '') => `<div><label for="${idDe(k)}">${rot}</label><input id="${idDe(k)}" data-k="${k}" type="${tipo}" value="${esc(val(k))}" ${extra}></div>`;
  const texto = (k, rot, ph = '') => `<label for="${idDe(k)}">${rot}</label><textarea id="${idDe(k)}" data-k="${k}" rows="3" placeholder="${esc(ph)}">${esc(val(k))}</textarea>`;
  const opcoes = (obj, atual, vazio) => (vazio ? `<option value="">${vazio}</option>` : '') + Object.entries(obj).map(([k, t]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const linhaAve = (a = {}) => `<div class="ab-ave">
      <input data-f="especie" list="ab-especies" placeholder="Espécie (comece pelo nome popular)" value="${esc(a.especie || '')}">
      <div class="ab-ave-grade">
        <input data-f="qtd" type="number" min="1" value="${esc(a.qtd || 1)}" aria-label="Quantidade" title="Quantidade">
        <select data-f="sexo" aria-label="Sexo">${opcoes({ M: 'Macho', F: 'Fêmea' }, a.sexo, 'Sexo ?')}</select>
        <input data-f="anilha" placeholder="Anilha (vazio = sem)" value="${esc(a.anilha || '')}">
        <select data-f="estado" aria-label="Estado">${opcoes(Normas.ESTADO_AVE, a.estado || 'viva')}</select>
        <select data-f="destino" aria-label="Destino">${opcoes(Normas.DESTINO_AVE, a.destino || 'apreendida')}</select>
        <button class="sec ab-del" type="button">Remover</button>
      </div><div class="peq ab-info"></div></div>`;
  const linhaPet = (p = {}) => `<div class="ab-pet"><input data-f="item" list="ab-petrechos" placeholder="Gaiola, alçapão..." value="${esc(p.item || '')}">
      <input data-f="qtd" type="number" min="1" value="${esc(p.qtd || 1)}" aria-label="Quantidade"><button class="sec ab-del" type="button">Remover</button></div>`;

  app.innerHTML = `<p class="linha"><a href="#/abordagens">← Abordagens</a> <a href="javascript:history.back()">← Voltar</a> <span id="ab-salvo" class="muted peq" style="margin-left:auto"></span></p>
  <div id="ab-form">
    <div class="card"><h1>${esc(ab.pessoa?.nome || 'Abordagem')}</h1>
      <div class="grade">
        <div><label for="ab-status">Situação</label><select id="ab-status" data-k="status">${opcoes(STATUS_AB, ab.status)}</select></div>
        ${campo('data', 'Data e hora da abordagem', 'datetime-local')}
        ${campo('equipe', 'Equipe')}
      </div>
      ${ab.status === 'aberta' ? '<p><button id="ab-atender" type="button">Atender agora</button> <span class="muted peq">marca como atendida com a data e hora atuais</span></p>' : ''}
      <p id="ab-resumo" class="peq"></p>
    </div>

    <div class="card"><h2>Origem / denúncia</h2>
      <div class="grade">${campo('denuncia.data', 'Recebida em', 'date')}${campo('denuncia.origem', 'Origem', 'text', 'list="ab-origens"')}${campo('denuncia.protocolo', 'Nº / protocolo')}</div>
      ${texto('denuncia.texto', 'Teor da denúncia')}
    </div>

    <div class="card"><h2>Local dos fatos</h2>
      ${campo('local.endereco', 'Endereço')}
      <div class="grade">${campo('local.bairro', 'Bairro')}${campo('local.cidade', 'Cidade', 'text', 'list="ab-cidades"')}</div>
      ${campo('local.referencia', 'Ponto de referência')}
      <div class="grade">${campo('local.lat', 'Latitude', 'text', 'inputmode="decimal"')}${campo('local.lon', 'Longitude', 'text', 'inputmode="decimal"')}</div>
      <div class="linha" style="margin-top:8px"><button class="sec" id="ab-gps" type="button">Usar minha localização</button>
        <a class="btn sec" id="ab-mapa" target="_blank" rel="noopener noreferrer" href="#">Abrir no mapa</a> <span id="ab-gps-m" class="msg peq"></span></div>
    </div>

    <div class="card"><h2>Abordado</h2>
      ${campo('pessoa.nome', 'Nome')}
      <div class="grade">${campo('pessoa.cpf', 'CPF', 'text', 'inputmode="numeric"')}${campo('pessoa.rg', 'RG')}${campo('pessoa.nascimento', 'Nascimento', 'date')}${campo('pessoa.telefone', 'Telefone', 'tel')}</div>
      <p id="ab-cpf-m" class="peq"></p>
      ${campo('pessoa.endereco', 'Endereço do abordado (se diferente do local)')}
      <label for="ab-documentacao">Documentação apresentada</label>
      <select id="ab-documentacao" data-k="documentacao">${opcoes(Normas.DOCUMENTACAO, ab.documentacao, 'Não verificado')}</select>
    </div>

    <div class="card"><h2>Aves</h2>
      <div id="ab-aves">${(ab.aves || []).map(linhaAve).join('')}</div>
      <button class="sec" id="ab-add-ave" type="button">+ Ave</button>
      <p class="muted peq">Uma linha por espécie e situação (ex.: 3 trinca-ferros sem anilha, vivos, apreendidos). O app identifica Anexo e ameaça pela espécie.</p>
    </div>

    <div class="card"><h2>Petrechos</h2>
      <div id="ab-pets">${(ab.petrechos || []).map(linhaPet).join('')}</div>
      <button class="sec" id="ab-add-pet" type="button">+ Petrecho</button>
    </div>

    <div class="card"><h2>Documentos gerados</h2>
      <div class="grade">${campo('docs.ai', 'Auto de Infração nº')}${campo('docs.termoApreensao', 'Termo de Apreensão nº')}${campo('docs.termoDeposito', 'Termo de Depósito nº')}${campo('docs.bo', 'BO / COP nº')}${campo('docs.tco', 'TCO nº')}</div>
    </div>

    <div class="card"><h2>Prazo / retorno</h2>
      <div class="grade">${campo('prazo.data', 'Data', 'date')}<div><label for="ab-prazo-situacao">Situação do prazo</label>
        <select id="ab-prazo-situacao" data-k="prazo.situacao">${opcoes({ concluido: 'Concluído' }, ab.prazo?.situacao, 'Em aberto')}</select></div></div>
      ${campo('prazo.motivo', 'Motivo', 'text', 'placeholder="Ex.: apresentar documentos das aves; retornar ao local"')}
      <p class="peq" id="ab-prazo-m"></p>
    </div>

    <div class="card"><h2>Relato</h2>
      <div class="frases">${FRASES_AB.map(f => `<button class="sec ab-frase" type="button">${esc(f)}</button>`).join('')}</div>
      <textarea id="ab-relato" data-k="relato" rows="6" placeholder="Clique nas frases acima e complete digitando">${esc(ab.relato || '')}</textarea>
    </div>
  </div>

  <div class="card"><h2>Relatório</h2>
    <p><button id="ab-gerar" type="button">Gerar relatório</button></p>
    <div class="rel-caixa" id="ab-rel" hidden><textarea rows="18"></textarea>
      <div class="linha"><button id="ab-rel-copiar" type="button">Copiar</button><button class="sec" id="ab-rel-imprimir" type="button">Imprimir / PDF</button>
        <a class="btn sec" id="ab-rel-whats" target="_blank" rel="noopener noreferrer" href="#">WhatsApp</a></div></div>
    <p class="muted peq">A multa é valor de referência (Decreto 6.514/2008, art. 24). Espécie ameaçada conta pelas listas RS e BR do app.</p>
  </div>
  <p><button class="perigo" id="ab-excluir" type="button">Excluir abordagem</button></p>

  <datalist id="ab-especies">${Normas.opcoesEspecies().map(o => `<option value="${esc(o)}">`).join('')}</datalist>
  <datalist id="ab-petrechos">${PETRECHOS.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
  <datalist id="ab-origens">${ORIGENS.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
  <datalist id="ab-cidades">${[...new Set(Object.values(db.criadores).map(c => c.cidade).filter(Boolean))].sort().map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;

  const coletar = () => {
    for (const el of document.querySelectorAll('#ab-form [data-k]')) {
      const partes = el.dataset.k.split('.'), ult = partes.pop();
      partes.reduce((o, p) => (o[p] ||= {}), ab)[ult] = el.value.trim();
    }
    const linhas = (sel, campos) => [...document.querySelectorAll(sel)].map(l => Object.fromEntries(campos.map(f => [f, l.querySelector(`[data-f="${f}"]`).value.trim()])));
    ab.aves = linhas('#ab-aves .ab-ave', ['especie', 'qtd', 'sexo', 'anilha', 'estado', 'destino']).filter(a => a.especie);
    ab.petrechos = linhas('#ab-pets .ab-pet', ['item', 'qtd']).filter(p => p.item);
    ab.atualizadoEm = new Date().toISOString();
  };
  const atualizarInfo = () => {
    for (const l of document.querySelectorAll('#ab-aves .ab-ave')) {
      const t = l.querySelector('[data-f="especie"]').value, i = Normas.identificarEspecie(t);
      const am = i.cientifico && Normas.ameaca(i.cientifico), ex = i.cientifico && Normas.especie(i.cientifico);
      porHtml(l.querySelector('.ab-info'), !t ? '' : !i.cientifico ? '<span class="muted">Espécie não identificada: escolha da lista ou digite o nome científico.</span>'
        : `<i>${esc(i.cientifico)}</i>${ex ? ` · Anexo ${ex.anexo}` : ' · fora dos Anexos'} ${am ? chipAmeaca(am) : ''}`);
    }
    const r = Normas.resumoAbordagem(ab), cri = criadorDoAbordado(ab);
    porHtml($('#ab-resumo'), r.aves ? `<b>${r.aves} ave(s)</b> de ${r.especies} espécie(s)${r.ameacadas ? `, ${chip(r.ameacadas + ' ameaçada(s)', 'ameaca')}` : ''} · multa de referência ${Normas.reais(r.multa)}` : '<span class="muted">Nenhuma ave registrada.</span>');
    const cpf = soDigitos(ab.pessoa?.cpf || '');
    porHtml($('#ab-cpf-m'), cpf.length !== 11 ? '' : cri ? `Criador cadastrado no SISPASS: <a href="#/c/${cri.cpf}">${esc(cri.nome)}</a> (registro ${esc(cri.registro)})` : '<span class="erro-txt">CPF sem cadastro na base de criadores.</span>');
    const pr = ab.prazo || {};
    // Só redesenha se mudou: o "change" do campo ao perder o foco não pode trocar o botão no meio do clique.
    const htmlPrazo = pr.data && pr.situacao !== 'concluido' ? `${esc(Normas.situacaoPrazo(pr.data, hojeIso()).texto)} ${botaoAgendaAb(ab)}` : '';
    if ($('#ab-prazo-m').dataset.h !== htmlPrazo) { $('#ab-prazo-m').innerHTML = htmlPrazo; $('#ab-prazo-m').dataset.h = htmlPrazo; ligarAgenda(); }
    const lat = ab.local?.lat, lon = ab.local?.lon, end = [ab.local?.endereco, ab.local?.bairro, ab.local?.cidade, 'RS'].filter(Boolean).join(', ');
    $('#ab-mapa').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat && lon ? `${lat},${lon}` : end);
  };
  let timer = null;
  const gravar = async () => { clearTimeout(timer); timer = null; sujosAb.add(id); await salvar(); const s = $('#ab-salvo'); if (s) s.textContent = 'Salvo'; };
  const alterou = () => { coletar(); atualizarInfo(); $('#ab-salvo').textContent = 'Salvando…'; clearTimeout(timer); timer = setTimeout(gravar, 600); };
  const form = $('#ab-form');
  form.addEventListener('input', alterou);
  form.addEventListener('change', alterou);
  form.addEventListener('click', e => {
    if (e.target.classList.contains('ab-del')) { e.target.closest('.ab-ave, .ab-pet').remove(); alterou(); }
    if (e.target.classList.contains('ab-frase')) {
      const o = $('#ab-relato'), t = e.target.textContent;
      if (!o.value.includes(t)) o.value = (o.value.trim() ? o.value.trim() + ' ' : '') + t;
      alterou();
    }
  });
  $('#ab-add-ave').onclick = () => { $('#ab-aves').insertAdjacentHTML('beforeend', linhaAve()); $('#ab-aves .ab-ave:last-child [data-f="especie"]').focus(); };
  $('#ab-add-pet').onclick = () => { $('#ab-pets').insertAdjacentHTML('beforeend', linhaPet()); $('#ab-pets .ab-pet:last-child [data-f="item"]').focus(); };
  if ($('#ab-atender')) $('#ab-atender').onclick = async () => {
    coletar(); ab.status = 'atendida'; if (!ab.data) ab.data = agoraLocal();
    await gravar(); telaAbordagem(id);
  };
  $('#ab-gps').onclick = () => {
    const m = $('#ab-gps-m');
    if (!navigator.geolocation) { m.textContent = 'Localização indisponível neste navegador.'; return; }
    m.textContent = 'Obtendo localização…';
    navigator.geolocation.getCurrentPosition(p => {
      $('#ab-local-lat').value = p.coords.latitude.toFixed(6); $('#ab-local-lon').value = p.coords.longitude.toFixed(6);
      m.textContent = `Precisão de ${Math.round(p.coords.accuracy)} m.`; alterou();
    }, err => { m.textContent = 'Não foi possível obter a localização: ' + err.message; m.className = 'msg peq erro'; }, { enableHighAccuracy: true, timeout: 20000 });
  };
  const gerar = () => {
    coletar();
    const t = Normas.textoAbordagem(ab, { assinatura: db.cfg.assinatura || '', criador: criadorDoAbordado(ab) });
    $('#ab-rel textarea').value = t; $('#ab-rel').hidden = false;
    $('#ab-rel-whats').href = 'https://wa.me/?text=' + encodeURIComponent(t);
  };
  $('#ab-gerar').onclick = gerar;
  $('#ab-rel textarea').oninput = e => { $('#ab-rel-whats').href = 'https://wa.me/?text=' + encodeURIComponent(e.target.value); };
  $('#ab-rel-copiar').onclick = async () => {
    const t = $('#ab-rel textarea');
    try { await navigator.clipboard.writeText(t.value); $('#ab-rel-copiar').textContent = 'Copiado'; } catch { t.select(); $('#ab-rel-copiar').textContent = 'Use Ctrl+C'; }
  };
  $('#ab-rel-imprimir').onclick = () => imprimirTexto($('#ab-rel textarea').value);
  $('#ab-excluir').onclick = async () => {
    if (!confirm('Excluir esta abordagem?')) return;
    clearTimeout(timer);
    delete db.abordagens[id]; sujosAb.add(id); await salvar();
    location.hash = '#/abordagens';
  };
  atualizarInfo();
  window.scrollTo(0, 0);
}

// Na ficha do criador: abordagens em que ele foi o abordado (pelo CPF).
function cardAbordagensDoCpf(cpf) {
  const l = Object.values(db.abordagens).filter(a => soDigitos(a.pessoa?.cpf || '') === cpf);
  return l.length ? `<div class="card"><h2>Abordagens (${l.length})</h2><ul class="lista">${l.map(itemAbordagem).join('')}</ul></div>` : '';
}

// Linha da planilha exportada.
function linhaAbordagem(ab) {
  const r = Normas.resumoAbordagem(ab), d = ab.docs || {};
  return { Situação: STATUS_AB[ab.status] || ab.status, 'Data da abordagem': ab.data || '', 'Denúncia recebida em': ab.denuncia?.data || '', Origem: ab.denuncia?.origem || '',
    Protocolo: ab.denuncia?.protocolo || '', 'Endereço': ab.local?.endereco || '', Bairro: ab.local?.bairro || '', Cidade: ab.local?.cidade || '',
    Latitude: ab.local?.lat || '', Longitude: ab.local?.lon || '', Abordado: ab.pessoa?.nome || '', CPF: ab.pessoa?.cpf || '',
    'Cadastro SISPASS': criadorDoAbordado(ab) ? 'Sim' : 'Não', Aves: r.aves, 'Espécies': r.especies, 'Ameaçadas': r.ameacadas, Apreendidas: r.apreendidas,
    'Multa de referência': r.multa, Petrechos: (ab.petrechos || []).map(p => `${p.qtd || 1} ${p.item}`).join('; '),
    AI: d.ai || '', 'Termo de Apreensão': d.termoApreensao || '', 'Termo de Depósito': d.termoDeposito || '', BO: d.bo || '', TCO: d.tco || '', Equipe: ab.equipe || '', Relato: ab.relato || '' };
}

// Bloco do painel.
function kpisAbordagens(card) {
  const todas = Object.values(db.abordagens);
  if (!todas.length) return '';
  const atend = todas.filter(a => a.status !== 'aberta'), esp = {};
  let aves = 0, apreendidas = 0, ameacadas = 0;
  for (const a of atend) {
    const r = Normas.resumoAbordagem(a);
    aves += r.aves; apreendidas += r.apreendidas; ameacadas += r.ameacadas;
    for (const l of r.linhas) esp[l.comum || l.especie] = (esp[l.comum || l.especie] || 0) + l.qtd;
  }
  const abertas = todas.length - atend.length, semSispass = atend.filter(a => !criadorDoAbordado(a)).length;
  return `<h2 class="sec-tit">Denúncias e abordagens</h2>
    <div class="kpis">
      ${card('Denúncias aguardando', abertas, '#/abordagens', abertas ? 'ruim' : 'bom')}
      ${card('Abordagens atendidas', atend.length, '#/abordagens', '', `${semSispass} sem cadastro no SISPASS`)}
      ${card('Aves encontradas', aves, '#/abordagens', '', `${apreendidas} apreendidas`)}
      ${card('De espécies ameaçadas', ameacadas, '#/abordagens', ameacadas ? 'ameaca' : '')}
    </div>
    ${aves ? `<div class="card"><h2>Aves encontradas em abordagens, por espécie</h2>${barras(Object.entries(esp).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => ({ rotulo: k, valor: n, href: '#/abordagens' })))}</div>` : ''}`;
}
