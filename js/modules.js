// Módulos de prevalencia / incidencia y de exactitud diagnóstica (DTA, beta). La interfaz se monta desde app.js con mountModules(env).
import { poolProp, propES, backTr, wilson, byar, PROP_TR, RATE_TR } from './prop.js?v=2026.10.25-4';
import { poolSeSp, bivariate, gradeDTA, dtaCertainty, dtaText, SCEN, fnPer100, fpPer100 } from './dta.js?v=2026.10.25-4';
import { forestRM, srocSVG, bubbleSVG } from './plots.js?v=2026.10.25-4';
import { rma, subgroupTest } from './pairwise.js?v=2026.10.25-4';
import { LEVELS, SYM } from './grade.js?v=2026.10.25-4';
import { normalize } from './io.js?v=2026.10.25-4';
import { sum } from './stats.js?v=2026.10.25-4';

const ZN = { ok: 'benefit', mid: 'nodiff', bad: 'harm' };
export const ZONE_TXT = { ok: 'Within acceptable range', mid: 'Between acceptable and unacceptable', bad: 'Beyond unacceptable threshold' };
const SEV = ['Not serious', 'Serious (−1)', 'Very serious (−2)'];
const DOMS = [['rob', 'Risk of bias'], ['inc', 'Inconsistency'], ['ind', 'Indirectness'], ['imp', 'Imprecision'], ['pub', 'Publication bias']];

