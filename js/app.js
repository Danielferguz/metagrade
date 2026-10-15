import { readFile, mapColumns, normalize, detectType, download, toCSV } from './io.js?v=2026.10.16-4';
import { escalc, rma, egger, subgroupTest } from './pairwise.js?v=2026.10.16-4';
import { NMA, isConnected, armBaseline } from './nma.js?v=2026.10.16-4';
import { gradePairwise, finalCertainty, footnotes, gradeNMA, absolute, category, legendText, plainStatement, thresholdSet, LEVELS, SYM, DOMAIN_LABEL, SEVERITY } from './grade.js?v=2026.10.16-4';
import { mountThreshold } from './thresh.js?v=2026.10.16-4';
import { renderEtD } from './etd.js?v=2026.10.16-4';
import { bindFigs, effPt, figSettings } from './figs.js?v=2026.10.16-4';
import { stepFlowHTML, stepsTableHTML, supplTable } from './nmasteps.js?v=2026.10.16-4';
import { forestSVG, networkSVG, funnelSVG, nodesplitSVG, thresholdSVG, shareBarSVG, i2GaugeSVG, oisSVG, crossLabel, robClass, ROB_COL, ZONE } from './plots.js?v=2026.10.16-4';
import { median } from './stats.js?v=2026.10.16-4';
import { HELP_HTML } from './help.js?v=2026.10.16-4';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f2 = x => (isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)) : '–');
const f1 = x => (isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(1)) : '–');
// minúscula inicial solo si no es una sigla (eGFR, KDQOL…)
const lcOut = o => (/^[A-Za-z][a-z]/.test(o) ? o.charAt(0).toLowerCase() + o.slice(1) : o);
const pct = x => (isFinite(x) ? (x * 100).toFixed(0) + '%' : '–');
const fp = p => (!isFinite(p) ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3));

const PALETTES = {
  default: { benefit: { 4: '93C47D', 3: 'C6E0B4', 2: 'E2EFDA' }, harm: { 4: 'E59393', 3: 'F2C4C4', 2: 'FAE1E1' }, nodiff: { 4: 'FFD966', 3: 'FFE699', 2: 'FFF2CC' }, verylow: 'D9D9D9' },
  cvd: { benefit: { 4: '6BAED6', 3: 'BDD7EE', 2: 'DEEBF7' }, harm: { 4: 'F4A261', 3: 'F8CBAD', 2: 'FBE5D6' }, nodiff: { 4: 'B4A7D6', 3: 'D9D2E9', 2: 'EEEAF5' }, verylow: 'D9D9D9' },
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
  state.sheet = name; state.raw = state.sheets[name] || [];
  state.map = mapColumns(state.raw);
  state.type = detectType(state.map);
  state.kind = state.type.kind === 'nma' ? 'nma' : 'pairwise';
  $('#kind').value = state.kind;
  renderMapping(); refreshData();
}
const CANON = { pairwise: ['study', 'outcome', 'subgroup', 'e1', 'n1', 'e2', 'n2', 'm1', 'sd1', 'm2', 'sd2', 'est', 'lower', 'upper', 'yi', 'sei', 'n', 'rob', 'indirect', 'design'], nma: ['study', 'outcome', 'treatment', 'r', 'mean', 'sd', 'n', 'rob', 'indirect', 'modifier'] };
const CANON_LABEL = { study: 'Estudio', outcome: 'Desenlace', subgroup: 'Subgrupo', e1: 'Eventos intervención', n1: 'N intervención', e2: 'Eventos comparador', n2: 'N comparador', m1: 'Media intervención', sd1: 'DE intervención', m2: 'Media comparador', sd2: 'DE comparador', est: 'Estimador (HR/OR/RR)', lower: 'IC inferior', upper: 'IC superior', yi: 'yi', sei: 'EE (sei)', n: 'N total', rob: 'Riesgo de sesgo', indirect: 'Indirecto', design: 'Diseño', treatment: 'Tratamiento', r: 'Eventos/respondedores', mean: 'Media', sd: 'DE', modifier: 'Modificador (intransitividad)' };
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
  $('#detected').textContent = t.kind === 'nma' ? `NMA · ${t.outcome === 'binary' ? 'binario' : 'continuo'} · ${new Set(rows.map(r => r.study)).size} estudios` : t.kind === 'pairwise' ? `Pares · ${{ binary: 'binario', continuous: 'continuo', generic: 'genérico (yi, sei)', 'ratio-ci': 'razones ajustadas con IC' }[t.data]} · ${rows.length} estudios` : 'Formato no reconocido: revise las columnas';
  const cols = Object.keys(state.raw[0] || {});
  const vis = state.raw.filter(r => !state.map.outcome || outs.length < 2 || r[state.map.outcome] === ($('#outcome-filter').value || outs[0])).slice(0, 200);
  $('#preview').innerHTML = `<thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${vis.map(r => `<tr>${cols.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  if ($('#pw-outcome') && outs.length) { $('#pw-outcome').value = $('#outcome-filter').value || outs[0]; $('#nm-outcome').value = $('#pw-outcome').value; }
}

