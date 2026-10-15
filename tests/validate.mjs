// node tests/validate.mjs — compara los motores JS con valores de referencia de implementaciones validadas
// (port de metafor y motor NMA en Python equivalente a netmeta) y con ejemplos publicados de GRADE 33.
import fs from 'fs';
import { escalc, rma, egger } from '../js/pairwise.js';
import { NMA } from '../js/nma.js';
import { oisBinary, effectiveN } from '../js/grade.js';
import { parseCSV } from '../js/io.js';
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
console.log(fails ? `\n${fails} fallos` : '\nTodas las comprobaciones pasaron'); process.exit(fails ? 1 : 0);