export function mountModules(env) {
  const { $, esc, state, fp, autoFig, figSettings, fillFor, pushSoF, subgroupAnalysis, regAnalysis, colLabel } = env;
  const pct = (v, d = 1) => (isFinite(v) ? v.toFixed(d) : '–');
  const f2 = v => (isFinite(v) ? v.toFixed(2) : '–');
  const cols = () => Object.keys(state.raw[0] || {});

  // ======================= PREVALENCIA / INCIDENCIA =======================
  function setupPrev() {
    const rate = state.type.data === 'rate';
    $('#pr-tr').innerHTML = Object.entries(rate ? RATE_TR : PROP_TR).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#pr-tr').value = rate ? 'IRLN' : 'PLO'; $('#pr-unit').closest('label').hidden = !rate;
    const dc = cols().filter(c => !['study', 'outcome'].includes(c) && c !== state.map.x && c !== state.map.r && c !== state.map.n && c !== state.map.pt);
    const op = `<option value="">— ninguno —</option>` + dc.map(c => `<option>${esc(c)}</option>`).join('');
    $('#pr-subvar').innerHTML = op + '<option value="__rob__">Riesgo de sesgo (sensibilidad)</option>'; $('#pr-regvar').innerHTML = op;
    $('#pr-results').innerHTML = '';
  }
  function runPrev() {
    const rate = state.type.data === 'rate', tr = $('#pr-tr').value, method = $('#pr-method').value, test = $('#pr-test').value, unit = rate ? +$('#pr-unit').value || 1000 : 100;
    const S = [], dropped = [];
    state.rows.forEach(r => { const x = r.x ?? r.r, n = rate ? r.pt : r.n, e = propES(x, n, tr); if (e) S.push({ study: r.study || '?', x, n, yi: e.yi, vi: e.vi, rob: r.rob, raw: r }); else dropped.push(r.study); });
    if (S.length < 1) { $('#pr-results').innerHTML = '<div class="err">No hay estudios analizables (revise casos y denominador).</div>'; return; }
    const pool = poolProp(S.map(s => s.x), S.map(s => s.n), tr, { method, test }), fit = pool.fit, sc = unit, nhOf = ss => ss.length / sum(ss.map(s => 1 / s.n));
    const bk = (y, ss) => backTr(tr, y, nhOf(ss)) * sc;
    const ci1 = s => { const [a, b] = rate ? byar(s.x, s.n) : wilson(s.x, s.n); return [a * sc, b * sc]; };
    const row = (s, w) => { const [lo, hi] = ci1(s); return { label: s.study, cells: [String(s.x), String(s.n)], w: w == null ? '' : `${(w * 100).toFixed(1)}%`, wf: w || 0, est: s.x / s.n * sc, lo, hi, rob: s.rob }; };
    const pr = (f, ss, label, pi) => ({ label, cells: [String(sum(ss.map(s => s.x))), String(Math.round(sum(ss.map(s => s.n)) * 100) / 100)], w: '100.0%', est: bk(f.est, ss), lo: bk(f.ci[0], ss), hi: bk(f.ci[1], ss) });
    const het = f => (f.k > 1 ? `Heterogeneity: Tau² = ${f.tau2.toFixed(3)}; Chi² = ${f.QE.toFixed(2)}, df = ${f.k - 1} (P ${f.QEp < 0.00001 ? '< 0.00001' : '= ' + f.QEp.toFixed(3)}); I² = ${Math.max(0, 100 * (f.QE - (f.k - 1)) / f.QE).toFixed(0)}%` : 'Heterogeneity: not applicable');
    const subvar = $('#pr-subvar').value, regvar = $('#pr-regvar').value, subRes = subvar ? subgroupAnalysis(S, subvar, method, test) : null, regRes = regvar ? regAnalysis(S, regvar, 'auto', method, test) : null;
    const measure = rate ? `Incidence rate (per ${unit})` : 'Prevalence (%)', title = $('#pr-outcome').value;
    const common = { cols: [{ group: '', head: 'Cases' }, { group: '', head: rate ? 'Person-time' : 'Total' }], log: false, measure, model: `${method}, 95% CI`, leftLabel: '', rightLabel: '', fs: 12, rob: S.some(s => s.rob), estDec: rate ? 2 : 1, noRef: true, xlim: [0, Math.max(...S.map(s => ci1(s)[1]), bk(fit.ci[1], S)) * 1.08] };
    const groups = subRes?.fits ? subRes.fits.map(x => { const ss = x.ix.map(i => S[i]); return { label: x.na ? 'Not reported' : x.sg, rows: ss.map((s, j) => row(s, x.f.weights[j])), sub: pr(x.f, ss, 'Subtotal (95% CI)'), lines: [het(x.f)] }; }) : [{ label: '', rows: S.map((s, i) => row(s, fit.weights[i])) }];
    const t = subRes?.test, overall = { ...pr(fit, S, 'Total (95% CI)'), lines: [het(fit)] };
    const svg = forestRM({ ...common, title, groups, overall, interaction: t ? `Test for subgroup differences: Chi² = ${t.Q.toFixed(2)}, df = ${t.df} (P ${t.p < 0.00001 ? '< 0.00001' : '= ' + t.p.toFixed(3)})` : '' });
    const I2q = pool.I2q, f = v => v.toFixed(rate ? 2 : 1), piTxt = pool.pi ? `${f(pool.pi[0] * sc)} a ${f(pool.pi[1] * sc)}` : '–';
    let h = `<div class="card"><h2>Resultados — ${esc(title)}</h2>${dropped.length ? `<div class="warn">Excluidos: ${esc(dropped.join('; '))}</div>` : ''}
      <div class="kpis"><div class="kpi"><span>Estudios</span><b>${fit.k}</b></div><div class="kpi"><span>${esc(measure)} (IC 95 %)</span><b>${f(pool.est * sc)} (${f(pool.lo * sc)} a ${f(pool.hi * sc)})</b></div><div class="kpi"><span>Heterogeneidad</span><b>I² ${I2q.toFixed(0)}% · τ² ${fit.tau2.toFixed(3)}</b></div><div class="kpi"><span>Intervalo de predicción 95 %</span><b>${piTxt}</b></div></div>${svg}
      <p class="muted">Transformación: ${esc(PROP_TR[tr] || RATE_TR[tr])}; modelo de efectos aleatorios (${method}); IC ${test === 'z' ? 'de Wald' : 'Knapp-Hartung'}; IC de cada estudio: ${rate ? 'Byar' : 'Wilson'}. ${tr === 'PFT' ? 'Retrotransformación de Miller con la media armónica de los tamaños. ' : ''}Para desenlaces muy raros o cercanos a 0 o 100 % prefiera logit o doble arcoseno; la proporción cruda no está acotada. La valoración GRADE de revisiones de prevalencia/incidencia no está incluida en esta versión.</p></div>`;
    if (subRes || regRes) {
      h += '<div class="card"><h2>Subgrupos y meta-regresión</h2>';
      if (subRes?.err) h += `<div class="warn">${esc(subRes.err)}</div>`;
      else if (subRes) h += `<table class="data"><thead><tr><th>Subgrupo (${esc(subRes.col)})</th><th>Estudios</th><th>${esc(measure)}</th><th>I²</th></tr></thead><tbody>${subRes.fits.map(x => { const ss = x.ix.map(i => S[i]); return `<tr><td>${esc(x.sg)}</td><td>${x.f.k}</td><td>${f(bk(x.f.est, ss))} (${f(bk(x.f.ci[0], ss))} a ${f(bk(x.f.ci[1], ss))})</td><td>${isFinite(x.f.I2) ? x.f.I2.toFixed(0) + '%' : '–'}</td></tr>`; }).join('')}</tbody></table><p><b>p de interacción = ${t ? fp(t.p) : '—'}</b> (Q = ${t ? t.Q.toFixed(2) : '–'}, gl = ${t ? t.df : '–'}).</p>`;
      if (regRes?.err) h += `<div class="warn">${esc(regRes.err)}</div>`;
      else if (regRes) { const { m, dm, isNum } = regRes; h += `<h3>Meta-regresión — «${esc(regRes.col)}» (coeficientes en la escala transformada: ${esc(PROP_TR[tr] || RATE_TR[tr])})</h3><table class="data"><thead><tr><th>Término</th><th>β (IC 95 %)</th><th>p</th></tr></thead><tbody>${dm.terms.map((tm, i) => `<tr><td>${esc(tm)}</td><td>${m.beta[i].toFixed(3)} (${m.ci[i][0].toFixed(3)} a ${m.ci[i][1].toFixed(3)})</td><td>${fp(m.pval[i])}</td></tr>`).join('')}</tbody></table><p><b>${m.test === 'z' ? 'QM' : 'F'} = ${m.QM.toFixed(2)}, p = ${fp(m.QMp)}</b> · τ² residual ${m.tau2.toFixed(3)} · R² ${m.R2.toFixed(0)}%${m.k < 10 ? ' · <b>menos de 10 estudios: exploratorio</b>' : ''}</p>`;
        if (isNum) { const wt = m.idx.map(j => 1 / (S[j].vi + m.tau2)), sw = sum(wt), z = (m.ci[0][1] - m.beta[0]) / m.se[0];
          h += bubbleSVG({ pts: m.idx.map((j, q) => ({ x: parseFloat(String(regRes.vals[j]).replace(',', '.')), y: S[j].x / S[j].n * sc, w: wt[q] / sw, label: S[j].study })), log: false, xlabel: regRes.col, ylabel: measure, title: `Meta-regression: ${measure} vs ${regRes.col}`,
            pred: x => { const xc = x - dm.mean, e = m.beta[0] + m.beta[1] * xc, v = m.vb[0][0] + 2 * m.vb[0][1] * xc + m.vb[1][1] * xc * xc, d = z * Math.sqrt(Math.max(v, 0)); return { est: backTr(tr, e, pool.nh) * sc, lo: backTr(tr, e - d, pool.nh) * sc, hi: backTr(tr, e + d, pool.nh) * sc }; } }); } }
      h += '</div>';
    }
    $('#pr-results').innerHTML = h; autoFig($('#pr-results'), title.replace(/\W+/g, '_'));
  }

  // ======================= DTA (beta) =======================
  const dtaRows = () => { const all = normalize(state.raw, state.map), by = new Map(); all.forEach(r => { if ([r.tp, r.fp, r.fn, r.tn].every(isFinite)) { const a = state.map.outcome ? r.outcome : 'Index test'; if (!by.has(a)) by.set(a, []); by.get(a).push({ study: r.study || '?', tp: r.tp, fp: r.fp, fn: r.fn, tn: r.tn, rob: r.rob, indirect: r.indirect, raw: r }); } }); return by; };
  const scen = () => { const k = $('#dt-scen').value; if (k !== 'custom') return { prev: +k / 100, thr: SCEN[k] }; return { prev: +$('#dt-prev').value / 100, thr: { fnA: +$('#dt-fna').value, fnU: +$('#dt-fnu').value, fpA: +$('#dt-fpa').value, fpU: +$('#dt-fpu').value } }; };
  const syncScen = () => { const k = $('#dt-scen').value, c = k === 'custom'; ['dt-prev', 'dt-fna', 'dt-fnu', 'dt-fpa', 'dt-fpu'].forEach(id => ($(`#${id}`).disabled = !c)); if (!c) { $('#dt-prev').value = k; const t = SCEN[k]; $('#dt-fna').value = t.fnA; $('#dt-fnu').value = t.fnU; $('#dt-fpa').value = t.fpA; $('#dt-fpu').value = t.fpU; } };
  function setupDta() { syncScen(); $('#dt-results').innerHTML = ''; state.dtaOv = state.dtaOv || {}; }
  const ovOf = (a, k) => (state.dtaOv[`${a}|${k}`] ||= {});
  const certOf = (a, k, d) => dtaCertainty(d.dom, ovOf(a, k));
  const itemOf = (a, G, ctx) => ({ type: 'dta', outcome: a, k: ctx.k, n: ctx.n, prev: G.prev, thr: G.thr, restricted: G.restricted, ...Object.fromEntries(['se', 'sp'].map(k => { const d = G[k], ov = ovOf(a, k), c = certOf(a, k, d); return [k, { est: d.est, ci: d.ci, k: d.k, n: d.n, f: d.f, fLo: d.fLo, fHi: d.fHi, zone: d.zone, c, text: dtaText(c, d.zone), dom: Object.fromEntries(DOMS.map(([m]) => [m, (ov[m] ?? d.dom[m])])), notes: DOMS.filter(([m]) => (ov[m] ?? d.dom[m]) > 0).map(([m, l]) => `${l} (−${ov[m] ?? d.dom[m]}): ${ov[`${m}_why`] || d.why[m]}`) }]; })) });
  function runDta() {
    const by = dtaRows(); if (!by.size) { $('#dt-results').innerHTML = '<div class="err">No hay filas con TP, FP, FN y TN numéricos.</div>'; return; }
    const tr = $('#dt-tr').value, method = $('#dt-method').value, test = $('#dt-test').value, { prev, thr } = scen(), useRestricted = $('#dt-restr').checked, biv = $('#dt-biv').checked;
    state.dtaRes = []; let html = `<div class="card"><h2>Exactitud diagnóstica — resultados <span class="pill">BETA</span></h2><p class="muted">Prevalencia ${(prev * 100).toFixed(0)} %; umbrales de decisión por 100 evaluados: falsos negativos aceptable ≤${thr.fnA}, inaceptable ≥${thr.fnU}; falsos positivos aceptable ≤${thr.fpA}, inaceptable ≥${thr.fpU}. La valoración GRADE para DTA es una <b>sugerencia en fase beta</b>: revise cada dominio.</p></div>`;
    for (const [a, S] of by) {
      const G = gradeDTA(S, { prev, thr, tr, method, test, useRestricted }), k = S.length, n = sum(S.map(s => s.tp + s.fn + s.fp + s.tn)), U = G.restricted ? G.lowRes : G.full, Bv = biv ? bivariate(S) : null;
      const ctx = { k, n }; state.dtaRes.push({ a, G, ctx });
      const fig = (key, name) => { const cs = key === 'se' ? [['TP', 'tp'], ['FN', 'fn']] : [['TN', 'tn'], ['FP', 'fp']], P = G.full[key], fit = P.fit, den = s => (key === 'se' ? s.tp + s.fn : s.tn + s.fp), num = s => (key === 'se' ? s.tp : s.tn);
        const rows = P.idx.map((i, j) => { const s = S[i], [lo, hi] = wilson(num(s), den(s)); return { label: s.study, cells: cs.map(([, f]) => String(s[f])), w: `${(fit.weights[j] * 100).toFixed(1)}%`, wf: fit.weights[j], est: num(s) / den(s), lo, hi, rob: s.rob }; });
        const sub = { label: 'Total (random effects)', cells: [String(sum(S.map(s => s[cs[0][1]]))), String(sum(S.map(s => s[cs[1][1]])))], w: '100.0%', est: P.est, lo: P.lo, hi: P.hi };
        return forestRM({ title: `${a} — ${name}`, groups: [{ label: '', rows }], overall: { ...sub, lines: [`Heterogeneity: Tau² = ${fit.tau2.toFixed(3)}; Chi² = ${fit.QE.toFixed(2)}, df = ${fit.k - 1}; I² = ${P.I2q.toFixed(0)}%`] }, cols: cs.map(([h]) => ({ group: '', head: h })), log: false, measure: name, model: 'Random, 95% CI', leftLabel: '', rightLabel: '', fs: 12, rob: S.some(s => s.rob), noRef: true, xlim: [0, 1] }); };
      const sroc = srocSVG({ pts: S.map(s => ({ se: s.tp / (s.tp + s.fn), sp: s.tn / (s.tn + s.fp), n: s.tp + s.fn + s.fp + s.tn, label: s.study })), summary: { se: [U.se.est, U.se.lo, U.se.hi], sp: [U.sp.est, U.sp.lo, U.sp.hi] }, title: `${a} — SROC` });
      const L = (P) => `${f2(P.est)} (${f2(P.lo)}–${f2(P.hi)})`, tbl = `<table class="data"><thead><tr><th>Modelo</th><th>Estudios</th><th>Sensibilidad (IC 95 %)</th><th>I² Se</th><th>Especificidad (IC 95 %)</th><th>I² Sp</th></tr></thead><tbody>
        <tr><td>Univariado (todos)</td><td>${k}</td><td>${L(G.full.se)}</td><td>${G.full.se.I2q.toFixed(0)}%</td><td>${L(G.full.sp)}</td><td>${G.full.sp.I2q.toFixed(0)}%</td></tr>
        ${G.lowRes ? `<tr><td>Univariado, solo riesgo de sesgo bajo/aceptable${G.restricted ? ' <b>(usado en GRADE)</b>' : ''}</td><td>${G.lowRes.se.fit.k}</td><td>${L(G.lowRes.se)}</td><td>${G.lowRes.se.I2q.toFixed(0)}%</td><td>${L(G.lowRes.sp)}</td><td>${G.lowRes.sp.I2q.toFixed(0)}%</td></tr>` : ''}
        ${Bv ? `<tr><td>Bivariado (Reitsma, ML)</td><td>${Bv.k}</td><td>${f2(Bv.se)} (${f2(Bv.seCI[0])}–${f2(Bv.seCI[1])})</td><td colspan="2">τ logit: ${Bv.tau.map(v => v.toFixed(2)).join(' / ')}; ρ = ${f2(Bv.rho)}</td><td>${f2(Bv.sp)} (${f2(Bv.spCI[0])}–${f2(Bv.spCI[1])})</td></tr>` : ''}</tbody></table>`;
      const gr = key => { const d = G[key], ov = ovOf(a, key), c = certOf(a, key, d), lab = key === 'se' ? 'Sensitivity' : 'Specificity', fl = key === 'se' ? 'FN' : 'FP';
        return `<tr data-a="${esc(a)}" data-k="${key}"><th>${lab}<br><small>${fl} per 100: ${pct(d.f, 1)} (${pct(d.fLo, 1)}–${pct(d.fHi, 1)}) · ${ZONE_TXT[d.zone]}</small></th>${DOMS.map(([m]) => `<td><select data-m="${m}">${[0, 1, 2].map(v => `<option value="${v}" ${(ov[m] ?? d.dom[m]) === v ? 'selected' : ''}>${SEV[v]}</option>`).join('')}</select><small class="muted">${esc(d.why[m])}</small></td>`).join('')}<td class="fin">${certCell(a, key, d)}</td></tr>`; };
      html += `<div class="card"><h2>${esc(a)}</h2><p class="muted">${k} estudios · ${n} participantes${G.restricted ? ' · se usa la estimación restringida a estudios con riesgo de sesgo bajo/aceptable' : ''}</p>${tbl}${fig('se', 'Sensitivity')}${fig('sp', 'Specificity')}${sroc}
        <h3>Valoración GRADE para DTA <span class="pill">BETA</span></h3><div class="tablewrap"><table class="grade-table dta-grade"><thead><tr><th>Resultado</th>${DOMS.map(([, l]) => `<th>${l}</th>`).join('')}<th>Certeza</th></tr></thead><tbody>${gr('se')}${gr('sp')}</tbody></table></div></div>`;
    }
    html += `<div class="card"><h2>Tabla Summary of Findings (DTA) <span class="pill">BETA</span></h2><div id="dt-sof"></div><div class="row end gap"><button class="primary" id="dt-add">Añadir todas las pruebas a la tabla SoF</button></div></div>`;
    $('#dt-results').innerHTML = html; autoFig($('#dt-results'), 'dta');
    $('#dt-results').querySelectorAll('tr[data-k] select').forEach(sel => sel.addEventListener('change', () => { const tr_ = sel.closest('tr'), a = tr_.dataset.a, k = tr_.dataset.k; ovOf(a, k)[sel.dataset.m] = +sel.value; const r = state.dtaRes.find(x => x.a === a); tr_.querySelector('.fin').innerHTML = certCell(a, k, r.G[k]); drawSofDta(); }));
    $('#dt-add').addEventListener('click', () => { state.dtaRes.forEach(r => pushSoF(itemOf(r.a, r.G, r.ctx))); $('#dt-add').textContent = 'Añadido ✓'; setTimeout(() => $('#dt-add') && ($('#dt-add').textContent = 'Añadir todas las pruebas a la tabla SoF'), 1500); });
    drawSofDta();
  }
  const certCell = (a, key, d) => { const c = certOf(a, key, d), fill = fillFor(ZN[d.zone], c); return `<span class="badge" style="background:#${fill}">${SYM[c]} ${LEVELS[c]}</span><br><small>${esc(dtaText(c, d.zone))}</small>`; };
  const drawSofDta = () => { $('#dt-sof').innerHTML = sofDtaHTML(state.dtaRes.map(r => itemOf(r.a, r.G, r.ctx))); };

  // tabla SoF DTA (también se usa en la pestaña SoF)
  function sofDtaHTML(items) {
    if (!items.length) return '';
    const t0 = items[0], notes = [], L = n => { let i = notes.indexOf(n); if (i < 0) { notes.push(n); i = notes.length - 1; } return 'abcdefghijklmnopqrstuvwxyz'[i]; };
    const cell = (x, key) => { const fill = fillFor(ZN[x.zone], x.c), fl = key === 'se' ? 'FN' : 'FP', lt = x.notes.map(L).join(','); return `<td>${f2(x.est)} (${f2(x.ci[0])}–${f2(x.ci[1])})</td><td style="background:#${fill}" bgcolor="#${fill}">${pct(x.f, 0)} (${pct(x.fLo, 0)}–${pct(x.fHi, 0)})</td><td class="c cert" style="background:#${fill}" bgcolor="#${fill}">${SYM[x.c]}<br>${LEVELS[x.c]}${lt ? ` <sup>${lt}</sup>` : ''}</td>`; };
    return `<p class="muted">Prevalence ${(t0.prev * 100).toFixed(0)}%. Decision thresholds per 100 tested — false negatives: acceptable ≤${t0.thr.fnA}, unacceptable ≥${t0.thr.fnU}; false positives: acceptable ≤${t0.thr.fpA}, unacceptable ≥${t0.thr.fpU}. The colour of the false-negative/false-positive and certainty cells combines the position of the point estimate relative to these thresholds (green acceptable, yellow intermediate, red unacceptable) and the certainty of the evidence (paler = lower certainty; grey = very low).</p>
    <table class="sof"><thead><tr><th>Test / analysis</th><th>Studies (participants)</th><th>Sensitivity (95% CI)</th><th>False negatives per 100 tested</th><th>Certainty</th><th>Specificity (95% CI)</th><th>False positives per 100 tested</th><th>Certainty</th></tr></thead><tbody>${items.map(it => `<tr><td>${esc(it.outcome)}</td><td>${it.k} (${it.n})</td>${cell(it.se, 'se')}${cell(it.sp, 'sp')}</tr>`).join('')}</tbody></table>
    <div class="notes">${notes.map((n, i) => `<p>${'abcdefghijklmnopqrstuvwxyz'[i]}. ${esc(n)}</p>`).join('')}<p>Beta: GRADE for diagnostic test accuracy (Schünemann et al., J Clin Epidemiol 2020;122:129–152; Mustafa et al., 2024). Sensitivity and specificity pooled separately (${items.some(i => i.restricted) ? 'restricted to low or acceptable risk of bias where heterogeneity decreased; ' : ''}univariate random-effects). Publication bias was not downgraded.</p></div>`;
  }

  // ----- enlaces de la interfaz -----
  $('#pr-run').addEventListener('click', runPrev); $('#dt-run').addEventListener('click', runDta); $('#dt-scen').addEventListener('change', syncScen);
  return { setupPrev, setupDta, sofDtaHTML };
}
