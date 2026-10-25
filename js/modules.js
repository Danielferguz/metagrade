// Módulos de prevalencia / incidencia y de exactitud diagnóstica (DTA, beta). La interfaz se monta desde app.js con mountModules(env).
import { poolProp, propES, backTr, wilson, byar, PROP_TR, RATE_TR } from './prop.js?v=2026.10.25-6';
import { poolSeSp, bivariate, gradeDTA, dtaCertainty, dtaText, SCEN, fnPer100, fpPer100, prevFrom, autoThr, robSplit } from './dta.js?v=2026.10.25-6';
import { dtaPaired, dtaThreshold, dtaPeople } from './dtaplots.js?v=2026.10.25-6';
import { forestRM, srocSVG, bubbleSVG } from './plots.js?v=2026.10.25-6';
import { rma, subgroupTest } from './pairwise.js?v=2026.10.25-6';
import { LEVELS, SYM } from './grade.js?v=2026.10.25-6';
import { normalize } from './io.js?v=2026.10.25-6';
import { sum } from './stats.js?v=2026.10.25-6';

const ZN = { ok: 'benefit', mid: 'nodiff', bad: 'harm' };
export const ZONE_TXT = { ok: 'Within acceptable range', mid: 'Between acceptable and unacceptable', bad: 'Beyond unacceptable threshold' };
const WARN = '<div style="border-left:4px solid #C0392B;background:#FDF0EE;padding:8px 12px;border-radius:6px;margin:8px 0"><b>⚠ Fase beta.</b> La valoración GRADE para pruebas diagnósticas aún no está plenamente desarrollada: la guía sigue evolucionando y las decisiones podrían ser diferentes en el futuro. Valide los juicios y umbrales con su panel antes de publicar.</div>';
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
  const SRC = { median: 'mediana de los estudios incluidos', lo: 'IC 95 % inferior de la prevalencia combinada', hi: 'IC 95 % superior de la prevalencia combinada', custom: 'valor personalizado' };
  const isPre = k => !!SCEN[k];
  const scen = S => { const k = $('#dt-scen').value; if (isPre(k)) return { prev: +k / 100, thr: SCEN[k], src: `escenario de referencia ${k} %` };
    const prev = k === 'custom' ? +$('#dt-prev').value / 100 : prevFrom(S, k);
    return { prev, thr: $('#dt-auto').checked ? autoThr(prev) : { fnA: +$('#dt-fna').value, fnU: +$('#dt-fnu').value, fpA: +$('#dt-fpa').value, fpU: +$('#dt-fpu').value }, src: SRC[k] }; };
  // el selector fija los valores por defecto; la casilla «calcular umbrales» y los campos se habilitan según el caso
  const syncScen = (fromSelect) => { const k = $('#dt-scen').value, pre = isPre(k); if (fromSelect) $('#dt-auto').checked = k === 'median' || k === 'lo' || k === 'hi';
    $('#dt-auto').disabled = pre; $('#dt-prev').disabled = k !== 'custom'; ['dt-fna', 'dt-fnu', 'dt-fpa', 'dt-fpu'].forEach(id => ($(`#${id}`).disabled = pre || $('#dt-auto').checked));
    if (pre) { $('#dt-prev').value = k; const t = SCEN[k]; $('#dt-fna').value = t.fnA; $('#dt-fnu').value = t.fnU; $('#dt-fpa').value = t.fpA; $('#dt-fpu').value = t.fpU; } };
  function setupDta() { syncScen(false); $('#dt-results').innerHTML = ''; state.dtaOv = state.dtaOv || {}; }
  const ovOf = (a, k) => (state.dtaOv[`${a}|${k}`] ||= {});
  const certOf = (a, k, d) => dtaCertainty(d.dom, ovOf(a, k));
  const itemOf = (a, G, ctx) => ({ type: 'dta', outcome: a, k: ctx.k, n: ctx.n, prev: G.prev, thr: G.thr, restricted: G.restricted, ...Object.fromEntries(['se', 'sp'].map(k => { const d = G[k], ov = ovOf(a, k), c = certOf(a, k, d); return [k, { est: d.est, ci: d.ci, k: d.k, n: d.n, f: d.f, fLo: d.fLo, fHi: d.fHi, zone: d.zone, c, text: dtaText(c, d.zone), dom: Object.fromEntries(DOMS.map(([m]) => [m, (ov[m] ?? d.dom[m])])), notes: DOMS.filter(([m]) => (ov[m] ?? d.dom[m]) > 0).map(([m, l]) => `${l} (−${ov[m] ?? d.dom[m]}): ${ov[`${m}_why`] || d.why[m]}`) }]; })) });
  function runDta() {
    const by = dtaRows(); if (!by.size) { $('#dt-results').innerHTML = '<div class="err">No hay filas con TP, FP, FN y TN numéricos.</div>'; return; }
    const tr = $('#dt-tr').value, method = $('#dt-method').value, test = $('#dt-test').value, useRestricted = $('#dt-restr').checked, biv = $('#dt-biv').checked, wantSub = $('#dt-sub').checked;
    const texts = { tp: $('#dt-c-tp').value, fn: $('#dt-c-fn').value, fp: $('#dt-c-fp').value, tn: $('#dt-c-tn').value };
    state.dtaRes = []; let html = `<div class="card"><h2>Exactitud diagnóstica — resultados <span class="pill">BETA</span></h2>${WARN}</div>`;
    const het = P => `Heterogeneity: χ²=${P.fit.QE.toFixed(2)}, df=${P.fit.k - 1}, I²=${P.I2q.toFixed(0)}%`;
    const pairRows = (SS, rS, rP) => { const wS = new Map(rS.idx.map((i, j) => [i, rS.fit.weights[j]])), wP = new Map(rP.idx.map((i, j) => [i, rP.fit.weights[j]]));
      return SS.map((s, i) => { const [a1, b1] = wilson(s.tp, s.tp + s.fn), [c1, d1] = wilson(s.tn, s.tn + s.fp); return { label: s.study, tp: s.tp, fn: s.fn, fp: s.fp, tn: s.tn, se: [s.tp / (s.tp + s.fn), a1, b1], sp: [s.tn / (s.tn + s.fp), c1, d1], wse: wS.get(i) ?? 0, wsp: wP.get(i) ?? 0, rob: s.rob }; }); };
    const subOf = (SS, R, label) => ({ label, tp: sum(SS.map(s => s.tp)), fn: sum(SS.map(s => s.fn)), fp: sum(SS.map(s => s.fp)), tn: sum(SS.map(s => s.tn)), se: [R.se.est, R.se.lo, R.se.hi], sp: [R.sp.est, R.sp.lo, R.sp.hi], het: [het(R.se), het(R.sp)] });
    const cnt = (prev, fn, fp) => { const nD = Math.round(prev * 100), nH = 100 - nD, f1 = Math.min(nD, Math.max(0, Math.round(fn))), f2_ = Math.min(nH, Math.max(0, Math.round(fp))); return { tp: nD - f1, fn: f1, fp: f2_, tn: nH - f2_ }; };
    for (const [a, S] of by) {
      const { prev, thr, src } = scen(S), G = gradeDTA(S, { prev, thr, tr, method, test, useRestricted }), k = S.length, n = sum(S.map(s => s.tp + s.fn + s.fp + s.tn)), U = G.restricted ? G.lowRes : G.full, Bv = biv ? bivariate(S) : null;
      const ctx = { k, n }; state.dtaRes.push({ a, G, ctx });
      const paired = dtaPaired({ title: `${a} — sensitivity and specificity`, groups: [{ label: '', rows: pairRows(S, G.full.se, G.full.sp) }], overall: subOf(S, G.full, 'Total (95% CI)'), rob: S.some(s => s.rob) });
      const sp = wantSub ? robSplit(S, { tr, method, test }) : null;
      const subFig = sp ? dtaPaired({ title: `${a} — by risk of bias`, groups: sp.groups.map(g => ({ label: g.label, rows: pairRows(g.S, g.res.se, g.res.sp), sub: subOf(g.S, g.res, 'Subtotal (95% CI)') })), overall: subOf(S, G.full, 'Total (95% CI)'), rob: true }) : '';
      const pv = t => (t ? `χ² = ${t.Q.toFixed(2)}, gl = ${t.df}, p ${t.p < 0.001 ? '< 0,001' : '= ' + t.p.toFixed(3).replace('.', ',')}` : 'no estimable');
      const sroc = srocSVG({ pts: S.map(s => ({ se: s.tp / (s.tp + s.fn), sp: s.tn / (s.tn + s.fp), n: s.tp + s.fn + s.fp + s.tn, label: s.study })), summary: { se: [U.se.est, U.se.lo, U.se.hi], sp: [U.sp.est, U.sp.lo, U.sp.hi] }, title: `${a} — SROC` });
      const thrFig = dtaThreshold({ items: [{ title: 'False negatives per 100 tested (from sensitivity)', est: G.se.f, lo: G.se.fLo, hi: G.se.fHi, a: thr.fnA, u: thr.fnU }, { title: 'False positives per 100 tested (from specificity)', est: G.sp.f, lo: G.sp.fLo, hi: G.sp.fHi, a: thr.fpA, u: thr.fpU }] });
      const nD = Math.round(prev * 100), peopleFig = dtaPeople({ scenarios: [
        { title: 'Acceptable limit', sub: `Up to ${thr.fnA} missed and ${thr.fpA} false alarm${thr.fpA === 1 ? '' : 's'}: still judged accurate`, c: cnt(prev, thr.fnA, thr.fpA) },
        { title: 'Unacceptable limit', sub: `From ${thr.fnU} missed or ${thr.fpU} false alarms: judged inaccurate`, c: cnt(prev, thr.fnU, thr.fpU) },
        { title: 'This test (pooled)', sub: `Prevalence ${(prev * 100).toFixed(0)} %: ${nD} of 100 have the condition`, c: cnt(prev, G.se.f, G.sp.f) }], texts });
      const L = (P) => `${f2(P.est)} (${f2(P.lo)}–${f2(P.hi)})`, tbl = `<table class="data"><thead><tr><th>Modelo</th><th>Estudios</th><th>Sensibilidad (IC 95 %)</th><th>I² Se</th><th>Especificidad (IC 95 %)</th><th>I² Sp</th></tr></thead><tbody>
        <tr><td>Univariado (todos)</td><td>${k}</td><td>${L(G.full.se)}</td><td>${G.full.se.I2q.toFixed(0)}%</td><td>${L(G.full.sp)}</td><td>${G.full.sp.I2q.toFixed(0)}%</td></tr>
        ${sp ? sp.groups.map(g => `<tr><td>Subgrupo: ${g.label}</td><td>${g.S.length}</td><td>${L(g.res.se)}</td><td>${g.res.se.I2q.toFixed(0)}%</td><td>${L(g.res.sp)}</td><td>${g.res.sp.I2q.toFixed(0)}%</td></tr>`).join('') : ''}
        ${G.lowRes && !sp ? `<tr><td>Univariado, solo riesgo de sesgo bajo/aceptable${G.restricted ? ' <b>(usado en GRADE)</b>' : ''}</td><td>${G.lowRes.se.fit.k}</td><td>${L(G.lowRes.se)}</td><td>${G.lowRes.se.I2q.toFixed(0)}%</td><td>${L(G.lowRes.sp)}</td><td>${G.lowRes.sp.I2q.toFixed(0)}%</td></tr>` : ''}
        ${Bv ? `<tr><td>Bivariado (Reitsma, ML)</td><td>${Bv.k}</td><td>${f2(Bv.se)} (${f2(Bv.seCI[0])}–${f2(Bv.seCI[1])})</td><td colspan="2">τ logit: ${Bv.tau.map(v => v.toFixed(2)).join(' / ')}; ρ = ${f2(Bv.rho)}</td><td>${f2(Bv.sp)} (${f2(Bv.spCI[0])}–${f2(Bv.spCI[1])})</td></tr>` : ''}</tbody></table>
        ${sp ? `<p class="muted">Prueba de diferencia entre subgrupos de riesgo de sesgo — sensibilidad: ${pv(sp.test.se)}; especificidad: ${pv(sp.test.sp)}.${G.restricted ? ' En GRADE se usa la estimación restringida a riesgo de sesgo bajo/aceptable (la heterogeneidad bajó ≥ 15 puntos).' : ''}</p>` : ''}`;
      const gr = key => { const d = G[key], ov = ovOf(a, key), c = certOf(a, key, d), lab = key === 'se' ? 'Sensitivity' : 'Specificity', fl = key === 'se' ? 'FN' : 'FP';
        return `<tr data-a="${esc(a)}" data-k="${key}"><th>${lab}<br><small>${fl} per 100: ${pct(d.f, 1)} (${pct(d.fLo, 1)}–${pct(d.fHi, 1)}) · ${ZONE_TXT[d.zone]}</small></th>${DOMS.map(([m]) => `<td><select data-m="${m}">${[0, 1, 2].map(v => `<option value="${v}" ${(ov[m] ?? d.dom[m]) === v ? 'selected' : ''}>${SEV[v]}</option>`).join('')}</select><small class="muted">${esc(d.why[m])}</small></td>`).join('')}<td class="fin">${certCell(a, key, d)}</td></tr>`; };
      html += `<div class="card"><h2>${esc(a)}</h2><p class="muted">${k} estudios · ${n} participantes${G.restricted ? ' · se usa la estimación restringida a estudios con riesgo de sesgo bajo/aceptable' : ''}. Prevalencia ${(prev * 100).toFixed(1)} % (${esc(src)}); umbrales por 100 evaluados — falsos negativos: aceptable ≤${thr.fnA}, inaceptable ≥${thr.fnU}; falsos positivos: aceptable ≤${thr.fpA}, inaceptable ≥${thr.fpU}.</p>${tbl}
        <h3>Sensibilidad y especificidad</h3>${paired}${subFig ? `<h3>Por riesgo de sesgo</h3>${subFig}` : ''}<h3>Curva SROC</h3>${sroc}
        <h3>¿Cruza el intervalo de confianza los umbrales de decisión?</h3><p class="muted">La imprecisión se juzga comparando el IC 95 % de los falsos negativos y positivos por 100 evaluados con los umbrales: si el IC cruza un umbral se rebaja certeza (GRADE guidance 37).</p>${thrFig}
        <h3>¿Por qué estos umbrales? Qué pasaría con 100 personas</h3><p class="muted">Los umbrales no son cortes estadísticos: salen de las consecuencias para las personas. Con una prevalencia de ${(prev * 100).toFixed(0)} %, de cada 100 personas evaluadas ${nD} tienen la enfermedad y ${100 - nD} no. Un <b>falso negativo</b> deja a una persona enferma sin tratamiento (retraso o progresión); un <b>falso positivo</b> lleva a pruebas adicionales, ansiedad o tratamiento innecesario. Cuanto más graves son esas consecuencias, más bajo debe ser el número de errores aceptable. Compare el límite aceptable, el inaceptable y el resultado de esta prueba:</p>${peopleFig}
        <h3>Valoración GRADE para DTA <span class="pill">BETA</span></h3>${WARN}<div class="tablewrap"><table class="grade-table dta-grade"><thead><tr><th>Resultado</th>${DOMS.map(([, l]) => `<th>${l}</th>`).join('')}<th>Certeza</th></tr></thead><tbody>${gr('se')}${gr('sp')}</tbody></table></div></div>`;
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
    const notes = [], L = n => { let i = notes.indexOf(n); if (i < 0) { notes.push(n); i = notes.length - 1; } return 'abcdefghijklmnopqrstuvwxyz'[i]; };
    const cell = (x, key) => { const fill = fillFor(ZN[x.zone], x.c), fl = key === 'se' ? 'FN' : 'FP', lt = x.notes.map(L).join(','); return `<td>${f2(x.est)} (${f2(x.ci[0])}–${f2(x.ci[1])})</td><td style="background:#${fill}" bgcolor="#${fill}">${pct(x.f, 0)} (${pct(x.fLo, 0)}–${pct(x.fHi, 0)})</td><td class="c cert" style="background:#${fill}" bgcolor="#${fill}">${SYM[x.c]}<br>${LEVELS[x.c]}${lt ? ` <sup>${lt}</sup>` : ''}</td>`; };
    return `<p class="muted"><b>Warning (beta):</b> GRADE for diagnostic test accuracy is not yet fully developed; future guidance may lead to different decisions. Decision thresholds (per 100 tested) depend on the prevalence and the consequences of false results; they are listed under each test. The colour of the false-negative/false-positive and certainty cells combines the position of the point estimate relative to these thresholds (green acceptable, yellow intermediate, red unacceptable) and the certainty of the evidence (paler = lower certainty; grey = very low).</p>
    <table class="sof"><thead><tr><th>Test / analysis</th><th>Studies (participants)</th><th>Sensitivity (95% CI)</th><th>False negatives per 100 tested</th><th>Certainty</th><th>Specificity (95% CI)</th><th>False positives per 100 tested</th><th>Certainty</th></tr></thead><tbody>${items.map(it => `<tr><td>${esc(it.outcome)}<br><small class="muted">Prevalence ${(it.prev * 100).toFixed(0)}%; FN ≤${it.thr.fnA} / ≥${it.thr.fnU}; FP ≤${it.thr.fpA} / ≥${it.thr.fpU}</small></td><td>${it.k} (${it.n})</td>${cell(it.se, 'se')}${cell(it.sp, 'sp')}</tr>`).join('')}</tbody></table>
    <div class="notes">${notes.map((n, i) => `<p>${'abcdefghijklmnopqrstuvwxyz'[i]}. ${esc(n)}</p>`).join('')}<p>Beta: GRADE for diagnostic test accuracy (Schünemann et al., J Clin Epidemiol 2020;122:129–152; Mustafa et al., 2024). Sensitivity and specificity pooled separately (${items.some(i => i.restricted) ? 'restricted to low or acceptable risk of bias where heterogeneity decreased; ' : ''}univariate random-effects). Publication bias was not downgraded.</p></div>`;
  }

  // ----- enlaces de la interfaz -----
  $('#pr-run').addEventListener('click', runPrev); $('#dt-run').addEventListener('click', runDta); $('#dt-scen').addEventListener('change', () => syncScen(true)); $('#dt-auto').addEventListener('change', () => syncScen(false));
  return { setupPrev, setupDta, sofDtaHTML };
}
