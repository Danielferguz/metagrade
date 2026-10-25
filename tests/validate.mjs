// node tests/validate.mjs — compara los motores JS con valores de referencia de implementaciones validadas
// (port de metafor y motor NMA en Python equivalente a netmeta) y con ejemplos publicados de GRADE 33.
import fs from 'fs';
import { escalc, rma, egger, metaReg, designMatrix, subgroupTest } from '../js/pairwise.js';
import { NMA } from '../js/nma.js';
import { oisBinary, effectiveN } from '../js/grade.js';
import { parseCSV } from '../js/io.js';
import { forestRM } from '../js/plots.js';
import { MIDS, midValues } from '../js/mids.js';
import { poolSeSp, bivariate, gradeDTA, dtaCertainty, SCEN, prevFrom, autoThr, robSplit } from '../js/dta.js';
import { dtaPaired, dtaThreshold, dtaPeople } from '../js/dtaplots.js';
import { poolProp, wilson } from '../js/prop.js';
const ref = JSON.parse(fs.readFileSync(new URL('./reference.json', import.meta.url)));
let fails = 0; const ok = (name, a, b, tol = 1e-6) => { const good = Math.abs(a - b) <= tol; if (!good) fails++; console.log(`${good ? 'OK  ' : 'FAIL'} ${name}: ${a} vs ${b}`); };
const rd = f => parseCSV(fs.readFileSync(new URL('../examples/' + f, import.meta.url), 'utf8'));
const pw = rd('pairwise_binary.csv').filter(r => r.outcome === 'All-cause mortality').map(r => escalc({ e1: +r.events_int, n1: +r.n_int, e2: +r.events_comp, n2: +r.n_comp }, 'RR'));
for (const [k, [method, test]] of Object.entries({ pw_REMLz: ['REML', 'z'], pw_DLz: ['DL', 'z'], pw_REMLadhoc: ['REML', 'adhoc'] })) {
  const m = rma(pw.map(e => e.yi), pw.map(e => e.vi), { method, test });
  ok(k + ' est', m.est, ref[k].est); ok(k + ' lo', m.ci[0], ref[k].lo); ok(k + ' hi', m.ci[1], ref[k].hi); ok(k + ' tau2', m.tau2, ref[k].tau2); ok(k + ' I2', m.I2, ref[k].I2, 1e-4);
}
const st = {}; for (const r of rd('nma_binary.csv').filter(r => !r.outcome || r.outcome === 'Response')) (st[r.study] = st[r.study] || []).push({ t: r.treatment, r: +r.responders, n: +r.n });
const m = new NMA(st, 'binary', 'Placebo');
ok('nma tau2', m.tau2, ref.nma.tau2, 1e-5); ok('nma Q', m.Q, ref.nma.Q, 1e-5); ok('nma p_inc', m.designDecomp().p_inc, ref.nma.p_inc, 1e-5);
for (const [t, [e, s]] of Object.entries(ref.nma.est)) { const [je, js] = m.est(t, 'Placebo'); ok('nma logOR ' + t, je, e, 1e-5); ok('nma SE ' + t, js, s, 1e-5); }
// Egger (regresión clásica) frente a scipy.stats.linregress con los datos de mortalidad
{ const e = egger(pw.map(x => x.yi), pw.map(x => x.vi)); ok('Egger intercept', e.intercept, 0.5358192057792281, 1e-10); ok('Egger SE', e.se, 1.4645083064645714, 1e-10); ok('Egger p', e.p, 0.7239480217147546, 1e-8); }
// GRADE 33 (Brignardello-Petersen 2021): caries APF vs NaF, RR 0.67 (0.45-0.99), pc 0.77 -> ESS 62; OIS (RRR 25%) 184
ok('GRADE33 ESS', effectiveN('RR', Math.log(0.67), Math.log(0.45), Math.log(0.99), 0.77), 62, 0);
ok('GRADE33 OIS', oisBinary(0.77, 0.25), 184, 0);
// Meta-regresión (REML, Wald / Knapp-Hartung / ad hoc) frente a una referencia independiente en numpy/scipy (verosimilitud restringida + GLS)
{
  const R = JSON.parse(fs.readFileSync(new URL('./reference_reg.json', import.meta.url)));
  for (const [kind, dm] of [['num', designMatrix(R.x.map(String), 'num')], ['cat', designMatrix(R.g, 'cat')]]) {
    if (kind === 'cat') ok('designMatrix referencia = A', dm.ref === 'A' ? 1 : 0, 1, 0);
    for (const test of ['z', 'knha', 'adhoc']) {
      const r = R[kind + '_' + test], m = metaReg(R.y, R.v, dm.X, { method: 'REML', test }), tag = `reg ${kind} ${test}`;
      ok(tag + ' tau2', m.tau2, r.tau2, 1e-6); r.beta.forEach((b, i) => { ok(`${tag} b${i}`, m.beta[i], b, 1e-6); ok(`${tag} se${i}`, m.se[i], r.se[i], 1e-6); ok(`${tag} p${i}`, m.pval[i], r.p[i], 1e-6); });
      ok(tag + ' QM', m.QM, r.QM, 1e-5); ok(tag + ' QMp', m.QMp, r.QMp, 1e-6); ok(tag + ' QE', m.QE, r.QE, 1e-6); ok(tag + ' QEp', m.QEp, r.QEp, 1e-8);
    }
  }
  // La meta-regresión con solo intercepto reproduce rma(); el contraste de 2 subgrupos con τ² común = meta-regresión categórica
  const m0 = metaReg(R.y, R.v, R.y.map(() => [1])), f0 = rma(R.y, R.v); ok('reg intercept-only = rma', m0.beta[0], f0.est, 1e-8); ok('reg intercept-only tau2', m0.tau2, f0.tau2, 1e-8);
  const g2 = [0, 1].map(j => R.g.map((g, i) => (g === 'A') === !j ? i : -1).filter(i => i >= 0).map(i => i));
  const fits = g2.map(ix => rma(ix.map(i => R.y[i]), ix.map(i => R.v[i]), { method: 'REML' })), st = subgroupTest(fits);
  const w = fits.map(f => 1 / f.se ** 2), mu = (w[0] * fits[0].est + w[1] * fits[1].est) / (w[0] + w[1]);
  ok('subgroupTest Q', st.Q, w[0] * (fits[0].est - mu) ** 2 + w[1] * (fits[1].est - mu) ** 2, 1e-9); ok('subgroupTest df', st.df, 1, 0);
}
// forest estilo RevMan: estructura de subtotales, pruebas y eje, sin NaN
{ const row = (label, est, lo, hi) => ({ label, cells: ['5', '100', '8', '100'], w: '25.0%', wf: 0.25, est, lo, hi, rob: 'Low' });
  const sub = { label: 'Subtotal (95% CI)', cells: ['10', '200', '16', '200'], w: '100.0%', est: 0.6, lo: 0.4, hi: 0.9 };
  const svg = forestRM({ groups: [{ label: 'Group 1', rows: [row('A', 0.5, 0.2, 1.2), row('B', 0.7, 0.4, 1.1)], sub, lines: ['Heterogeneity: Tau² = 0.00', 'Test for overall effect: Z = 2.5 (P = 0.01)'] }], overall: { ...sub, label: 'Total (95% CI)' }, cols: [{ group: 'Drug', head: 'Events' }, { group: 'Drug', head: 'Total' }, { group: 'Control', head: 'Events' }, { group: 'Control', head: 'Total' }], log: true, measure: 'Risk Ratio', model: 'IV, Random, 95% CI', leftLabel: 'Favours Drug', rightLabel: 'Favours Control', interaction: 'Test for subgroup differences: Chi² = 1.00', rob: true });
  ok('forestRM: subtotal, total, pruebas y riesgo de sesgo', ['Subtotal (95% CI)', 'Total (95% CI)', 'Test for subgroup differences', 'Risk of Bias', 'Favours Drug'].every(t => svg.includes(t)) && svg.includes('data-fs="12"') ? 1 : 0, 1, 0);
  ok('forestRM: sin NaN/undefined y 2 rombos (subtotal y total)', !/NaN|undefined|Infinity/.test(svg) && (svg.match(/<polygon /g) || []).length === 2 ? 1 : 0, 1, 0); }
