// Regras das normas aplicáveis no RS:
// - IN SEMA nº 04/2022 (prevalece no RS; Anexos I e II de espécies);
// - IN IBAMA nº 10/2011 (subsidiária, onde a SEMA é omissa);
// - Decreto RS nº 51.797/2014 e Portaria MMA nº 444/2014 com redação da Portaria MMA nº 1.704/2026 (espécies ameaçadas).
// Script comum (sem módulos) para funcionar aberto direto do arquivo.
(() => {
const { parseData, chaveAnilha, indicios, resumo } = globalThis.Parser;

// IN SEMA 04/2022, Anexo I: nome científico | nome comum | diâmetro interno da anilha (mm) | genotipagem obrigatória (x)
const ANEXO_I = `Turdus albicollis|sabiá-coleira|4,0|
Turdus amaurochalinus|sabiá-pocá|4,0|
Turdus flavipes|sabiá-una|4,0|
Turdus fumigatus|sabiá-da-mata|4,0|
Turdus leucomelas|sabiá-barranco|4,0|
Turdus rufiventris|sabiá-laranjeira|4,0|
Mimus saturninus|sabiá-do-campo|4,0|
Zonotrichia capensis|tico-tico|2,8|
Agelasticus thilius|sargento|3,0|
Cacicus cela|xexéu|4,0|
Cacicus chrysopterus|tecelão|4,0|
Gnorimopsar chopi|graúna|3,5|x
Icterus jamacaii|corrupião|4,0|
Molothrus oryzivorus|iraúna-grande|4,0|
Coryphospingus cucullatus|tico-tico-rei|2,4|
Coryphospingus pileatus|tico-tico-rei-cinza|2,8|
Gubernatrix cristata|cardeal-amarelo|3,8|x
Haplospiza unicolor|cigarra-bambu|2,4|
Paroaria coronata|cardeal|3,5|
Paroaria dominicana|galo-da-campina|3,5|x
Ramphocelus bresilius|tiê-sangue|3,0|
Saltatricula atricollis|batuqueiro|3,5|
Saltator aurantiirostris|bico-duro|3,5|
Saltator fuliginosus|bico-de-pimenta|4,0|
Saltator maximus|tempera-viola|3,5|
Saltator similis|trinca-ferro-verdadeiro|3,5|x
Schistochlamys melanopis|sanhaço-de-coleira|3,0|
Schistochlamys ruficapillus|bico-de-veludo|3,0|
Sicalis flaveola brasiliensis|canário-da-terra|2,8|x
Sicalis flaveola pelzelni|canário-chapinha|2,6|x
Sporophila albogularis|golinho|2,2|x
Sporophila angolensis|curió|2,6|x
Sporophila bouvreuil|caboclinho|2,2|
Sporophila maximiliani|bicudo-verdadeiro|3,0|x
Sporophila maximiliani atrirostris|bicudo-do-bico-preto|3,0|x
Sporophila maximiliani gigantirostris|bicudo-pantaneiro|3,0|x
Sporophila caerulescens|coleiro-papa-capim|2,2|x
Sporophila collaris|coleiro-do-brejo|2,6|x
Sporophila crassirostris|bicudinho|2,8|
Sporophila falcirostris|cigarra-verdadeira|2,2|
Sporophila frontalis|pichochó|2,6|x
Sporophila leucoptera|cigarra-rainha|2,6|
Sporophila lineola|bigodinho|2,2|x
Sporophila minuta|caboclinho-lindo|2,2|
Sporophila nigricollis|coleiro-baiano|2,2|x
Sporophila plumbea|patativa-verdadeira|2,4|
Sporophila ruficollis|caboclinho-de-papo-escuro|2,2|
Stephanophorus diadematus|sanhaço-frade|2,8|
Tachyphonus coronatus|tiê-preto|3,0|
Tangara seledon|saíra-sete-cores|2,6|
Tangara episcopus|sanhaço-da-amazônia|2,8|
Tangara sayaca|sanhaço-cinzento|2,8|
Volatinia jacarina|tiziu|2,0|
Cyanoloxia brissonii|azulão-verdadeiro|2,8|x
Cyanoloxia glaucocaerulea|azulinho|2,6|
Cyanoloxia rothschildii|azulão-da-amazônia|2,8|
Spinus magellanicus|pintassilgo|2,4|
Euphonia laniirostris|gaturamo-de-bico-grosso|2,4|`;

// IN SEMA 04/2022, Anexo II (proibidas de reproduzir, transacionar e participar de torneios): científico | comum | diâmetro
const ANEXO_II = `Turdus subalaris|sabiá-ferreiro|3,5
Mimus gilvus|sabiá-da-praia|3,5
Agelaioides badius|asa-de-telha|3,0
Cacicus haemorrhous|guaxe|4,0
Icterus cayanensis|encontro|3,5
Icterus chrysocephalus|rouxinol-do-rio-negro|3,5
Molothrus bonariensis|vira-bosta|3,0
Molothrus rufoaxillaris|vira-bosta-picumã|3,0
Pseudoleistes virescens|dragão|4,0
Sturnella superciliaris|polícia-inglesa-do-sul|4,0
Chlorophanes spiza|saí-verde|2,0
Cissopis leverianus|tietinga|3,5
Coereba flaveola|cambacica|2,2
Cyanerpes cyaneus|saíra-beija-flor|2,0
Embernagra platensis|sabiá-do-banhado|3,2
Paroaria gularis|cardeal-da-amazônia|3,0
Pipraeidea melanonota|saíra-viúva|2,0
Saltator coerulescens|bico-grosso|3,5
Sicalis columbiana|canário-do-amazonas|2,5
Sicalis luteola|tipio|2,5
Sporophila cinnamomea|caboclinho-de-chapéu-cinzento|2,4
Sporophila palustris|caboclinho-de-papo-branco|2,4
Tangara cayana|saíra-amarela|2,4
Tangara cyanocephala|saíra-militar|2,0
Tangara cyanoventris|saíra-douradinha|2,0
Tangara desmaresti|saíra-lagarta|2,0
Tangara fastuosa|pintor-verdadeiro|2,6
Tangara mexicana|saíra-de-bando|2,8
Tangara preciosa|saíra-preciosa|2,6
Tangara punctata|saíra-negaça|2,4
Tangara velia|saíra-diamante|2,4
Tersina viridis|saí-andorinha|2,4
Pipraeidea bonariensis|sanhaço-papa-laranja|3,0
Tangara cyanoptera|sanhaço-de-encontro-azul|2,8
Tangara ornata|sanhaço-de-encontro-amarelo|2,8
Trichothraupis melanops|tiê-de-topete|3,2
Caryothraustes canadensis|furriel|3,5
Pheucticus aureoventris|rei-do-bosque|3,0
Piranga flava|sanhaço-de-fogo|3,0
Spinus yarrellii|pintassilgo-do-nordeste|2,4
Chlorophonia cyanea|bandeirinha|2,2
Euphonia chalybea|cais-cais|2,4
Euphonia chlorotica|fim-fim|2,2
Euphonia cyanocephala|gaturamo-rei|2,4
Euphonia pectoralis|ferro-velho|2,0
Euphonia violacea|gaturamo-verdadeiro|2,4`;

// Passeriformes ameaçados. RS: Decreto 51.797/2014, Anexo I. BR: Portaria MMA 444/2014, Anexo I (redação Portaria MMA 1.704/2026).
const LISTA_RS = 'Agelasticus cyanopus|EN;Alectrurus risora|RE;Anabacerthia amaurotis|VU;Anthus nattereri|VU;Asthenes hudsoni|VU;Attila rufus|VU;Automolus leucophthalmus|CR;Capsiempis flaveola|VU;Cinclodes pabsti|VU;Clibanornis dendrocolaptoides|VU;Cnemotriccus fuscatus fuscatus|VU;Colonia colonus|VU;Contopus cinereus|VU;Coryphistera alaudina|CR;Corythopis delalandi|EN;Culicivora caudacuta|VU;Dendrocincla turdina|CR;Drymophila rubricollis|EN;Eleoscytalopus indigoticus|EN;Formicarius colma|EN;Gubernatrix cristata|CR;Hemitriccus diops|EN;Hemitriccus orbitatus|CR;Leptasthenura platensis|CR;Mackenziaena severa|VU;Manacus manacus|VU;Myiarchus tyrannulus|VU;Myrmeciza squamosa|EN;Myrmotherula unicolor|VU;Philydor atricapillus|VU;Philydor lichtensteini|VU;Phylloscartes eximius|VU;Phylloscartes kronei|VU;Piprites chloris|VU;Platyrinchus leucoryphus|RE;Polystictus pectoralis|EN;Procnias nudicollis|VU;Pseudoseisura lophotes|VU;Psilorhamphus guttatus|VU;Pyroderus scutatus|VU;Saltator fuliginosus|VU;Scytalopus iraiensis|EN;Sporophila angolensis|EN;Sporophila bouvreuil|VU;Sporophila frontalis|RE;Sporophila hypoxantha|VU;Sporophila melanogaster|EN;Sporophila palustris|VU;Sporophila plumbea|EN;Sporophila ruficollis|VU;Sturnella defilippii|RE;Stymphalornis acutirostris|EN;Tangara peruviana|EN;Xanthopsar flavus|VU;Xolmis dominicanus|VU';
const LISTA_BR = 'Acrobatornis fonsecai|VU;Alectrurus tricolor|VU;Anabazenops dorsalis|VU;Anthus nattereri|VU;Antilophia bokermanni|EN;Anumara forbesi|VU;Arremonops conirostris|EN;Asthenes luizae|EN;Attila spadiceus uropygiatus|EN;Automolus lammi|EN;Cacicus koepckeae|VU;Calyptura cristata|CR;Campylorhamphus cardosoi|VU;Campylorhamphus multostriatus|VU;Campylorhamphus trochilirostris trochilirostris|VU;Chamaeza nobilis fulvipectus|VU;Cichlopsis leucogenys|EN;Cinclodes espinhacensis|EN;Clytoctantes atrogularis|VU;Cnipodectes superrufus|VU;Conopophaga cearae|EN;Conopophaga lineata lineata|VU;Conothraupis mesoleuca|EN;Contopus nigrescens|VU;Coryphaspiza melanotis|VU;Coryphistera alaudina|CR;Cotinga maculata|EN;Cyanocorax hafferi|VU;Cyphorhinus griseolateralis|VU;Dendrexetastes paraensis paraensis|VU;Dendrocincla merula badia|VU;Dendrocincla taunayi|EN;Dendrocolaptes medius|VU;Dendrocolaptes retentus|VU;Dendrocolaptes transfasciatus|VU;Dysithamnus plumbeus|EN;Elaenia ridleyana|VU;Eleoscytalopus psychopompus|EN;Epinecrophylla dentei|VU;Formicivora acutirostris|VU;Formicivora erythronotos|CR;Formicivora grantsaui|VU;Formicivora iheringi|VU;Formicivora littoralis|EN;Formicivora paludicola|CR;Geositta poeciloptera|VU;Grallaria varia distincta|VU;Grallaria varia intercedens|EN;Granatellus pelzelni paraensis|VU;Gubernatrix cristata|CR;Hemitriccus kaempferi|VU;Hemitriccus mirandae|EN;Heteroxolmis dominicanus|VU;Hylexetastes uniformis|VU;Hylopezus ochroleucus|VU;Hylopezus paraensis|VU;Hylopezus whittakeri|VU;Hypocnemis hypoxantha ochraceiventris|VU;Hypocnemis ochrogyna|VU;Hypocnemis striata|VU;Iodopleura pipra leucopygia|EN;Knipolegus franciscanus|VU;Laniisoma elegans|EN;Lepidocolaptes wagleri|EN;Lepidothrix iris|EN;Lepidothrix vilasboasi|EN;Leptasthenura platensis|CR;Lipaugus conditus|VU;Merulaxis stresemanni|CR;Myrmoderus ruficauda|EN;Myrmotherula fluminensis|CR;Myrmotherula minor|VU;Myrmotherula oreni|VU;Myrmotherula snowi|CR;Myrmotherula urosticta|VU;Nemosia rourei|CR;Neopelma aurifrons|EN;Onychorhynchus swainsoni|VU;Oxyruncus cristatus tocantinsi|VU;Phlegopsis borbae|VU;Phlegopsis nigromaculata confinis|VU;Phyllomyias reiseri|EN;Phylloscartes ceciliae|EN;Phylloscartes roquettei|EN;Platyrinchus leucoryphus|VU;Platyrinchus niveigularis|VU;Poecilotriccus albifacies|VU;Procnias averano averano|EN;Pyriglena atra|EN;Pyriglena pernambucensis|VU;Rhegmatorhina gymnops|VU;Rhegmatorhina hoffmannsi|VU;Rhopornis ardesiacus|VU;Schiffornis turdina intermedia|EN;Sclerurus caudacutus caligineus|CR;Sclerurus caudacutus umbretta|CR;Sclerurus cearensis|EN;Sclerurus macconnelli bahiae|EN;Scytalopus diamantinensis|VU;Scytalopus gonzagai|EN;Scytalopus iraiensis|EN;Scytalopus novacapitalis|EN;Serpophaga hypoleuca pallida|VU;Spinus yarrellii|VU;Sporophila beltoni|EN;Sporophila falcirostris|VU;Sporophila frontalis|VU;Sporophila maximiliani|CR;Sporophila melanogaster|VU;Sporophila nigrorufa|VU;Stigmatura napensis napensis|VU;Synallaxis infuscata|EN;Synallaxis kollari|VU;Syndactyla ucayalae|VU;Tangara cyanocephala cearensis|VU;Tangara fastuosa|VU;Tangara velia signata|VU;Terenura sicki|EN;Thamnomanes caesius caesius|EN;Thamnophilus aethiops distans|EN;Thamnophilus caerulescens cearensis|VU;Thamnophilus caerulescens pernambucensis|VU;Thamnophilus nigrocinereus huberi|VU;Thamnophilus nigrocinereus tschudii|EN;Thripophaga macroura|VU;Vireo gracilirostris|VU;Xenops minutus alagoanus|VU;Xiphocolaptes carajaensis|VU;Xiphocolaptes falcirostris|VU;Xipholena atropurpurea|VU;Xipholena lamellipennis|VU;Xiphorhynchus atlanticus|VU;Xiphorhynchus guttatoides gracilirostris|EN';

// O SISPASS usa nomenclatura antiga; as listas usam a atual. Tudo é convertido para a forma atual antes de comparar.
const SINONIMOS = {
  'oryzoborus atrirostris': 'sporophila maximiliani atrirostris',
  'xolmis dominicanus': 'heteroxolmis dominicanus',
  'thraupis sayaca': 'tangara sayaca', 'thraupis episcopus': 'tangara episcopus',
  'thraupis bonariensis': 'pipraeidea bonariensis', 'thraupis cyanoptera': 'tangara cyanoptera', 'thraupis ornata': 'tangara ornata',
  'passerina cyanoides': 'cyanoloxia rothschildii', 'saltator atricollis': 'saltatricula atricollis',
  'carduelis magellanica': 'spinus magellanicus', 'sturnella defilippii': 'leistes defilippii',
};
const GENEROS = { oryzoborus: 'sporophila', carduelis: 'spinus', cyanocompsa: 'cyanoloxia', passerina: 'cyanoloxia' };
function canon(nome) {
  let n = String(nome ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [de, para] of Object.entries(SINONIMOS)) if (n === de || n.startsWith(de + ' ')) return para + n.slice(de.length);
  const [g, ...resto] = n.split(' ');
  return GENEROS[g] ? [GENEROS[g], ...resto].join(' ') : n;
}
// Mesma espécie: nomes iguais, ou um é subespécie do outro.
const casa = (a, b) => a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ');
const num = s => parseFloat(String(s).replace(',', '.'));

const TAB_I = ANEXO_I.split('\n').map(l => { const [c, comum, d, g] = l.split('|'); return { c: canon(c), nome: c, comum, diam: num(d), genot: g === 'x', anexo: 'I' }; });
const TAB_II = ANEXO_II.split('\n').map(l => { const [c, comum, d] = l.split('|'); return { c: canon(c), nome: c, comum, diam: num(d), genot: false, anexo: 'II' }; });
const lista = s => s.split(';').map(x => { const [n, cat] = x.split('|'); return { c: canon(n), cat }; });
const AM_RS = lista(LISTA_RS), AM_BR = lista(LISTA_BR);

function especie(cientifico) {
  const c = canon(cientifico);
  if (!c) return null;
  for (const tab of [TAB_I, TAB_II]) {
    const ach = tab.filter(e => casa(c, e.c));
    if (ach.length) return { anexo: ach[0].anexo, nomes: ach.map(e => e.nome), comum: ach.map(e => e.comum).join(' / '),
      diametros: [...new Set(ach.map(e => e.diam))], genotipagem: ach.some(e => e.genot) };
  }
  return null;
}
function ameaca(cientifico) {
  const c = canon(cientifico);
  if (!c) return null;
  const rs = AM_RS.find(e => casa(c, e.c))?.cat || null, br = AM_BR.find(e => casa(c, e.c))?.cat || null;
  return rs || br ? { rs, br } : null;
}

const fmt = d => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
function periodo(d) {
  const a = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return { inicio: new Date(a, 7, 1), fim: new Date(a + 1, 6, 31), rotulo: `${a}/${a + 1}` };
}

function situacaoCTF(rel) {
  const rows = (rel.secoes['Categorias no CTF'] || []).filter(r => /passeriforme/i.test(`${r.Categoria} ${r.Detalhe}`));
  if (!rows.length) return { status: 'não encontrado', texto: 'Categoria de criação de passeriformes não encontrada no CTF' };
  // A categoria antiga ("Uso de Recursos Naturais") foi encerrada na migração da IN IBAMA 11/2018; só conta a amadorista.
  const atual = rows.filter(r => /amador/i.test(r.Detalhe || '')), alvo = atual.length ? atual : rows;
  const ativa = alvo.find(r => !/^s/i.test(r.Cancelado || '') && !parseData(r['Término']));
  return ativa ? { status: 'ativo', texto: `Ativo desde ${ativa['Início'] || '?'}` }
    : { status: 'cancelado', texto: `Cancelado/encerrado${alvo[0]['Término'] ? ' em ' + alvo[0]['Término'] : ''}. ${alvo[0].DES_OBSERVACOES || ''}`.trim() };
}

function situacaoLicenca(rel, hoje) {
  const rows = rel.secoes['Licenças Verificadas no Sistema'] || [];
  const fim = fmt(periodo(hoje).fim);
  const lic = rows.find(r => (r.Validade || '').slice(0, 10) === fim);
  const pendentes = rows.filter(r => /pendente|inadimpl/i.test(r['Situação'] || '')).length;
  return { status: lic ? (lic['Situação'] || '?').toLowerCase() : 'sem licença', numero: lic?.['Número'] || '', validade: fim, pendentes, periodo: periodo(hoje).rotulo };
}

function ameacadasDoPlantel(rel) {
  return (rel.secoes.Plantel || []).filter(a => /^ativ/i.test(a['Situação'] || '')).map(a => ({ anilha: a['Código anilha'], popular: a['Nome Popular'],
    especie: a['Espécie'], ...(ameaca(a['Espécie']) || {}) })).filter(a => a.rs || a.br);
}

const BASE = 'IN SEMA 04/2022';
function verificar(rel, ctx) {
  const { hoje, cfg, nascimentos = {} } = ctx;
  const s = rel.secoes, itens = [];
  const add = (id, grupo, tipo, titulo, texto, base, destino, providencia, data = '') => itens.push({ id, grupo, tipo, titulo, texto, base, destino, providencia, data });
  const dias = (a, b) => Math.round((parseData(b) - parseData(a)) / 864e5);
  const ultima = datas => datas.filter(parseData).sort((a, b) => parseData(b) - parseData(a))[0]?.slice(0, 10) || '';
  const plantel = s.Plantel || [], ativas = plantel.filter(a => /^ativ/i.test(a['Situação'] || ''));
  const hist = s['Histórico de Operações'] || [];
  const confirmada = r => /confirmar/i.test(r['Operação do Receptor'] || '');
  const recebidas = (s['Transferências Recebidas'] || []).filter(confirmada).map(r => ({ anilha: r.Anilha, data: r['Data do Recebimento'] || r['Data da Doação'] }));
  const enviadas = (s['Transferências Solicitadas'] || []).filter(confirmada).map(r => ({ anilha: r.Anilha, data: r.Data }));
  const aveDe = anilha => plantel.find(a => chaveAnilha(a['Código anilha']) === chaveAnilha(anilha)) || nascimentos[chaveAnilha(anilha)] || nascimentos[anilha];
  const per = periodo(hoje);

  // Cadastro e licença
  const ctf = situacaoCTF(rel);
  if (ctf.status === 'cancelado') add('ctf', 'sispass', 'nc', 'CTF cancelado', ctf.texto, `${BASE}, art. 3º`, 'SEMA',
    'Criador sem registro ativo no CTF para a atividade. Comunicar a SEMA e verificar a destinação do plantel.');
  const lic = situacaoLicenca(rel, hoje);
  if (lic.status !== 'regular') add('licenca', 'sispass', 'nc', `Licença ${lic.periodo}: ${lic.status}`,
    `Licença do período ${lic.periodo}${lic.numero ? ' nº ' + lic.numero : ''} está "${lic.status}".`, `${BASE}, art. 10`, 'SEMA',
    'Criador impedido de transferir ou adquirir aves (arts. 9 e 33). Em vistoria, conferir o comprovante de pagamento.');
  if (lic.pendentes >= 2) add('inadimplentes', 'sispass', 'nc', `${lic.pendentes} licenças inadimplentes`,
    `${lic.pendentes} licenças com situação pendente no SISPASS.`, `${BASE}, art. 42, I`, 'SEMA',
    'Caso de recadastramento: exigir no SOL documentos, laudo com ART, relatório fotográfico e localização (art. 43).');

  // Plantel
  if (!ativas.length) add('zerado', 'sispass', 'nc', 'Plantel sem aves ativas', 'Nenhuma ave ativa no plantel.',
    'IN IBAMA 10/2011, art. 5º, §10; IN SEMA 04/2022, art. 69', 'SEMA', 'Comunicar a SEMA para notificação e cancelamento da licença.');
  if (ativas.length > 50 && ![8, 9, 10, 11, 0, 1, 2].includes(hoje.getMonth())) add('plantel50', 'sispass', 'nc', `${ativas.length} aves ativas`,
    `Plantel acima do máximo de 50 aves fora do período reprodutivo (setembro a março).`, `${BASE}, art. 69`, 'Notificação',
    'Notificar para adequação do plantel e apresentação de laudo com ART (§5º).');
  const genot = [];
  for (const a of ativas) {
    const anilha = a['Código anilha'], e = especie(a['Espécie']), am = ameaca(a['Espécie']);
    if (!e) add(`foraAnexo:${anilha}`, 'campo', 'conferir', `Espécie fora dos Anexos: ${a['Nome Popular'] || a['Espécie']}`,
      `${a['Espécie']} (${anilha}) não consta nos Anexos I ou II.`, `${BASE}, arts. 25 e 48`, 'Campo', 'Conferir a ave e a origem legal.');
    else {
      const d = num(a['Diâmetro anilha']);
      if (d && !e.diametros.includes(d)) add(`diametro:${anilha}`, 'campo', 'conferir', `Diâmetro de anilha divergente (${anilha})`,
        `${a['Nome Popular']}: anilha de ${a['Diâmetro anilha']} mm; previsto ${e.diametros.join(' ou ').replace(/\./g, ',')} mm.`,
        `${BASE}, art. 26, §2º e Anexo ${e.anexo}`, 'Campo', 'Conferir a anilha em vistoria (possível troca ou adulteração).');
      if (e.genotipagem) genot.push(`${a['Nome Popular']} ${anilha}`);
    }
    if (am && (am.rs === 'CR' || am.br === 'CR')) add(`art71:${anilha}`, 'campo', 'conferir', `Espécie criticamente ameaçada (${anilha})`,
      `${a['Nome Popular']} (${a['Espécie']}): CR.`, `${BASE}, art. 71`, 'Campo', 'Conferir ART de médico veterinário ou biólogo anexada ao processo no SOL.');
    const nasc = parseData(a.Nascimento);
    if (nasc && (hoje - nasc) / (365.25 * 864e5) > cfg.idadeMax) add(`longevidade:${anilha}`, 'campo', 'indicio', `Ave com mais de ${cfg.idadeMax} anos (${anilha})`,
      `${a['Nome Popular']} nascida em ${a.Nascimento}.`, 'IN IBAMA 10/2011, art. 66, §3º (longevidade)', 'Campo', 'Conferir a ave e a anilha (possível substituição).');
  }
  if (genot.length) add('genotipagem', 'campo', 'conferir', 'Espécies com genotipagem obrigatória', genot.join('; '),
    `${BASE}, art. 32`, 'Campo', 'Conferir a genotipagem dos reprodutores dessas espécies.');

  // Transferências
  const porPer = {};
  for (const [lista, campo] of [[recebidas, 'rec'], [enviadas, 'env']]) for (const x of lista) {
    const d = parseData(x.data);
    if (!d) continue;
    const p = periodo(d).rotulo;
    (porPer[p] ||= { rec: 0, env: 0, datas: [] })[campo]++;
    porPer[p].datas.push(x.data);
  }
  for (const [p, v] of Object.entries(porPer)) if (v.rec > 35 || v.env > 35) add(`transf35:${p}`, 'sispass', 'nc', `Mais de 35 transferências em ${p}`,
    `${v.rec} recebidas e ${v.env} enviadas no período ${p}.`, `${BASE}, art. 33`, 'SEMA', 'Comunicar a SEMA e requerer justificativa (art. 33, §7º).', ultima(v.datas));
  for (const e of recebidas) {
    const sa = enviadas.find(x => chaveAnilha(x.anilha) === chaveAnilha(e.anilha) && dias(e.data, x.data) >= 0 && dias(e.data, x.data) < 90);
    if (sa) add(`transf90:${e.anilha}`, 'sispass', 'nc', `Repassada antes de 90 dias (${e.anilha})`,
      `Recebida em ${e.data.slice(0, 10)} e transferida em ${sa.data.slice(0, 10)} (${dias(e.data, sa.data)} dias).`,
      `${BASE}, art. 33, §4º; IN IBAMA 10/2011, art. 38`, 'SEMA', 'Comunicar a SEMA para análise e cancelamento da transferência (art. 33, §7º).', sa.data.slice(0, 10));
  }
  for (const x of [...recebidas, ...enviadas]) {
    const ave = aveDe(x.anilha);
    if (!ave) continue;
    const nasc = parseData(ave.Nascimento);
    if (nasc && enviadas.includes(x) && dias(ave.Nascimento, x.data) < 35) add(`idade35:${x.anilha}`, 'sispass', 'nc', `Transferida com menos de 35 dias de vida (${x.anilha})`,
      `Nascida em ${ave.Nascimento}, transferida em ${x.data.slice(0, 10)}.`, `${BASE}, art. 33, §5º`, 'SEMA', 'Comunicar a SEMA para análise da transferência.', x.data.slice(0, 10));
    if (especie(ave['Espécie'])?.anexo === 'II') add(`anexoII:${x.anilha}`, 'sispass', 'nc', `Transferência de espécie do Anexo II (${x.anilha})`,
      `${ave['Espécie']} é proibida de ser transacionada.`, `${BASE}, art. 48, II`, 'SEMA', 'Comunicar a SEMA para cancelamento da transferência.', x.data.slice(0, 10));
  }

  // Nascimentos, fugas, roubos, furtos e óbitos
  const ev = re => hist.filter(h => re.test(h['Operação'] || ''));
  const nascs = ev(/nasc/i), perdas = ev(/fuga|roubo|furto/i), obitos = ev(/(ó|o|\?|ã³)bito/i);
  for (const h of nascs) {
    const ave = aveDe(h.Anilha);
    if (ave && especie(ave['Espécie'])?.anexo === 'II') add(`anexoII:${h.Anilha}`, 'sispass', 'nc', `Nascimento de espécie do Anexo II (${h.Anilha})`,
      `Nascimento declarado em ${h.Data.slice(0, 10)} de ${ave['Espécie']}.`, `${BASE}, art. 30, V`, 'SEMA', 'Comunicar a SEMA; filhotes devem ser entregues ao órgão.', h.Data.slice(0, 10));
  }
  const nPer = {};
  for (const h of nascs) { const d = parseData(h.Data); if (d) (nPer[periodo(d).rotulo] ||= []).push(h.Data); }
  for (const [p, ds] of Object.entries(nPer)) if (ds.length > 35) add(`nasc35:${p}`, 'sispass', 'nc', `${ds.length} nascimentos em ${p}`,
    'Acima do máximo de 35 filhotes por ano.', `${BASE}, art. 70`, 'SEMA', 'Comunicar a SEMA e conferir em vistoria.', ultima(ds));
  if (perdas.length >= 2) add('reiteradas', 'sispass', 'nc', `${perdas.length} declarações de fuga/roubo/furto`,
    perdas.map(h => `${h.Anilha || '?'} (${h.Data.slice(0, 10)})`).join('; '), `${BASE}, art. 23`, 'Notificação',
    'Notificar o criador para justificativa em 20 dias, com fotos e laudo de profissional habilitado.', ultima(perdas.map(h => h.Data)));
  for (const p of [per, periodo(new Date(per.inicio.getFullYear() - 1, 7, 1))]) {
    const baixas = [...perdas, ...obitos].filter(h => { const d = parseData(h.Data); return d && d >= p.inicio && d <= p.fim; });
    const base = ativas.length + baixas.length;
    if (baixas.length && base && baixas.length / base > 0.3) add(`baixa30:${p.rotulo}`, 'sispass', 'nc', `Fuga/óbito acima de 30% do plantel em ${p.rotulo}`,
      `${baixas.length} baixas para um plantel estimado de ${base} aves (ativas hoje + baixas do período).`, `${BASE}, art. 22`, 'Notificação',
      'Exigir justificativa em 20 dias, com fotos e laudo de profissional habilitado.', ultima(baixas.map(h => h.Data)));
  }
  const recente = h => { const d = parseData(h.Data); return d && (hoje - d) / 864e5 <= 730; };
  for (const h of perdas.filter(recente)) add(`bo:${h.Anilha}`, 'campo', 'conferir', `B.O. da ${/fuga/i.test(h['Operação']) ? 'fuga' : 'ocorrência'} (${h.Anilha})`,
    `${h['Operação']} em ${h.Data.slice(0, 10)}.`, `${BASE}, art. 21, §§1º e 2º`, 'Campo', 'Conferir B.O. lavrado em até 7 dias e anexado ao SOL em até 30 dias.', h.Data.slice(0, 10));
  for (const h of obitos.filter(recente)) add(`anilhaObito:${h.Anilha}`, 'campo', 'conferir', `Entrega da anilha do óbito (${h.Anilha})`,
    `Óbito declarado em ${h.Data.slice(0, 10)}.`, `${BASE}, art. 21, §3º`, 'Campo', 'Conferir a entrega da anilha à SEMA em até 30 dias.', h.Data.slice(0, 10));

  // Cadastro: endereço e um criador por residência
  if (ctx.outrosNoEndereco?.length) add('mesmoEndereco', 'campo', 'nc', 'Mais de um criador no mesmo endereço',
    `Também cadastrado(s) neste endereço: ${ctx.outrosNoEndereco.join(', ')}.`, `${BASE}, art. 11, §2º`, 'Campo',
    'Conferir quem reside e quem maneja as aves; apenas um criador por residência.');
  add('sol', 'campo', 'conferir', 'Autorização no SOL', 'O relatório do SISPASS não mostra a autorização emitida no SOL.',
    `${BASE}, arts. 5º, 14 e 67`, 'Campo', 'Conferir a autorização para criação amadora no SOL (validade de 5 anos).');

  // Indícios (não são infração). Fugas e plantel zerado já estão acima, com base legal.
  for (const i of indicios(rel, cfg)) if (!['fugas', 'zerado'].includes(i.tipo)) add(`ind:${i.tipo}`, 'campo', 'indicio', INDICIOS[i.tipo], i.texto,
    'Indício para verificação', 'Campo', 'Verificar em vistoria.', i.data || '');
  for (const a of resumo(rel, cfg, hoje).alertas.filter(a => a.tipo === 'semMov')) add('ind:semMov', 'campo', 'indicio', 'Sem movimentação no SISPASS', a.texto,
    'Indício para verificação', 'Campo', 'Conferir se o plantel físico corresponde ao do sistema.');
  return itens;
}
const INDICIOS = { saidaRapida: 'Ave recebida e logo baixada', semDestino: 'Ave recebida sem destino', movAlta: 'Movimentação alta', semLicenca: 'Operações bloqueadas por licença' };

function textoSuspensao(data, motivos, bases) {
  return `Suspensa em ${fmt(data)} por fiscalização PATRAM/BM. Motivo: ${motivos.join('; ')}. Base: ${BASE}, ${bases.join('; ')}.`;
}

// ---------- Conferência ave por ave e relatório de vistoria ----------
const CONF = { ok: 'Conferida', ausente: 'Ausente no local', anilha: 'Anilha divergente, violada ou adulterada', divergente: 'Espécie ou sexo divergente do registro' };
const rotuloAve = a => `${a['Nome Popular'] || a['Espécie'] || '?'}${a.Sexo ? ' ' + a.Sexo : ''} (${a['Código anilha'] || 'sem anilha'})`;
function resumoConferencia(ativas, v) {
  const st = v.aves || {}, r = { total: ativas.length, conferidas: [], ausentes: [], anilha: [], divergente: [], naoConferidas: [] };
  const alvo = { ok: 'conferidas', ausente: 'ausentes', anilha: 'anilha', divergente: 'divergente' };
  for (const a of ativas) r[alvo[st[chaveAnilha(a['Código anilha'])]] || 'naoConferidas'].push(rotuloAve(a));
  r.extras = (v.extras || []).filter(e => e.descricao || e.anilha).map(e => `${e.descricao || 'Ave'} (${e.anilha || 'sem anilha'})`);
  r.irregular = !!(r.ausentes.length || r.anilha.length || r.divergente.length || r.extras.length);
  return r;
}
const dataIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || ''); };
function textoRelatorio({ criador: c, vistoria: v, resultado, ctf, licenca, conf, graves = [], constatacoes = [], providencias = [], assinatura }) {
  const L = [];
  L.push('RELATÓRIO DE VISTORIA - CRIADOR AMADORISTA DE PASSERIFORMES', '');
  L.push(`Criador: ${c.nome}, CPF ${c.cpf}${c.registro ? ', registro SISPASS ' + c.registro : ''}`);
  if (c.endereco) L.push(`Endereço cadastrado: ${c.endereco}`);
  L.push(`Data da vistoria: ${dataIso(v.data)}`);
  if (v.endereco) L.push(`Local vistoriado: ${v.endereco}`);
  if (v.maneja) L.push(`Manejo das aves: ${v.maneja === 'titular' ? 'pelo próprio titular' : 'por terceiro' + (v.manejaNome ? ' (' + v.manejaNome + ')' : '')}`);
  if (ctf) L.push(`CTF/APP: ${ctf}`);
  if (licenca) L.push(licenca);
  L.push(`Resultado: ${resultado}`, '');
  if (conf) {
    L.push('CONFERÊNCIA DO PLANTEL', `Plantel registrado: ${conf.total} aves ativas. Conferidas sem divergência: ${conf.conferidas.length}.`);
    const bloco = (rot, arr) => { if (arr.length) L.push(`${rot} (${arr.length}): ${arr.join('; ')}`); };
    bloco('Ausentes no local', conf.ausentes); bloco(CONF.anilha, conf.anilha); bloco(CONF.divergente, conf.divergente);
    bloco('Sem registro no plantel', conf.extras);
    if (conf.naoConferidas.length) L.push(`Não conferidas: ${conf.naoConferidas.length}`);
    L.push('');
  }
  if (graves.length || constatacoes.length) {
    L.push('CONSTATAÇÕES');
    graves.forEach(g => L.push(`- ${g}`));
    constatacoes.forEach(k => L.push(`- ${k.titulo}: ${k.texto}${k.base ? ' (' + k.base + ')' : ''}`));
    L.push('');
  }
  if (v.obs) L.push('OBSERVAÇÕES', v.obs, '');
  if (v.notificacao?.ciencia) L.push('NOTIFICAÇÃO', textoNotificacao(v.notificacao), '');
  if (providencias.length) { L.push('PROVIDÊNCIAS'); providencias.forEach(p => L.push(`- ${p}`)); L.push(''); }
  if (assinatura) L.push(assinatura);
  return L.join('\n').trim();
}

