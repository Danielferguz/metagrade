import { readFile, mapColumns, normalize, detectType, download, toCSV } from './io.js?v=2026.10.25-4';
import { escalc, rma, egger, subgroupTest, metaReg, designMatrix } from './pairwise.js?v=2026.10.25-4';
import { NMA, isConnected, armBaseline, quantile } from './nma.js?v=2026.10.25-4';
import { gradePairwise, finalCertainty, footnotes, gradeNMA, absolute, category, legendText, plainStatement, thresholdSet, LEVELS, SYM, DOMAIN_LABEL, SEVERITY } from './grade.js?v=2026.10.25-4';
import { mountThreshold } from './thresh.js?v=2026.10.25-4';
import { renderEtD } from './etd.js?v=2026.10.25-4';
import { bindFigs, effPt, figSettings } from './figs.js?v=2026.10.25-4';
import { stepFlowHTML, stepsTableHTML, supplTable } from './nmasteps.js?v=2026.10.25-4';
import { forestSVG, forestRM, bubbleSVG, networkSVG, funnelSVG, nodesplitSVG, thresholdSVG, shareBarSVG, i2GaugeSVG, oisSVG, crossLabel, robClass, ROB_COL, ZONE } from './plots.js?v=2026.10.25-4';
import { mountModules } from './modules.js?v=2026.10.25-4';
import { MIDS, midValues } from './mids.js?v=2026.10.25-4';
import { median } from './stats.js?v=2026.10.25-4';
import { HELP_HTML } from './help.js?v=2026.10.25-4';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f2 = x => (isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)) : '–');
const f1 = x => (isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(1)) : '–');
// minúscula inicial solo si no es una sigla (eGFR, KDQOL…)
const lcOut = o => (/^[A-Za-z][a-z]/.test(o) ? o.charAt(0).toLowerCase() + o.slice(1) : o);
const pct = x => (isFinite(x) ? (x * 100).toFixed(0) + '%' : '–');
const fp = p => (!isFinite(p) ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3));

const PALETTES = {
  default: { benefit: { 4: 'B6D7A8', 3: 'D4E8CB', 2: 'EAF4E4' }, harm: { 4: 'EDB0B0', 3: 'F5CFCF', 2: 'FBEAEA' }, nodiff: { 4: 'FFE08A', 3: 'FFEDB8', 2: 'FFF7DB' }, verylow: 'EDEDED' },
  cvd: { benefit: { 4: 'A9CCE3', 3: 'CFE2F0', 2: 'E8F1F8' }, harm: { 4: 'F5C19B', 3: 'F9DAC3', 2: 'FCEDE1' }, nodiff: { 4: 'C9C0E0', 3: 'DDD7EC', 2: 'EEEBF6' }, verylow: 'EDEDED' },
};
const fillFor = (cat, c, pal = PALETTES[state.palette]) => c <= 1 ? pal.verylow : (pal[cat] || {})[c];

const state = { ocfg: {}, cache: { pw: {}, nm: {} }, sheets: null, sheet: null, map: {}, rows: [], kind: 'pairwise', type: {}, sof: load('mg-sof', []), palette: load('mg-pal', 'default'), lastPw: null, lastNm: null };
function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }

// ---------------- pestañas ----------------
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(t) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
  if (t === 'sof') renderSoF();
  if (t === 'etd') renderEtD($('#etd'), { sof: state.sof, fillFor, save, load });
  window.scrollTo({ top: 0 });
}
$('#help').innerHTML = HELP_HTML;
// biblioteca de MID (tabla de consulta y CSV)
{
  const row = m => { const a = midValues(m, 100), b = midValues(m, 1000), u = m.type === 'bin' ? 'por 100 (por 1000)' : m.unit, f = (x, y) => (m.type === 'bin' ? `${x} (${y})` : x); return [m.area, m.name, m.type === 'bin' ? 'binario' : 'continuo', u, m.type === 'bin' ? m.dis : '', f(a.mid, b.mid), f(a.mod, b.mod), f(a.large, b.large), m.dir === 'lower' ? 'mayor = indeseable' : 'mayor = deseable', m.basis]; };
  const head = ['Área', 'Desenlace', 'Tipo', 'Unidad', 'Desutilidad', 'MID (pequeño)', 'Moderado', 'Grande', 'Dirección', 'Base'];
  $('#help').insertAdjacentHTML('beforeend', `<h2>Biblioteca de MID para nefrología, cardiología y hematología</h2><p>Propuestas <b>conservadoras</b> y orientativas: la MID es el menor cambio que un paciente o clínico consideraría importante; se redondea hacia el valor mayor razonable para no llamar «importante» a un cambio trivial. En los binarios se usa la desutilidad (muerte = 1) y los umbrales de GRADE-THRESHOLD; en los continuos, el umbral pequeño es la MID y los otros dos son moderado y grande. Elíjalas en «Plantilla de MID» de cada desenlace (paso 2) y ajuste con su panel, su población y su contexto.</p><p><button class="ghost" id="mid-csv">Descargar CSV</button></p><div class="tablewrap"><table class="data"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${MIDS.map(m => `<tr>${row(m).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
  $('#mid-csv').addEventListener('click', () => download('MID_library.csv', toCSV(MIDS.map(m => Object.fromEntries(row(m).map((v, i) => [head[i], v]))), head), 'text/csv'));
}

// ---------------- carga de datos ----------------
$('#file').addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0]));
const drop = $('#drop');
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]));
document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', async () => {
  const r = await fetch(b.dataset.example); const txt = await r.text();
  loadFile(new File([txt], b.dataset.example.split('/').pop(), { type: 'text/csv' }));
}));