// forest RevMan: dominios de riesgo de sesgo (A, B…) + global, y estudios no estimables
{ const r = (label, est, rob) => ({ label, cells: ['', '', '', ''], w: isFinite(est) ? '50.0%' : '', wf: 0.5, est, lo: est / 2, hi: est * 2, rob, robs: ['Low', 'High', 'Some concerns'] });
  const svg = forestRM({ groups: [{ label: '', rows: [r('Estudio 1', 0.8, 'High'), r('Cero 2', NaN, 'Low')] }], cols: [{ group: 'I', head: 'Events' }, { group: 'I', head: 'Total' }, { group: 'C', head: 'Events' }, { group: 'C', head: 'Total' }], log: true, measure: 'RR', model: 'IV', leftLabel: 'a', rightLabel: 'b', rob: true, robDoms: [{ head: 'A', name: 'Randomisation' }, { head: 'B', name: 'Deviations' }, { head: 'C', name: 'Missing data' }] });
  ok('forestRM: «Not estimable» para estudios sin estimador', svg.includes('Not estimable') ? 1 : 0, 1, 0);
  ok('forestRM: columnas A–C, Global y leyenda de dominios', ['>A<', '>B<', '>C<', 'Global', '(A) Randomisation', '(C) Missing data'].every(t => svg.includes(t)) && (svg.match(/<circle /g) || []).length === 8 ? 1 : 0, 1, 0); }
