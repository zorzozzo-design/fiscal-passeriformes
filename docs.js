// Notificação Ambiental, Termo de Apreensão/Fiel Depositário e Regularização de Plantel,
// no layout dos modelos do Comando Ambiental da Brigada Militar. Gera HTML para impressão (PDF pelo navegador).
// Script comum, sem módulos; não depende do app.js (importável nos testes).
(() => {

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const nomeProprio = s => String(s ?? '').toLowerCase().trim().split(/\s+/).map((w, i) => i && PARTICULAS.has(w) ? w
  : w.replace(/(^|['\-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase())).join(' ');
const fmtCpf = c => { const d = String(c ?? '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(c ?? ''); };
const dataBr = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
const marca = ok => ok ? '( X )' : '(&nbsp;&nbsp;&nbsp;)';
const linha = n => '_'.repeat(n);
const num = v => String(v ?? '').replace('.', ',');
const DESTINOS = ['Recolhimento (CETAS/CRAF-LN)', 'Soltura', 'Óbito', 'Doação'];

const cabecalho = (cfg, titulo) => `
  <table class="doc-cab"><tr>
    <td class="doc-logo">${cfg.logos?.brasao ? `<img src="${esc(cfg.logos.brasao)}" alt="">` : ''}</td>
    <td class="doc-orgao">ESTADO DO RIO GRANDE DO SUL<br>SECRETARIA DE SEGURANÇA PÚBLICA<br>BRIGADA MILITAR<br>COMANDO AMBIENTAL DA BRIGADA MILITAR</td>
    <td class="doc-logo">${cfg.logos?.comando ? `<img src="${esc(cfg.logos.comando)}" alt="">` : ''}</td>
  </tr></table>
  <div class="doc-titulo">${titulo}</div>`;

const campo = (rot, val, cls = '') => `<td class="${cls}"><span class="doc-rot">${rot}</span> ${esc(val)}</td>`;

// Itens do termo: aves apreendidas (não as soltas/entregues) e petrechos da abordagem.
function itensApreensao(ab) {
  const aves = (ab.aves || []).filter(a => (a.destino || 'apreendida') === 'apreendida' && a.especie).map(a => ({
    quantidade: Math.max(1, parseInt(a.qtd) || 1), unidade: 'un',
    descricao: [a.especie, a.sexo === 'M' ? 'macho' : a.sexo === 'F' ? 'fêmea' : '', a.anilha ? `anilha ${a.anilha}` : 'sem anilha', a.estado].filter(Boolean).join(', ') }));
  const pet = (ab.petrechos || []).filter(p => p.item).map(p => ({ quantidade: Math.max(1, parseInt(p.qtd) || 1), unidade: 'un', descricao: p.item }));
  return [...aves, ...pet];
}

function termoApreensao(ab, cfg) {
  const a = ab.apreensao || {}, f = a.fiel || {}, ag = cfg.agente || {}, p = ab.pessoa || {};
  const itens = itensApreensao(ab);
  const linhas = [...itens.map(i => `<tr class="linha-item"><td>${esc(i.descricao)}</td><td class="doc-qtd">${esc(num(i.quantidade))} ${esc(i.unidade)}</td></tr>`),
    ...Array.from({ length: Math.max(0, 14 - itens.length) }, () => '<tr class="linha-item"><td>&nbsp;</td><td></td></tr>')].join('');
  return `<div class="doc">
    ${cabecalho(cfg, 'TERMO DE APREENSÃO E FIEL DEPOSITÁRIO')}
    <div class="doc-faixa">APREENSÃO</div>
    <p class="doc-texto">Em decorrência da lavratura do ${marca(a.docTipo === 'BO/TC-COP')}BO/TC-COP / ${marca(a.docTipo === 'BA')}BA nº <b>${esc(a.docNumero) || linha(15)}</b>,
      que consta como responsável pelos fatos constatados o(a) Sr(a) <b>${esc(nomeProprio(p.nome))}</b>${p.cpf ? `, CPF <b>${esc(fmtCpf(p.cpf))}</b>` : ''},
      fica(m) apreendido(s) o(s) animal(is), petrecho(s) e/ou material(is) abaixo descrito(s):</p>
    <table class="doc-linhas">${linhas}</table>
    <table class="doc-grade"><tr><td class="doc-assin">Assinatura do responsável cujos animais / bens foram apreendidos:</td></tr></table>
    <div class="doc-faixa">FIEL DEPOSITÁRIO</div>
    <p class="doc-texto doc-negrito">Nomeio como FIEL DEPOSITÁRIO dos animais/bens aqui apreendidos, a pessoa abaixo qualificada, que desde já, fica ciente de que NÃO PODERÁ vender, usufruir, e/ou emprestar os mesmos, devendo apresentá-los quando solicitado pelo depositante, nas mesmas condições e quantidades que recebeu, conforme Art. 640 e 652 do Código Civil vigente.</p>
    <table class="doc-grade"><tr>${campo('Nome do(a) Fiel Depositário(a):', f.nome, 'doc-largo')}${campo('CPF:', fmtCpf(f.cpf))}</tr></table>
    <table class="doc-grade"><tr>${campo('RG:', f.rg)}${campo('Telefone:', f.telefone)}${campo('Município/UF:', f.municipioUf)}</tr></table>
    <table class="doc-grade"><tr>${campo('Endereço:', f.endereco, 'doc-largo')}</tr></table>
    <table class="doc-grade"><tr><td class="doc-assin">Assinatura do Fiel Depositário</td></tr></table>
    <div class="doc-faixa">DADOS DO AGENTE APREENSOR</div>
    <table class="doc-grade"><tr>${campo('Nome:', ag.nome, 'doc-largo')}${campo('Id Func.:', ag.idFunc)}</tr>
      <tr><td class="doc-assin"><span class="doc-rot">Assinatura:</span></td>${campo('Fração:', ag.fracao)}</tr></table>
    <table class="doc-grade"><tr><td><b>Destinação do material apreendido quando não for nomeado Fiel Depositário:</b><br>
      ${DESTINOS.map(d => `${marca(a.destinacao === d)} ${d}`).join('&nbsp;&nbsp;')}</td></tr></table>
    <div class="doc-vias">1ª via – Processo | 2ª via – Autuado | 3ª via – Depósito</div>
  </div>`;
}

// Abertura fixa do motivo da notificação (aprovada no Fiscal Pesca).
const NOTIF_ABERTURA = 'Tendo em vista os princípios da precaução e da prevenção (artigo 225 da CF/88) e o art. 64 da IN SEMA 04/2022, fica notificado(a) pelo seguinte motivo:';
function notificacao(ab, cfg) {
  const n = ab.notificacao || {}, ag = cfg.agente || {}, p = ab.pessoa || {}, lo = ab.local || {};
  const temGps = lo.lat != null && lo.lat !== '' && lo.lon != null && lo.lon !== '';
  const coord = v => temGps ? num(Number(v).toFixed(5)) : '';
  return `<div class="doc">
    ${cabecalho(cfg, 'NOTIFICAÇÃO AMBIENTAL')}
    <table class="doc-grade"><tr>${campo('Data:', dataBr(ab.data))}${campo('Hora:', (ab.data || '').slice(11, 16))}</tr></table>
    <table class="doc-grade"><tr>${campo('Nome ou razão social do(a) notificado(a):', nomeProprio(p.nome))}</tr></table>
    <table class="doc-grade"><tr>${campo('CPF / CNPJ:', fmtCpf(p.cpf))}${campo('RG:', p.rg)}${campo('Telefone:', p.telefone)}</tr></table>
    <table class="doc-grade"><tr>${campo('Endereço:', p.endereco, 'doc-largo')}${campo('Bairro:', p.bairro)}</tr></table>
    <table class="doc-grade"><tr>${campo('Município:', p.cidade || p.municipio)}</tr></table>
    <table class="doc-grade"><tr><td class="doc-motivo"><b>${NOTIF_ABERTURA}</b><div>${esc(n.motivo).replace(/\n/g, '<br>')}</div></td></tr></table>
    <table class="doc-grade"><tr><td><b>Local onde foi lavrada a notificação:</b> ${esc([lo.endereco, lo.bairro, lo.cidade].filter(Boolean).join(', '))}<br>
      <span class="doc-rot">Coordenadas geográficas:</span> <b>Latitude:</b> ${coord(lo.lat)}&nbsp;&nbsp;&nbsp; <b>Longitude:</b> ${coord(lo.lon)}<br>
      <span class="doc-rot">DATUM:</span> ${temGps ? 'WGS 84' : ''}</td></tr></table>
    <div class="doc-aviso">O NÃO ATENDIMENTO DO PRESENTE PODERÁ CONSTITUIR<br>CRIME DE DESOBEDIÊNCIA CONFORME ARTIGO 330 DO CÓDIGO PENAL</div>
    <table class="doc-grade"><tr><td><b>RECEBI A 2ª VIA DO PRESENTE, ESTANDO NOTIFICADO SOBRE O FATO E CIENTE DOS PRAZOS ESTIPULADOS.</b><br>
      EM _____/ _____/ ______<br>Nome do preposto: ${linha(45)}, CPF ${linha(20)}<br>
      Assinatura do Notificado/ Preposto (&nbsp;&nbsp;&nbsp;): ${linha(50)}</td></tr></table>
    <table class="doc-grade"><tr>${campo('Endereço de comparecimento e apresentação dos documentos solicitados:', n.comparecimento, 'doc-largo')}</tr></table>
    <div class="doc-faixa">DADOS DO POLICIAL MILITAR RESPONSÁVEL PELA NOTIFICAÇÃO</div>
    <table class="doc-grade"><tr>${campo('Nome:', ag.nome, 'doc-largo')}${campo('Id Func.:', ag.idFunc)}</tr>
      <tr><td class="doc-assin" colspan="2"><span class="doc-rot">Assinatura:</span></td></tr></table>
    <div class="doc-vias">1ª via – Processo | 2ª via – Notificado</div>
  </div>`;
}

// Regularização do plantel (art. 64, IN SEMA 04/2022): itens a corrigir e prazo.
function regularizacaoPlantel(dados, cfg) {
  const c = dados.criador || {}, ag = cfg.agente || {};
  const itens = (dados.itens || []).map(i => `<tr class="linha-item"><td>${esc(i)}</td></tr>`).join('')
    || '<tr class="linha-item"><td>&nbsp;</td></tr>';
  return `<div class="doc">
    ${cabecalho(cfg, 'NOTIFICAÇÃO PARA REGULARIZAÇÃO DE PLANTEL')}
    <table class="doc-grade"><tr>${campo('Criador:', nomeProprio(c.nome), 'doc-largo')}${campo('Registro SISPASS:', c.registro)}</tr></table>
    <table class="doc-grade"><tr>${campo('CPF:', fmtCpf(c.cpf))}${campo('Endereço:', c.endereco, 'doc-largo')}</tr></table>
    <p class="doc-texto"><b>${NOTIF_ABERTURA.replace('pelo seguinte motivo:', 'a regularizar o plantel quanto aos itens abaixo:')}</b></p>
    <table class="doc-linhas">${itens}</table>
    <p class="doc-texto"><b>Prazo: 15 (quinze) dias</b>, a contar da ciência${dados.dataLimite ? `, até <b>${esc(dados.dataLimite)}</b>` : ''}, sob pena de caracterizar a infração estabelecida (IN SEMA 04/2022, art. 64).</p>
    <table class="doc-grade"><tr><td><b>RECEBI A 2ª VIA, CIENTE DO PRAZO.</b><br>
      Ciência em: ${esc(dados.ciencia) || '_____/ _____/ ______'}<br>
      Assinatura do criador (&nbsp;&nbsp;&nbsp;): ${linha(50)}</td></tr></table>
    <div class="doc-faixa">DADOS DO POLICIAL MILITAR RESPONSÁVEL</div>
    <table class="doc-grade"><tr>${campo('Nome:', ag.nome, 'doc-largo')}${campo('Id Func.:', ag.idFunc)}</tr>
      <tr><td class="doc-assin"><span class="doc-rot">Assinatura:</span></td>${campo('Fração:', ag.fracao)}</tr></table>
    <div class="doc-vias">1ª via – Processo | 2ª via – Criador</div>
  </div>`;
}

globalThis.Docs = { cabecalho, itensApreensao, termoApreensao, notificacao, regularizacaoPlantel, NOTIF_ABERTURA, DESTINOS };
})();
