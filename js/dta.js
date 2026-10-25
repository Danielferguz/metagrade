// Exactitud diagnóstica (DTA): sensibilidad y especificidad combinadas por separado (modelos univariados de proporciones, como en metaprop)
// y modelo bivariado de Reitsma (verosimilitud máxima, μ perfilada por GLS). Valoración GRADE para DTA (versión beta) con umbrales de decisión
// de falsos negativos / falsos positivos por 100 evaluados (GRADE guidelines 21 y guidance 37).
import { poolProp, wilson } from './prop.js?v=2026.10.25-6';
import { qnorm, sum } from './stats.js?v=2026.10.25-6';
import { subgroupTest } from './pairwise.js?v=2026.10.25-6';

export const dtaN = s => ({ nSe: s.tp + s.fn, nSp: s.fp + s.tn });
// Se y Sp por separado; devuelve estimaciones, IC, heterogeneidad y pesos (para GRADE)
export function poolSeSp(S, { tr = 'PFT', method = 'REML', test = 'z' } = {}) {
  const se = poolProp(S.map(s => s.tp), S.map(s => s.tp + s.fn), tr, { method, test }), sp = poolProp(S.map(s => s.tn), S.map(s => s.tn + s.fp), tr, { method, test });
  return { se, sp };
}
// ---- modelo bivariado de Reitsma ----
const inv2 = (a, b, d) => { const det = a * d - b * b; return [d / det, -b / det, a / det, det]; };
function nelder(f, x0, step = 0.5, iters = 400) {
  const n = x0.length; let sx = [x0, ...x0.map((v, i) => x0.map((w, j) => (i === j ? w + step : w)))], sf = sx.map(f);
  for (let it = 0; it < iters; it++) {
    const o = sf.map((v, i) => i).sort((a, b) => sf[a] - sf[b]); sx = o.map(i => sx[i]); sf = o.map(i => sf[i]);
    if (Math.abs(sf[n] - sf[0]) < 1e-10) break;
    const c = sx[0].map((_, j) => sum(sx.slice(0, n).map(p => p[j])) / n), at = t => c.map((v, j) => v + t * (sx[n][j] - v)), r = at(-1), fr = f(r);
    if (fr < sf[0]) { const e = at(-2), fe = f(e); if (fe < fr) { sx[n] = e; sf[n] = fe; } else { sx[n] = r; sf[n] = fr; } }
    else if (fr < sf[n - 1]) { sx[n] = r; sf[n] = fr; }
    else { const k = at(fr < sf[n] ? -0.5 : 0.5), fk = f(k); if (fk < Math.min(fr, sf[n])) { sx[n] = k; sf[n] = fk; } else for (let i = 1; i <= n; i++) { sx[i] = sx[i].map((v, j) => sx[0][j] + 0.5 * (v - sx[0][j])); sf[i] = f(sx[i]); } }
  }
  const b = sf.indexOf(Math.min(...sf)); return { x: sx[b], f: sf[b] };
}
export function bivariate(S) {
  const k = S.length; if (k < 3) return null;
  const y = S.map(s => { const a = s.tp + 0.5, b = s.fn + 0.5, c = s.tn + 0.5, d = s.fp + 0.5; return [Math.log(a / b), Math.log(c / d), 1 / a + 1 / b, 1 / c + 1 / d]; });
  const prof = th => { // μ por GLS dado (τ1, τ2, ρ); devuelve -2 logL (restringida no; ML) y cov(μ)
    const t1 = Math.exp(th[0]), t2 = Math.exp(th[1]), r = Math.tanh(th[2]); let A = [0, 0, 0], B = [0, 0], ll = 0;
    const W = y.map(v => inv2(t1 * t1 + v[2], r * t1 * t2, t2 * t2 + v[3]));
    W.forEach((w, i) => { A[0] += w[0]; A[1] += w[1]; A[2] += w[2]; B[0] += w[0] * y[i][0] + w[1] * y[i][1]; B[1] += w[1] * y[i][0] + w[2] * y[i][1]; });
    const Ai = inv2(A[0], A[1], A[2]), mu = [Ai[0] * B[0] + Ai[1] * B[1], Ai[1] * B[0] + Ai[2] * B[1]];
    W.forEach((w, i) => { const d0 = y[i][0] - mu[0], d1 = y[i][1] - mu[1]; ll += d0 * (w[0] * d0 + w[1] * d1) + d1 * (w[1] * d0 + w[2] * d1) + Math.log(w[3]); });
    return { v: ll, mu, cov: Ai };
  };
  const fit = (x0) => nelder(th => (Math.abs(th[2]) > 6 || Math.abs(th[0]) > 8 || Math.abs(th[1]) > 8 ? 1e12 : prof(th).v), x0);
  let best = null; for (const x0 of [[-1, -1, 0], [-0.5, -0.5, 0.5], [0, 0, -0.5], [-2, -2, 0]]) { const r = fit(x0), r2 = fit(r.x); const b = r2.f < r.f ? r2 : r; if (!best || b.f < best.f) best = b; }
  const p = prof(best.x), lg = v => 1 / (1 + Math.exp(-v)), z = qnorm(0.975), se1 = Math.sqrt(p.cov[0]), se2 = Math.sqrt(p.cov[2]);
  return { k, se: lg(p.mu[0]), seCI: [lg(p.mu[0] - z * se1), lg(p.mu[0] + z * se1)], sp: lg(p.mu[1]), spCI: [lg(p.mu[1] - z * se2), lg(p.mu[1] + z * se2)], tau: [Math.exp(best.x[0]), Math.exp(best.x[1])], rho: Math.tanh(best.x[2]), mu: p.mu, cov: p.cov, loglik: -p.v / 2 };
}
// ---- GRADE para DTA (beta) ----
export const SCEN = { '10': { fnA: 2, fnU: 5, fpA: 5, fpU: 20 }, '24': { fnA: 5, fnU: 11, fpA: 4, fpU: 18 }, '36': { fnA: 8, fnU: 17, fpA: 3, fpU: 15 } };
const zone = (v, a, u) => (v <= a ? 'ok' : v >= u ? 'bad' : 'mid');
// Se/Sp → falsos por 100 evaluados: FN = prev × (1 − Se); FP = (1 − prev) × (1 − Sp)
export const fnPer100 = (se, prev) => 100 * prev * (1 - se);
export const fpPer100 = (sp, prev) => 100 * (1 - prev) * (1 - sp);
// S: estudios del análisis ({tp, fp, fn, tn, rob: 'low'|'high'|…, indirect}); opts: { prev, thr {fnA, fnU, fpA, fpU}, tr, method, test, useRestricted }
export function gradeDTA(S, o) {
  const { prev = 0.24, thr = SCEN['24'], tr = 'PFT', method = 'REML', test = 'z', useRestricted = true, robCut = 0.7, heterDrop = 15 } = o;
  const isLow = s => /^(low|bajo|acceptable)/i.test(String(s.rob || '')), lowS = S.filter(isLow), full = poolSeSp(S, { tr, method, test });
  let used = full, restricted = false, lowRes = null;
  if (lowS.length >= 2 && lowS.length < S.length) {
    lowRes = poolSeSp(lowS, { tr, method, test });
    const drop = (a, b) => (isFinite(a?.fit.I2) && isFinite(b?.fit.I2) ? a.fit.I2 - b.fit.I2 : 0);
    if (useRestricted && (drop(full.se, lowRes.se) >= heterDrop || drop(full.sp, lowRes.sp) >= heterDrop)) { used = lowRes; restricted = true; }
  }
  const out = {}, SU = restricted ? lowS : S, pick = n => ({ se: S.map(s => s.tp / (s.tp + s.fn)), sp: S.map(s => s.tn / (s.tn + s.fp)) })[n];
  for (const [key, A] of [['se', ['fnA', 'fnU', fnPer100]], ['sp', ['fpA', 'fpU', fpPer100]]]) {
    const P = used[key], fit = P.fit, w = fit.weights, ss = P.idx.map(i => SU[i]), est = P.est, f = (v, i) => A[2](v, prev);
    const ptF = A[2](est, prev), loF = A[2](P.hi, prev), hiF = A[2](P.lo, prev); // un Se/Sp mayor da menos falsos
    const a = thr[A[0]], u = thr[A[1]], zPool = zone(ptF, a, u);
    const stud = ss.map(s => (key === 'se' ? s.tp / (s.tp + s.fn) : s.tn / (s.tn + s.fp)));
    const wLow = restricted ? 1 : sum(ss.map((s, j) => (isLow(s) ? w[j] : 0)));
    const same = sum(ss.map((s, j) => (zone(A[2](stud[j], prev), a, u) === zPool ? w[j] : 0)));
    const robL = wLow < robCut ? 1 : 0;
    const incL = ss.length < 2 ? 1 : same < 0.6 ? 2 : same < 0.8 ? 1 : 0;
    const flag = sum(ss.map((s, j) => (/^(1|y|yes|true|si|sí|major|serious)/i.test(String(s.indirect ?? '')) ? w[j] : 0)));
    const indL = flag > 0.7 ? 2 : flag > 0.2 ? 1 : 0;
    const cross = [a, u].filter(t => loF < t && hiF > t).length, impL = Math.min(2, cross);
    const why = {
      rob: restricted ? 'Estimate restricted to studies at low or acceptable risk of bias (heterogeneity decreased)' : `${(wLow * 100).toFixed(0)}% of the meta-analysis weight from studies at low or acceptable risk of bias (${robL ? '<' : '≥'}${robCut * 100}%)`,
      inc: ss.length < 2 ? 'Single study: heterogeneity cannot be assessed' : `${(same * 100).toFixed(0)}% of the weight on the same side of the decision thresholds as the pooled estimate; I² = ${isFinite(fit.I2) ? fit.I2.toFixed(0) : '–'}%`,
      ind: flag > 0.2 ? `${(flag * 100).toFixed(0)}% of the weight from studies flagged for indirectness` : 'No relevant indirectness flagged in the data',
      imp: `95% CI of ${key === 'se' ? 'false negatives' : 'false positives'} per 100 (${loF.toFixed(1)} to ${hiF.toFixed(1)}) crosses ${cross} decision threshold${cross === 1 ? '' : 's'} (acceptable ${a}, unacceptable ${u})`,
      pub: 'Not downgraded: no validated test for publication bias in DTA reviews with few studies',
    };
    out[key] = { est, ci: [P.lo, P.hi], k: fit.k, n: sum(ss.map(s => (key === 'se' ? s.tp + s.fn : s.tn + s.fp))), I2: fit.I2, f: ptF, fLo: loF, fHi: hiF, zone: zPool, thr: [a, u], dom: { rob: robL, inc: incL, ind: indL, imp: impL, pub: 0 }, why, studies: ss.length };
  }
  return { ...out, restricted, full, lowRes, prev, thr };
}
export const dtaCertainty = (d, ov = {}) => Math.max(1, 4 - ['rob', 'inc', 'ind', 'imp', 'pub'].reduce((a, k) => a + (ov[k] != null ? +ov[k] : d[k]), 0));
// texto estandarizado (matriz de interpretación del material suplementario) según zona de la estimación puntual y certeza
const MATRIX = {
  4: { ok: 'The test has adequate diagnostic accuracy.', mid: 'The test likely remains clinically useful despite minor misclassification.', bad: 'The test has inadequate diagnostic accuracy.' },
  3: { ok: 'The test probably has adequate diagnostic accuracy.', mid: 'The test probably has limited diagnostic accuracy; caution is advised.', bad: 'The test probably has inadequate diagnostic accuracy.' },
  2: { ok: 'The test may have adequate diagnostic accuracy.', mid: 'The test may have limited clinical utility due to misclassification.', bad: 'The test may have inadequate diagnostic accuracy.' },
  1: { ok: 'The evidence is very uncertain about the test’s accuracy.', mid: 'The evidence is very uncertain and suggests possible misclassification.', bad: 'The evidence is very uncertain and suggests poor test performance.' },
};
export const dtaText = (c, zn) => MATRIX[c][zn];
// prevalencia a partir de los estudios: mediana de (TP+FN)/N o límite inferior/superior del IC 95 % de la prevalencia combinada (logit)
export function prevFrom(S, mode) {
  const x = S.map(s => s.tp + s.fn), n = S.map(s => s.tp + s.fn + s.fp + s.tn);
  if (mode === 'median') { const p = S.map((s, i) => x[i] / n[i]).sort((a, b) => a - b), m = p.length >> 1; return p.length % 2 ? p[m] : (p[m - 1] + p[m]) / 2; }
  const P = poolProp(x, n, 'PLO'); return mode === 'lo' ? P.lo : P.hi;
}
// umbrales por 100 para una prevalencia cualquiera: las tres prevalencias de referencia (10/24/36 %) equivalen a ≈21 % / 47 % de los enfermos
// y ≈5 % / 23 % de los sanos (falsos negativos aceptable/inaceptable; falsos positivos aceptable/inaceptable)
export function autoThr(prev) {
  const fnA = Math.max(1, Math.round(100 * prev * 0.21)), fpA = Math.max(1, Math.round(100 * (1 - prev) * 0.053));
  return { fnA, fnU: Math.max(fnA + 1, Math.round(100 * prev * 0.47)), fpA, fpU: Math.max(fpA + 1, Math.round(100 * (1 - prev) * 0.23)) };
}
// subgrupos por riesgo de sesgo: bajo/aceptable frente a alto/poco claro, con la prueba de diferencia entre subgrupos (Q sobre la escala transformada)
export function robSplit(S, o = {}) {
  const isLow = s => /^(low|bajo|acceptable)/i.test(String(s.rob || '')), lo = S.filter(isLow), hi = S.filter(s => s.rob && !isLow(s));
  if (!lo.length || !hi.length) return null;
  const r = [lo, hi].map(g => poolSeSp(g, o)), t = key => (r[0][key] && r[1][key] ? subgroupTest([r[0][key].fit, r[1][key].fit]) : null);
  return { groups: [{ label: 'Low or acceptable risk of bias', S: lo, res: r[0] }, { label: 'High or unclear risk of bias', S: hi, res: r[1] }], test: { se: t('se'), sp: t('sp') } };
}
export { wilson };
