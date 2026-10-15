import { readFile, mapColumns, normalize, detectType, download, toCSV } from './io.js';
import { escalc, rma, egger, subgroupTest } from './pairwise.js';
import { NMA, isConnected, armBaseline } from './nma.js';
import { gradePairwise, finalCertainty, footnotes, gradeNMA, absolute, category, legendText, plainStatement, LEVELS, SYM, DOMAIN_LABEL, SEVERITY } from './grade.js';
import { forestSVG, networkSVG } from './plots.js';
import { median } from './stats.js';
import { HELP_HTML } from './help.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f2 = x => (isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)) : '–');
const f1 = x => (isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(1)) : '–');
const pct = x => (isFinite(x) ? (x * 100).toFixed(0) + '%' : '–');
const fp = p => (!isFinite(p) ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3));

const PALETTES = {
  default: { benefit: { 4: '93C47D', 3: 'C6E0B4', 2: 'E2EFDA' }, harm: { 4: 'E59393', 3: 'F2C4C4', 2: 'FAE1E1' }, nodiff: { 4: 'FFD966', 3: 'FFE699', 2: 'FFF2CC' }, verylow: 'D9D9D9' },
  cvd: { benefit: { 4: '6BAED6', 3: 'BDD7EE', 2: 'DEEBF7' }, harm: { 4: 'F4A261', 3: 'F8CBAD', 2: 'FBE5D6' }, nodiff: { 4: 'B4A7D6', 3: 'D9D2E9', 2: 'EEEAF5' }, verylow: 'D9D9D9' },
};
const fillFor = (cat, c, pal = PALETTES[state.palette]) => c <= 1 ? pal.verylow : (pal[cat] || {})[c];

const state = { sheets: null, sheet: null, map: {}, rows: [], kind: 'pairwise', type: {}, sof: load('mg-sof', []), palette: load('mg-pal', 'default'), lastPw: null, lastNm: null };
function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }

// ---------------- pestañas ----------------
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(t) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
  if (t === 'sof') renderSoF();
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

