// node tests/validate.mjs — compara los motores JS con valores de referencia de implementaciones validadas
// (port de metafor y motor NMA en Python equivalente a netmeta) y con ejemplos publicados de GRADE 33.
import fs from 'fs';
import { escalc, rma, egger, metaReg, designMatrix, subgroupTest } from '../js/pairwise.js';
import { NMA } from '../js/nma.js';
import { oisBinary, effectiveN } from '../js/grade.js';
import { parseCSV } from '../js/io.js';
import { forestRM } from '../js/plots.js';
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
console.log(fails ? `\n${fails} fallos` : '\nTodas las comprobaciones pasaron'); process.exit(fails ? 1 : 0);