$('#go-analysis').addEventListener('click', () => { setupAnalysis(); renderOutcomeConfig(state.kind === 'nma' ? 'nm' : 'pw'); showTab('analisis'); });

// ---------------- análisis: preparación ----------------
function setupAnalysis() {
  const t = detectType(state.map);
  $('#no-data').hidden = true;
  $('#pw').hidden = state.kind !== 'pairwise'; $('#nm').hidden = state.kind !== 'nma';
  if (state.kind === 'pairwise') {
    const opts = { binary: ['RR', 'OR', 'RD'], continuous: ['MD', 'SMD', 'ROM'], generic: ['RR', 'OR', 'HR', 'MD', 'SMD'], 'ratio-ci': ['HR', 'OR', 'RR'] }[t.data] || ['RR'];
    $('#pw-measure').innerHTML = opts.map(o => `<option>${o}</option>`).join('');
    if (t.data === 'binary') {
      const p = state.rows.map(r => r.e2 / r.n2).filter(isFinite);
      $('#pw-p0').value = p.length ? median(p).toFixed(3) : '';
    }
    $('#pw-p0').closest('label').hidden = t.data === 'continuous';
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
function defaultCfg(kind, o) {
  const rows = outcomeRows(o), r = rows.find(x => x.o_dir || x.o_mid || x.o_dis || x.o_importance) || rows[0] || {};
  const t = detectType(state.map), pre = kind === 'pw' ? '#pw-' : '#nm-', unit = +$(pre + 'unit').value;
  const binary = kind === 'pw' ? ['binary', 'ratio-ci'].includes(t.data) || (t.data === 'generic' && false) : t.outcome === 'binary';
  const c = { include: true, importance: normImp(r.o_importance), dir: r.o_dir ? (/^(high|desir|mayor)/i.test(r.o_dir) ? 'higher' : 'lower') : $(pre + 'dir').value,
    mid: '', mod: '', large: '', dis: r.o_dis > 0 ? r.o_dis : '', sd: '', binary, n: kind === 'nm' ? new Set(rows.map(x => x.study)).size : rows.length };
  if (r.o_dis > 0) [c.mid, c.mod, c.large] = DT(r.o_dis, unit);
  else if (r.o_mid > 0) c.mid = r.o_mid;
  else c.mid = +$(pre + 'mid').value || '';
  if (kind === 'pw') {
    const opts = { binary: ['RR', 'OR', 'RD'], continuous: ['MD', 'SMD', 'ROM'], generic: ['RR', 'OR', 'HR', 'MD', 'SMD'], 'ratio-ci': ['HR', 'OR', 'RR'] }[t.data] || ['RR'];
    c.measures = opts; c.measure = opts[0];
    const p = rows.map(x => x.e2 / x.n2).filter(isFinite);
    c.p0 = r.o_p0 > 0 ? r.o_p0 : p.length ? +median(p).toFixed(3) : '';
    c.int = r.o_int || $('#pw-int').value; c.comp = r.o_comp || $('#pw-comp').value;
  }
  return c;
}
function outcomeList() { const o = state.map.outcome ? [...new Set(normalize(state.raw, state.map).map(r => r.outcome))] : []; return o.length >= 2 ? o : [SINGLE]; }
const ocSummary = (kind, c) => `· ${c.n} ${kind === 'nm' ? 'estudios' : 'filas'} · ${c.importance} · ${c.dir === 'higher' ? '↑ deseable' : '↓ indeseable'}${kind === 'pw' ? ' · ' + c.measure : ''} · MID ${c.mid === '' ? '—' : c.mid}${c.mod ? ` / ${c.mod} / ${c.large}` : ''}`;
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
        ${fld(o, 'mid', 'MID (umbral pequeño)', 'type="number" step="any"', c.binary ? unitLbl : '')}
        ${fld(o, 'mod', 'Umbral moderado', 'type="number" step="any" placeholder="opcional"')}
        ${fld(o, 'large', 'Umbral grande', 'type="number" step="any" placeholder="opcional"')}
        ${kind === 'pw' && c.binary ? fld(o, 'p0', 'Riesgo basal (proporción)', 'type="number" step="any" min="0" max="1"') : ''}
        ${kind === 'pw' ? fld(o, 'int', 'Intervención') + fld(o, 'comp', 'Comparador') : ''}
      </div>
      <details class="thr-oc" open><summary>Umbrales de este desenlace: GRADE-THRESHOLD (disutilidad) o DME 0,2 / 0,5 / 0,8</summary><div class="thr" data-thr="${oi}"></div></details>
      <div class="row end gap"><button type="button" class="ghost" data-ocrun>Ejecutar solo este desenlace</button></div></details>`; }).join('')}`;
  el.querySelectorAll('details.ocfg').forEach(d => {
    const o = d.dataset.out, c = C[o];
    d.querySelectorAll('[data-oc]').forEach(inp => {
      inp.addEventListener('click', e => { if (inp.dataset.oc === 'include') e.stopPropagation(); });
      inp.addEventListener('change', () => { c[inp.dataset.oc] = inp.type === 'checkbox' ? inp.checked : inp.value; const sm = d.querySelector('summary .muted'); if (sm) sm.textContent = ocSummary(kind, c); });
    });
    const thr = d.querySelector('[data-thr]');
    mountThreshold(thr, `oc-${kind}-${thr.dataset.thr}-`, {
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
  } else { set('#nm-dir', c.dir); set('#nm-mid', c.mid); set('#nm-mod', c.mod); set('#nm-large', c.large); }
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
    return e && isFinite(e.yi) ? { study: r.study || '?', yi: e.yi, vi: e.vi, rob: r.rob, indirect: r.indirect, n, subgroup: r.subgroup, raw: r } : { study: r.study, dropped: e ? e.dropped || 'datos incompletos' : 'datos incompletos' };
  });
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
  const isHigh = r => /high|serious|critical/i.test(r || '') || (cfg.someConcernsAsHigh && /some|unclear|moderate/i.test(r || ''));
  const lowS = S.filter(s => !isHigh(s.rob)), highS = S.filter(s => isHigh(s.rob));
  let robCmp = null;
  if (lowS.length && highS.length) {
    const fl = rma(lowS.map(s => s.yi), lowS.map(s => s.vi), { method, test }), fh = rma(highS.map(s => s.yi), highS.map(s => s.vi), { method, test });
    robCmp = { fl, fh, test: subgroupTest([fl, fh]) };
  }
  // subgrupos
  let subRes = null;
  if (state.subAll && state.subgroups.length >= 2) {
    const fits = state.subgroups.map(sg => { const ss = S.filter(s => s.subgroup === sg); return ss.length ? { sg, f: rma(ss.map(s => s.yi), ss.map(s => s.vi), { method, test }) } : null; }).filter(Boolean);
    subRes = { fits, test: subgroupTest(fits.map(x => x.f)) };
  }
  state.lastPw = { cfg, g, fit, S, measure, isRatio, eg, outcome: $('#pw-outcome').value, int: $('#pw-int').value, comp: $('#pw-comp').value, method, test, dataType: t.data, overrides: {} };
  state.lastPw.args = [dropped, robCmp, subRes];
  state.cache.pw[state.lastPw.outcome] = state.lastPw;
  renderPairwise(dropped, robCmp, subRes, tr);
  renderOTabs('pw');
}

function domainRow(key, label, lvl, why, max = 3) {
  return `<tr><th>${label}</th><td><select data-dom="${key}">${[0, 1, 2, 3].slice(0, max + 1).map(v => `<option value="${v}" ${v === lvl ? 'selected' : ''}>${v === 0 ? 'No serio' : v === 1 ? 'Serio (−1)' : v === 2 ? 'Muy serio (−2)' : 'Extremadamente serio (−3)'}</option>`).join('')}</select></td><td><textarea data-why="${key}">${esc(why)}</textarea></td></tr>`;
}

function renderPairwise(dropped, robCmp, subRes, tr) {
  const P = state.lastPw, { fit, g, S, measure, isRatio, cfg } = P;
  const lbl = isRatio ? measure : measure;
  const rows = S.map((s, i) => ({ label: s.study, est: tr(s.yi), lo: tr(s.yi - 1.96 * Math.sqrt(s.vi)), hi: tr(s.yi + 1.96 * Math.sqrt(s.vi)), w: fit.weights[i], rob: s.rob }));
  const het = fit.k > 1 ? `Heterogeneity: τ² = ${fit.tau2.toFixed(3)}; I² = ${fit.I2.toFixed(0)}%; Q = ${fit.QE.toFixed(2)} (p = ${fp(fit.QEp)})` : '';
  const goodLeft = cfg.higherBetter ? isRatio ? false : false : true;
  const fav = cfg.higherBetter ? [`Favours ${P.comp}`, `Favours ${P.int}`] : [`Favours ${P.int}`, `Favours ${P.comp}`];
  const svg = forestSVG({ rows, pooled: { est: tr(fit.est), lo: tr(fit.ci[0]), hi: tr(fit.ci[1]), pi: fit.k >= 3 ? [tr(fit.pi[0]), tr(fit.pi[1])] : null, het, label: `Pooled (${fit.method === 'EE' ? 'common effect' : 'random effects, ' + fit.method}${fit.test !== 'z' ? ', ' + (fit.test === 'adhoc' ? 'HKSJ' : 'Knapp-Hartung') : ''})` }, log: isRatio, measure: lbl, leftLabel: fav[0], rightLabel: fav[1], title: P.outcome });
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
  if (subRes) html += `<p class="muted"><b>Subgrupos:</b> ${subRes.fits.map(x => `${esc(x.sg)}: ${f2(tr(x.f.est))} (${f2(tr(x.f.ci[0]))}–${f2(tr(x.f.ci[1]))}, k=${x.f.k})`).join(' · ')}; p de interacción = ${fp(subRes.test?.p)}. Juzgue la credibilidad con ICEMAN antes de presentar estimaciones separadas.</p>`;
  html += `</div>`;
  html += pwVizHTML(robCmp);
  // GRADE
  html += `<div class="card"><h2>Certeza de la evidencia (Core GRADE)</h2>
  <p class="muted">Umbral: <b>${cfg.threshold === 'MID' ? 'MID ±' + cfg.mid + un : 'valor nulo'}</b> · punto de partida: <b>${LEVELS[g.start]}</b>. Las calificaciones son sugerencias: modifique el nivel y la justificación si su juicio difiere.</p>
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
  $('#pw-results').innerHTML = html;
  bindVizTabs($('#pw-results'));
  autoFig($('#pw-results'), P.outcome);
  $('#pw-results').querySelectorAll('[data-dom],[data-why]').forEach(el => el.addEventListener('input', updatePwFinal));
  $('#pw-add').addEventListener('click', addPwToSoF);
  if (P.ov) document.querySelectorAll('#pw-results [data-dom],#pw-results [data-why]').forEach(el => { const k = el.dataset.dom ?? el.dataset.why + '_why'; if (P.ov[k] != null) el.value = P.ov[k]; });
  updatePwFinal();
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
function figNote() { const st = figSettings(); $('#fig-note').textContent = `Ancho ${st.mm} mm a ${st.dpi} dpi = ${Math.round(st.mm / 25.4 * st.dpi)} px. Letra del texto principal ≈ ${effPt(900, st.mm).toFixed(1)} pt en gráficos de umbrales/forest (${effPt(620, st.mm).toFixed(1)} pt en el gráfico de red)${effPt(900, st.mm) < 6 ? ' — demasiado pequeña: use 2 columnas' : ''}.`; }
['#fig-width', '#fig-mm', '#fig-dpi', '#fig-font'].forEach(id => $(id).addEventListener('change', figNote)); figNote();

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
function pwAbs(yi, lo, hi) {
  const { cfg, g } = state.lastPw, sc = g.ab.binary ? cfg.unit : 1;
  const a = absolute(cfg.measure, yi, lo, hi, cfg.p0);
  return { d: a.d * sc, lo: a.lo * sc, hi: a.hi * sc };
}
function pwXLabel() {
  const { cfg, g, int, comp } = state.lastPw;
  return g.ab.binary ? `Absolute effect per ${cfg.unit} (${int} − ${comp})` : `${cfg.measure} (${int} − ${comp})`;
}
function pwVizHTML(robCmp) {
  const P = state.lastPw, { fit, g, S, cfg } = P, w = fit.weights;
  const mid = cfg.threshold === 'MID' ? cfg.mid : 0;
  // Riesgo de sesgo
  const items = S.map((s, i) => ({ rob: s.rob, w: w[i], study: s.study }));
  const hs = g.domains.rob.highShare;
  let rob = shareBarSVG({ segments: robSegments(items), title: `Weight of the evidence by risk of bias — ${hs > cfg.robDominance ? 'high-risk studies dominate → −1' : 'high-risk studies do not dominate → 0'}`,
    marker: { at: cfg.robDominance, label: `Dominance threshold ${(cfg.robDominance * 100).toFixed(0)}%${cfg.someConcernsAsHigh ? ' (high + some concerns)' : ' (high risk)'}` } });
  rob += `<table class="data wtable"><thead><tr><th>Study</th><th>Risk of bias</th><th>Weight</th></tr></thead><tbody>${items.slice().sort((a, b) => b.w - a.w).map(x => `<tr><td>${esc(x.study)}</td><td><span class="chip" style="background:${ROB_COL[robClass(x.rob)]}"></span>${esc(x.rob || '—')}</td><td><div class="wbar"><span style="width:${x.w * 100}%;background:${ROB_COL[robClass(x.rob)]}"></span></div>${(x.w * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>`;
  if (robCmp) {
    const r3 = [['Low risk of bias', robCmp.fl], ['High risk of bias', robCmp.fh], ['All studies', fit]].map(([l, f], i) => ({ label: l, sub: `k = ${f.k}`, ...pwAbs(f.est, f.ci[0], f.ci[1]), bold: i === 2, fill: i < 2 ? (i ? 'F2C4C4' : 'C6E0B4') : null }));
    rob += thresholdSVG({ rows: r3, mid, higherBetter: cfg.higherBetter, xlabel: pwXLabel(), title: `Low vs high risk of bias (interaction p = ${fp(robCmp.test?.p)})` });
    rob += `<p class="muted">Si los estudios de bajo riesgo dan un resultado importante distinto y aportan evidencia apreciable, use solo esos estudios y no baje la certeza (Core GRADE 4).</p>`;
  } else rob += `<p class="muted">No hay estudios de bajo y alto riesgo a la vez: no se puede comparar por riesgo de sesgo.</p>`;
  rob += robLegend();
  // Inconsistencia
  let inc;
  if (fit.k >= 2) {
    const rows = S.map((s, i) => { const se = Math.sqrt(s.vi); return { label: s.study, ...pwAbs(s.yi, s.yi - 1.96 * se, s.yi + 1.96 * se), w: w[i], chip: ROB_COL[robClass(s.rob)] }; });
    const piA = fit.k >= 3 ? pwAbs(fit.est, fit.pi[0], fit.pi[1]) : null;
    rows.push({ label: 'Pooled', sub: piA ? 'band = 95% prediction interval' : '', ...g.abs, bold: true, pi: piA ? [piA.lo, piA.hi] : null });
    const Di = g.domains.inc;
    inc = thresholdSVG({ rows, mid, higherBetter: cfg.higherBetter, xlabel: pwXLabel(), title: `Study estimates against the decision threshold (absolute scale)${Di.piAbs && cfg.usePI ? ` — prediction interval ${Di.piLevel ? `crosses ${Di.piLevel} MID${Di.piLevel > 1 ? 's' : ''} not crossed by the CI → −${Di.piLevel}` : 'adds no threshold → 0'}` : ''}` });
    const zoneOf = d => { const v = cfg.higherBetter ? d : -d; return mid > 0 ? (v >= mid ? 'benefit' : v <= -mid ? 'harm' : 'nodiff') : (v > 0 ? 'benefit' : 'harm'); };
    const zw = { benefit: 0, nodiff: 0, harm: 0 }; rows.slice(0, -1).forEach(r => { zw[zoneOf(r.d)] += r.w; });
    const D = g.domains.inc;
    inc += shareBarSVG({ title: `Weight by zone of the point estimate — ${(D.same * 100).toFixed(0)}% on the side of the pooled estimate${D.nonOverlap ? '; some CIs do not overlap' : '; CIs overlap'} → ${D.level ? '−1' : '0'}`,
      segments: [['benefit', 'Important benefit'], ['nodiff', 'Little/no difference'], ['harm', 'Important harm']].filter(([k]) => mid > 0 || k !== 'nodiff').map(([k, l]) => ({ label: l, value: zw[k], color: { benefit: '#93C47D', nodiff: '#FFD966', harm: '#E59393' }[k], text: '#1B2430' })),
      marker: { at: 0.8, label: '≥80% on one side → not serious' } });
    inc += i2GaugeSVG(fit.I2);
  } else inc = '<p class="muted">Un solo estudio: la inconsistencia no es evaluable.</p>';
  const imp = '<div id="pw-impviz"></div>';
  // sesgo de publicación: funnel plot + Egger
  const egAll = fit.k >= 3 ? egger(S.map(x => x.yi), S.map(x => x.vi)) : null;
  const pub = fit.k >= 3 ? funnelSVG({ pts: S.map(x => ({ y: x.yi, se: Math.sqrt(x.vi), label: x.study, col: ROB_COL[robClass(x.rob)] })), center: fit.est, log: P.isRatio, eg: egAll,
      title: `Funnel plot — ${P.outcome}`, xlabel: P.isRatio ? `${P.measure} (log scale)` : P.measure,
      note: fit.k < 10 ? `Only ${fit.k} studies: funnel plot and Egger's test have low power (recommended ≥10 studies); interpret with caution.` : 'Dashed red line: Egger regression; grey triangle: pseudo 95% confidence limits around the pooled estimate.' })
      + `<p class="muted">Juicio GRADE sugerido: <b>${g.domains.pub.level ? 'serio (−1)' : 'no detectado'}</b> — ${esc(g.domains.pub.why)}. La asimetría puede deberse también a heterogeneidad o a efectos de estudios pequeños verdaderos; considere además estudios no publicados, registros y financiamiento.</p>${robLegend()}`
    : '<p class="muted">Se necesitan al menos 3 estudios para el funnel plot.</p>';
  return `<div class="card"><h2>Visualización de los dominios GRADE</h2>${vizTabs('pw', [['Riesgo de sesgo', rob], ['Inconsistencia', inc], ['Imprecisión', imp], ['Sesgo de publicación', pub]])}</div>`;
}
function pwImpViz(s) {
  const { g, cfg } = state.lastPw, mid = cfg.threshold === 'MID' ? cfg.mid : 0, I = g.domains.imp;
  let h = thresholdSVG({ rows: [{ label: s.intervention, sub: `vs ${s.comparator}`, ...g.abs, bold: true, fill: fillFor(s.cat, s.c), right: `${crossLabel(g.abs.lo, g.abs.hi, mid, I.ths)}${I.level && !/crosses/i.test(I.why) ? ' · OIS → −' + I.level : ''}`, badge: { text: `${SYM[s.c]} ${LEVELS[s.c]}`, fill: fillFor(s.cat, s.c) } }],
    mid, ths: I.ths, higherBetter: cfg.higherBetter, xlabel: pwXLabel(), title: `Imprecision: 95% CI of the absolute effect vs ${I.ths && I.ths.length > 1 ? 'small, moderate and large thresholds' : mid > 0 ? '±MID' : 'the null'}` });
  if (isFinite(I.ois) && I.ntot > 0) h += oisSVG({ n: I.ntot, ois: I.ois, title: 'Optimal information size (applies when the CI does not cross the threshold and the effect is large)' });
  return h + `<p class="muted">${esc(I.why || '')}</p>`;
}

function readOverrides() {
  const o = {};
  document.querySelectorAll('#pw-results [data-dom]').forEach(s => o[s.dataset.dom] = +s.value);
  document.querySelectorAll('#pw-results [data-why]').forEach(t => o[t.dataset.why + '_why'] = t.value.trim());
  return o;
}
function pwSummary() {
  const P = state.lastPw, { g, cfg, fit, isRatio, measure } = P, o = readOverrides();
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
    type: 'pairwise', outcome: P.outcome, intervention: P.int, comparator: P.comp, participants: `${ntot || '–'} (${fit.k} ${des === 'RCT' ? (fit.k > 1 ? 'RCTs' : 'RCT') : des})`, relative: rel,
    risk0: g.ab.binary ? `${f1(cfg.p0 * cfg.unit)}${un}` : '—', risk1: g.ab.binary ? `${f1(g.ab.p1 * cfg.unit)}${un}` : '—',
    absolute: absTxt, c, cat, notes, plain: plainStatement(cat, c, P.int, lcOut(P.outcome), cfg.threshold, cfg.higherBetter ? -g.abs.d : g.abs.d).replace(/an? (important )?(reduction|increase)/, (m0) => m0),
    importance: P.importance || '', k: fit.k, ntot, design: cfg.design,
    domains: Object.fromEntries(['rob', 'inc', 'ind', 'imp', 'pub', 'up'].map(d => [d, { level: o[d] != null ? o[d] : d === 'up' ? g.up.level : g.domains[d].level, why: o[d + '_why'] ?? (d === 'up' ? g.up.why : g.domains[d].why) }])),
    plainRaw: { cat, c, d: g.abs.d }, magThs: thresholdSet(3, cfg.threshold === 'MID' ? cfg.mid : 0, cfg.moderate, cfg.large), d: g.abs.d, mid: cfg.threshold === 'MID' ? `${cfg.mid}${un}` : 'null', higherBetter: cfg.higherBetter,
    methods: { measure, method: P.method, test: P.test, threshold: cfg.threshold, design: cfg.design, scheme: cfg.scheme, usePI: cfg.usePI },
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
  const vi = $('#pw-impviz'); if (vi) { vi.innerHTML = pwImpViz(s); autoFig(vi, s.outcome); }
}
const sameItem = (a, b) => a.type === b.type && a.outcome === b.outcome && (a.type === 'nma' || (a.intervention === b.intervention && a.comparator === b.comparator));
function pushSoF(item) { const i = state.sof.findIndex(x => sameItem(x, item)); if (i >= 0) state.sof[i] = item; else state.sof.push(item); save('mg-sof', state.sof); }
function addPwToSoF(importance) {
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
  const pal = PALETTES[state.palette];
  const cells = c => ['benefit', 'harm', 'nodiff'].map(cat => `<td class="c" style="background:#${pal[cat][c]}" bgcolor="#${pal[cat][c]}">${legendText(cat, c, comparator, nma)}</td>`).join('');
  return `<table class="legend"><tr><td class="h" colspan="4">Interpretation of the colour code</td></tr>
  ${[4, 3, 2].map(c => `<tr><td class="h">${LEVELS[c]} certainty</td>${cells(c)}</tr>`).join('')}
  <tr><td class="h">Very low certainty</td><td class="c" colspan="3" style="background:#${pal.verylow}" bgcolor="#${pal.verylow}">The evidence is very uncertain</td></tr></table>`;
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
    html += `<table class="sof"><thead><tr><th>Outcome</th><th>Participants (studies)</th><th>Relative effect (95% CI)</th><th>Risk with ${esc(comp)}</th><th>Risk with ${esc(pw[0].intervention)}</th><th>Absolute effect (95% CI)</th><th>Certainty of evidence</th><th>Plain language summary</th></tr></thead><tbody>`;
    pw.forEach(s => {
      const fill = fillFor(s.cat, s.c), lt = s.notes.map(L).join(',');
      if (s.mid !== 'null') mids.push(`${s.outcome} ${s.mid}`);
      html += `<tr><td>${esc(s.outcome)}</td><td>${esc(s.participants)}</td><td>${esc(s.relative)}</td><td>${esc(s.risk0)}</td><td>${esc(s.risk1)}</td><td class="c" style="background:#${fill}" bgcolor="#${fill}">${esc(s.absolute)}</td><td class="c" style="background:#${fill}" bgcolor="#${fill}">${SYM[s.c]}<br>${LEVELS[s.c]}${lt ? ' <sup>' + lt + '</sup>' : ''}</td><td>${esc(s.plain)}</td></tr>`;
    });
    html += `</tbody></table><div class="notes"><p>Colours apply to the absolute effect and certainty columns (minimally contextualised framework).</p>${mids.length ? `<p>Minimal important differences: ${esc(mids.join('; '))}.</p>` : ''}${notes.map((n, i) => `<p>${'abcdefghijklmnopqrstuvwxyz'[i]}. ${esc(n)}</p>`).join('')}</div>`;
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
    <p><b>Explanations of certainty ratings:</b></p>${gl.map((t, i) => `<p>${'abcdefghijklmnopqrstuvwxyz'[i] || i + 1}. ${esc(t)}.</p>`).join('')}</div>`;
  }
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
    <div class="notes"><p>CI = confidence interval. Absolute effects calculated with the baseline risk of the comparator group. Thresholds: ${esc(items.filter(x => x.mid !== 'null').map(x => `${x.outcome} ${x.mid}`).join('; ') || 'null effect')}.</p>${notes.map((n, i) => `<p>${'abcdefghijklmnopqrstuvwxyz'[i]}. ${esc(n)}.</p>`).join('')}</div><br>`;
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
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Calibri,sans-serif;font-size:9pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #9aa4ae;padding:3pt;vertical-align:top;font-size:8pt}th{background:#1F3A5F;color:#fff}.notes p{margin:0;font-size:8pt}</style></head><body>${sofHTML()}</body></html>`;
  download('summary_of_findings.doc', html, 'application/msword');
});
$('#sof-csv').addEventListener('click', () => {
  const rows = state.sof.filter(s => s.type === 'pairwise').map(s => ({ outcome: s.outcome, participants: s.participants, relative: s.relative, risk_comparator: s.risk0, risk_intervention: s.risk1, absolute: s.absolute, certainty: LEVELS[s.c], category: s.cat, plain: s.plain, footnotes: s.notes.join(' | ') }));
  const nm = state.sof.filter(s => s.type === 'nma').flatMap(b => Object.entries(b.cells).flatMap(([t, cs]) => Object.entries(cs).map(([ref, x]) => ({ outcome: b.outcome, participants: '', relative: x.text.split('\n')[2], risk_comparator: ref, risk_intervention: t, absolute: x.text.split('\n').slice(0, 2).join(' '), certainty: LEVELS[x.c], category: x.cat, plain: '', footnotes: x.letters }))));
  download('summary_of_findings.csv', toCSV([...rows, ...nm], ['outcome', 'participants', 'relative', 'risk_comparator', 'risk_intervention', 'absolute', 'certainty', 'category', 'plain', 'footnotes']), 'text/csv');
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
    t.push(`Certainty of evidence. Two reviewers rated the certainty of evidence for each outcome with the GRADE approach as operationalised in Core GRADE. Evidence from ${M.design === 'RCT' ? 'randomised trials started at high certainty' : M.design === 'NRSI' ? 'non-randomised studies started at low certainty' : 'non-randomised studies assessed with ROBINS-I started at high certainty'} and could be rated down for risk of bias, inconsistency, indirectness, imprecision and publication bias${M.design === 'NRSI' ? ', or rated up for a large effect or a dose–response gradient' : ''}. We rated our certainty that the true effect ${M.threshold === 'MID' ? 'is important, using minimal important differences (MIDs) as thresholds; when the point estimate was below the MID we rated certainty in little to no important effect' : 'lies on one side of the null'}. Thresholds were applied to absolute effects, obtained by applying the pooled relative effect to the baseline risk. Risk of bias was rated down when studies at high risk of bias dominated the analysis; inconsistency was judged from the location of study estimates relative to the threshold and the overlap of confidence intervals, with I² as a secondary criterion${M.usePI ? '; we also rated down one level when the 95% prediction interval crossed an MID threshold not crossed by the confidence interval of the pooled estimate, and two levels when it crossed both' : ''}; ${M.scheme === 3 ? 'imprecision was rated down one level for each decision threshold (small, moderate and large effect, on either side of the null) crossed by the 95% CI of the absolute effect, up to three levels, or,' : 'imprecision was rated down when the 95% CI of the absolute effect crossed the threshold (two levels when it crossed both MIDs) or,'} for large effects, when the optimal information size was not met. Automated suggestions (MetaGRADE) were reviewed and modified with justification. Results are presented in summary of findings tables with a colour code combining certainty and the direction of the effect relative to the MID (minimally contextualised framework).`);
  }
  if (nm) {
    t.push(`Network meta-analysis. We performed a frequentist contrast-based ${nm.methods.type === 'binary' ? 'odds ratio' : 'mean difference'} network meta-analysis by generalised least squares (graph-theoretical approach), accounting for the correlation of multi-arm trials, with random effects and a common between-study variance estimated by restricted maximum likelihood. Global inconsistency was assessed with the design-by-treatment decomposition of Q and local inconsistency with node-splitting (back-calculation). P-scores were used only descriptively. Certainty was rated with the GRADE approach for NMA: direct estimates were rated for risk of bias, inconsistency and indirectness; indirect estimates started from the lower certainty of the direct comparisons in the dominant first-order loop and were rated down for intransitivity; network estimates started from the certainty of the dominant source (or the higher of direct and indirect when both contributed similarly) and were rated down for incoherence and for imprecision of the absolute effect relative to the MID, using the effective sample size and the optimal information size for large effects (GRADE guidance 33). We followed the stepwise process described by Izcovich et al. (direct estimate, indirect estimate, network estimate and selection of the best estimate); when direct and indirect estimates were incoherent, we also rated imprecision of the direct and indirect estimates and presented the estimate with the highest certainty. Conclusions were drawn with the minimally contextualised framework.`);
  }
  return t.join('\n\n');
}
renderSoF();