async function loadFile(file) {
  try {
    const { sheets } = await readFile(file);
    state.sheets = sheets;
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
  if (outs.length >= 2 && ![...$('#outcome-filter').options].some(o => outs.includes(o.value))) $('#outcome-filter').innerHTML = outs.map(o => `<option>${esc(o)}</option>`).join('');
  let rows = all;
  if (outs.length >= 2) rows = rows.filter(r => r.outcome === ($('#outcome-filter').value || prevO || outs[0]));
  const subs = state.kind === 'pairwise' && state.map.subgroup ? [...new Set(rows.map(r => r.subgroup))] : [];
  $('#subgroup-wrap').hidden = subs.length < 2;
  if (subs.length >= 2) {
    if (![...$('#subgroup-filter').options].some(o => subs.includes(o.value) || o.value === '__all')) $('#subgroup-filter').innerHTML = `<option value="__all">Todos (con prueba de subgrupos)</option>` + subs.map(o => `<option>${esc(o)}</option>`).join('');
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

$('#go-analysis').addEventListener('click', () => { setupAnalysis(); showTab('analisis'); });

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
$('#pw-unit').addEventListener('change', () => $('#pw-mid-unit').textContent = 'por ' + $('#pw-unit').value);
$('#dt-calc').addEventListener('click', () => {
  const u = +$('#dt-dis').value, unit = +$('#pw-unit').value;
  if (!(u > 0)) return;
  const v = [0.0135, 0.0321, 0.0625].map(c => Math.min(unit, c * unit / u));
  $('#dt-out').textContent = `DT1 ${f1(v[0])} · DT2 ${f1(v[1])} · DT3 ${f1(v[2])} por ${unit} (MID = DT1)`;
  $('#pw-mid').value = v[0].toFixed(2);
});

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
  };
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
  renderPairwise(dropped, robCmp, subRes, tr);
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
  $('#pw-results').querySelectorAll('[data-dom],[data-why]').forEach(el => el.addEventListener('input', updatePwFinal));
  $('#pw-add').addEventListener('click', addPwToSoF);
  updatePwFinal();
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
    absolute: absTxt, c, cat, notes, plain: plainStatement(cat, c, P.int, P.outcome.toLowerCase(), cfg.threshold, cfg.higherBetter ? -g.abs.d : g.abs.d).replace(/an? (important )?(reduction|increase)/, (m0) => m0),
    plainRaw: { cat, c, d: g.abs.d }, mid: cfg.threshold === 'MID' ? `${cfg.mid}${un}` : 'null', higherBetter: cfg.higherBetter,
    methods: { measure, method: P.method, test: P.test, threshold: cfg.threshold, design: cfg.design },
  };
}
function updatePwFinal() {
  const s = pwSummary();
  const fill = fillFor(s.cat, s.c);
  const plain = plainStatement(s.cat, s.c, s.intervention, s.outcome.toLowerCase(), state.lastPw.cfg.threshold, s.plainRaw.d);
  $('#pw-final').innerHTML = `<div class="row gap wrap" style="margin-top:10px"><span class="badge" style="background:#${fill}">${SYM[s.c]} ${LEVELS[s.c]}</span>
    <span>${legendText(s.cat, s.c, s.comparator)}</span></div><p><b>Frase en lenguaje claro:</b> ${esc(plain)}</p>
    <div class="notes">${s.notes.map(n => `<p>• ${esc(n)}</p>`).join('')}</div>`;
}
function addPwToSoF() {
  const s = pwSummary();
  s.plain = plainStatement(s.cat, s.c, s.intervention, s.outcome.toLowerCase(), state.lastPw.cfg.threshold, s.plainRaw.d);
  state.sof.push(s); save('mg-sof', state.sof);
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
  const bmode = $('#nm-base').value, p0man = +$('#nm-p0').value;
  const baseline = t => bmode === 'manual' && p0man > 0 ? p0man : armBaseline(studies, t, bmode);
  const blocks = refs.map(ref => {
    const pairs = m.T.filter(t => t !== ref).map(t => [t, ref]);
    return { ref, res: gradeNMA({ m, rob, indirect, modifier, mid, large, unit, baseline, higherBetter, incP: +$('#nm-incp').value, sd: +$('#nm-sd').value || NaN }, pairs) };
  });
  state.lastNm = { m, blocks, outcome: $('#nm-outcome').value, unit, mid, type, higherBetter, overrides: {}, bmode, baseline };
  renderNMA();
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
    <div class="cols2"><div>${networkSVG(m.T, m.edges(), nArms, shortName)}</div><div><h3>P-scores (solo descriptivos)</h3><table class="data"><thead><tr><th>Tratamiento</th><th>P-score</th><th>Brazos</th><th>Participantes</th></tr></thead><tbody>
    ${m.T.slice().sort((a, b) => ps[b] - ps[a]).map(t => `<tr><td>${esc(t)}</td><td>${ps[t].toFixed(2)}</td><td>${sizes.k[t]}</td><td>${nArms[t]}</td></tr>`).join('')}</tbody></table>
    <p class="muted">Los rankings no sustituyen la magnitud ni la certeza: use las categorías del marco contextualizado para concluir.</p></div></div></div>`;
  // forest vs ref + perfil GRADE por comparador
  blocks.forEach((B, bi) => {
    const rows = B.res.rows;
    const fr = rows.map(r => ({ label: r.a, est: tr(r.est), lo: tr(r.est - 1.96 * r.se), hi: tr(r.est + 1.96 * r.se) }));
    html += `<div class="card"><h2>Frente a ${esc(B.ref)}</h2>${forestSVG({ rows: fr, log: isB, measure: meas + ' (network)', leftLabel: N.higherBetter ? 'Favours ' + shortName(B.ref) : 'Favours intervention', rightLabel: N.higherBetter ? 'Favours intervention' : 'Favours ' + shortName(B.ref), title: `vs ${B.ref}` })}
    <h3>Perfil de evidencia GRADE para NMA</h3><div class="tablewrap" style="max-height:none"><table class="grade-table"><thead><tr><th>Comparación</th><th>Directa</th><th>Indirecta</th><th>Red: ${meas} (IC 95 %)</th><th>Absoluto${isB ? ' por ' + unit : ''}</th><th>Certeza (editable)</th><th>Razones</th></tr></thead><tbody>
    ${rows.map((r, i) => {
      const dTxt = r.D ? `${r.kdir} ensayo(s); ${meas} ${f2(tr(r.D.dr.est))} (${f2(tr(r.D.dr.est - 1.96 * r.D.dr.se))} a ${f2(tr(r.D.dr.est + 1.96 * r.D.dr.se))})<br>${SYM[r.D.c]} ${LEVELS[r.D.c]}${r.D.reasons.length ? '<br><small>' + r.D.reasons.map(x => esc(x[1])).join('<br>') + '</small>' : ''}` : '—';
      const iTxt = r.path ? `${r.nsd && isFinite(r.nsd.ind) ? meas + ' ' + f2(tr(r.nsd.ind)) + '<br>' : ''}${SYM[r.indC]} ${LEVELS[r.indC]}<br><small>${r.indR.map(x => esc(x[1])).join('<br>')}</small>` : '—';
      const key = `${bi}|${i}`, c = N.overrides[key] ?? r.c;
      return `<tr><td><b>${esc(r.a)}</b><br><small>vs ${esc(r.b)}</small></td><td>${dTxt}</td><td>${iTxt}</td><td>${f2(tr(r.est))} (${f2(tr(r.est - 1.96 * r.se))} a ${f2(tr(r.est + 1.96 * r.se))})<br><small>${esc(r.basis)}${r.nsd && isFinite(r.nsd.p) ? '; node-split p = ' + fp(r.nsd.p) : ''}</small></td>
      <td>${f1(r.r[0])} (${f1(r.r[1])} a ${f1(r.r[2])})${isB ? `<br><small>basal ${f1(r.p0 * unit)}</small>` : ''}</td>
      <td><select data-nmo="${key}">${[4, 3, 2, 1].map(v => `<option value="${v}" ${v === c ? 'selected' : ''}>${LEVELS[v]}</option>`).join('')}</select><br><span class="badge" style="background:#${fillFor(r.cat, c)}">${SYM[c]}</span></td>
      <td><small>${[...r.nr].map(x => esc(x[1])).join('<br>') || 'Sin bajadas adicionales en la red'}</small></td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  });
  // league table
  const L = m.T;
  html += `<div class="card"><h2>Tabla de liga (${meas}, IC 95 %; fila vs columna)</h2><div class="tablewrap"><table class="data"><thead><tr><th></th>${L.map(t => `<th>${esc(shortName(t))}</th>`).join('')}</tr></thead><tbody>
  ${L.map(a => `<tr><th>${esc(shortName(a))}</th>${L.map(b => { if (a === b) return '<td>—</td>'; const [e, s] = m.est(a, b); return `<td>${f2(tr(e))}<br><small>(${f2(tr(e - 1.96 * s))}–${f2(tr(e + 1.96 * s))})</small></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
  <h3>Node-splitting (retro-cálculo)</h3><div class="tablewrap"><table class="data"><thead><tr><th>Comparación</th><th>k directa</th><th>Directa</th><th>Indirecta</th><th>Red</th><th>% directa</th><th>p</th></tr></thead><tbody>
  ${m.netsplit().map(x => `<tr><td>${esc(x.a)} vs ${esc(x.b)}</td><td>${x.k}</td><td>${f2(tr(x.dir))}</td><td>${isFinite(x.ind) ? f2(tr(x.ind)) : '—'}</td><td>${f2(tr(x.net))}</td><td>${pct(x.prop_dir)}</td><td>${fp(x.p)}</td></tr>`).join('')}</tbody></table></div>
  <div class="row end"><button class="primary" id="nm-add">Añadir matriz NMA a la tabla SoF</button></div></div>`;
  $('#nm-results').innerHTML = html;
  $('#nm-results').querySelectorAll('[data-nmo]').forEach(s => s.addEventListener('change', () => { N.overrides[s.dataset.nmo] = +s.value; renderNMA(); }));
  $('#nm-add').addEventListener('click', addNmToSoF);
}
function addNmToSoF() {
  const N = state.lastNm, isB = N.type === 'binary', tr = x => (isB ? Math.exp(x) : x), meas = isB ? 'OR' : 'MD';
  const word = x => (Math.abs(x) < 0.5 ? '0' : x < 0 ? `${f1(Math.abs(x))} fewer` : `${f1(x)} more`);
  const cols = N.blocks.map(B => ({ ref: B.ref, base: isB ? `${f1(N.baseline(B.ref) * N.unit)} per ${N.unit}` : '—' }));
  const letters = {}; let li = 0;
  const cells = {};
  N.blocks.forEach((B, bi) => B.res.rows.forEach((r, i) => {
    const c = N.overrides[`${bi}|${i}`] ?? r.c;
    const keys = [...r.applied, ...r.nr.filter(x => x[0] !== 'cohflag')]
      .map(x => x[1].replace(/\s*\(.*?trials at high risk.*?\)$/, ''));
    const lt = keys.map(k => { const gen = k.split(':')[0]; if (!letters[gen]) letters[gen] = { l: 'abcdefghijklmnop'[li++], text: k }; return letters[gen].l; });
    (cells[r.a] = cells[r.a] || {})[B.ref] = {
      text: `${word(r.r[0])}${isB ? '' : ''}\n(${word(r.r[1])} to ${word(r.r[2])})\n${meas} ${f2(tr(r.est))} (${f2(tr(r.est - 1.96 * r.se))} to ${f2(tr(r.est + 1.96 * r.se))})\n${r.kdir ? `${r.kdir} RCT${r.kdir > 1 ? 's' : ''}; ${r.ndir} participants` : 'Indirect evidence only'}`,
      c, cat: r.cat, letters: [...new Set(lt)].sort().join(','),
    };
  }));
  state.sof.push({ type: 'nma', outcome: N.outcome, cols, cells, rowsOrder: N.m.T, mid: `±${N.mid}${isB ? ' per ' + N.unit : ''}`, letters: Object.values(letters).map(x => ({ l: x.l, text: x.text })), tau2: N.m.tau2, k: N.m.k, methods: { type: N.type, bmode: N.bmode } });
  save('mg-sof', state.sof);
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
  if (pw.length) {
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
  nm.forEach(b => {
    html += `<h3 style="margin-top:22px">Summary of findings (GRADE for network meta-analysis): ${esc(b.outcome)}</h3>` + legendHTML('the comparator', true);
    html += `<table class="sof matrix"><thead><tr><th>Intervention</th>${b.cols.map(c => `<th>Versus ${esc(c.ref)}</th>`).join('')}</tr></thead><tbody>
    <tr class="sec"><td>Comparator risk</td>${b.cols.map(c => `<td>${esc(c.base)}</td>`).join('')}</tr><tr class="sec"><td>MID</td>${b.cols.map(() => `<td>${esc(b.mid)}</td>`).join('')}</tr>
    ${b.rowsOrder.map(t => `<tr><td><b>${esc(t)}</b></td>${b.cols.map(c => { const x = (b.cells[t] || {})[c.ref]; if (!x) return '<td>Comparator</td>'; const fill = fillFor(x.cat, x.c); return `<td class="c" style="background:#${fill}" bgcolor="#${fill}">${esc(x.text).replace(/\n/g, '<br>')}<br>${SYM[x.c]} ${LEVELS[x.c]}${x.letters ? ' <sup>' + x.letters + '</sup>' : ''}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table><div class="notes"><p>Each cell shows the absolute difference per ${esc(b.mid.split('per ')[1] || 'unit')} (95% CI), the network ${b.methods.type === 'binary' ? 'odds ratio' : 'mean difference'}, the direct evidence and the certainty of the evidence. Random-effects NMA (${b.k} studies; τ² = ${b.tau2.toFixed(2)}). Network estimates start from the certainty of the dominant source (direct or indirect), or the higher of the two when contributions are similar.</p>
    <p><b>Explanations of certainty ratings:</b></p>${b.letters.map(x => `<p>${x.l}. ${esc(x.text)}.</p>`).join('')}</div>`;
  });
  return html || '<p class="muted">Aún no hay desenlaces en la tabla.</p>';
}
function renderSoF() { $('#sof').innerHTML = sofHTML(); $('#methods-text').value = methodsText(); }
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
    t.push(`Certainty of evidence. Two reviewers rated the certainty of evidence for each outcome with the GRADE approach as operationalised in Core GRADE. Evidence from ${M.design === 'RCT' ? 'randomised trials started at high certainty' : M.design === 'NRSI' ? 'non-randomised studies started at low certainty' : 'non-randomised studies assessed with ROBINS-I started at high certainty'} and could be rated down for risk of bias, inconsistency, indirectness, imprecision and publication bias${M.design === 'NRSI' ? ', or rated up for a large effect or a dose–response gradient' : ''}. We rated our certainty that the true effect ${M.threshold === 'MID' ? 'is important, using minimal important differences (MIDs) as thresholds; when the point estimate was below the MID we rated certainty in little to no important effect' : 'lies on one side of the null'}. Thresholds were applied to absolute effects, obtained by applying the pooled relative effect to the baseline risk. Risk of bias was rated down when studies at high risk of bias dominated the analysis; inconsistency was judged from the location of study estimates relative to the threshold and the overlap of confidence intervals, with I² as a secondary criterion; imprecision was rated down when the 95% CI of the absolute effect crossed the threshold (two levels when it crossed both MIDs) or, for large effects, when the optimal information size was not met. Automated suggestions (MetaGRADE) were reviewed and modified with justification. Results are presented in summary of findings tables with a colour code combining certainty and the direction of the effect relative to the MID (minimally contextualised framework).`);
  }
  if (nm) {
    t.push(`Network meta-analysis. We performed a frequentist contrast-based ${nm.methods.type === 'binary' ? 'odds ratio' : 'mean difference'} network meta-analysis by generalised least squares (graph-theoretical approach), accounting for the correlation of multi-arm trials, with random effects and a common between-study variance estimated by restricted maximum likelihood. Global inconsistency was assessed with the design-by-treatment decomposition of Q and local inconsistency with node-splitting (back-calculation). P-scores were used only descriptively. Certainty was rated with the GRADE approach for NMA: direct estimates were rated for risk of bias, inconsistency and indirectness; indirect estimates started from the lower certainty of the direct comparisons in the dominant first-order loop and were rated down for intransitivity; network estimates started from the certainty of the dominant source (or the higher of direct and indirect when both contributed similarly) and were rated down for incoherence and for imprecision of the absolute effect relative to the MID, using the effective sample size and the optimal information size for large effects (GRADE guidance 33). Conclusions were drawn with the minimally contextualised framework.`);
  }
  return t.join('\n\n');
}
renderSoF();