// pestañas por desenlace en el paso 2 (resultados ya calculados, sin volver a ejecutar)
function renderOTabs(kind) {
  const C = state.cache[kind], keys = Object.keys(C), el = $(kind === 'pw' ? '#pw-otabs' : '#nm-otabs');
  const cur = kind === 'pw' ? state.lastPw?.outcome : state.lastNm?.outcome;
  if (keys.length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = `<span class="muted">Desenlaces analizados:</span>${keys.map(k => `<button type="button" class="${k === cur ? 'active' : ''}" data-otab="${esc(k)}">${esc(k)}${C[k].addedSoF ? ' ✓' : ''}</button>`).join('')}`;
  el.querySelectorAll('[data-otab]').forEach(b => b.addEventListener('click', () => {
    const P = C[b.dataset.otab];
    if (kind === 'pw') { state.lastPw = P; $('#pw-outcome').value = P.outcome; renderPairwise(...P.args, x => (P.isRatio ? Math.exp(x) : x)); }
    else { state.lastNm = P; $('#nm-outcome').value = P.outcome; renderNMA(); }
    renderOTabs(kind);
  }));
}
async function loadFile(file) {
  try {
    const { sheets } = await readFile(file);
    state.sheets = sheets; state.cache = { pw: {}, nm: {} }; state.ocfg = {}; $('#pw-otabs').innerHTML = ''; $('#nm-otabs').innerHTML = '';
    const names = Object.keys(sheets);
    $('#sheet').innerHTML = names.map(n => `<option>${esc(n)}</option>`).join('');
    $('#sheet').parentElement.hidden = names.length < 2;
    selectSheet(names.find(n => sheets[n].length) || names[0]);
    $('#data-card').hidden = false;
  } catch (err) { alert('No se pudo leer el archivo: ' + err.message); }
}
$('#sheet').addEventListener('change', e => selectSheet(e.target.value));
function selectSheet(name) {
  state.sheet = name; state.raw = state.sheets[name] || []; state.subvar = state.regvar = undefined;
  state.map = mapColumns(state.raw);
  state.type = detectType(state.map);
  state.kind = ['nma', 'prop', 'dta'].includes(state.type.kind) ? state.type.kind : 'pairwise';
  $('#kind').value = state.kind;
  renderMapping(); refreshData();
}
const CANON = { pairwise: ['study', 'outcome', 'subgroup', 'e1', 'n1', 'e2', 'n2', 'm1', 'sd1', 'm2', 'sd2', 'est', 'lower', 'upper', 'yi', 'sei', 'n', 'fu', 'rob', 'indirect', 'design'], prop: ['study', 'outcome', 'subgroup', 'x', 'n', 'pt', 'rob', 'design', 'fu'], dta: ['study', 'outcome', 'subgroup', 'tp', 'fp', 'fn', 'tn', 'rob', 'indirect'], nma: ['study', 'outcome', 'treatment', 'r', 'mean', 'sd', 'n', 'rob', 'indirect', 'modifier'] };
const CANON_LABEL = { tp: 'Verdaderos positivos (TP)', fp: 'Falsos positivos (FP)', fn: 'Falsos negativos (FN)', tn: 'Verdaderos negativos (TN)', x: 'Casos', pt: 'Tiempo-persona', fu: 'Seguimiento (mediana o rango)', study: 'Estudio', outcome: 'Desenlace', subgroup: 'Subgrupo', e1: 'Eventos intervención', n1: 'N intervención', e2: 'Eventos comparador', n2: 'N comparador', m1: 'Media intervención', sd1: 'DE intervención', m2: 'Media comparador', sd2: 'DE comparador', est: 'Estimador (HR/OR/RR)', lower: 'IC inferior', upper: 'IC superior', yi: 'yi', sei: 'EE (sei)', n: 'N total', rob: 'Riesgo de sesgo', indirect: 'Indirecto', design: 'Diseño', treatment: 'Tratamiento', r: 'Eventos/respondedores', mean: 'Media', sd: 'DE', modifier: 'Modificador (intransitividad)' };
function renderMapping() {
  const cols = Object.keys(state.raw[0] || {});
  $('#mapping').innerHTML = CANON[state.kind].map(k => `<label>${CANON_LABEL[k]}<select data-canon="${k}"><option value="">—</option>${cols.map(c => `<option ${state.map[k] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`).join('');
  $('#mapping').querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
    if (s.value) state.map[s.dataset.canon] = s.value; else delete state.map[s.dataset.canon];
    state.type = detectType(state.map); refreshData();
  }));
}
$('#kind').addEventListener('change', e => { state.kind = e.target.value; renderMapping(); refreshData(); });
['#outcome-filter', '#subgroup-filter'].forEach(s => $(s).addEventListener('change', refreshData));

function refreshData() {
  const all = normalize(state.raw, state.map);
  const outs = state.map.outcome ? [...new Set(all.map(r => r.outcome))] : [];
  const prevO = $('#outcome-filter').value;
  $('#outcome-wrap').hidden = outs.length < 2;
  const pick = $('#outcome-pick');
  if (outs.length < 2) pick.innerHTML = '';
  else if ([...pick.querySelectorAll('input')].map(x => x.value).join('\u0001') !== outs.join('\u0001')) {
    pick.innerHTML = `<div class="row between wrap"><b>Desenlaces a analizar</b><span><button type="button" class="ghost" data-pickall="1">Todos</button> <button type="button" class="ghost" data-pickall="0">Ninguno</button></span></div><div class="picklist">${outs.map(o => `<label><input type="checkbox" value="${esc(o)}" checked> ${esc(o)} <small class="muted">(${all.filter(r => r.outcome === o).length} filas)</small></label>`).join('')}</div><p class="muted">«Ejecutar todos los desenlaces» en el paso 2 analiza solo los marcados; el selector «Desenlace» define la vista previa y el análisis individual.</p>`;
    pick.querySelectorAll('[data-pickall]').forEach(b => b.addEventListener('click', () => pick.querySelectorAll('input').forEach(x => x.checked = b.dataset.pickall === '1')));
  }
  if (outs.length < 2) $('#outcome-filter').innerHTML = '';
  const curOpts = [...$('#outcome-filter').options].map(o => o.value);
  if (outs.length >= 2 && curOpts.join('\u0001') !== outs.join('\u0001')) { $('#outcome-filter').innerHTML = outs.map(o => `<option>${esc(o)}</option>`).join(''); if (outs.includes(prevO)) $('#outcome-filter').value = prevO; }
  let rows = all;
  if (outs.length >= 2) rows = rows.filter(r => r.outcome === ($('#outcome-filter').value || prevO || outs[0]));
  const subs = state.kind === 'pairwise' && state.map.subgroup ? [...new Set(rows.map(r => r.subgroup))] : [];
  $('#subgroup-wrap').hidden = subs.length < 2;
  if (subs.length >= 2) {
    if ([...$('#subgroup-filter').options].filter(o => o.value !== '__all').map(o => o.value).join('\u0001') !== subs.join('\u0001')) $('#subgroup-filter').innerHTML = `<option value="__all">Todos (con prueba de subgrupos)</option>` + subs.map(o => `<option>${esc(o)}</option>`).join('');
    const sv = $('#subgroup-filter').value;
    state.subgroups = subs;
    state.subAll = sv === '__all';
    if (sv && sv !== '__all') rows = rows.filter(r => r.subgroup === sv);
  } else { state.subgroups = []; state.subAll = false; }
  state.rows = rows;
  const t = detectType(state.map);
  $('#detected').textContent = t.kind === 'dta' ? `DTA (beta) · ${new Set(rows.map(r => r.outcome)).size} análisis · ${rows.length} filas` : t.kind === 'prop' ? `${t.data === 'rate' ? 'Incidencia' : 'Prevalencia'} · ${rows.length} estudios` : t.kind === 'nma' ? `NMA · ${t.outcome === 'binary' ? 'binario' : 'continuo'} · ${new Set(rows.map(r => r.study)).size} estudios` : t.kind === 'pairwise' ? `Pares · ${{ binary: 'binario', continuous: 'continuo', generic: 'genérico (yi, sei)', 'ratio-ci': 'razones ajustadas con IC' }[t.data]} · ${rows.length} estudios` : 'Formato no reconocido: revise las columnas';
  const cols = Object.keys(state.raw[0] || {});
  const vis = state.raw.filter(r => !state.map.outcome || outs.length < 2 || r[state.map.outcome] === ($('#outcome-filter').value || outs[0])).slice(0, 200);
  $('#preview').innerHTML = `<thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${vis.map(r => `<tr>${cols.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  if ($('#pw-outcome') && outs.length) { $('#pw-outcome').value = $('#outcome-filter').value || outs[0]; $('#nm-outcome').value = $('#pw-outcome').value; }
}

$('#go-analysis').addEventListener('click', () => { setupAnalysis(); if (['pairwise', 'nma'].includes(state.kind)) renderOutcomeConfig(state.kind === 'nma' ? 'nm' : 'pw'); showTab('analisis'); });

// ---------------- análisis: preparación ----------------
function setupAnalysis() {
  const t = detectType(state.map);
  $('#no-data').hidden = true;
  $('#pw').hidden = state.kind !== 'pairwise'; $('#nm').hidden = state.kind !== 'nma'; $('#pr').hidden = state.kind !== 'prop'; $('#dt').hidden = state.kind !== 'dta';
  if (state.kind === 'prop') { MOD.setupPrev(); return; }
  if (state.kind === 'dta') { MOD.setupDta(); return; }
  if (state.kind === 'pairwise') {
    const opts = { binary: ['RR', 'OR', 'RD'], continuous: ['MD', 'SMD', 'ROM'], generic: ['RR', 'OR', 'HR', 'MD', 'SMD'], 'ratio-ci': ['HR', 'OR', 'RR'] }[t.data] || ['RR'];
    $('#pw-measure').innerHTML = opts.map(o => `<option>${o}</option>`).join('');
    if (t.data === 'binary') {
      const p = state.rows.map(r => r.e2 / r.n2).filter(isFinite);
      $('#pw-p0').value = p.length ? median(p).toFixed(3) : '';
    }
    $('#pw-p0').closest('label').hidden = t.data === 'continuous';
    const dc = dataCols(), opts2 = cur => '<option value="">— ninguno —</option>' + dc.map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
    const keep = v => (v !== undefined && (v === '' || v === '__rob__' || dc.includes(v)) ? v : null);
    const cs = keep(state.subvar) ?? (state.subvar === '__rob__' ? '__rob__' : state.subAll && state.map.subgroup ? state.map.subgroup : '');
    $('#pw-subvar').innerHTML = opts2(cs).replace('</option>', `</option><option value="__rob__"${cs === '__rob__' ? ' selected' : ''}>Riesgo de sesgo (sensibilidad: bajo / algunas preocupaciones / alto)</option>`);
    $('#pw-regvar').innerHTML = opts2(keep(state.regvar) ?? '');
    $('#pw-results').innerHTML = '';
  } else {
    $('#nm-type').value = t.outcome || 'binary';
    const counts = {}; state.rows.forEach(r => counts[r.treatment] = (counts[r.treatment] || 0) + 1);
    const ts = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    $('#nm-ref').innerHTML = ts.map((x, i) => `<option ${i === 0 ? 'selected' : ''}>${esc(x)}</option>`).join('');
    $('#nm-results').innerHTML = '';
  }
}
const syncScheme = () => { document.querySelectorAll('.s3').forEach(e => e.hidden = $('#pw-scheme').value !== '3'); document.querySelectorAll('.s3n').forEach(e => e.hidden = $('#nm-scheme').value !== '3'); };
$('#pw-scheme').addEventListener('change', syncScheme); $('#nm-scheme').addEventListener('change', syncScheme); syncScheme();
// umbrales moderado/grande por defecto en binarios: proporciones de GRADE-THRESHOLD (DT2/DT1 = 2,38; DT3/DT1 = 4,63)
const defT = (v, mid, f, binary) => (v > 0 ? v : binary && mid > 0 ? +(mid * f).toFixed(2) : NaN);
$('#pw-unit').addEventListener('change', () => $('#pw-mid-unit').textContent = 'por ' + $('#pw-unit').value);

const DT = (dis, unit) => [0.0135, 0.0321, 0.0625].map(c => +Math.min(unit, c * unit / dis).toFixed(2));
// configuración por desenlace desde columnas opcionales del archivo
// ---------- configuración por desenlace (desplegables en el paso 2) ----------
const IMP_OPTS = ['Critical', 'Important', 'Surrogate'];
const normImp = v => (/crit/i.test(v || '') ? 'Critical' : /surrog|subrog/i.test(v || '') ? 'Surrogate' : /import/i.test(v || '') ? 'Important' : 'Critical');
const SINGLE = '__single__';
const oName = (kind, o) => (o === SINGLE ? ($(kind === 'pw' ? '#pw-outcome' : '#nm-outcome').value || 'Outcome') : o);
function outcomeRows(o) { return normalize(state.raw, state.map).filter(r => o === SINGLE || !state.map.outcome || r.outcome === o); }
// riesgo basal del comparador: opciones calculadas a partir de los brazos control del desenlace
const P0_LABEL = { median: 'Mediana del riesgo en los grupos comparadores', largest: 'Grupo comparador del estudio más grande', p25: 'Percentil 25 del riesgo en los grupos comparadores', pt: 'Proporción combinada (efectos aleatorios)', manual: 'Manual (p. ej., cohorte o registro representativo)' };
function ctrlStats(rows) {
  const ok = rows.filter(x => isFinite(x.e2) && x.n2 > 0), p = ok.map(x => x.e2 / x.n2);
  if (!p.length) return null;
  const big = ok.reduce((a, b) => (b.n2 > a.n2 ? b : a));
  return { median: median(p), largest: big.e2 / big.n2, largestName: big.study, p25: quantile(p, 0.25), k: p.length };
}
const P0_EN = { median: 'median risk in the comparator groups', largest: 'comparator group of the largest study', p25: '25th percentile of comparator-group risks', lo: 'lower limit of the pooled comparator-arm proportion', hi: 'upper limit of the pooled comparator-arm proportion', pt: 'pooled comparator-arm proportion (random effects)', manual: 'external source (manual)' };
function p0Source(outcome) {
  const C = state.ocfg.pw || {}, c = C[outcome] || (Object.keys(C).length === 1 && C['__single__']);
  if (!c || !c.p0method) return '';
  return P0_EN[c.p0method] + (c.p0method === 'largest' && c.p0stats ? ` (${c.p0stats.largestName})` : '');
}
// seguimiento para la SoF: texto libre del desenlace o, si no hay, resumen de la columna «followup» (mediana y rango; texto → valores distintos)
function followupText(P) {
  const C = state.ocfg.pw || {}, c = C[P.outcome] || (Object.keys(C).length === 1 && C.__single__);
  if (c && String(c.followup || '').trim()) return String(c.followup).trim();
  const col = state.map.fu; if (!col) return '';
  const vals = P.S.map(s => String(s.raw.fu ?? '').trim()).filter(Boolean); if (!vals.length) return '';
  if (vals.every(v => /^-?[\d.,]+$/.test(v))) {
    const x = vals.map(v => parseFloat(v.replace(',', '.'))), u = { year: 'years', 'año': 'years', ano: 'years', month: 'months', mes: 'months', week: 'weeks', semana: 'weeks', day: 'days', dia: 'days', 'día': 'days' }, un = u[(String(col).toLowerCase().match(/year|a[nñ]o|month|mes|week|semana|day|d[ií]a/) || [''])[0]] || '', f = v => +v.toFixed(1);
    return x.length > 1 ? `median ${f(median(x))}${un ? ' ' + un : ''} (range ${f(Math.min(...x))}–${f(Math.max(...x))})` : `${f(x[0])}${un ? ' ' + un : ''}`;
  }
  return [...new Set(vals)].slice(0, 4).join('; ');
}
function p0Value(c) { return c.p0method === 'manual' || !c.p0stats ? c.p0manual : c.p0stats[c.p0method]; }
function defaultCfg(kind, o) {
  const rows = outcomeRows(o), r = rows.find(x => x.o_dir || x.o_mid || x.o_dis || x.o_importance) || rows[0] || {};
  const t = detectType(state.map), pre = kind === 'pw' ? '#pw-' : '#nm-', unit = +$(pre + 'unit').value;
  const binary = kind === 'pw' ? ['binary', 'ratio-ci'].includes(t.data) || (t.data === 'generic' && false) : t.outcome === 'binary';
  const c = { include: true, importance: normImp(r.o_importance), dir: r.o_dir ? (/^(high|desir|mayor)/i.test(r.o_dir) ? 'higher' : 'lower') : $(pre + 'dir').value,
    mid: '', mod: '', large: '', dis: r.o_dis > 0 ? r.o_dis : '', sd: '', binary, n: kind === 'nm' ? new Set(rows.map(x => x.study)).size : rows.length };
  if (r.o_dis > 0) [c.mid, c.mod, c.large] = DT(r.o_dis, unit);
  else if (r.o_mid > 0) c.mid = r.o_mid;
  else c.mid = +$(pre + 'mid').value || '';
  if (kind === 'nm' && c.binary) { c.p0method = r.o_p0 > 0 ? 'manual' : $('#nm-base').value === 'manual' ? 'pt' : $('#nm-base').value; c.p0manual = r.o_p0 > 0 ? r.o_p0 : ''; }
  if (kind === 'pw') {
    const opts = { binary: ['RR', 'OR', 'RD'], continuous: ['MD', 'SMD', 'ROM'], generic: ['RR', 'OR', 'HR', 'MD', 'SMD'], 'ratio-ci': ['HR', 'OR', 'RR'] }[t.data] || ['RR'];
    c.measures = opts; c.measure = opts[0];
    c.p0stats = ctrlStats(rows);
    c.p0manual = r.o_p0 > 0 ? r.o_p0 : '';
    c.p0method = r.o_p0 > 0 || !c.p0stats ? 'manual' : 'median';
    c.p0 = p0Value(c) === '' ? '' : +(+p0Value(c)).toFixed(4);
    c.int = r.o_int || $('#pw-int').value; c.comp = r.o_comp || $('#pw-comp').value;
  }
  return c;
}
function outcomeList() { const o = state.map.outcome ? [...new Set(normalize(state.raw, state.map).map(r => r.outcome))] : []; return o.length >= 2 ? o : [SINGLE]; }
const ocSummary = (kind, c) => `· ${c.n} ${kind === 'nm' ? 'estudios' : 'filas'} · ${c.importance} · ${c.dir === 'higher' ? '↑ deseable' : '↓ indeseable'}${kind === 'pw' ? ' · ' + c.measure : ''} · MID ${c.mid === '' ? '—' : c.mid}${c.mod ? ` / ${c.mod} / ${c.large}` : ''}${c.binary && c.p0method ? ` · riesgo basal: ${{ median: 'mediana', largest: 'estudio más grande', p25: 'p25', pt: 'combinado', manual: 'manual' }[c.p0method]}${kind === 'pw' && c.p0 !== '' ? ' ' + (c.p0 * 100).toFixed(1) + '%' : ''}` : ''}`;
function renderOutcomeConfig(kind) {
  const el = $(kind === 'pw' ? '#pw-outcfg' : '#nm-outcfg'), outs = outcomeList();
  const C = (state.ocfg[kind] = state.ocfg[kind] || {});
  const picked = [...document.querySelectorAll('#outcome-pick input')].reduce((a, x) => (a[x.value] = x.checked, a), {});
  outs.forEach(o => { if (!C[o]) { C[o] = defaultCfg(kind, o); if (picked[o] === false) C[o].include = false; } });
  const unitLbl = kind === 'pw' ? `por ${$('#pw-unit').value}` : `por ${$('#nm-unit').value}`;
  const fld = (o, k, label, attrs = '', unit = '') => `<label>${label}${unit ? ` <span class="unit">${unit}</span>` : ''}<input data-oc="${k}" value="${esc(C[o][k] ?? '')}" ${attrs}></label>`;
  el.innerHTML = `<div class="row between wrap"><h3 style="margin:0">Desenlaces: configuración individual</h3><span class="row gap"><button type="button" class="ghost" data-ocall="1">Abrir todos</button><button type="button" class="ghost" data-ocall="0">Cerrar todos</button></span></div>
  <p class="muted">Cada desenlace tiene su propia importancia, dirección, umbrales (MID, moderado, grande) y, en pares, medida, riesgo basal y nombres. Al final use «Ejecutar todos los desenlaces y añadir a SoF». La configuración global de arriba (modelo, IC, esquema de umbrales, opciones de dominios) se aplica a todos.</p>
  ${outs.map((o, oi) => { const c = C[o], st = state.cache[kind]?.[oName(kind, o)];
    return `<details class="ocfg" data-out="${esc(o)}"><summary><input type="checkbox" data-oc="include" ${c.include ? 'checked' : ''} title="Incluir en «Ejecutar todos»"> <b>${esc(oName(kind, o))}</b>
      <span class="muted">${esc(ocSummary(kind, c))}</span>${st ? ` <span class="pill">${st.addedSoF ? 'en SoF ✓' : 'analizado'}</span>` : ''}</summary>
      <div class="form">
        <label>Importancia <select data-oc="importance">${IMP_OPTS.map(x => `<option ${x === c.importance ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Un valor mayor es… <select data-oc="dir"><option value="lower" ${c.dir === 'lower' ? 'selected' : ''}>indeseable</option><option value="higher" ${c.dir === 'higher' ? 'selected' : ''}>deseable</option></select></label>
        ${kind === 'pw' ? `<label>Medida <select data-oc="measure">${c.measures.map(x => `<option ${x === c.measure ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
        <label class="wide">Plantilla de MID (nefro-cardio-hemato; propuesta conservadora, ajuste con su panel)<select data-preset><option value="">— elegir —</option>${[...new Set(MIDS.map(m => m.area))].map(a => `<optgroup label="${a}">${MIDS.map((m, i) => [i, m]).filter(([, m]) => m.area === a && (m.type === 'bin') === !!c.binary).map(([i, m]) => `<option value="${i}">${esc(m.name)}${m.type === 'cont' ? ' [' + esc(m.unit) + ']' : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>
        ${fld(o, 'mid', 'MID (umbral pequeño)', 'type="number" step="any"', c.binary ? unitLbl : '')}
        ${fld(o, 'mod', 'Umbral moderado', 'type="number" step="any" placeholder="opcional"')}
        ${fld(o, 'large', 'Umbral grande', 'type="number" step="any" placeholder="opcional"')}
        ${kind === 'pw' && c.binary ? `<label>Riesgo basal del comparador <select data-oc="p0method">${['median', 'largest', 'p25', 'manual'].filter(m => m === 'manual' || c.p0stats).map(m => `<option value="${m}" ${m === c.p0method ? 'selected' : ''}>${P0_LABEL[m]}${m !== 'manual' ? ` (${(c.p0stats[m] * 100).toFixed(1)}%${m === 'largest' ? ', ' + esc(c.p0stats.largestName) : ''})` : ''}</option>`).join('')}</select></label>
          <label>Riesgo basal (proporción) <input data-oc="p0manual" type="number" step="any" min="0" max="1" value="${esc(c.p0method === 'manual' ? c.p0manual : c.p0)}" ${c.p0method === 'manual' ? '' : 'disabled'}></label>` : ''}
        ${kind === 'nm' && c.binary ? `<label>Riesgo basal del comparador <select data-oc="p0method">${['pt', 'median', 'largest', 'p25', 'manual'].map(m => `<option value="${m}" ${m === c.p0method ? 'selected' : ''}>${P0_LABEL[m].replace('grupos comparadores', 'brazos del comparador').replace('Grupo comparador', 'Brazo del comparador')}</option>`).join('')}</select></label>
          <label>Riesgo basal manual (proporción) <input data-oc="p0manual" type="number" step="any" min="0" max="1" value="${esc(c.p0manual)}" ${c.p0method === 'manual' ? '' : 'disabled'}></label>` : ''}
        ${kind === 'pw' ? fld(o, 'int', 'Intervención') + fld(o, 'comp', 'Comparador') + fld(o, 'followup', 'Seguimiento en la SoF', 'placeholder="vacío = automático (columna de seguimiento)"') : ''}
      </div>
      <details class="thr-oc" open><summary>Umbrales de este desenlace: GRADE-THRESHOLD (disutilidad) o DME 0,2 / 0,5 / 0,8</summary><div class="thr" data-thr="${oi}"></div></details>
      <div class="row end gap"><button type="button" class="ghost" data-ocrun>Ejecutar solo este desenlace</button></div></details>`; }).join('')}`;
  el.querySelectorAll('details.ocfg').forEach(d => {
    const o = d.dataset.out, c = C[o];
    d.querySelectorAll('[data-oc]').forEach(inp => {
      inp.addEventListener('click', e => { if (inp.dataset.oc === 'include') e.stopPropagation(); });
      inp.addEventListener('change', () => {
        c[inp.dataset.oc] = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (inp.dataset.oc === 'dir' && d._thr) d._thr.setDesirable(c.dir === 'higher');
        if (inp.dataset.oc === 'p0method' || inp.dataset.oc === 'p0manual') {
          if (kind === 'pw') { const v = p0Value(c); c.p0 = v === '' ? '' : +(+v).toFixed(4); }
          const man = d.querySelector('[data-oc="p0manual"]');
          if (man) { man.disabled = c.p0method !== 'manual'; if (kind === 'pw' && c.p0method !== 'manual') man.value = c.p0; }
        }
        const sm = d.querySelector('summary .muted'); if (sm) sm.textContent = ocSummary(kind, c); });
    });
    d.querySelector('[data-preset]')?.addEventListener('change', e => {
      const m = MIDS[+e.target.value]; if (!m) return;
      const v = midValues(m, +$(kind === 'pw' ? '#pw-unit' : '#nm-unit').value);
      Object.assign(c, { dir: m.dir, mid: v.mid, mod: v.mod, large: v.large });
      if (m.type === 'bin') c.dis = m.dis; else if (kind === 'pw' && c.measures?.includes(m.measure)) c.measure = m.measure;
      ['mid', 'mod', 'large', 'dir', 'measure'].forEach(k => { const inp = d.querySelector(`[data-oc="${k}"]`); if (inp && c[k] !== undefined) inp.value = c[k]; });
      d._thr?.setDesirable(c.dir === 'higher');
      const sm = d.querySelector('summary .muted'); if (sm) sm.textContent = ocSummary(kind, c);
    });
    const thr = d.querySelector('[data-thr]');
    d._thr = mountThreshold(thr, `oc-${kind}-${thr.dataset.thr}-`, {
      desirable: c.dir === 'higher',
      unitFn: () => +$(kind === 'pw' ? '#pw-unit' : '#nm-unit').value, mode: c.binary ? 'bin' : 'cont', dis: c.dis, sd: c.sd, smd: c.measure === 'SMD',
      apply: (t, info) => {
        [c.mid, c.mod, c.large] = t; if (info.mode === 'bin') c.dis = info.dis; else c.sd = info.sd;
        ['mid', 'mod', 'large'].forEach(k => { const inp = d.querySelector(`[data-oc="${k}"]`); if (inp) inp.value = c[k]; });
        const sm = d.querySelector('summary .muted'); if (sm) sm.textContent = ocSummary(kind, c);
      } });
    d.querySelector('[data-ocrun]').addEventListener('click', () => runAll(kind, [o]));
  });
  el.querySelectorAll('[data-ocall]').forEach(b => b.addEventListener('click', () => el.querySelectorAll('details.ocfg').forEach(d => d.open = b.dataset.ocall === '1')));
}
function applyCfg(kind, o) {
  const c = state.ocfg[kind]?.[o]; if (!c) return '';
  const set = (id, v) => { if (v !== undefined && v !== null) $(id).value = v; };
  if (kind === 'pw') {
    if (c.measures?.includes(c.measure)) set('#pw-measure', c.measure);
    set('#pw-dir', c.dir); set('#pw-mid', c.mid); set('#pw-t2', c.mod); set('#pw-t3', c.large);
    if (c.binary && c.p0 !== '') set('#pw-p0', c.p0);
    set('#pw-int', c.int); set('#pw-comp', c.comp);
  } else {
    set('#nm-dir', c.dir); set('#nm-mid', c.mid); set('#nm-mod', c.mod); set('#nm-large', c.large);
    if (c.binary && c.p0method) { set('#nm-base', c.p0method); if (c.p0method === 'manual') set('#nm-p0', c.p0manual); }
  }
  return c.importance;
}
async function runAll(kind, only = null) {
  const outsAll = [...$('#outcome-filter').options].map(o => o.value);
  const C = state.ocfg[kind] || {};
  const picked = [...document.querySelectorAll('#outcome-pick input:checked')].map(x => x.value);
  const outs = only ? only.filter(o => o !== SINGLE) : outsAll.filter(o => (C[o] ? C[o].include : (!picked.length || picked.includes(o))));
  const list = outsAll.length ? outs : (C[SINGLE] && C[SINGLE].include === false && !only ? [] : [null]);
  const btn = $(kind === 'pw' ? '#pw-runall' : '#nm-runall'), t0 = btn.textContent;
  for (const [i, o] of list.entries()) {
    btn.textContent = `Ejecutando ${i + 1}/${list.length}…`;
    if (o != null) { $('#outcome-filter').value = o; if ($('#subgroup-filter').querySelector('option[value="__all"]')) $('#subgroup-filter').value = '__all'; refreshData(); }
    const keepRefs = kind === 'nm' ? [...$('#nm-ref').selectedOptions].map(x => x.value) : null;
    setupAnalysis();
    if (keepRefs) [...$('#nm-ref').options].forEach(x => x.selected = keepRefs.includes(x.value));
    if (o != null && !C[o]) { state.ocfg[kind] = state.ocfg[kind] || {}; state.ocfg[kind][o] = defaultCfg(kind, o); }
    if (o == null && !C[SINGLE]) { state.ocfg[kind] = state.ocfg[kind] || {}; state.ocfg[kind][SINGLE] = defaultCfg(kind, SINGLE); }
    const imp = applyCfg(kind, o ?? SINGLE);
    state.lastPw = null; state.lastNm = null;
    if (kind === 'pw') { if (o != null) $('#pw-outcome').value = o; runPairwise(); if (state.lastPw) addPwToSoF(imp); }
    else { if (o != null) $('#nm-outcome').value = o; runNMA(); if (state.lastNm && $('#nm-add')) addNmToSoF(imp); }
    await new Promise(r => setTimeout(r, 20));
  }
  renderOTabs(kind); renderOutcomeConfig(kind);
  btn.textContent = list.length ? `Listo ✓ (${list.length} desenlace${list.length > 1 ? 's' : ''} en la tabla SoF)` : 'Ningún desenlace marcado'; setTimeout(() => btn.textContent = t0, 2500);
}
$('#pw-runall').addEventListener('click', () => runAll('pw'));
$('#nm-runall').addEventListener('click', () => runAll('nm'));

// ---------------- meta-análisis por pares ----------------
$('#pw-run').addEventListener('click', runPairwise);
function pwStudies(rows, measure, dataType) {
  return rows.map(r => {
    let e;
    if (dataType === 'ratio-ci') e = r.est > 0 && r.lower > 0 ? { yi: Math.log(r.est), vi: ((Math.log(r.upper) - Math.log(r.lower)) / 3.92) ** 2 } : null;
    else e = escalc(r, measure);
    const n = isFinite(r.n1) && isFinite(r.n2) ? r.n1 + r.n2 : (isFinite(r.n) ? r.n : NaN);
    return e && isFinite(e.yi) ? { study: r.study || '?', yi: e.yi, vi: e.vi, rob: r.rob, indirect: r.indirect, n, subgroup: r.subgroup, raw: r } : { study: r.study, rob: r.rob, raw: r, dropped: e ? e.dropped || 'datos incompletos' : 'datos incompletos' };
  });
}
// ---------- subgrupos, meta-regresión, columnas de grupo y estratos por diseño ----------
const hiddenCols = new Set(['study', 'outcome', 'e1', 'n1', 'e2', 'n2', 'm1', 'sd1', 'm2', 'sd2', 'est', 'lower', 'upper', 'yi', 'sei', 'indirect', 'o_importance', 'o_dir', 'o_mid', 'o_dis', 'o_p0', 'o_int', 'o_comp']);
function dataCols() { const used = new Set(Object.entries(state.map).filter(([k]) => hiddenCols.has(k)).map(([, c]) => c)); return Object.keys(state.raw[0] || {}).filter(c => !used.has(c)); }
$('#pw-subvar').addEventListener('change', e => { state.subvar = e.target.value; });
$('#pw-regvar').addEventListener('change', e => { state.regvar = e.target.value; });
const ROB_LBL3 = ['Low risk of bias', 'Some concerns', 'High risk of bias'], ROB_KEY = { low: ROB_LBL3[0], some: ROB_LBL3[1], high: ROB_LBL3[2], na: '' };
const colOf = (s, col) => (col === '__rob__' ? ROB_KEY[robClass(s.rob)] : String(s.raw?._raw?.[col] ?? '').trim());
const colLabel = c => (c === '__rob__' ? 'Risk of bias' : c);
// columnas de riesgo de sesgo por dominio (rob_*): se muestran como A, B, C… en el forest estilo RevMan
const robDomCols = () => Object.keys(state.raw[0] || {}).filter(c => /^rob[_\s.-]\S/i.test(c));
const NRSI_RE = /non.?random|no.?aleat|observ|cohort|case.?control|caso|nrsi|nrs\b|registr|claims|real.?world|quasi|cuasi/i, RCT_RE = /rct|random|aleat|ensayo|\beca\b|trial/i;
const designClass = (v, fallback) => (!v ? fallback : NRSI_RE.test(v) ? 'NRSI' : RCT_RE.test(v) ? 'RCT' : 'NRSI');
const num = v => parseFloat(String(v).replace(',', '.'));
function subgroupAnalysis(S, col, method, test) {
  const by = new Map(); let miss = 0;
  S.forEach((s, i) => { const v = colOf(s, col); if (!v) miss++; const key = v || '(not reported)'; if (!by.has(key)) by.set(key, []); by.get(key).push(i); });
  const named = [...by.keys()].filter(k => k !== '(not reported)');
  if (named.length < 2) return { col: colLabel(col), err: 'La variable tiene menos de 2 categorías con datos.' };
  if (named.length > 10) return { col: colLabel(col), err: `La variable tiene ${named.length} categorías: use la meta-regresión o agrupe las categorías.` };
  if (col === '__rob__') named.sort((a, b) => ROB_LBL3.indexOf(a) - ROB_LBL3.indexOf(b)); else if (named.every(k => isFinite(num(k)))) named.sort((a, b) => num(a) - num(b));
  const fits = [...named, ...(by.has('(not reported)') ? ['(not reported)'] : [])].map(sg => { const ix = by.get(sg); return { sg, ix, na: sg === '(not reported)', f: rma(ix.map(i => S[i].yi), ix.map(i => S[i].vi), { method, test }) }; });
  return { col: colLabel(col), fits, miss, test: subgroupTest(fits.filter(x => !x.na).map(x => x.f)) };
}
function regAnalysis(S, col, type, method, test) {
  const vals = S.map(s => colOf(s, col)), ne = vals.filter(v => v !== '');
  const isNum = type === 'num' || (type === 'auto' && ne.length && ne.filter(v => isFinite(num(v))).length >= 0.8 * ne.length && new Set(ne).size > 2);
  const dm = designMatrix(vals, isNum ? 'num' : 'cat');
  if (!isNum && dm.levels.length < 2) return { col, err: 'El moderador tiene una sola categoría.' };
  const m = metaReg(S.map(s => s.yi), S.map(s => s.vi), dm.X, { method, test });
  if (!m) return { col, err: `Se necesitan más estudios con dato del moderador que coeficientes del modelo (hay ${vals.filter(v => v !== '').length}).` };
  return { col, dm, m, isNum, vals };
}
// columnas de intervención y control del forest plot: n/N (%) en binarios, media (DE) y N en continuos, solo N en razones ajustadas
function pwCols(dataType, S, on) {
  if (!on) return null;
  const I = 'Intervention', C = 'Control', ok = isFinite;
  const ev = (e, n) => (ok(e) && n > 0 ? `${e}/${n} (${(100 * e / n).toFixed(1)})` : '–');
  const ms = (m, sd) => (ok(m) && ok(sd) ? `${+m.toFixed(2)} (${+sd.toFixed(2)})` : '–');
  const nn = n => (ok(n) ? String(n) : '–');
  const tot = (ss, k) => ss.every(s => ok(s.raw[k])) ? ss.reduce((a, s) => a + s.raw[k], 0) : NaN;
  if (dataType === 'binary') return { cols: [{ group: I, head: 'n/N (%)', w: 122 }, { group: C, head: 'n/N (%)', w: 122 }], cells: s => [ev(s.raw.e1, s.raw.n1), ev(s.raw.e2, s.raw.n2)], total: ss => [ev(tot(ss, 'e1'), tot(ss, 'n1')), ev(tot(ss, 'e2'), tot(ss, 'n2'))] };
  if (dataType === 'continuous') return { cols: [{ group: I, head: 'Mean (SD)', w: 100 }, { group: I, head: 'N', w: 48 }, { group: C, head: 'Mean (SD)', w: 100 }, { group: C, head: 'N', w: 48 }], cells: s => [ms(s.raw.m1, s.raw.sd1), nn(s.raw.n1), ms(s.raw.m2, s.raw.sd2), nn(s.raw.n2)], total: ss => ['', nn(tot(ss, 'n1')), '', nn(tot(ss, 'n2'))] };
  if (dataType === 'ratio-ci' && S.some(s => ok(s.raw.n1) || ok(s.raw.n2))) return { cols: [{ group: I, head: 'N', w: 64 }, { group: C, head: 'N', w: 64 }], cells: s => [nn(s.raw.n1), nn(s.raw.n2)], total: ss => [nn(tot(ss, 'n1')), nn(tot(ss, 'n2'))] };
  return null;
}
const hetShort = f => (f.k > 1 ? `I² = ${isFinite(f.I2) ? f.I2.toFixed(0) : '–'}%, τ² = ${f.tau2.toFixed(3)}` : '');
const methLabel = fit => (fit.method === 'EE' ? 'Common effect' : 'Random effects, ' + fit.method) + (fit.test !== 'z' ? ', ' + (fit.test === 'adhoc' ? 'HKSJ' : 'Knapp-Hartung') : '');
const interTxt = (col, t) => (t ? `Test for subgroup differences (${col}): Q = ${t.Q.toFixed(2)}, df = ${t.df}, p = ${fp(t.p)}` : '');
function designStrata(S, cfg, method, test) {
  if (!state.map.design) return null;
  const fb = cfg.design === 'RCT' ? 'RCT' : 'NRSI', cls = S.map(s => designClass(colOf(s, state.map.design), fb));
  const mk = kind => {
    const ix = S.map((_, i) => i).filter(i => cls[i] === kind); if (!ix.length) return null;
    const ss = ix.map(i => S[i]), f = rma(ss.map(x => x.yi), ss.map(x => x.vi), { method, test });
    const c = { ...cfg, fit: f, studies: ss, design: kind === 'RCT' ? 'RCT' : cfg.design === 'NRSI_TTE' ? 'NRSI_TTE' : 'NRSI', eggerRes: ss.length >= 10 ? egger(ss.map(x => x.yi), ss.map(x => x.vi)) : null };
    return { kind, ix, ss, f, cfg: c, g: gradePairwise(c), ov: {} };
  };
  const R = mk('RCT'), N = mk('NRSI');
  return R && N ? { list: [R, N], test: subgroupTest([R.f, N.f]) } : null;
}

// bajo vs alto riesgo de sesgo (Core GRADE 4) con la regla de «algunas preocupaciones» elegida
function robCompare(S, cfg, method, test) {
  const isHigh = r => /high|serious|critical/i.test(r || '') || (cfg.someConcernsAsHigh && /some|unclear|moderate/i.test(r || ''));
  const lowS = S.filter(s => !isHigh(s.rob)), highS = S.filter(s => isHigh(s.rob));
  if (!lowS.length || !highS.length) return null;
  const fl = rma(lowS.map(s => s.yi), lowS.map(s => s.vi), { method, test }), fh = rma(highS.map(s => s.yi), highS.map(s => s.vi), { method, test });
  return { fl, fh, test: subgroupTest([fl, fh]) };
}
function runPairwise() {
  const t = detectType(state.map), measure = $('#pw-measure').value;
  const isRatio = ['RR', 'OR', 'HR', 'ROM'].includes(measure);
  const all = pwStudies(state.rows, measure, t.data);
  const S = all.filter(s => !s.dropped), dropped = all.filter(s => s.dropped);
  if (!S.length) { $('#pw-results').innerHTML = '<div class="err">No hay estudios analizables.</div>'; return; }
  const method = $('#pw-method').value, test = $('#pw-test').value;
  const fit = rma(S.map(s => s.yi), S.map(s => s.vi), { method, test });
  const eg = S.length >= 10 ? egger(S.map(s => s.yi), S.map(s => s.vi)) : null;
  const tr = x => (isRatio ? Math.exp(x) : x);
  const unit = +$('#pw-unit').value;
  const cfg = {
    fit, studies: S, measure: measure === 'ROM' ? 'MD' : measure, design: $('#pw-design').value, threshold: $('#pw-threshold').value,
    mid: +$('#pw-mid').value || 0, p0: +$('#pw-p0').value, higherBetter: $('#pw-dir').value === 'higher',
    robDominance: +$('#pw-robdom').value, someConcernsAsHigh: $('#pw-someconc').checked, oisRRR: +$('#pw-oisrrr').value,
    power: +$('#pw-power').value, sdForOIS: +$('#pw-sd').value || NaN, eggerRes: eg, industrySmall: $('#pw-industry').checked,
    surrogate: $('#pw-surrogate').checked, doseResponse: $('#pw-dose').checked, unit,
    scheme: +$('#pw-scheme').value, usePI: $('#pw-piinc').checked,
  };
  const binM = ['RR', 'OR', 'HR', 'RD'].includes(measure);
  cfg.moderate = defT(+$('#pw-t2').value, cfg.mid, 3.21 / 1.35, binM); cfg.large = defT(+$('#pw-t3').value, cfg.mid, 6.25 / 1.35, binM);
  const binaryAbs = ['RR', 'OR', 'HR', 'RD'].includes(measure);
  if (binaryAbs && !(cfg.p0 > 0 && cfg.p0 < 1)) { $('#pw-results').innerHTML = '<div class="err">Indique el riesgo basal (proporción entre 0 y 1) para calcular el efecto absoluto.</div>'; return; }
  const g = gradePairwise(cfg);
  // análisis por riesgo de sesgo (Core GRADE 4)
  const robCmp = robCompare(S, cfg, method, test);
  // subgrupos (cualquier columna) y meta-regresión
  const subvar = $('#pw-subvar').value, regvar = $('#pw-regvar').value;
  const subRes = subvar ? subgroupAnalysis(S, subvar, method, test) : null;
  const regRes = regvar ? regAnalysis(S, regvar, $('#pw-regtype').value, method, test) : null;
  const strata = $('#pw-strata').checked ? designStrata(S, cfg, method, test) : null;
  const colSpec = pwCols(t.data, S, $('#pw-cols').checked);
  state.lastPw = { dropped, cfg, g, fit, S, measure, isRatio, eg, outcome: $('#pw-outcome').value, int: $('#pw-int').value, comp: $('#pw-comp').value, method, test, dataType: t.data, overrides: {}, regRes, strata, colSpec, subvar, regvar };
  state.lastPw.args = [dropped, robCmp, subRes]; state.lastPw.subRes = subRes;
  state.cache.pw[state.lastPw.outcome] = state.lastPw;
  renderPairwise(dropped, robCmp, subRes, tr);
  renderOTabs('pw');
}

function domainRow(key, label, lvl, why, max = 3, pre = '') {
  return `<tr><th>${label}</th><td><select data-${pre}dom="${key}">${[0, 1, 2, 3].slice(0, max + 1).map(v => `<option value="${v}" ${v === lvl ? 'selected' : ''}>${v === 0 ? 'No serio' : v === 1 ? 'Serio (−1)' : v === 2 ? 'Muy serio (−2)' : 'Extremadamente serio (−3)'}</option>`).join('')}</select></td><td><textarea data-${pre}why="${key}">${esc(why)}</textarea></td></tr>`;
}

// ---------- filas del forest y tarjetas de subgrupos / meta-regresión / evidencia por diseño ----------
const fRow = (P, tr, s, w) => ({ label: s.study, est: tr(s.yi), lo: tr(s.yi - 1.96 * Math.sqrt(s.vi)), hi: tr(s.yi + 1.96 * Math.sqrt(s.vi)), w, rob: s.rob, cells: P.colSpec ? P.colSpec.cells(s) : null });
const fPool = (P, tr, f, label, ss, het) => ({ est: tr(f.est), lo: tr(f.ci[0]), hi: tr(f.ci[1]), label, het, cells: P.colSpec ? P.colSpec.total(ss) : null });
// ---------- forest: estilo clásico o RevMan (selector de figuras) ----------
const MEAS_RM = { RR: 'Risk Ratio', OR: 'Odds Ratio', RD: 'Risk Difference', HR: 'Hazard Ratio', MD: 'Mean Difference', SMD: 'Std. Mean Difference', ROM: 'Ratio of Means' };
const pRM = p => (!isFinite(p) ? '= –' : p < 0.00001 ? '< 0.00001' : p < 0.001 ? '= ' + p.toFixed(4) : p < 0.1 ? '= ' + p.toFixed(3) : '= ' + p.toFixed(2));
// columnas de datos de RevMan: eventos y total (binario), media, DE y total (continuo) o log[estimador] y EE (razones ajustadas)
function rmCols(P) {
  const on = $('#pw-cols').checked, ok = isFinite, I = P.int || 'Intervention', C = P.comp || 'Control', S = P.S, n = v => (ok(v) ? String(v) : '');
  const sum = (ss, k) => (ss.length && ss.every(x => ok(x.raw[k])) ? ss.reduce((a, x) => a + x.raw[k], 0) : NaN), d2 = v => (ok(v) ? v.toFixed(2) : '');
  if (P.dataType === 'binary' && on) return { cols: [{ group: I, head: 'Events' }, { group: I, head: 'Total' }, { group: C, head: 'Events' }, { group: C, head: 'Total' }], cells: s => [n(s.raw.e1), n(s.raw.n1), n(s.raw.e2), n(s.raw.n2)], total: ss => [n(sum(ss, 'e1')), n(sum(ss, 'n1')), n(sum(ss, 'e2')), n(sum(ss, 'n2'))] };
  if (P.dataType === 'continuous' && on) return { cols: [{ group: I, head: 'Mean' }, { group: I, head: 'SD' }, { group: I, head: 'Total' }, { group: C, head: 'Mean' }, { group: C, head: 'SD' }, { group: C, head: 'Total' }], cells: s => [d2(s.raw.m1), d2(s.raw.sd1), n(s.raw.n1), d2(s.raw.m2), d2(s.raw.sd2), n(s.raw.n2)], total: ss => ['', '', n(sum(ss, 'n1')), '', '', n(sum(ss, 'n2'))] };
  const hasN = on && S.some(x => ok(x.raw.n1) || ok(x.raw.n2)), base = [{ group: '', head: `log[${P.measure}]` }, { group: '', head: 'SE' }];
  return { cols: hasN ? [...base, { group: I, head: 'Total' }, { group: C, head: 'Total' }] : base, cells: s => [ok(s.yi) ? s.yi.toFixed(3) : '', ok(s.vi) ? Math.sqrt(s.vi).toFixed(3) : '', ...(hasN ? [n(s.raw.n1), n(s.raw.n2)] : [])], total: ss => ['', '', ...(hasN ? [n(sum(ss, 'n1')), n(sum(ss, 'n2'))] : [])] };
}
const hetRM = f => (f.k > 1 ? `Heterogeneity: Tau² = ${f.tau2.toFixed(2)}; Chi² = ${f.QE.toFixed(2)}, df = ${f.k - 1} (P ${pRM(f.QEp)}); I² = ${isFinite(f.I2) ? f.I2.toFixed(0) : '0'}%` : 'Heterogeneity: not applicable');
const testRM = f => (f.k > 1 && f.test !== 'z' ? `Test for overall effect: t = ${Math.abs(f.z).toFixed(2)}, df = ${f.k - 1} (P ${pRM(f.pval)})` : `Test for overall effect: Z = ${Math.abs(f.z).toFixed(2)} (P ${pRM(f.pval)})`);
// spec: {groups:[{label, ss, f}] | null, overall: bool, interaction: {col, test} | null, weightHead}
function pwForest(P, tr, spec, title) {
  const { fit, S, cfg, isRatio } = P, fav = cfg.higherBetter ? [`Favours ${P.comp}`, `Favours ${P.int}`] : [`Favours ${P.int}`, `Favours ${P.comp}`], G = spec.groups, DR = P.dropped || [];
  // estudios sin estimador (p. ej., doble cero) se muestran como «Not estimable»; en los análisis por grupos van a su grupo
  const dropFor = x => (x ? x.drop || [] : DR);
  if (figSettings().forest !== 'classic') {
    const cs = rmCols(P), rd = robDomCols(), blank = d => ({ ...d, yi: NaN, vi: NaN });
    const mk = (ss, f, dr) => [...ss.map((s, j) => ({ label: s.study, cells: cs.cells(s), w: `${(f.weights[j] * 100).toFixed(1)}%`, wf: f.weights[j], est: tr(s.yi), lo: tr(s.yi - 1.96 * Math.sqrt(s.vi)), hi: tr(s.yi + 1.96 * Math.sqrt(s.vi)), rob: s.rob, robs: rd.map(c => String(s.raw?._raw?.[c] ?? '').trim()) })),
      ...dr.map(d => ({ label: d.study, cells: cs.cells(blank(d)), w: '', wf: 0, est: NaN, lo: NaN, hi: NaN, rob: d.rob, robs: rd.map(c => String(d.raw?._raw?.[c] ?? '').trim()) }))];
    const pool = (f, ss, dr, label) => ({ label, cells: cs.total([...ss, ...dr]), w: '100.0%', est: tr(f.est), lo: tr(f.ci[0]), hi: tr(f.ci[1]) });
    const groups = G ? G.map(x => ({ label: x.label, rows: mk(x.ss, x.f, dropFor(x)), sub: pool(x.f, x.ss, dropFor(x), 'Subtotal (95% CI)'), lines: [hetRM(x.f), testRM(x.f)] })) : [{ label: '', rows: mk(S, fit, DR) }];
    const ov = spec.overall ? { ...pool(fit, S, DR, 'Total (95% CI)'), lines: [hetRM(fit), testRM(fit)] } : null, t = spec.interaction?.test;
    const robDoms = rd.map((c, j) => ({ head: String.fromCharCode(65 + j), name: c.replace(/^rob[_\s.-]+/i, '').replace(/[_.-]+/g, ' ').replace(/^./, m => m.toUpperCase()) }));
    return forestRM({ title, groups, overall: ov, cols: cs.cols, log: isRatio, measure: MEAS_RM[P.measure] || P.measure, model: `IV, ${fit.method === 'EE' ? 'Fixed' : 'Random'}, 95% CI`, leftLabel: fav[0], rightLabel: fav[1], fs: 12, rob: S.some(s => s.rob), robDoms,
      interaction: t ? `Test for subgroup differences: Chi² = ${t.Q.toFixed(2)}, df = ${t.df} (P ${pRM(t.p)}), I² = ${t.Q > t.df ? (100 * (t.Q - t.df) / t.Q).toFixed(1) : '0.0'}%` : '' });
  }
  const dRow = d => fRow(P, tr, { ...d, yi: NaN, vi: NaN }, null);
  const grp = G ? G.map(x => ({ label: x.label, rows: [...x.ss.map((s, j) => fRow(P, tr, s, x.f.weights[j])), ...dropFor(x).map(dRow)], pooled: fPool(P, tr, x.f, `Subtotal (k = ${x.f.k})`, x.ss, hetShort(x.f)) })) : null;
  const hetTxt = fit.k > 1 ? `Heterogeneity: τ² = ${fit.tau2.toFixed(3)}; I² = ${fit.I2.toFixed(0)}%; Q = ${fit.QE.toFixed(2)} (p = ${fp(fit.QEp)})` : '', short = !!(grp || P.colSpec);
  const pooledAll = spec.overall ? { ...fPool(P, tr, fit, short ? 'Overall' : `Pooled (${methLabel(fit).replace('Random effects, ', 'random effects, ').replace('Common effect', 'common effect')})`, S, short ? `${methLabel(fit)}. ${hetTxt}` : hetTxt), pi: fit.k >= 3 ? [tr(fit.pi[0]), tr(fit.pi[1])] : null } : null;
  return forestSVG({ rows: G ? [] : [...S.map((s, i) => fRow(P, tr, s, fit.weights[i])), ...DR.map(dRow)], groups: grp, cols: P.colSpec?.cols || [], pooled: pooledAll, interaction: spec.interaction ? interTxt(spec.interaction.col, spec.interaction.test) : '', weightHead: spec.weightHead || (grp ? 'Weight (in subgroup)' : 'Weight'), log: isRatio, measure: P.measure, leftLabel: fav[0], rightLabel: fav[1], title });
}
const nTot = ss => { const v = ss.map(s => s.n).filter(isFinite); return v.length ? v.reduce((a, b) => a + b, 0) : '–'; };
function subRegHTML(P, tr, subRes) {
  const { regRes } = P, lbl = P.measure, ci = f => `${f2(tr(f.est))} (${f2(tr(f.ci[0]))} a ${f2(tr(f.ci[1]))})`;
  let h = '';
  if (subRes) {
    if (subRes.err) h += `<div class="warn">Subgrupos (${esc(subRes.col)}): ${esc(subRes.err)}</div>`;
    else {
      const t = subRes.test;
      h += `<h3>Análisis por subgrupos — ${esc(subRes.col)}</h3><table class="data"><thead><tr><th>Subgrupo</th><th>Estudios</th><th>Participantes</th><th>${esc(lbl)} (IC 95 %)</th><th>I²</th><th>τ²</th></tr></thead><tbody>
      ${subRes.fits.map(x => `<tr><td>${esc(x.na ? '(sin dato)' : x.sg)}</td><td>${x.f.k}</td><td>${nTot(x.ix.map(i => P.S[i]))}</td><td>${ci(x.f)}</td><td>${isFinite(x.f.I2) ? x.f.I2.toFixed(0) + '%' : '–'}</td><td>${x.f.tau2.toFixed(3)}</td></tr>`).join('')}</tbody></table>
      <p><b>Prueba de diferencia entre subgrupos (p de interacción): ${t ? `p = ${fp(t.p)}` : '—'}</b>${t ? ` (Q entre grupos = ${t.Q.toFixed(2)}, gl = ${t.df})` : ''}. Cada subgrupo usa su propio τ²; con pocos estudios por subgrupo la prueba tiene poca potencia. ${subRes.miss ? `${subRes.miss} estudio(s) sin dato de «${esc(subRes.col)}» se muestran aparte y no entran en la prueba. ` : ''}Para presentar estimaciones separadas, juzgue la credibilidad del subgrupo con ICEMAN (hipótesis a priori, comparación dentro del estudio, diferencia coherente en magnitud y dirección).</p>`;
    }
  }
  if (regRes) {
    if (regRes.err) h += `<div class="warn">Meta-regresión (${esc(regRes.col)}): ${esc(regRes.err)}</div>`;
    else {
      const { m, dm, isNum } = regRes, col = regRes.col, crit = (m.ci[0][1] - m.beta[0]) / m.se[0], ratio = P.isRatio;
      const terms = isNum ? [`Intercepto (efecto en el valor medio, ${+dm.mean.toFixed(2)})`, `Pendiente por cada +1 de ${col}${ratio ? ' (cociente de ' + lbl + ')' : ''}`] : [`Referencia: ${dm.ref}`, ...dm.terms.slice(1).map(x => x + (ratio ? ` (cociente de ${lbl})` : ''))];
      const F = m.test !== 'z';
      h += `<h3>Meta-regresión — moderador «${esc(col)}» (${isNum ? 'numérico' : 'categórico'})</h3>
      <table class="data"><thead><tr><th>Término</th><th>${ratio ? 'exp(β)' : 'β'} (IC 95 %)</th><th>p</th></tr></thead><tbody>${terms.map((t, i) => `<tr><td>${esc(t)}</td><td>${f2(tr(m.beta[i]))} (${f2(tr(m.ci[i][0]))} a ${f2(tr(m.ci[i][1]))})</td><td>${fp(m.pval[i])}</td></tr>`).join('')}</tbody></table>
      <p><b>Prueba de moderadores: ${F ? 'F' : 'QM'} = ${m.QM.toFixed(2)}, gl = ${m.m}${F ? ', ' + m.df : ''}, p = ${fp(m.QMp)}</b> · heterogeneidad residual: QE = ${m.QE.toFixed(2)} (gl = ${m.df}, p = ${fp(m.QEp)}), τ² = ${m.tau2.toFixed(3)} (sin moderador ${m.tau2_0.toFixed(3)}), I² residual = ${isFinite(m.I2) ? m.I2.toFixed(0) : '–'}% · R² = ${m.R2.toFixed(0)}% de la heterogeneidad explicada.</p>
      <p class="muted">${m.k < 10 ? `<b>Solo ${m.k} estudios:</b> la meta-regresión tiene poca potencia y alto riesgo de falsos positivos (se recomienda ≥10 estudios por moderador); trátela como exploratoria. ` : ''}Es una asociación entre estudios (no causal) y puede estar confundida por otras características de los estudios.</p>`;
      if (isNum) {
        const wt = m.idx.map(j => 1 / (P.S[j].vi + m.tau2)), sw = wt.reduce((a, b) => a + b, 0);
        h += bubbleSVG({ pts: m.idx.map((j, q) => ({ x: num(regRes.vals[j]), y: P.S[j].yi, w: wt[q] / sw, label: `${P.S[j].study}: ${f2(tr(P.S[j].yi))}` })), log: ratio, xlabel: col, ylabel: ratio ? `${lbl} (log scale)` : lbl, title: `Meta-regression: ${lbl} vs ${col}`,
          pred: x => { const xc = x - dm.mean, est = m.beta[0] + m.beta[1] * xc, v = m.vb[0][0] + 2 * m.vb[0][1] * xc + m.vb[1][1] * xc * xc, d = crit * Math.sqrt(Math.max(v, 0)); return { est, lo: est - d, hi: est + d }; } });
      }
    }
  }
  return h ? `<div class="card"><h2>Subgrupos y meta-regresión</h2>${h}</div>` : '';
}

// Evidencia de ECA y estudios observacionales por separado: dominios GRADE de cada cuerpo de evidencia (solo meta-análisis por pares)
const DESIGN_EN = { RCT: 'Randomised trials', NRSI: 'Observational (non-randomised) studies' };
const DESIGN_NAME = { RCT: 'Ensayos aleatorizados (ECA)', NRSI: 'Estudios observacionales (no aleatorizados)' };
const stratumP = st => ({ ...state.lastPw, isStratum: true, cfg: st.cfg, g: st.g, fit: st.f, S: st.ss, eg: st.cfg.eggerRes });
function stratumOv(i) {
  const o = {}, root = document.querySelector(`.stratum[data-st="${i}"]`);
  root.querySelectorAll('[data-sdom]').forEach(x => o[x.dataset.sdom] = +x.value);
  root.querySelectorAll('[data-swhy]').forEach(t => o[t.dataset.swhy + '_why'] = t.value.trim());
  return o;
}
function strataHTML(P, tr) {
  const ST = P.strata; if (!ST) return '';
  const lbl = P.measure, fav = P.cfg.higherBetter ? [`Favours ${P.comp}`, `Favours ${P.int}`] : [`Favours ${P.int}`, `Favours ${P.comp}`];
  const svg = pwForest(P, tr, { groups: ST.list.map(st => ({ label: DESIGN_EN[st.kind], ss: st.ss, f: st.f, drop: (P.dropped || []).filter(d => designClass(colOf(d, state.map.design), P.cfg.design === 'RCT' ? 'RCT' : 'NRSI') === st.kind) })), overall: false, interaction: { col: 'study design', test: ST.test }, weightHead: 'Weight (in design)' }, `${P.outcome} — by study design`);
  const body = ST.list.map((st, i) => { const g = st.g, un = g.ab.binary ? ` por ${P.cfg.unit}` : '';
    return `<details class="stratum" data-st="${i}" open><summary><b>${DESIGN_NAME[st.kind]}</b> <span class="muted">· ${st.f.k} estudio(s) · punto de partida: ${LEVELS[g.start]}</span></summary>
    <table class="grade-table"><thead><tr><th style="width:160px">Dominio</th><th style="width:190px">Juicio</th><th>Justificación (aparece como nota al pie)</th></tr></thead><tbody>
    ${domainRow('rob', 'Riesgo de sesgo', g.domains.rob.level, g.domains.rob.why, 3, 's')}${domainRow('inc', 'Inconsistencia', g.domains.inc.level, g.domains.inc.why, 3, 's')}
    ${domainRow('ind', 'Evidencia indirecta', g.domains.ind.level, g.domains.ind.why, 3, 's')}${domainRow('imp', 'Imprecisión', g.domains.imp.level, g.domains.imp.why, 3, 's')}
    ${domainRow('pub', 'Sesgo de publicación', g.domains.pub.level, g.domains.pub.why, 2, 's')}
    ${g.start === 2 ? `<tr><th>Subir certeza</th><td><select data-sdom="up">${[0, 1, 2].map(v => `<option value="${v}" ${v === g.up.level ? 'selected' : ''}>${v ? '+' + v : 'No'}</option>`).join('')}</select></td><td><textarea data-swhy="up">${esc(g.up.why)}</textarea></td></tr>` : ''}
    </tbody></table><div class="sfinal"></div></details>`; }).join('');
  return `<div class="card" id="pw-strata-card"><h2>Evidencia por diseño: ECA vs estudios observacionales (GRADE)</h2>
  <p class="muted">Cada cuerpo de evidencia se agrupa y se califica por separado, con sus propios dominios GRADE (como un análisis por subgrupos de diseño): los ECA parten de certeza alta y los estudios no aleatorizados de baja (alta si se evalúan con ROBINS-I y emulan un ensayo). Cuando hay ECA de certeza alta o moderada, los observacionales rara vez la modifican; si la de los ECA es baja o muy baja, la evidencia observacional puede ser más informativa. Combínelos solo con una justificación explícita. No aplica a las NMA.</p>
  ${svg}
  <p><b>Prueba de diferencia entre diseños (p de interacción): ${ST.test ? 'p = ' + fp(ST.test.p) : '—'}</b>${ST.test ? ` (Q = ${ST.test.Q.toFixed(2)}, gl = ${ST.test.df})` : ''}. Una diferencia importante no implica que un diseño sea «el correcto»: explore confusión residual, población, intervención y riesgo de sesgo de cada cuerpo de evidencia.</p>
  <div id="st-sum"></div>${body}
  <div class="row end"><button class="primary" id="st-add">Añadir ECA y observacionales a la tabla SoF</button></div></div>`;
}
function stratumSummaryHTML(P) {
  const rows = P.strata.list.map(st => { const s = pwSummary(stratumP(st), st.ov), fill = fillFor(s.cat, s.c);
    return `<tr><td>${DESIGN_NAME[st.kind]}</td><td>${esc(s.participants)}</td><td>${esc(s.relative)}</td><td>${esc(s.absolute)}</td><td><span class="badge" style="background:#${fill}">${SYM[s.c]} ${LEVELS[s.c]}</span></td></tr>`; }).join('');
  return `<table class="data"><thead><tr><th>Cuerpo de evidencia</th><th>Participantes (estudios)</th><th>Efecto relativo</th><th>Efecto absoluto</th><th>Certeza</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function updateStratum(i) {
  const P = state.lastPw, st = P.strata.list[i]; st.ov = stratumOv(i);
  const s = pwSummary(stratumP(st), st.ov), fill = fillFor(s.cat, s.c), plain = plainStatement(s.cat, s.c, s.intervention, lcOut(s.outcome), P.cfg.threshold, s.plainRaw.d);
  document.querySelector(`.stratum[data-st="${i}"] .sfinal`).innerHTML = `<div class="row gap wrap" style="margin-top:10px"><span class="badge" style="background:#${fill}">${SYM[s.c]} ${LEVELS[s.c]}</span><span>${legendText(s.cat, s.c, s.comparator)}</span></div><p><b>Frase en lenguaje claro:</b> ${esc(plain)}</p><div class="notes">${s.notes.map(n => `<p>• ${esc(n)}</p>`).join('')}</div>`;
  $('#st-sum').innerHTML = stratumSummaryHTML(P);
  const iv = document.getElementById(`pw-impviz-st${i}`); if (iv) { iv.innerHTML = pwImpViz(stratumP(st), s); autoFig(iv, `${s.outcome}_st${i}`); }
}
function bindStrata() {
  const P = state.lastPw; if (!P?.strata) return;
  P.strata.list.forEach((st, i) => {
    const root = document.querySelector(`.stratum[data-st="${i}"]`);
    Object.entries(st.ov).forEach(([k, v]) => { const el = k.endsWith('_why') ? root.querySelector(`[data-swhy="${k.slice(0, -4)}"]`) : root.querySelector(`[data-sdom="${k}"]`); if (el) el.value = v; });
    root.querySelectorAll('[data-sdom],[data-swhy]').forEach(el => el.addEventListener('input', () => updateStratum(i)));
  });
  P.strata.list.forEach((_, i) => updateStratum(i));
  $('#st-add').addEventListener('click', addStrataToSoF);
}
function addStrataToSoF(importance) {
  const P = state.lastPw;
  state.sof = state.sof.filter(x => !(x.type === 'pairwise' && x.outcome === P.outcome && !x.stratum && x.intervention === P.int && x.comparator === P.comp)); // la fila combinada se sustituye por las dos filas por diseño
  P.strata.list.forEach(st => {
    const s = pwSummary(stratumP(st), st.ov);
    s.plain = plainStatement(s.cat, s.c, s.intervention, lcOut(s.outcome), P.cfg.threshold, s.plainRaw.d);
    s.importance = (typeof importance === 'string' && importance) || state.rows[0]?.o_importance || P.importance || '';
    s.baseOutcome = P.outcome; s.outcome = `${P.outcome} (${st.kind === 'RCT' ? 'RCTs' : 'observational'})`; s.stratum = st.kind;
    pushSoF(s);
  });
  P.addedSoF = true; save('mg-sof', state.sof);
  const b = $('#st-add'); if (b) { b.textContent = 'Añadido ✓'; setTimeout(() => b.textContent = 'Añadir ECA y observacionales a la tabla SoF', 1500); }
}

function renderPairwise(dropped, robCmp, subRes, tr) {
  const P = state.lastPw, { fit, g, S, measure, isRatio, cfg } = P;
  const lbl = isRatio ? measure : measure;
  const fav = cfg.higherBetter ? [`Favours ${P.comp}`, `Favours ${P.int}`] : [`Favours ${P.int}`, `Favours ${P.comp}`];
  const svg = pwForest(P, tr, { groups: subRes && subRes.fits ? subRes.fits.map(x => ({ label: x.na ? 'Not reported' : x.sg, ss: x.ix.map(i => S[i]), f: x.f, drop: (P.dropped || []).filter(d => (colOf(d, P.subvar) || '(not reported)') === (x.na ? '(not reported)' : x.sg)) })) : null, overall: true, interaction: subRes && subRes.test ? { col: subRes.col, test: subRes.test } : null }, P.outcome);
  const A = g.abs, ab = g.ab, un = ab.binary ? ` por ${cfg.unit}` : '';
  let html = `<div class="card"><h2>Resultados — ${esc(P.outcome)}</h2>`;
  if (dropped.length) html += `<div class="warn">Excluidos del cálculo: ${dropped.map(d => esc(d.study) + ' (' + esc(d.dropped) + ')').join('; ')}</div>`;
  html += `<div class="kpis"><div class="kpi"><span>Estudios / participantes</span><b>${fit.k} / ${g.domains.imp.ntot || '–'}</b></div>
  <div class="kpi"><span>${lbl} (IC 95 %)</span><b>${f2(tr(fit.est))} (${f2(tr(fit.ci[0]))} a ${f2(tr(fit.ci[1]))})</b></div>
  <div class="kpi"><span>Efecto absoluto</span><b>${f1(A.d)} (${f1(A.lo)} a ${f1(A.hi)})${un}</b></div>
  <div class="kpi"><span>Heterogeneidad</span><b>I² ${isFinite(fit.I2) ? fit.I2.toFixed(0) + '%' : '–'} · τ² ${fit.tau2.toFixed(3)}</b></div>
  ${fit.k >= 3 ? `<div class="kpi"><span>Intervalo de predicción 95 %</span><b>${f2(tr(fit.pi[0]))} a ${f2(tr(fit.pi[1]))}</b></div>` : ''}
  ${P.eg ? `<div class="kpi"><span>Egger (≥10 estudios)</span><b>p = ${fp(P.eg.p)}</b></div>` : ''}</div>`;
  html += svg;
  if (robCmp) html += `<p class="muted"><b>Bajo vs alto riesgo de sesgo:</b> bajo ${f2(tr(robCmp.fl.est))} (${f2(tr(robCmp.fl.ci[0]))}–${f2(tr(robCmp.fl.ci[1]))}, k=${robCmp.fl.k}); alto ${f2(tr(robCmp.fh.est))} (${f2(tr(robCmp.fh.ci[0]))}–${f2(tr(robCmp.fh.ci[1]))}, k=${robCmp.fh.k}); p de interacción = ${fp(robCmp.test?.p)}. Si difieren de forma importante y hay evidencia apreciable de bajo riesgo, use solo los estudios de bajo riesgo y no baje la certeza (Core GRADE 4).</p>`;
  html += `</div>`;
  html += subRegHTML(P, tr, subRes);
  html += vizCardHTML(P, robCmp);
  // GRADE
  html += `<div class="card"><h2>Certeza de la evidencia (Core GRADE)</h2>
  <p class="muted">Umbral: <b>${cfg.threshold === 'MID' ? 'MID ±' + cfg.mid + un : 'valor nulo'}</b> · punto de partida: <b>${LEVELS[g.start]}</b>. Las calificaciones son sugerencias: modifique el nivel y la justificación si su juicio difiere.</p>
  ${P.strata ? '<p class="close">Hay ECA y estudios observacionales: se califican por separado en la sección <a href="#pw-strata-card">Evidencia por diseño</a>; esta calificación conjunta mezcla ambos diseños.</p>' : ''}
  <table class="grade-table"><thead><tr><th style="width:160px">Dominio</th><th style="width:190px">Juicio</th><th>Justificación (aparece como nota al pie)</th></tr></thead><tbody>
  ${domainRow('rob', 'Riesgo de sesgo', g.domains.rob.level, g.domains.rob.why)}
  ${domainRow('inc', 'Inconsistencia', g.domains.inc.level, g.domains.inc.why)}
  ${domainRow('ind', 'Evidencia indirecta', g.domains.ind.level, g.domains.ind.why)}
  ${domainRow('imp', 'Imprecisión', g.domains.imp.level, g.domains.imp.why)}
  ${domainRow('pub', 'Sesgo de publicación', g.domains.pub.level, g.domains.pub.why, 2)}
  ${g.start === 2 ? `<tr><th>Subir certeza</th><td><select data-dom="up">${[0, 1, 2].map(v => `<option value="${v}" ${v === g.up.level ? 'selected' : ''}>${v ? '+' + v : 'No'}</option>`).join('')}</select></td><td><textarea data-why="up">${esc(g.up.why)}</textarea></td></tr>` : ''}
  </tbody></table>
  ${g.close.length ? `<p class="close">Decisión cercana al límite en: ${g.close.map(d => DOMAIN_LABEL[d]).join(', ')}. Considere la certeza como un continuo y explíquelo.</p>` : ''}
  <div id="pw-final"></div>
  <div class="row end"><button class="primary" id="pw-add">Añadir a la tabla SoF</button></div></div>`;
  html += strataHTML(P, tr);
  $('#pw-results').innerHTML = html;
  bindVizTabs($('#pw-results')); bindCtxTabs($('#pw-results')); fillCtxImp(P); fillCtxImp(P);
  autoFig($('#pw-results'), P.outcome); figNote();
  $('#pw-results').querySelectorAll('[data-dom],[data-why]').forEach(el => el.addEventListener('input', updatePwFinal));
  $('#pw-add').addEventListener('click', addPwToSoF);
  if (P.ov) document.querySelectorAll('#pw-results [data-dom],#pw-results [data-why]').forEach(el => { const k = el.dataset.dom ?? el.dataset.why + '_why'; if (P.ov[k] != null) el.value = P.ov[k]; });
  updatePwFinal();
  bindStrata();
}
// ---------- figuras con descarga en formato de revista ----------
function autoFig(root, prefix) {
  root.querySelectorAll('svg.plot').forEach(svg => {
    if (svg.closest('figure.fig')) return;
    const f = document.createElement('figure'); f.className = 'fig';
    f.dataset.name = `${prefix}_${svg.getAttribute('aria-label') || 'figure'}`;
    svg.replaceWith(f); f.appendChild(svg);
    const vbw = +(svg.getAttribute('viewBox') || '').split(/\s+/)[2];
    if (vbw) svg.style.maxWidth = `${Math.round(vbw * 1.12)}px`;
    f.insertAdjacentHTML('beforeend', '<figcaption class="figbar"><span>Download (journal format):</span><button type="button" data-fig="svg">SVG</button><button type="button" data-fig="png">PNG</button><button type="button" data-fig="tiff">TIFF</button></figcaption>');
  });
  bindFigs(root.querySelectorAll ? root : document);
}
function figNote() {
  const st = figSettings(), svg = document.querySelector('#pw-results svg.plot, #nm-results svg.plot'), w = svg ? +svg.getAttribute('viewBox').split(/\s+/)[2] : 900, fs = +svg?.dataset.fs || 12;
  $('#fig-pt').disabled = !st.auto; $('#fig-mm').disabled = st.auto || $('#fig-width').value !== 'custom';
  $('#fig-note').textContent = st.auto ? `Ancho automático: con letra final de ${st.pt} pt, la figura mostrada mide ≈ ${Math.round(st.pt * 0.3528 * w / fs)} mm de ancho (los forest anchos pueden superar una página: reduzca la letra o las columnas).`
    : `Ancho ${st.mm} mm a ${st.dpi} dpi = ${Math.round(st.mm / 25.4 * st.dpi)} px. Letra del gráfico mostrado ≈ ${(fs * st.mm / w / 0.3528).toFixed(1)} pt${fs * st.mm / w / 0.3528 < 6 ? ' — demasiado pequeña: use ancho automático, un ancho mayor o menos columnas' : ''}.`;
}
['#fig-width', '#fig-mm', '#fig-dpi', '#fig-font', '#fig-pt'].forEach(id => $(id).addEventListener('change', figNote));
$('#fig-forest').addEventListener('change', () => { const P = state.lastPw; if (P && !$('#pw').hidden) renderPairwise(...P.args, x => (P.isRatio ? Math.exp(x) : x)); figNote(); });
figNote();
// ---------- Visualización de dominios (riesgo de sesgo, inconsistencia, imprecisión) ----------
const ROB_LBL = { high: 'High', some: 'Some concerns', low: 'Low', na: 'Not reported' };
function robSegments(items) { // items: [{rob, w}]
  const tot = { high: 0, some: 0, low: 0, na: 0 };
  items.forEach(x => { tot[robClass(x.rob)] += x.w; });
  return ['high', 'some', 'low', 'na'].map(k => ({ label: ROB_LBL[k], value: tot[k], color: ROB_COL[k], text: k === 'some' ? '#1B2430' : '#fff' }));
}
function robBarHTML(items) {
  return `<div class="rbar">${robSegments(items).filter(g => g.value > 0).map(g => `<span style="width:${g.value * 100}%;background:${g.color}" title="${g.label}: ${(g.value * 100).toFixed(0)}%"></span>`).join('')}</div>`;
}
const robLegend = () => `<div class="row gap wrap vlegend">${['low', 'some', 'high', 'na'].map(k => `<span><i style="background:${ROB_COL[k]}"></i>${ROB_LBL[k]}</span>`).join('')}</div>`;
function vizTabs(id, panes) {
  return `<div class="viztabs" data-viz="${id}">${panes.map((p, i) => `<button type="button" class="${i ? '' : 'active'}" data-pane="${i}">${p[0]}</button>`).join('')}</div>
  ${panes.map((p, i) => `<div class="vizpane${i ? '' : ' active'}" data-pane="${i}">${p[1]}</div>`).join('')}`;
}
function bindVizTabs(root) {
  root.querySelectorAll('.viztabs').forEach(t => t.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const card = t.parentElement;
    t.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    card.querySelectorAll(':scope > .vizpane').forEach(p => p.classList.toggle('active', p.dataset.pane === b.dataset.pane));
  })));
}
// Visualización de dominios GRADE: para todos los estudios y, además, para cada diseño (ECA vs observacionales) y para cada subgrupo
// cuando hay diferencia entre subgrupos (p de interacción < 0,10); cada contexto tiene su propio g (GRADE) y sus cuatro paneles.
const SUB_P = 0.10;
function vizContexts(P) {
  const out = [{ id: 'main', label: 'Todos los estudios', C: P, robCmp: null }];
  if (P.strata) P.strata.list.forEach((st, i) => out.push({ id: `st${i}`, label: DESIGN_SHORT[st.kind], C: stratumP(st), st: i }));
  const sr = P.subRes;
  if (sr?.fits && sr.test && sr.test.p < SUB_P && !(P.strata && P.subvar === state.map.design)) {
    sr.fits.filter(x => !x.na).forEach((x, i) => {
      const ss = x.ix.map(j => P.S[j]), c = { ...P.cfg, fit: x.f, studies: ss, eggerRes: ss.length >= 10 ? egger(ss.map(q => q.yi), ss.map(q => q.vi)) : null };
      out.push({ id: `sg${i}`, label: `${sr.col}: ${x.sg}`, C: { ...P, cfg: c, g: gradePairwise(c), fit: x.f, S: ss, eg: c.eggerRes } });
    });
  }
  return out;
}
const DESIGN_SHORT = { RCT: 'ECA', NRSI: 'Observacionales' };
function vizCardHTML(P, robCmp) {
  const ctx = vizContexts(P); ctx[0].robCmp = robCmp; P.vizCtx = ctx;
  if (ctx.length === 1) return `<div class="card"><h2>Visualización de los dominios GRADE</h2>${pwVizHTML(P, robCmp, 'main')}</div>`;
  const why = [P.strata ? 'ECA y observacionales por separado' : '', ctx.some(c => c.id.startsWith('sg')) ? `subgrupos de «${esc(P.subRes.col)}» (p de interacción = ${fp(P.subRes.test.p)} < ${SUB_P.toFixed(2)})` : ''].filter(Boolean).join(' · ');
  return `<div class="card"><h2>Visualización de los dominios GRADE</h2><p class="muted">Se muestran por separado: ${why}. Cada pestaña recalcula la sugerencia GRADE solo con esos estudios.</p>
  <div class="viztabs ctxtabs">${ctx.map((c, i) => `<button type="button" class="${i ? '' : 'active'}" data-ctx="${c.id}">${esc(c.label)}</button>`).join('')}</div>
  ${ctx.map((c, i) => `<div class="vizctx${i ? '' : ' active'}" data-ctx="${c.id}"${i ? ' hidden' : ''}>${pwVizHTML(c.C, c.robCmp ?? robCompare(c.C.S, c.C.cfg, P.method, P.test), c.id)}</div>`).join('')}</div>`;
}
function bindCtxTabs(root) {
  root.querySelectorAll('.ctxtabs').forEach(t => t.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    t.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    t.parentElement.querySelectorAll(':scope > .vizctx').forEach(d => { const on = d.dataset.ctx === b.dataset.ctx; d.hidden = !on; d.classList.toggle('active', on); });
  })));
}
// imprecisión de los contextos distintos del principal (el principal se actualiza en updatePwFinal)
function fillCtxImp(P) {
  (P.vizCtx || []).filter(c => c.id !== 'main').forEach(c => {
    const el = document.getElementById(`pw-impviz-${c.id}`); if (!el) return;
    const s = pwSummary(c.C, c.st != null ? P.strata.list[c.st].ov : {}); el.innerHTML = pwImpViz(c.C, s); autoFig(el, `${s.outcome}_${c.id}`);
  });
}
function pwAbs(C, yi, lo, hi) {
  const { cfg, g } = C, sc = g.ab.binary ? cfg.unit : 1;
  const a = absolute(cfg.measure, yi, lo, hi, cfg.p0);
  return { d: a.d * sc, lo: a.lo * sc, hi: a.hi * sc };
}
function pwXLabel(C) {
  const { cfg, g, int, comp } = C;
  return g.ab.binary ? `Absolute effect per ${cfg.unit} (${int} − ${comp})` : `${cfg.measure} (${int} − ${comp})`;
}
function pwVizHTML(C, robCmp, id) {
  const P = C, { fit, g, S, cfg } = P, w = fit.weights;
  const mid = cfg.threshold === 'MID' ? cfg.mid : 0;
  // Riesgo de sesgo
  const items = S.map((s, i) => ({ rob: s.rob, w: w[i], study: s.study }));
  const hs = g.domains.rob.highShare;
  let rob = shareBarSVG({ segments: robSegments(items), title: `Weight of the evidence by risk of bias — ${hs > cfg.robDominance ? 'high-risk studies dominate → −1' : 'high-risk studies do not dominate → 0'}`,
    marker: { at: cfg.robDominance, label: `Dominance threshold ${(cfg.robDominance * 100).toFixed(0)}%${cfg.someConcernsAsHigh ? ' (high + some concerns)' : ' (high risk)'}` } });
  rob += `<table class="data wtable"><thead><tr><th>Study</th><th>Risk of bias</th><th>Weight</th></tr></thead><tbody>${items.slice().sort((a, b) => b.w - a.w).map(x => `<tr><td>${esc(x.study)}</td><td><span class="chip" style="background:${ROB_COL[robClass(x.rob)]}"></span>${esc(x.rob || '—')}</td><td><div class="wbar"><span style="width:${x.w * 100}%;background:${ROB_COL[robClass(x.rob)]}"></span></div>${(x.w * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>`;
  if (robCmp) {
    const r3 = [['Low risk of bias', robCmp.fl], ['High risk of bias', robCmp.fh], ['All studies', fit]].map(([l, f], i) => ({ label: l, sub: `k = ${f.k}`, ...pwAbs(C, f.est, f.ci[0], f.ci[1]), bold: i === 2, fill: i < 2 ? (i ? 'F2C4C4' : 'C6E0B4') : null }));
    rob += thresholdSVG({ rows: r3, mid, higherBetter: cfg.higherBetter, xlabel: pwXLabel(C), title: `Low vs high risk of bias (interaction p = ${fp(robCmp.test?.p)})` });
    rob += `<p class="muted">Si los estudios de bajo riesgo dan un resultado importante distinto y aportan evidencia apreciable, use solo esos estudios y no baje la certeza (Core GRADE 4).</p>`;
  } else rob += `<p class="muted">No hay estudios de bajo y alto riesgo a la vez: no se puede comparar por riesgo de sesgo.</p>`;
  rob += robLegend();
  // Inconsistencia
  let inc;
  if (fit.k >= 2) {
    const rows = S.map((s, i) => { const se = Math.sqrt(s.vi); return { label: s.study, ...pwAbs(C, s.yi, s.yi - 1.96 * se, s.yi + 1.96 * se), w: w[i], chip: ROB_COL[robClass(s.rob)] }; });
    const piA = fit.k >= 3 ? pwAbs(C, fit.est, fit.pi[0], fit.pi[1]) : null;
    rows.push({ label: 'Pooled', sub: piA ? 'band = 95% prediction interval' : '', ...g.abs, bold: true, pi: piA ? [piA.lo, piA.hi] : null });
    const Di = g.domains.inc;
    inc = thresholdSVG({ rows, mid, higherBetter: cfg.higherBetter, xlabel: pwXLabel(C), title: `Study estimates against the decision threshold (absolute scale)${Di.piAbs && cfg.usePI ? ` — prediction interval ${Di.piLevel ? `crosses ${Di.piLevel} MID${Di.piLevel > 1 ? 's' : ''} not crossed by the CI → −${Di.piLevel}` : 'adds no threshold → 0'}` : ''}` });
    const zoneOf = d => { const v = cfg.higherBetter ? d : -d; return mid > 0 ? (v >= mid ? 'benefit' : v <= -mid ? 'harm' : 'nodiff') : (v > 0 ? 'benefit' : 'harm'); };
    const zw = { benefit: 0, nodiff: 0, harm: 0 }; rows.slice(0, -1).forEach(r => { zw[zoneOf(r.d)] += r.w; });
    const D = g.domains.inc;
    inc += shareBarSVG({ title: `Weight by zone of the point estimate — ${(D.same * 100).toFixed(0)}% on the side of the pooled estimate${D.nonOverlap ? '; some CIs do not overlap' : '; CIs overlap'} → ${D.level ? '−1' : '0'}`,
      segments: [['benefit', 'Important benefit'], ['nodiff', 'Little/no difference'], ['harm', 'Important harm']].filter(([k]) => mid > 0 || k !== 'nodiff').map(([k, l]) => ({ label: l, value: zw[k], color: { benefit: '#93C47D', nodiff: '#FFD966', harm: '#E59393' }[k], text: '#1B2430' })),
      marker: { at: 0.8, label: '≥80% on one side → not serious' } });
    inc += i2GaugeSVG(fit.I2);
  } else inc = '<p class="muted">Un solo estudio: la inconsistencia no es evaluable.</p>';
  const imp = `<div id="pw-impviz-${id}"></div>`;
  // sesgo de publicación: funnel plot + Egger
  const egAll = fit.k >= 3 ? egger(S.map(x => x.yi), S.map(x => x.vi)) : null;
  const pub = fit.k >= 3 ? funnelSVG({ pts: S.map(x => ({ y: x.yi, se: Math.sqrt(x.vi), label: x.study, col: ROB_COL[robClass(x.rob)] })), center: fit.est, log: P.isRatio, eg: egAll,
      title: `Funnel plot — ${P.outcome}`, xlabel: P.isRatio ? `${P.measure} (log scale)` : P.measure,
      note: fit.k < 10 ? `Only ${fit.k} studies: funnel plot and Egger's test have low power (recommended ≥10 studies); interpret with caution.` : 'Dashed red line: Egger regression; grey triangle: pseudo 95% confidence limits around the pooled estimate.' })
      + `<p class="muted">Juicio GRADE sugerido: <b>${g.domains.pub.level ? 'serio (−1)' : 'no detectado'}</b> — ${esc(g.domains.pub.why)}. La asimetría puede deberse también a heterogeneidad o a efectos de estudios pequeños verdaderos; considere además estudios no publicados, registros y financiamiento.</p>${robLegend()}`
    : '<p class="muted">Se necesitan al menos 3 estudios para el funnel plot.</p>';
  return vizTabs('pw', [['Riesgo de sesgo', rob], ['Inconsistencia', inc], ['Imprecisión', imp], ['Sesgo de publicación', pub]]);
}
function pwImpViz(C, s) {
  const { g, cfg } = C, mid = cfg.threshold === 'MID' ? cfg.mid : 0, I = g.domains.imp;
  let h = thresholdSVG({ rows: [{ label: s.intervention, sub: `vs ${s.comparator}`, ...g.abs, bold: true, fill: fillFor(s.cat, s.c), right: `${crossLabel(g.abs.lo, g.abs.hi, mid, I.ths)}${I.level && !/crosses/i.test(I.why) ? ' · OIS → −' + I.level : ''}`, badge: { text: `${SYM[s.c]} ${LEVELS[s.c]}`, fill: fillFor(s.cat, s.c) } }],
    mid, ths: I.ths, higherBetter: cfg.higherBetter, xlabel: pwXLabel(C), title: `Imprecision: 95% CI of the absolute effect vs ${I.ths && I.ths.length > 1 ? 'small, moderate and large thresholds' : mid > 0 ? '±MID' : 'the null'}` });
  if (isFinite(I.ois) && I.ntot > 0) h += oisSVG({ n: I.ntot, ois: I.ois, title: 'Optimal information size (applies when the CI does not cross the threshold and the effect is large)' });
  return h + `<p class="muted">${esc(I.why || '')}</p>`;
}

function readOverrides() {
  const o = {};
  document.querySelectorAll('#pw-results [data-dom]').forEach(s => o[s.dataset.dom] = +s.value);
  document.querySelectorAll('#pw-results [data-why]').forEach(t => o[t.dataset.why + '_why'] = t.value.trim());
  return o;
}
function pwSummary(P = state.lastPw, o = readOverrides()) {
  const { g, cfg, fit, isRatio, measure } = P;
  const c = finalCertainty(g, o);
  const cat = category(g.abs.d, cfg.threshold === 'MID' ? cfg.mid : cfg.mid, cfg.higherBetter, g.abs.lo, g.abs.hi);
  const notes = footnotes(g, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v])));
  const tr = x => (isRatio ? Math.exp(x) : x);
  const un = g.ab.binary ? ` per ${cfg.unit}` : '';
  const word = x => (x < 0 ? `${f1(Math.abs(x))} fewer` : `${f1(x)} more`);
  const absTxt = g.ab.binary ? `${word(g.abs.d)}${un} (${word(g.abs.lo)} to ${word(g.abs.hi)})` : `${measure} ${f2(g.abs.d)} (${f2(g.abs.lo)} to ${f2(g.abs.hi)})`;
  const rel = isRatio ? `${measure} ${f2(tr(fit.est))} (${f2(tr(fit.ci[0]))} to ${f2(tr(fit.ci[1]))})` : '—';
  const ntot = g.domains.imp.ntot;
  const des = { RCT: 'RCT', NRSI: 'non-randomised studies', NRSI_TTE: 'non-randomised studies' }[cfg.design];
  return {
    type: 'pairwise', followup: followupText(P), outcome: P.outcome, intervention: P.int, comparator: P.comp, participants: `${ntot || '–'} (${P.strata && !P.isStratum ? P.strata.list.map(st => `${st.f.k} ${st.kind === 'RCT' ? (st.f.k > 1 ? 'RCTs' : 'RCT') : 'non-randomised'}`).join(' + ') : `${fit.k} ${des === 'RCT' ? (fit.k > 1 ? 'RCTs' : 'RCT') : des}`})`, relative: rel,
    risk0: g.ab.binary ? `${f1(cfg.p0 * cfg.unit)}${un}` : '—', risk1: g.ab.binary ? `${f1(g.ab.p1 * cfg.unit)}${un}` : '—',
    absolute: absTxt, c, cat, notes, plain: plainStatement(cat, c, P.int, lcOut(P.outcome), cfg.threshold, cfg.higherBetter ? -g.abs.d : g.abs.d).replace(/an? (important )?(reduction|increase)/, (m0) => m0),
    importance: P.importance || '', k: fit.k, ntot, design: cfg.design, p0src: g.ab.binary ? p0Source(P.outcome) : '',
    domains: Object.fromEntries(['rob', 'inc', 'ind', 'imp', 'pub', 'up'].map(d => [d, { level: o[d] != null ? o[d] : d === 'up' ? g.up.level : g.domains[d].level, why: o[d + '_why'] ?? (d === 'up' ? g.up.why : g.domains[d].why) }])),
    plainRaw: { cat, c, d: g.abs.d }, magThs: thresholdSet(3, cfg.threshold === 'MID' ? cfg.mid : 0, cfg.moderate, cfg.large), d: g.abs.d, mid: cfg.threshold === 'MID' ? `${cfg.mid}${un}` : 'null', higherBetter: cfg.higherBetter,
    methods: { measure, method: P.method, test: P.test, threshold: cfg.threshold, design: cfg.design, scheme: cfg.scheme, usePI: cfg.usePI, subvar: P.subRes?.fits ? P.subvar : '', regvar: P.regRes?.m ? P.regvar : '', strata: !!P.strata },
  };
}
function updatePwFinal() {
  state.lastPw.ov = readOverrides();
  const s = pwSummary();
  const fill = fillFor(s.cat, s.c);
  const plain = plainStatement(s.cat, s.c, s.intervention, lcOut(s.outcome), state.lastPw.cfg.threshold, s.plainRaw.d);
  $('#pw-final').innerHTML = `<div class="row gap wrap" style="margin-top:10px"><span class="badge" style="background:#${fill}">${SYM[s.c]} ${LEVELS[s.c]}</span>
    <span>${legendText(s.cat, s.c, s.comparator)}</span></div><p><b>Frase en lenguaje claro:</b> ${esc(plain)}</p>
    <div class="notes">${s.notes.map(n => `<p>• ${esc(n)}</p>`).join('')}</div>`;
  const vi = $('#pw-impviz-main'); if (vi) { vi.innerHTML = pwImpViz(state.lastPw, s); autoFig(vi, s.outcome); }
}
const sameItem = (a, b) => a.type === b.type && a.outcome === b.outcome && (a.type === 'nma' || (a.intervention === b.intervention && a.comparator === b.comparator));
function pushSoF(item) { const i = state.sof.findIndex(x => sameItem(x, item)); if (i >= 0) state.sof[i] = item; else state.sof.push(item); save('mg-sof', state.sof); }
function addPwToSoF(importance) {
  if (state.lastPw.strata) { addStrataToSoF(importance); const b = $('#pw-add'); if (b) { b.textContent = 'Añadido ✓ (ECA y observacionales)'; setTimeout(() => $('#pw-add') && ($('#pw-add').textContent = 'Añadir a la tabla SoF'), 1500); } return; }
  const s = pwSummary();
  if (typeof importance === 'string' && importance) s.importance = importance;
  else if (state.rows[0]?.o_importance) s.importance = state.rows[0].o_importance;
  s.plain = plainStatement(s.cat, s.c, s.intervention, lcOut(s.outcome), state.lastPw.cfg.threshold, s.plainRaw.d);
  pushSoF(s); state.lastPw.addedSoF = true;
  $('#pw-add').textContent = 'Añadido ✓'; setTimeout(() => $('#pw-add') && ($('#pw-add').textContent = 'Añadir a la tabla SoF'), 1500);
}

// ---------------- NMA ----------------
$('#nm-run').addEventListener('click', runNMA);
function runNMA() {
  const out = $('#nm-results');
  const type = $('#nm-type').value;
  const studies = {}, rob = {}, indirect = {}, modifier = {};
  for (const r of state.rows) {
    if (!r.study || !r.treatment) continue;
    const arm = type === 'binary' ? { t: r.treatment, r: r.r, n: r.n } : { t: r.treatment, m: r.mean, sd: r.sd, n: r.n };
    if (type === 'binary' ? !(isFinite(arm.r) && isFinite(arm.n)) : !(isFinite(arm.m) && isFinite(arm.sd) && isFinite(arm.n))) continue;
    const arms = (studies[r.study] = studies[r.study] || []);
    const ex = arms.find(a => a.t === arm.t);
    if (ex && type === 'binary') { ex.r += arm.r; ex.n += arm.n; } else if (!ex) arms.push(arm);
    if (r.rob) rob[r.study] = r.rob; if (r.indirect) indirect[r.study] = r.indirect; if (r.modifier) modifier[r.study] = r.modifier;
  }
  for (const s of Object.keys(studies)) if (studies[s].length < 2) delete studies[s];
  const con = isConnected(studies);
  if (!con.ok) { out.innerHTML = `<div class="err">La red no está conectada (${con.components.length} componentes): ${con.components.map(c => '[' + c.join(', ') + ']').join(' · ')}. Analice cada sub-red por separado (filtre los datos).</div>`; return; }
  const refs = [...$('#nm-ref').selectedOptions].map(o => o.value);
  if (!refs.length) { out.innerHTML = '<div class="err">Elija al menos un comparador.</div>'; return; }
  let m;
  try { m = new NMA(studies, type, refs[0], { method: $('#nm-method').value }); } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const unit = +$('#nm-unit').value, mid = +$('#nm-mid').value || 0, large = +$('#nm-large').value || 0, higherBetter = $('#nm-dir').value === 'higher';
  const bmode = $('#nm-base').value, p0man = +$('#nm-p0').value, scheme = +$('#nm-scheme').value, isBin = type === 'binary';
  const magThs = thresholdSet(3, mid, defT(+$('#nm-mod').value, mid, 3.21 / 1.35, isBin), defT(large, mid, 6.25 / 1.35, isBin));
  const baseline = t => bmode === 'manual' && p0man > 0 ? p0man : armBaseline(studies, t, bmode);
  const blocks = refs.map(ref => {
    const pairs = m.T.filter(t => t !== ref).map(t => [t, ref]);
    return { ref, res: gradeNMA({ m, rob, indirect, modifier, mid, large: scheme === 3 ? defT(large, mid, 6.25 / 1.35, isBin) : large, moderate: defT(+$('#nm-mod').value, mid, 3.21 / 1.35, isBin), scheme, usePI: $('#nm-piinc').checked, unit, baseline, higherBetter, incP: +$('#nm-incp').value, sd: +$('#nm-sd').value || NaN }, pairs) };
  });
  state.lastNm = { m, blocks, rob, magThs, scheme, stepSel: {}, outcome: $('#nm-outcome').value, unit, mid, type, higherBetter, overrides: {}, bmode, baseline };
  state.cache.nm[state.lastNm.outcome] = state.lastNm;
  renderNMA();
  renderOTabs('nm');
}
const shortName = t => (t.length > 28 ? t.slice(0, 26) + '…' : t);
function renderNMA() {
  const N = state.lastNm, { m, blocks, unit, type } = N, isB = type === 'binary', tr = x => (isB ? Math.exp(x) : x), meas = isB ? 'OR' : 'MD';
  const dd = blocks[0].res.dd, sizes = m.nodeSize();
  const ps = m.pscore(N.higherBetter);
  const nArms = sizes.n;
  let html = `<div class="card"><h2>Red — ${esc(N.outcome)}</h2><div class="kpis">
    <div class="kpi"><span>Estudios / tratamientos</span><b>${m.k} / ${m.T.length}</b></div>
    <div class="kpi"><span>τ² (común)</span><b>${m.tau2.toFixed(3)}</b></div>
    <div class="kpi"><span>I² global</span><b>${pct(m.I2())}</b></div>
    <div class="kpi"><span>Inconsistencia global (diseño-por-tratamiento)</span><b>Q ${f2(dd.Q_inc)}, gl ${dd.df_inc}, p ${fp(dd.p_inc)}</b></div>
    <div class="kpi"><span>Heterogeneidad dentro de diseños</span><b>Q ${f2(dd.Q_het)}, gl ${dd.df_het}, p ${fp(dd.p_het)}</b></div></div>
    <div class="cols2"><div>${networkSVG(m.T, m.edges(), nArms, shortName, nmEdgeColor)}<p class="muted">Color de las aristas: riesgo de sesgo de la evidencia directa (peso).</p>${robLegend()}</div><div><h3>P-scores (solo descriptivos)</h3><table class="data"><thead><tr><th>Tratamiento</th><th>P-score</th><th>Brazos</th><th>Participantes</th></tr></thead><tbody>
    ${m.T.slice().sort((a, b) => ps[b] - ps[a]).map(t => `<tr><td>${esc(t)}</td><td>${ps[t].toFixed(2)}</td><td>${sizes.k[t]}</td><td>${nArms[t]}</td></tr>`).join('')}</tbody></table>
    <p class="muted">Los rankings no sustituyen la magnitud ni la certeza: use las categorías del marco contextualizado para concluir.</p></div></div></div>`;
  // forest vs ref + perfil GRADE por comparador
  blocks.forEach((B, bi) => {
    const rows = B.res.rows;
    const fr = rows.map(r => ({ label: r.a, est: tr(r.est), lo: tr(r.est - 1.96 * r.se), hi: tr(r.est + 1.96 * r.se) }));
    const sub = (q, kind, cc, lbl) => q ? { label: lbl, indent: true, kind, h: 20, d: q.r[0], lo: q.r[1], hi: q.r[2], fill: fillFor(category(q.r[0], N.mid, N.higherBetter, q.r[1], q.r[2]), cc), badge: { text: `${SYM[cc]} ${LEVELS[cc]}` } }
      : { label: lbl, indent: true, h: 20, d: NaN, empty: kind === 'direct' ? 'No direct evidence' : 'No indirect evidence' };
    const vrows = rows.flatMap((r, i) => { const c = N.overrides[`${bi}|${i}`] ?? r.best.c, f = fillFor(r.bestCat, c), q = r.best.r;
      return [{ label: `${r.a} vs ${r.b}`, bold: true, h: 20, d: NaN, sep: true },
        sub(r.dImp, 'direct', r.dFinal ?? 1, 'Direct'), sub(r.path ? r.iImp : null, 'indirect', r.iFinal ?? 1, 'Indirect'), {
        label: 'Network' + (r.best.src !== 'network' ? ` → best: ${r.best.src}` : ''), indent: true, h: 36, d: q[0], lo: q[1], hi: q[2], pi: r.best.src === 'network' ? r.piAbs : null, fill: f, badge: { text: `${SYM[c]} ${LEVELS[c]}`, fill: f },
        right: `${N.scheme === 3 ? crossLabel(r.r[1], r.r[2], N.mid, r.ths) : r.impLvl === 3 ? 'Large benefit to large harm → −3' : crossLabel(r.r[1], r.r[2], N.mid)}${(r.nr.find(x => x[0] === 'inc') || [, ''])[1].replace(/^Inconsistency \((−\d)\).*$/, ' · PI $1')}${isFinite(r.ess) && isFinite(r.ois) ? ` · ESS ${r.ess} vs OIS ${r.ois}` : ''}` }]; });
    const impViz = thresholdSVG({ rows: vrows, mid: N.mid, ths: N.scheme === 3 ? rows[0]?.ths : null, higherBetter: N.higherBetter, title: `Direct (□), indirect (△) and network (●) estimates vs ${B.ref}: imprecision and certainty`, xlabel: isB ? `Absolute effect per ${unit} vs ${B.ref}` : `MD vs ${B.ref}` });
    html += `<div class="card"><h2>Frente a ${esc(B.ref)}</h2>${impViz}${forestSVG({ rows: fr, log: isB, measure: 'Network ' + meas, leftLabel: N.higherBetter ? 'Favours ' + shortName(B.ref) : 'Favours intervention', rightLabel: N.higherBetter ? 'Favours intervention' : 'Favours ' + shortName(B.ref), title: `Network estimates vs ${B.ref}` })}
    <h3>Perfil de evidencia GRADE para NMA</h3><div class="tablewrap" style="max-height:none"><table class="grade-table"><thead><tr><th>Comparación</th><th>Directa</th><th>Indirecta</th><th>Red: ${meas} (IC 95 %)</th><th>Absoluto${isB ? ' por ' + unit : ''}</th><th>Certeza (editable)</th><th>Razones</th></tr></thead><tbody>
    ${rows.map((r, i) => {
      const dTxt = r.D ? `${r.kdir} ensayo(s); ${meas} ${f2(tr(r.D.dr.est))} (${f2(tr(r.D.dr.est - 1.96 * r.D.dr.se))} a ${f2(tr(r.D.dr.est + 1.96 * r.D.dr.se))})<br>${SYM[r.D.c]} ${LEVELS[r.D.c]}${r.D.reasons.length ? '<br><small>' + r.D.reasons.map(x => esc(x[1])).join('<br>') + '</small>' : ''}` : '—';
      const iTxt = r.path ? `${r.nsd && isFinite(r.nsd.ind) ? meas + ' ' + f2(tr(r.nsd.ind)) + '<br>' : ''}${SYM[r.indC]} ${LEVELS[r.indC]}<br><small>${r.indR.map(x => esc(x[1])).join('<br>')}</small>` : '—';
      const key = `${bi}|${i}`, c = N.overrides[key] ?? r.best.c;
      return `<tr><td><b>${esc(r.a)}</b><br><small>vs ${esc(r.b)}</small></td><td>${dTxt}</td><td>${iTxt}</td><td>${f2(tr(r.est))} (${f2(tr(r.est - 1.96 * r.se))} a ${f2(tr(r.est + 1.96 * r.se))})<br><small>${esc(r.basis)}${r.nsd && isFinite(r.nsd.p) ? '; node-split p = ' + fp(r.nsd.p) : ''}</small></td>
      <td>${f1(r.r[0])} (${f1(r.r[1])} a ${f1(r.r[2])})${isB ? `<br><small>basal ${f1(r.p0 * unit)}</small>` : ''}</td>
      <td><select data-nmo="${key}">${[4, 3, 2, 1].map(v => `<option value="${v}" ${v === c ? 'selected' : ''}>${LEVELS[v]}</option>`).join('')}</select><br><span class="badge" style="background:#${fillFor(r.bestCat, c)}">${SYM[c]}</span>${r.best.src !== 'network' ? `<br><small>best estimate: ${r.best.src} (incoherence)</small>` : ''}</td>
      <td><small>${[...r.nr].map(x => esc(x[1])).join('<br>') || 'Sin bajadas adicionales en la red'}</small></td></tr>`;
    }).join('')}</tbody></table></div></div>`;
    // evaluación paso a paso (Izcovich 2023) y tabla suplementaria
    const X = nmCtx(B);
    const sel = +(N.stepSel[bi] ?? 0);
    html += `<div class="card" data-block="${bi}"><h2>Valoración GRADE paso a paso — frente a ${esc(B.ref)}</h2>
      <p class="muted">Orden de Izcovich et al. (BMJ 2023): primero la evidencia directa (A), luego la indirecta (B), después la estimación de red (C) y, si hay incoherencia, se elige el mejor estimado (D).</p>
      ${stepsTableHTML(rows, X, i => i)}
      <div class="row gap wrap" id="flow-${bi}"><label>Diagrama de la comparación <select data-stepsel="${bi}">${rows.map((r, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(r.a)} vs ${esc(r.b)}</option>`).join('')}</select></label></div>
      ${rows[sel] ? stepFlowHTML(rows[sel], X) : ''}</div>`;
    const ST = supplTable(B, X);
    html += `<div class="card"><div class="row between wrap"><h2>Tabla suplementaria — frente a ${esc(B.ref)}</h2><div class="row gap"><button class="ghost" data-supdoc="${bi}">Word (.doc)</button><button class="ghost" data-supcsv="${bi}">CSV</button></div></div><div class="tablewrap" style="max-height:none">${ST.html}</div></div>`;
  });
  html += nmDirectViz();
  // league table
  const L = m.T;
  html += `<div class="card"><h2>Tabla de liga (${meas}, IC 95 %; fila vs columna)</h2><div class="tablewrap"><table class="data"><thead><tr><th></th>${L.map(t => `<th>${esc(shortName(t))}</th>`).join('')}</tr></thead><tbody>
  ${L.map(a => `<tr><th>${esc(shortName(a))}</th>${L.map(b => { if (a === b) return '<td>—</td>'; const [e, s] = m.est(a, b); return `<td>${f2(tr(e))}<br><small>(${f2(tr(e - 1.96 * s))}–${f2(tr(e + 1.96 * s))})</small></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
  <h3>Node-splitting (retro-cálculo)</h3><div class="tablewrap"><table class="data"><thead><tr><th>Comparación</th><th>k directa</th><th>Directa</th><th>Indirecta</th><th>Red</th><th>% directa</th><th>p</th></tr></thead><tbody>
  ${m.netsplit().map(x => `<tr><td>${esc(x.a)} vs ${esc(x.b)}</td><td>${x.k}</td><td>${f2(tr(x.dir))}</td><td>${isFinite(x.ind) ? f2(tr(x.ind)) : '—'}</td><td>${f2(tr(x.net))}</td><td>${pct(x.prop_dir)}</td><td>${fp(x.p)}</td></tr>`).join('')}</tbody></table></div>
  <div class="row end"><button class="primary" id="nm-add">Añadir matriz NMA a la tabla SoF</button></div></div>`;
  $('#nm-results').innerHTML = html;
  bindVizTabs($('#nm-results'));
  autoFig($('#nm-results'), N.outcome);
  $('#nm-results').querySelectorAll('[data-step]').forEach(tr => tr.addEventListener('click', () => { N.stepSel[tr.closest('[data-block]').dataset.block] = tr.dataset.step; renderNMA(); setTimeout(() => document.getElementById('flow-' + tr.closest('[data-block]').dataset.block)?.scrollIntoView({ block: 'nearest' }), 30); }));
  $('#nm-results').querySelectorAll('[data-stepsel]').forEach(sel => sel.addEventListener('change', () => { N.stepSel[sel.dataset.stepsel] = sel.value; renderNMA(); }));
  $('#nm-results').querySelector('[data-nsdoc]')?.addEventListener('click', () => download('node_splitting.doc', docWrap(nsData().html), 'application/msword'));
  $('#nm-results').querySelector('[data-nscsv]')?.addEventListener('click', () => download('node_splitting.csv', toCSV(nsData().csv, ['outcome', 'comparison', 'k', 'direct', 'indirect', 'network', 'pct_direct', 'p']), 'text/csv'));
  $('#nm-results').querySelectorAll('[data-supdoc]').forEach(b => b.addEventListener('click', () => supplDownload([state.lastNm.blocks[+b.dataset.supdoc]], 'doc')));
  $('#nm-results').querySelectorAll('[data-supcsv]').forEach(b => b.addEventListener('click', () => supplDownload([state.lastNm.blocks[+b.dataset.supcsv]], 'csv')));
  $('#nm-results').querySelectorAll('[data-nmo]').forEach(s => s.addEventListener('change', () => { N.overrides[s.dataset.nmo] = +s.value; renderNMA(); }));
  $('#nm-add').addEventListener('click', addNmToSoF);
}
// node-splitting: filas para el gráfico y tabla (inglés, para material suplementario)
function nsData(N = state.lastNm) {
  const { m } = N, isB = N.type === 'binary', tr = x => (isB ? Math.exp(x) : x), meas = isB ? 'OR' : 'MD';
  const tri = (e, se) => (isFinite(e) && isFinite(se) ? [tr(e), tr(e - 1.96 * se), tr(e + 1.96 * se)] : null);
  const ns = m.netsplit();
  const rows = ns.map(x => ({ label: `${shortName(x.a)} vs ${shortName(x.b)}`, k: x.k, dir: tri(x.dir, x.se_dir), ind: tri(x.ind, x.se_ind), net: tri(x.net, x.se_net), pdir: x.prop_dir, p: x.p }));
  const c = v => (v ? `${f2(v[0])} (${f2(v[1])} to ${f2(v[2])})` : '–');
  const html = `<p class="stitle2"><b>Node-splitting (back-calculation) for ${esc(N.outcome)}: direct, indirect and network estimates, ${meas} (95% CI)</b></p><table class="suppl"><thead><tr><th>Comparison</th><th>k (direct)</th><th>Direct</th><th>Indirect</th><th>Network</th><th>% direct</th><th>p</th></tr></thead><tbody>
    ${ns.map((x, i) => `<tr><td>${esc(x.a)} vs ${esc(x.b)}</td><td>${x.k}</td><td>${c(rows[i].dir)}</td><td>${c(rows[i].ind)}</td><td>${c(rows[i].net)}</td><td>${pct(x.prop_dir)}</td><td>${fp(x.p)}</td></tr>`).join('')}</tbody></table>
    <div class="notes"><p>k = number of trials with direct evidence; % direct = contribution of the direct estimate to the network estimate; p = test of disagreement between direct and indirect estimates. Random-effects model, τ² = ${m.tau2.toFixed(3)}.</p></div>`;
  return { rows, html, csv: ns.map((x, i) => ({ outcome: N.outcome, comparison: `${x.a} vs ${x.b}`, k: x.k, direct: c(rows[i].dir), indirect: c(rows[i].ind), network: c(rows[i].net), pct_direct: pct(x.prop_dir), p: fp(x.p) })) };
}
function nmCtx(B) {
  const N = state.lastNm, isB = N.type === 'binary';
  return { tr: x => (isB ? Math.exp(x) : x), meas: isB ? 'OR' : 'MD', isB, unit: N.unit, f2, f1, shortName, m: N.m, outcome: N.outcome, ref: B.ref };
}
function supplDownload(blocks, fmt) {
  const tabs = blocks.map(B => supplTable(B, nmCtx(B)));
  if (fmt === 'csv') {
    const rows = tabs.flatMap((t, i) => t.rows.map(r => ({ outcome: state.lastNm.outcome, comparator: blocks[i].ref, ...r })));
    download('supplementary_NMA_certainty.csv', toCSV(rows, ['outcome', 'comparator', 'cmp', 'dir', 'k', 'n1', 'n2', 'i2', 'dcoe', 'ind', 'icoe', 'nma', 'ncoe', 'best']), 'text/csv');
  } else download('supplementary_NMA_certainty.doc', docWrap(tabs.map(t => t.html).join('<br>')), 'application/msword');
}
const docWrap = body => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>@page{size:landscape}body{font-family:Arial,sans-serif;font-size:9pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #9aa4ae;padding:2pt 3pt;vertical-align:top;font-size:8pt;text-align:left}th{background:#DCE6F1}.notes p{margin:0;font-size:7.5pt}</style></head><body>${body}</body></html>`;
function nmEdgeColor(e) {
  const N = state.lastNm, D = N && N.blocks[0].res.dcert[[e.a, e.b].sort().join(' || ')];
  if (!D) return null;
  const sh = robSegments(D.dr.studies.map((s, i) => ({ rob: N.rob[s], w: D.dr.weights[i] })));
  const v = Object.fromEntries(sh.map(x => [x.label, x.value]));
  if (v.High > 0.5) return ROB_COL.high;
  if (v['Not reported'] > 0.5) return ROB_COL.na;
  if (v.High > 0 || v['Some concerns'] > 0) return ROB_COL.some;
  return ROB_COL.low;
}
function nmDirectViz() {
  const N = state.lastNm, { m, blocks } = N, isB = N.type === 'binary', tr = x => (isB ? Math.exp(x) : x), meas = isB ? 'OR' : 'MD';
  const dc = Object.entries(blocks[0].res.dcert);
  const robT = `<table class="data wtable"><thead><tr><th>Comparación directa</th><th>Ensayos</th><th>Riesgo de sesgo (peso)</th><th>I²</th><th>Certeza directa</th></tr></thead><tbody>${dc.map(([k, D]) => {
    const i2 = D.dr.I2, items = D.dr.studies.map((s, i) => ({ rob: N.rob[s], w: D.dr.weights[i] }));
    return `<tr><td>${esc(k.replace(' || ', ' vs '))}</td><td>${D.dr.k}</td><td>${robBarHTML(items)}</td><td>${isFinite(i2) ? `<div class="wbar"><span style="width:${i2 * 100}%;background:${i2 > 0.5 ? '#E59393' : i2 > 0.3 ? '#FFD966' : '#93C47D'}"></span></div>${(i2 * 100).toFixed(0)}%` : '—'}</td><td><span class="badge" style="background:#${{ 4: 'C9DAEA', 3: 'DCE6F1', 2: 'ECF1F7', 1: 'D9D9D9' }[D.c]}">${SYM[D.c]} ${LEVELS[D.c]}</span>${D.reasons.length ? '<br><small>' + D.reasons.map(x => esc(x[1].split(':')[0])).join('; ') + '</small>' : ''}</td></tr>`;
  }).join('')}</tbody></table>${robLegend()}<p class="muted">Reglas: −1 por riesgo de sesgo si &gt;50 % del peso procede de ensayos de alto riesgo; −1 por inconsistencia si I² &gt;50 % con ≥2 ensayos (revise además los forest plots).</p>`;
  const NS = nsData();
  const coh = NS.rows.some(r => r.ind) ? nodesplitSVG({ rows: NS.rows, log: isB, measure: meas, title: `Node-splitting: direct, indirect and network estimates — ${N.outcome}`, pcut: +$('#nm-incp').value || 0.1 })
      + `<p class="muted">p &lt; ${$('#nm-incp').value}: se baja −1 por incoherencia solo si ambas fuentes contribuyen (20–80 % de evidencia directa).</p>`
      + `<div class="row between wrap"><h3>Tabla de node-splitting (material suplementario)</h3><div class="row gap"><button class="ghost" data-nsdoc>Word (.doc)</button><button class="ghost" data-nscsv>CSV</button></div></div><div class="tablewrap" style="max-height:none">${NS.html}</div>`
    : '<p class="muted">No hay lazos cerrados: la incoherencia no es evaluable.</p>';
  // funnel ajustado por comparación (Chaimani 2013): contraste de cada estudio menos la estimación de red de esa comparación
  const order = [blocks[0].ref, ...m.T.filter(t => t !== blocks[0].ref)];
  const pts = [];
  for (const e of m.edges()) {
    const [older, newer] = order.indexOf(e.a) < order.indexOf(e.b) ? [e.a, e.b] : [e.b, e.a];
    const dr = m.direct(newer, older); if (!dr) continue;
    const [net] = m.est(newer, older);
    dr.ys.forEach((y, i) => pts.push({ y: y - net, v: dr.vs[i], se: Math.sqrt(dr.vs[i]), label: `${dr.studies[i]}: ${newer} vs ${older}`, col: ROB_COL[robClass(N.rob[dr.studies[i]])] }));
  }
  const egN = pts.length >= 3 ? egger(pts.map(p => p.y), pts.map(p => p.v)) : null;
  const fun = pts.length >= 3 ? funnelSVG({ pts, center: 0, log: false, eg: egN, title: `Comparison-adjusted funnel plot — ${N.outcome}`, xlabel: `Study ${meas === 'OR' ? 'log OR' : 'MD'} minus network estimate (comparisons ordered from ${shortName(order[0])} to newer treatments)`,
      note: pts.length < 10 ? `Only ${pts.length} study comparisons: low power; interpret with caution.` : 'Each point is a study-specific comparison centred at its network estimate; asymmetry suggests small-study effects.' })
    + `<p class="muted">Funnel ajustado por comparación: el contraste de cada estudio (tratamiento más «nuevo» vs más «antiguo», según el orden: ${esc(order.join(' → '))}) se centra en la estimación de red de esa comparación. Egger sobre los valores centrados. Los ensayos multibrazo aportan varios puntos correlacionados.</p>${robLegend()}`
    : '<p class="muted">Se necesitan al menos 3 comparaciones de estudios.</p>';
  return `<div class="card"><h2>Visualización de los dominios GRADE (evidencia directa e incoherencia)</h2>${vizTabs('nm', [['Riesgo de sesgo e inconsistencia', robT], ['Incoherencia', coh], ['Sesgo de publicación (funnel ajustado)', fun]])}</div>`;
}
function addNmToSoF(importance) {
  const N = state.lastNm, isB = N.type === 'binary', tr = x => (isB ? Math.exp(x) : x), meas = isB ? 'OR' : 'MD';
  const word = x => (Math.abs(x) < 0.5 ? '0' : x < 0 ? `${f1(Math.abs(x))} fewer` : `${f1(x)} more`);
  const cols = N.blocks.map(B => ({ ref: B.ref, base: isB ? `${f1(N.baseline(B.ref) * N.unit)} per ${N.unit}` : '—' }));
  const letters = {}; let li = 0;
  const cells = {};
  N.blocks.forEach((B, bi) => B.res.rows.forEach((r, i) => {
    const c = N.overrides[`${bi}|${i}`] ?? r.best.c, bst = r.best, q = bst.r;
    const keys = (bst.src === 'network' ? [...r.applied, ...r.nr.filter(x => x[0] !== 'cohflag')] : bst.src === 'direct' ? [...r.D.reasons, ['incbest', 'Direct estimate presented as best estimate: direct and indirect estimates incoherent']] : [...r.indR.filter(x => x[0] === 'intr'), ['incbest', 'Indirect estimate presented as best estimate: direct and indirect estimates incoherent']])
      .map(x => x[1].replace(/\s*\(.*?trials at high risk.*?\)$/, ''));
    const lt = keys.map(k => { const gen = k.split(':')[0]; if (!letters[gen]) letters[gen] = { l: 'abcdefghijklmnop'[li++], text: k }; return letters[gen].l; });
    (cells[r.a] = cells[r.a] || {})[B.ref] = {
      text: `${word(q[0])}\n(${word(q[1])} to ${word(q[2])})\n${meas} ${f2(tr(bst.est))} (${f2(tr(bst.est - 1.96 * bst.se))} to ${f2(tr(bst.est + 1.96 * bst.se))})${bst.src !== 'network' ? ` [${bst.src}]` : ''}\n${r.kdir ? `${r.kdir} RCT${r.kdir > 1 ? 's' : ''}; ${r.ndir} participants` : 'Indirect evidence only'}`,
      c, cat: r.bestCat, d: q[0], letters: [...new Set(lt)].sort().join(','),
    };
  }));
  const suppl = N.blocks.map(B => supplTable(B, nmCtx(B)));
  pushSoF({ type: 'nma', outcome: N.outcome, importance: typeof importance === 'string' && importance ? importance : (state.rows[0]?.o_importance || ''), suppl: suppl.map(t => ({ html: t.html, rows: t.rows })), nsHtml: nsData().html, higherBetter: N.higherBetter, magThs: N.magThs, cols, cells, rowsOrder: N.m.T, mid: `±${N.mid}${isB ? ' per ' + N.unit : ''}`, letters: Object.values(letters).map(x => ({ l: x.l, text: x.text })), tau2: N.m.tau2, k: N.m.k, methods: { type: N.type, bmode: N.bmode } });
  state.lastNm.addedSoF = true;
  $('#nm-add').textContent = 'Añadido ✓';
}

// ---------------- SoF ----------------
$('#palette').value = state.palette;
$('#palette').addEventListener('change', e => { state.palette = e.target.value; save('mg-pal', state.palette); renderSoF(); });
function legendHTML(comparator, nma) {
  const pal = PALETTES[state.palette], sw = f => `<td class="sw" style="background:#${f}" bgcolor="#${f}"></td>`;
  const cells = c => ['benefit', 'harm', 'nodiff'].map(cat => `${sw(pal[cat][c])}<td class="lt">${legendText(cat, c, comparator, nma)}</td>`).join('');
  return `<table class="legend"><tr><td class="h" colspan="7">Summary of findings (GRADE approach)</td></tr>
  ${[4, 3, 2].map(c => `<tr><td class="h">${LEVELS[c]} certainty</td>${cells(c)}</tr>`).join('')}
  <tr><td class="h">Very low certainty</td>${[0, 1, 2].map(() => `${sw(pal.verylow)}<td class="lt">The evidence is very uncertain</td>`).join('')}</tr></table>`;
}
function sofHTML() {
  const pw = state.sof.filter(s => s.type === 'pairwise'), nm = state.sof.filter(s => s.type === 'nma');
  let html = '';
  const pgroups = {};
  pw.forEach(x => (pgroups[`${x.intervention} || ${x.comparator}`] = pgroups[`${x.intervention} || ${x.comparator}`] || []).push(x));
  for (const pw of Object.values(pgroups)) {
    const comp = pw[0].comparator, notes = [], mids = [];
    const L = n => { let i = notes.indexOf(n); if (i < 0) { notes.push(n); i = notes.length - 1; } return 'abcdefghijklmnopqrstuvwxyz'[i]; };
    html += `<h3>Summary of findings: ${esc(pw[0].intervention)} compared with ${esc(comp)}</h3>` + legendHTML(comp, false);
    html += `<table class="sof"><thead><tr><th>Outcome</th>${pw.some(x => x.stratum) ? '<th>Study design</th>' : ''}<th>Participants (studies)</th><th>Follow-up</th><th>Relative effect (95% CI)</th><th>Risk with ${esc(comp)}</th><th>Risk with ${esc(pw[0].intervention)}</th><th>Absolute effect (95% CI)</th><th>Certainty of evidence</th><th>Plain language summary</th></tr></thead><tbody>`;
    pw.forEach((s, ix) => {
      const fill = fillFor(s.cat, s.c), lt = s.notes.map(L).join(','), key = x => x.baseOutcome || x.outcome, first = ix === 0 || key(pw[ix - 1]) !== key(s) || !s.stratum, span = s.stratum ? pw.slice(ix).findIndex((x, j) => j > 0 && key(x) !== key(s)) : 1, spn = s.stratum ? (span < 0 ? pw.length - ix : span) : 1;
      if (s.mid !== 'null') mids.push(`${s.outcome} ${s.mid}`);
      html += `<tr>${first ? `<td${spn > 1 ? ` rowspan="${spn}"` : ''}>${esc(s.baseOutcome || s.outcome)}</td>` : ''}${pw.some(x => x.stratum) ? `<td>${s.stratum ? (s.stratum === 'RCT' ? 'Randomised trials' : 'Observational studies') : 'All studies'}</td>` : ''}<td>${esc(s.participants)}</td><td>${esc(s.followup || '—')}</td><td>${esc(s.relative)}</td><td>${esc(s.risk0)}</td><td>${esc(s.risk1)}</td><td>${esc(s.absolute)}</td><td class="c cert" style="background:#${fill}" bgcolor="#${fill}">${SYM[s.c]}<br>${LEVELS[s.c]}${lt ? ' <sup>' + lt + '</sup>' : ''}</td><td>${esc(s.plain)}</td></tr>`;
    });
    html += `</tbody></table><div class="notes"><p>Colour applies to the certainty column only (minimally contextualised framework).</p>${mids.length ? `<p>Minimal important differences: ${esc(mids.join('; '))}.</p>` : ''}${pw.some(x => x.p0src) ? `<p>Baseline (comparator) risk: ${esc(pw.filter(x => x.p0src).map(x => `${x.outcome}, ${x.risk0} (${x.p0src})`).join('; '))}.</p>` : ''}${notes.map((n, i) => `<p>${'abcdefghijklmnopqrstuvwxyz'[i]}. ${esc(n)}</p>`).join('')}</div>`;
  }
  // una tabla por red: los desenlaces que comparten tratamientos van juntos (columnas por desenlace)
  const nets = [];
  nm.forEach(b => { const g = nets.find(n => n.some(x => x.rowsOrder.some(t => b.rowsOrder.includes(t)))); if (g) g.push(b); else nets.push([b]); });
  for (const nm of nets) {
    // filas = intervenciones; columnas = desenlaces (y comparador, si hay varios)
    const treat = [];
    nm.forEach(b => b.rowsOrder.forEach(t => { if (!treat.includes(t)) treat.push(t); }));
    const cols = nm.flatMap(b => b.cols.map(c => ({ b, c })));
    const multiRef = nm.some(b => b.cols.length > 1);
    const gl = []; const G = text => { let i = gl.indexOf(text); if (i < 0) { gl.push(text); i = gl.length - 1; } return 'abcdefghijklmnopqrstuvwxyz'[i] || String(i + 1); };
    const refs = [...new Set(cols.map(x => x.c.ref))];
    html += `<h3 style="margin-top:22px">Summary of findings (GRADE for network meta-analysis)</h3>` + legendHTML(refs.length === 1 ? refs[0] : 'the comparator', true);
    html += `<div class="tablewrap" style="max-height:none"><table class="sof matrix"><thead><tr><th rowspan="${multiRef ? 2 : 1}">Intervention</th>${nm.map(b => `<th colspan="${b.cols.length}">${esc(b.outcome)}${b.importance ? `<br><small>${esc(b.importance)}</small>` : ''}${multiRef ? '' : `<br><small>vs ${esc(b.cols[0].ref)}</small>`}</th>`).join('')}</tr>
    ${multiRef ? `<tr>${cols.map(x => `<th>vs ${esc(x.c.ref)}</th>`).join('')}</tr>` : ''}</thead><tbody>
    <tr class="sec"><td>Comparator risk</td>${cols.map(x => `<td>${esc(x.c.base)}</td>`).join('')}</tr>
    <tr class="sec"><td>MID</td>${cols.map(x => `<td>${esc(x.b.mid)}</td>`).join('')}</tr>
    ${treat.map(t => `<tr><td><b>${esc(t)}</b></td>${cols.map(({ b, c }) => {
      const x = (b.cells[t] || {})[c.ref];
      if (!x) return `<td>${b.rowsOrder.includes(t) ? (t === c.ref ? 'Comparator' : '—') : 'Not reported'}</td>`;
      const fill = fillFor(x.cat, x.c);
      const lt = (x.letters || '').split(',').filter(Boolean).map(l => { const n = b.letters.find(y => y.l === l); return n ? G(n.text) : ''; }).filter(Boolean);
      return `<td class="c" style="background:#${fill}" bgcolor="#${fill}">${esc(x.text).replace(/\n/g, '<br>')}<br>${SYM[x.c]} ${LEVELS[x.c]}${lt.length ? ' <sup>' + [...new Set(lt)].sort().join(',') + '</sup>' : ''}</td>`;
    }).join('')}</tr>`).join('')}
    </tbody></table></div><div class="notes"><p>Each cell shows the absolute difference (95% CI), the network ${nm.every(b => b.methods.type === 'binary') ? 'odds ratio' : nm.every(b => b.methods.type !== 'binary') ? 'mean difference' : 'odds ratio or mean difference'}, the direct evidence and the certainty of the evidence. Random-effects NMA per outcome (${nm.map(b => `${b.outcome}: ${b.k} studies, τ² = ${b.tau2.toFixed(2)}`).join('; ')}). Network estimates start from the certainty of the dominant source (direct or indirect), or the higher of the two when contributions are similar.</p>
    ${nm.some(b => b.methods.type === 'binary') ? `<p>Comparator risk: ${esc(nm.filter(b => b.methods.type === 'binary').map(b => `${b.outcome}, ${P0_EN[b.methods.bmode] || b.methods.bmode}`).join('; '))}.</p>` : ''}
    <p><b>Explanations of certainty ratings:</b></p>${gl.map((t, i) => `<p>${'abcdefghijklmnopqrstuvwxyz'[i] || i + 1}. ${esc(t)}.</p>`).join('')}</div>`;
  }
  const dta = state.sof.filter(x => x.type === 'dta');
  if (dta.length) html += `<h3 style="margin-top:22px">Summary of findings: diagnostic test accuracy (BETA)</h3>` + MOD.sofDtaHTML(dta);
  return html || '<p class="muted">Aún no hay desenlaces en la tabla.</p>';
}
// tablas suplementarias: perfil de evidencia GRADE (pares) y estimados directo/indirecto/red (NMA)
const SEVW = ['Not serious', 'Serious', 'Very serious', 'Extremely serious'];
function profileHTML() {
  const pw = state.sof.filter(s => s.type === 'pairwise' && s.domains), nm = state.sof.filter(s => s.type === 'nma' && s.suppl);
  let html = '';
  const groups = {};
  pw.forEach(s => (groups[`${s.intervention} || ${s.comparator}`] = groups[`${s.intervention} || ${s.comparator}`] || []).push(s));
  for (const [k, items] of Object.entries(groups)) {
    const [I, C] = k.split(' || '), notes = [];
    const L = t => { let i = notes.indexOf(t); if (i < 0) { notes.push(t); i = notes.length - 1; } return 'abcdefghijklmnopqrstuvwxyz'[i]; };
    const dom = (d, x) => { const v = x.domains[d]; if (!v) return '—'; return v.level ? `${SEVW[v.level]}<sup>${L(v.why || DOMAIN_LABEL[d])}</sup>` : (d === 'pub' ? 'Undetected' : 'Not serious'); };
    html += `<p><b>Supplementary table. GRADE evidence profile: ${esc(I)} compared with ${esc(C)}</b></p><table class="suppl"><thead><tr><th>Outcome (importance)</th><th>No. of studies (participants)</th><th>Study design</th><th>Risk of bias</th><th>Inconsistency</th><th>Indirectness</th><th>Imprecision</th><th>Publication bias</th><th>Other considerations</th><th>Relative effect (95% CI)</th><th>Absolute effect (95% CI)</th><th>Certainty</th></tr></thead><tbody>
    ${items.map(x => `<tr><td>${esc(x.outcome)}${x.importance ? ` (${esc(x.importance)})` : ''}</td><td>${x.k} (${x.ntot || '–'})</td><td>${x.design === 'RCT' ? 'Randomised trials' : 'Non-randomised studies'}</td><td>${dom('rob', x)}</td><td>${dom('inc', x)}</td><td>${dom('ind', x)}</td><td>${dom('imp', x)}</td><td>${dom('pub', x)}</td>
      <td>${x.domains.up && x.domains.up.level ? `Rated up +${x.domains.up.level}<sup>${L(x.domains.up.why || 'Rated up')}</sup>` : 'None'}</td><td>${esc(x.relative)}</td><td>${esc(x.absolute)}</td><td>${SYM[x.c]} ${LEVELS[x.c]}</td></tr>`).join('')}</tbody></table>
    <div class="notes"><p>CI = confidence interval. Absolute effects calculated with the baseline risk of the comparator group${items.some(x => x.p0src) ? ` (${esc(items.filter(x => x.p0src).map(x => `${x.outcome}: ${x.risk0}, ${x.p0src}`).join('; '))})` : ''}. Thresholds: ${esc(items.filter(x => x.mid !== 'null').map(x => `${x.outcome} ${x.mid}`).join('; ') || 'null effect')}.</p>${notes.map((n, i) => `<p>${'abcdefghijklmnopqrstuvwxyz'[i]}. ${esc(n)}.</p>`).join('')}</div><br>`;
  }
  nm.forEach(b => { b.suppl.forEach(t => { html += t.html + '<br>'; }); if (b.nsHtml) html += b.nsHtml + '<br>'; });
  return html || '<p class="muted">Añada desenlaces a la tabla SoF para generar las tablas suplementarias.</p>';
}
function renderSoF() { $('#sof').innerHTML = sofHTML(); $('#suppl').innerHTML = profileHTML(); $('#methods-text').value = methodsText(); }
$('#sup-doc').addEventListener('click', () => download('supplementary_GRADE_tables.doc', docWrap(profileHTML()), 'application/msword'));
$('#sup-csv').addEventListener('click', () => {
  const pw = state.sof.filter(s => s.type === 'pairwise' && s.domains).map(x => ({ table: 'evidence profile', outcome: x.outcome, importance: x.importance, comparison: `${x.intervention} vs ${x.comparator}`, studies: x.k, participants: x.ntot, rob: SEVW[x.domains.rob.level], inconsistency: SEVW[x.domains.inc.level], indirectness: SEVW[x.domains.ind.level], imprecision: SEVW[x.domains.imp.level], publication_bias: x.domains.pub.level ? SEVW[x.domains.pub.level] : 'Undetected', relative: x.relative, absolute: x.absolute, certainty: LEVELS[x.c] }));
  const nm = state.sof.filter(s => s.type === 'nma' && s.suppl).flatMap(b => b.suppl.flatMap((t, i) => t.rows.map(r => ({ table: 'NMA direct/indirect/network', outcome: b.outcome, importance: b.importance, comparison: `${r.cmp} vs ${b.cols[i].ref}`, studies: r.k, participants: `${r.n1}/${r.n2}`, rob: '', inconsistency: r.i2, indirectness: '', imprecision: '', publication_bias: '', relative: `direct ${r.dir}; indirect ${r.ind}; NMA ${r.nma}`, absolute: '', certainty: `direct ${r.dcoe}; indirect ${r.icoe}; NMA ${r.ncoe}` }))));
  download('supplementary_GRADE_tables.csv', toCSV([...pw, ...nm], ['table', 'outcome', 'importance', 'comparison', 'studies', 'participants', 'rob', 'inconsistency', 'indirectness', 'imprecision', 'publication_bias', 'relative', 'absolute', 'certainty']), 'text/csv');
});
$('#sof-clear').addEventListener('click', () => { if (confirm('¿Vaciar la tabla SoF?')) { state.sof = []; save('mg-sof', []); renderSoF(); } });
$('#sof-doc').addEventListener('click', () => {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Calibri,sans-serif;font-size:9pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #9aa4ae;padding:3pt;vertical-align:top;font-size:8pt}td.sw{width:18pt}th{background:#1F3A5F;color:#fff}.notes p{margin:0;font-size:8pt}</style></head><body>${sofHTML()}</body></html>`;
  download('summary_of_findings.doc', html, 'application/msword');
});
$('#sof-csv').addEventListener('click', () => {
  const rows = state.sof.filter(s => s.type === 'pairwise').map(s => ({ outcome: s.baseOutcome || s.outcome, design: s.stratum || 'all', participants: s.participants, follow_up: s.followup || '', relative: s.relative, risk_comparator: s.risk0, risk_intervention: s.risk1, absolute: s.absolute, certainty: LEVELS[s.c], category: s.cat, plain: s.plain, footnotes: s.notes.join(' | ') }));
  const nm = state.sof.filter(s => s.type === 'nma').flatMap(b => Object.entries(b.cells).flatMap(([t, cs]) => Object.entries(cs).map(([ref, x]) => ({ outcome: b.outcome, participants: '', relative: x.text.split('\n')[2], risk_comparator: ref, risk_intervention: t, absolute: x.text.split('\n').slice(0, 2).join(' '), certainty: LEVELS[x.c], category: x.cat, plain: '', footnotes: x.letters }))));
  const dtaRows = state.sof.filter(s => s.type === 'dta').map(s => ({ outcome: s.outcome, design: 'DTA (beta)', participants: `${s.n} (${s.k} studies)`, relative: `Se ${s.se.est.toFixed(2)} (${s.se.ci[0].toFixed(2)}-${s.se.ci[1].toFixed(2)}); Sp ${s.sp.est.toFixed(2)} (${s.sp.ci[0].toFixed(2)}-${s.sp.ci[1].toFixed(2)})`, risk_comparator: `FN per 100: ${s.se.f.toFixed(1)} (${s.se.fLo.toFixed(1)}-${s.se.fHi.toFixed(1)})`, risk_intervention: `FP per 100: ${s.sp.f.toFixed(1)} (${s.sp.fLo.toFixed(1)}-${s.sp.fHi.toFixed(1)})`, absolute: '', certainty: `Se: ${LEVELS[s.se.c]}; Sp: ${LEVELS[s.sp.c]}`, category: `${s.se.zone}/${s.sp.zone}`, plain: `${s.se.text} | ${s.sp.text}`, footnotes: [...s.se.notes, ...s.sp.notes].join(' | ') }));
  download('summary_of_findings.csv', toCSV([...rows, ...nm, ...dtaRows], ['outcome', 'design', 'participants', 'follow_up', 'relative', 'risk_comparator', 'risk_intervention', 'absolute', 'certainty', 'category', 'plain', 'footnotes']), 'text/csv');
});
$('#sof-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([sofHTML()], { type: 'text/html' }) })]); $('#sof-copy').textContent = 'Copiado ✓'; }
  catch { const r = document.createRange(); r.selectNode($('#sof')); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy'); }
  setTimeout(() => $('#sof-copy').textContent = 'Copiar tabla', 1500);
});

function methodsText() {
  const pw = state.sof.find(s => s.type === 'pairwise'), nm = state.sof.find(s => s.type === 'nma');
  const t = [];
  if (pw) {
    const M = pw.methods;
    t.push(`Statistical analysis. We pooled ${{ RR: 'risk ratios', OR: 'odds ratios', HR: 'hazard ratios (generic inverse variance)', RD: 'risk differences', MD: 'mean differences', SMD: 'standardised mean differences (Hedges g)', ROM: 'ratios of means' }[M.measure]} with ${M.method === 'EE' ? 'a common-effect model' : `random-effects models (${M.method === 'REML' ? 'restricted maximum likelihood' : 'DerSimonian–Laird'} estimator of τ²)`}${M.test === 'z' ? ' and Wald-type 95% confidence intervals' : M.test === 'adhoc' ? ' and the Hartung–Knapp–Sidik–Jonkman adjustment with the ad hoc correction (q ≥ 1)' : ' and the Knapp–Hartung adjustment'}. Heterogeneity was summarised with τ², I² and 95% prediction intervals (t distribution, k−2 degrees of freedom). Small-study effects were explored with Egger's test when at least 10 studies were available.`);
    if (M.subvar) t.push(`Subgroup analyses. We explored differences between subgroups defined by ${M.subvar} by pooling each subgroup separately (own between-study variance) and testing the between-subgroup difference (Q test, p for interaction).`);
    if (M.regvar) t.push(`Meta-regression. We fitted a mixed-effects meta-regression with ${M.regvar} as moderator (REML estimation of residual heterogeneity; ${M.test === 'z' ? 'Wald-type tests' : 'Knapp-Hartung adjustment'}) and report the omnibus test of moderators and the proportion of heterogeneity explained (R²).`);
    if (M.strata) t.push('Study design. Randomised trials and observational studies were pooled and rated separately: each body of evidence started at its own level (randomised high; non-randomised low, or high when assessed with ROBINS-I) and the GRADE domains were judged separately for each.');
    t.push(`Certainty of evidence. Two reviewers rated the certainty of evidence for each outcome with the GRADE approach as operationalised in Core GRADE. Evidence from ${M.design === 'RCT' ? 'randomised trials started at high certainty' : M.design === 'NRSI' ? 'non-randomised studies started at low certainty' : 'non-randomised studies assessed with ROBINS-I started at high certainty'} and could be rated down for risk of bias, inconsistency, indirectness, imprecision and publication bias${M.design === 'NRSI' ? ', or rated up for a large effect or a dose–response gradient' : ''}. We rated our certainty that the true effect ${M.threshold === 'MID' ? 'is important, using minimal important differences (MIDs) as thresholds; when the point estimate was below the MID we rated certainty in little to no important effect' : 'lies on one side of the null'}. Thresholds were applied to absolute effects, obtained by applying the pooled relative effect to the baseline risk. Risk of bias was rated down when studies at high risk of bias dominated the analysis; inconsistency was judged from the location of study estimates relative to the threshold and the overlap of confidence intervals, with I² as a secondary criterion${M.usePI ? '; we also rated down one level when the 95% prediction interval crossed an MID threshold not crossed by the confidence interval of the pooled estimate, and two levels when it crossed both' : ''}; ${M.scheme === 3 ? 'imprecision was rated down one level for each decision threshold (small, moderate and large effect, on either side of the null) crossed by the 95% CI of the absolute effect, up to three levels, or,' : 'imprecision was rated down when the 95% CI of the absolute effect crossed the threshold (two levels when it crossed both MIDs) or,'} for large effects, when the optimal information size was not met. Automated suggestions (MetaGRADE) were reviewed and modified with justification. Results are presented in summary of findings tables with a colour code combining certainty and the direction of the effect relative to the MID (minimally contextualised framework).`);
  }
  if (nm) {
    t.push(`Network meta-analysis. We performed a frequentist contrast-based ${nm.methods.type === 'binary' ? 'odds ratio' : 'mean difference'} network meta-analysis by generalised least squares (graph-theoretical approach), accounting for the correlation of multi-arm trials, with random effects and a common between-study variance estimated by restricted maximum likelihood. Global inconsistency was assessed with the design-by-treatment decomposition of Q and local inconsistency with node-splitting (back-calculation). P-scores were used only descriptively. Certainty was rated with the GRADE approach for NMA: direct estimates were rated for risk of bias, inconsistency and indirectness; indirect estimates started from the lower certainty of the direct comparisons in the dominant first-order loop and were rated down for intransitivity; network estimates started from the certainty of the dominant source (or the higher of direct and indirect when both contributed similarly) and were rated down for incoherence and for imprecision of the absolute effect relative to the MID, using the effective sample size and the optimal information size for large effects (GRADE guidance 33). We followed the stepwise process described by Izcovich et al. (direct estimate, indirect estimate, network estimate and selection of the best estimate); when direct and indirect estimates were incoherent, we also rated imprecision of the direct and indirect estimates and presented the estimate with the highest certainty. Conclusions were drawn with the minimally contextualised framework.`);
  }
  return t.join('\n\n');
}
const MOD = mountModules({ $, esc, state, fp, autoFig, figSettings, fillFor, pushSoF, subgroupAnalysis, regAnalysis, colLabel });
renderSoF();