// ---------- Abordagens: denúncias, apreensões e guarda sem autorização ----------
const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const capital = n => n.charAt(0).toUpperCase() + n.slice(1);
const TODAS = [...TAB_I, ...TAB_II];
// Nome digitado (popular, "popular (Científico)" ou científico) → { cientifico, comum }. Sem correspondência: cientifico vazio.
function identificarEspecie(texto) {
  const t = String(texto ?? '').trim(), par = /\(([^)]+)\)/.exec(t);
  const porCient = n => { const c = canon(n); const e = TODAS.find(x => casa(c, x.c)); if (e) return { cientifico: e.nome, comum: e.comum };
    const am = [...AM_RS, ...AM_BR].find(x => casa(c, x.c)); return am ? { cientifico: capital(am.c), comum: '' } : null; };
  if (par) { const r = porCient(par[1]); if (r) return r; }
  const p = semAcento(t.replace(/\(.*?\)/g, '')).replace(/ /g, '-');
  const exato = TODAS.find(e => semAcento(e.comum) === p);
  if (exato) return { cientifico: exato.nome, comum: exato.comum };
  const pref = [...new Set(TODAS.filter(e => semAcento(e.comum).startsWith(p + '-')).map(e => e.nome))];
  if (p && pref.length === 1) { const e = TODAS.find(x => x.nome === pref[0]); return { cientifico: e.nome, comum: e.comum }; }
  return porCient(t) || { cientifico: '', comum: '' };
}
const opcoesEspecies = () => [...new Set([...TODAS.map(e => `${e.comum} (${e.nome})`),
  ...[...AM_RS, ...AM_BR].filter(a => !TODAS.some(e => casa(a.c, e.c))).map(a => capital(a.c))])].sort((a, b) => a.localeCompare(b, 'pt-BR'));