// biblioteca de MID: umbrales positivos y crecientes; las desutilidades coinciden con GRADE-THRESHOLD (muerte = 1 → 1,35 / 3,21 / 6,25 por 100)
{ const good = MIDS.every(m => { const v = midValues(m, 100); return v.mid > 0 && v.mid < v.mod && v.mod < v.large && (m.type === 'bin' ? m.dis > 0 && m.dis <= 1 : m.t.length === 3); });
  ok('MID: todos los umbrales son positivos y crecientes', good ? 1 : 0, 1, 0);
  const d = midValues(MIDS.find(m => m.name === 'Mortalidad por todas las causas'), 100); ok('MID mortalidad por 100 = 1,35 / 3,21 / 6,25', Math.abs(d.mid - 1.35) + Math.abs(d.mod - 3.21) + Math.abs(d.large - 6.25), 0, 1e-9);
  ok('MID: hay desenlaces de nefrología, cardiología y hematología', ['Nefrología', 'Cardiología', 'Hematología'].every(a => MIDS.some(m => m.area === a && m.type === 'bin') && MIDS.some(m => m.area === a && m.type === 'cont')) ? 1 : 0, 1, 0); }
// DTA: reproduce el artículo de referencia (TRV > 2,8 m/s: Se 0,788, Sp 0,756; I² 92/91) y el modelo bivariado frente a scipy
{ const mk = a => a.map(([tp, fp, fn, tn]) => ({ tp, fp, fn, tn }));
  const S = mk([[27, 3, 18, 14], [53, 14, 15, 29], [10, 11, 1, 37], [198, 2, 42, 21], [1176, 166, 88, 142], [2, 0, 5, 10], [15, 0, 19, 7], [1321, 67, 143, 77], [162, 17, 33, 45], [70, 115, 8, 318]]);
  const r = poolSeSp(S); ok('DTA Se TRV>2,8 = 0,788', r.se.est, 0.788, 0.002); ok('DTA Sp TRV>2,8 = 0,756', r.sp.est, 0.756, 0.002); ok('DTA I² Se (Q) = 92', Math.round(r.se.I2q), 92, 0.5);
  const b = bivariate(S); ok('bivariado Se vs scipy', b.se, 0.78106, 2e-3); ok('bivariado Sp vs scipy', b.sp, 0.76545, 2e-3);
  const g = gradeDTA(S.map((s, i) => ({ ...s, rob: i < 4 ? 'low' : 'high' })), { prev: 0.24, thr: SCEN['24'] });
  ok('GRADE-DTA: FN por 100 = 24 × (1 − Se)', g.se.f, 24 * (1 - g.se.est), 1e-9); ok('GRADE-DTA: certeza entre 1 y 4', dtaCertainty(g.se.dom) >= 1 && dtaCertainty(g.se.dom) <= 4 ? 1 : 0, 1, 0);
  ok('GRADE-DTA: riesgo de sesgo rebaja si < 70 % del peso es bajo', gradeDTA(S.map(s => ({ ...s, rob: 'high' })), { prev: 0.24, thr: SCEN['24'] }).se.dom.rob, 1, 0); }