const MULTA = { comum: 500, ameacada: 5000 }; // Decreto 6.514/2008, art. 24, I e II
const ESTADO_AVE = { viva: 'viva', ferida: 'ferida', morta: 'morta' };
const DESTINO_AVE = { apreendida: 'apreendida e encaminhada ao CETAS/CRAF', deposito: 'deixada com depositário', soltura: 'solta no local', entrega: 'entregue voluntariamente' };
const SEXO_AVE = { M: 'macho', F: 'fêmea' };
const DOCUMENTACAO = { nenhuma: 'nenhuma', vencida: 'licença ou cadastro vencido', ctf: 'apenas CTF', outra: 'outra (ver relato)' };
function resumoAbordagem(ab) {
  const linhas = (ab.aves || []).filter(a => a.especie || +a.qtd).map(a => {
    const id = identificarEspecie(a.especie), am = id.cientifico ? ameaca(id.cientifico) : null, qtd = Math.max(1, parseInt(a.qtd) || 1);
    return { ...a, qtd, ...id, ameaca: am, anexo: id.cientifico ? especie(id.cientifico)?.anexo || '' : '', multaUnit: am ? MULTA.ameacada : MULTA.comum };
  });
  const soma = f => linhas.reduce((n, l) => n + (f(l) ? l.qtd : 0), 0);
  return { linhas, aves: soma(() => true), ameacadas: soma(l => l.ameaca), apreendidas: soma(l => l.destino === 'apreendida'),
    especies: new Set(linhas.map(l => l.cientifico || semAcento(l.especie))).size, multa: linhas.reduce((n, l) => n + l.qtd * l.multaUnit, 0) };
}
const reais = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCpf = c => { const d = String(c ?? '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d; };
const dataHora = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] : ''}` : (s || ''); };
function textoAbordagem(ab, { assinatura = '', criador = null } = {}) {
  const r = resumoAbordagem(ab), L = [], d = ab.denuncia || {}, lo = ab.local || {}, pe = ab.pessoa || {}, dc = ab.docs || {};
  const junta = (...x) => x.filter(Boolean).join(', ');
  L.push('RELATÓRIO DE ABORDAGEM - FAUNA SILVESTRE (PASSERIFORMES)', '');
  if (d.protocolo || d.data || d.origem) L.push(`Origem: ${d.protocolo ? `Denúncia nº ${d.protocolo}` : 'Denúncia'}${d.origem ? ` (${d.origem})` : ''}${d.data ? `, recebida em ${dataHora(d.data)}` : ''}.`);
  if (d.texto) L.push(`Teor da denúncia: ${d.texto}`);
  if (ab.data) L.push(`Data e hora da abordagem: ${dataHora(ab.data)}`);
  if (ab.equipe) L.push(`Equipe: ${ab.equipe}`);
  L.push('', 'LOCAL DOS FATOS', junta(lo.endereco, lo.bairro, lo.cidade) || 'não informado');
  if (lo.referencia) L.push(`Referência: ${lo.referencia}`);
  if (lo.lat != null && lo.lon != null && lo.lat !== '') L.push(`Coordenadas: ${lo.lat}, ${lo.lon}`);
  L.push('', 'ABORDADO');
  L.push(junta(pe.nome || 'não identificado', pe.cpf && `CPF ${fmtCpf(pe.cpf)}`, pe.rg && `RG ${pe.rg}`, pe.nascimento && `nascido(a) em ${dataHora(pe.nascimento)}`, pe.telefone && `telefone ${pe.telefone}`));
  if (pe.endereco) L.push(`Endereço: ${pe.endereco}`);
  L.push(criador ? `Criador cadastrado no SISPASS (registro ${criador.registro || '?'}).` : 'Não possui cadastro no SISPASS na base consultada.');
  if (ab.documentacao) L.push(`Documentação apresentada: ${DOCUMENTACAO[ab.documentacao] || ab.documentacao}`);
  if (r.linhas.length) {
    L.push('', `AVES (${r.aves} indivíduos de ${r.especies} espécies${r.ameacadas ? `, ${r.ameacadas} de espécie ameaçada` : ''})`);
    for (const l of r.linhas) L.push(`- ${l.qtd} × ${l.comum || l.especie}${l.cientifico ? ` (${l.cientifico})` : ''}` + [SEXO_AVE[l.sexo], l.anilha ? `anilha ${l.anilha}` : 'sem anilha',
      ESTADO_AVE[l.estado], DESTINO_AVE[l.destino], l.ameaca && `ameaçada (${[l.ameaca.rs && 'RS ' + l.ameaca.rs, l.ameaca.br && 'BR ' + l.ameaca.br].filter(Boolean).join(', ')})`]
      .filter(Boolean).map(x => ', ' + x).join(''));
  }
  const pet = (ab.petrechos || []).filter(p => p.item);
  if (pet.length) { L.push('', 'PETRECHOS'); pet.forEach(p => L.push(`- ${Math.max(1, parseInt(p.qtd) || 1)} × ${p.item}`)); }
  if (r.linhas.length && !criador) {
    L.push('', 'ENQUADRAMENTO');
    L.push(`- Crime: Lei 9.605/1998, art. 29, §1º, III (guardar ou ter em cativeiro espécimes da fauna silvestre sem permissão, licença ou autorização)${r.ameacadas ? '; pena aumentada de metade pelo §4º, I (espécie ameaçada)' : ''}.`);
    const comuns = r.aves - r.ameacadas;
    L.push(`- Infração administrativa: Decreto 6.514/2008, art. 24, §3º, III: ${[comuns && `${comuns} × ${reais(MULTA.comum)} (inciso I)`, r.ameacadas && `${r.ameacadas} × ${reais(MULTA.ameacada)} (inciso II)`].filter(Boolean).join(' + ')} = ${reais(r.multa)} (valor de referência).`);
  }
  const docs = [['ai', 'Auto de Infração'], ['termoApreensao', 'Termo de Apreensão'], ['termoDeposito', 'Termo de Depósito'], ['bo', 'BO'], ['tco', 'TCO']].filter(([k]) => dc[k]);
  if (docs.length) { L.push('', 'DOCUMENTOS'); docs.forEach(([k, n]) => L.push(`- ${n} nº ${dc[k]}`)); }
  if (ab.relato) L.push('', 'RELATO', ab.relato);
  if (ab.prazo?.data) L.push('', `Prazo / retorno: ${dataHora(ab.prazo.data)}${ab.prazo.motivo ? ` (${ab.prazo.motivo})` : ''}`);
  if (assinatura) L.push('', assinatura);
  return L.join('\n').trim();
}

// ---------- Prazos (notificação do art. 64 e retornos de abordagem) ----------
const iso = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const utc = s => new Date(s.slice(0, 10) + 'T00:00:00Z');
const somarDias = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function situacaoPrazo(venc, hoje) {
  const dias = Math.round((utc(venc) - utc(hoje)) / 864e5), dt = dataIso(venc);
  const texto = dias === 0 ? `vence hoje (${dt})` : dias > 0 ? `vence em ${dt} (falta${dias > 1 ? 'm' : ''} ${dias} dia${dias > 1 ? 's' : ''})` : `vencido há ${-dias} dia${dias < -1 ? 's' : ''} (${dt})`;
  return { dias, vencido: dias < 0, texto };
}
// Evento de dia inteiro com alarme às 9h da véspera, para importar na agenda do celular.
function ics({ uid, data, titulo, descricao = '' }) {
  const e = t => String(t).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const d = data.replace(/-/g, ''), fim = somarDias(data, 1).replace(/-/g, '');
  const agora = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//fiscal-passeriformes//PT-BR', 'BEGIN:VEVENT', `UID:${uid}@fiscal-passeriformes`, `DTSTAMP:${agora}`,
    `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${fim}`, `SUMMARY:${e(titulo)}`, `DESCRIPTION:${e(descricao)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15H', `DESCRIPTION:${e(titulo)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
const textoNotificacao = n => `Notificado em ${dataIso(n.ciencia)} para regularizar em ${n.prazo} dias, até ${dataIso(somarDias(n.ciencia, +n.prazo))}${n.objeto ? ': ' + n.objeto : ''} (IN SEMA 04/2022, art. 64).`;

// CTF cancelado se o relatório já aponta, ou se alguma observação do fiscal menciona "CTF cancelado".
function ctfCancelado(status, textos = []) {
  if (status === 'cancelado') return true;
  return textos.some(t => /ctf[^.]{0,12}cancelad|cancelad[^.]{0,12}ctf/i.test(String(t ?? '')));
}

globalThis.Normas = { especie, ameaca, periodo, situacaoCTF, situacaoLicenca, ameacadasDoPlantel, verificar, textoSuspensao, fmt, canon, CONF, resumoConferencia, textoRelatorio,
  identificarEspecie, opcoesEspecies, resumoAbordagem, textoAbordagem, ESTADO_AVE, DESTINO_AVE, DOCUMENTACAO, MULTA, reais,
  somarDias, situacaoPrazo, ics, textoNotificacao, ctfCancelado };
})();