// prevalencia: PLO reproduce la proporción agrupada cuando los estudios son idénticos; Wilson contiene la proporción
{ const p = poolProp([20, 20, 20], [100, 100, 100], 'PLO'); ok('prevalencia PLO estudios idénticos = 0,20', p.est, 0.2, 1e-6);
  const w = wilson(20, 100); ok('Wilson 20/100 contiene 0,20', w[0] < 0.2 && w[1] > 0.2 ? 1 : 0, 1, 0); }
// DTA: prevalencia (mediana / IC), umbrales escalados, subgrupos por riesgo de sesgo y figuras
{ const S = [[27, 3, 18, 14], [53, 14, 15, 29], [10, 11, 1, 37], [198, 2, 42, 21], [1176, 166, 88, 142], [162, 17, 33, 45]].map(([tp, fp, fn, tn], i) => ({ tp, fp, fn, tn, rob: i < 3 ? 'low' : 'high', study: 'S' + i }));
  const pr = S.map(s => (s.tp + s.fn) / (s.tp + s.fn + s.fp + s.tn)).sort((a, b) => a - b); ok('DTA prevalencia mediana', prevFrom(S, 'median'), (pr[2] + pr[3]) / 2, 1e-12);
  ok('DTA prevalencia: IC inferior < mediana-ish < IC superior', prevFrom(S, 'lo') < prevFrom(S, 'hi') ? 1 : 0, 1, 0);
  for (const p of [0.1, 0.24, 0.36]) { const a = autoThr(p), r = SCEN[String(Math.round(p * 100))]; ok(`umbrales auto ≈ referencia (${p})`, Math.abs(a.fnA - r.fnA) + Math.abs(a.fnU - r.fnU) + Math.abs(a.fpA - r.fpA) <= 1 && Math.abs(a.fpU - r.fpU) <= 1 ? 1 : 0, 1, 0); }
  const sp = robSplit(S); ok('subgrupos por RoB: 2 grupos con prueba de diferencia', sp && sp.groups.length === 2 && sp.test.se.df === 1 && sp.test.sp.p >= 0 ? 1 : 0, 1, 0);
  const R = poolSeSp(S), row = (x, i) => ({ label: x.study, tp: x.tp, fn: x.fn, fp: x.fp, tn: x.tn, se: [0.5, 0.4, 0.6], sp: [0.7, 0.6, 0.8], wse: 1 / 6, wsp: 1 / 6, rob: x.rob });
  const svg = dtaPaired({ title: 't', groups: [{ label: '', rows: S.map(row) }], overall: { label: 'Total', se: [R.se.est, R.se.lo, R.se.hi], sp: [R.sp.est, R.sp.lo, R.sp.hi], tp: 1, fn: 1, fp: 1, tn: 1, het: ['a', 'b'] } });
  ok('forest pareado: Sens/Spec, RoB y sin NaN', ['Sens', 'Spec', 'Risk of bias', '#1F6FD0'].every(t => svg.includes(t)) && !/NaN|undefined/.test(svg) ? 1 : 0, 1, 0);
  const th = dtaThreshold({ items: [{ title: 'FN', est: 10, lo: 4, hi: 16, a: 5, u: 11 }] }), pe = dtaPeople({ scenarios: [{ title: 'x', sub: 'y', c: { tp: 20, fn: 4, fp: 4, tn: 72 } }], texts: { fn: 'z' } });
  ok('umbrales: cruza 2 → rebaja 2', th.includes('crosses 2 thresholds') ? 1 : 0, 1, 0); ok('100 personas: 100 figuras y sin NaN', (pe.match(/<circle /g) || []).length === 104 && !/NaN/.test(pe) ? 1 : 0, 1, 0); }
console.log(fails ? `\n${fails} fallos` : '\nTodas las comprobaciones pasaron'); process.exit(fails ? 1 : 0);
