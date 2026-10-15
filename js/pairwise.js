// Meta-análisis por pares: escalc + rma (EE, DL, REML; Wald, Knapp-Hartung, HKSJ ad hoc).
// Port de la implementación validada contra metafor (BAFF-APRIL, metafx.py).
import { qnorm, pnorm, qt, pt, pchisq, sum } from './stats.js';

export const RATIO = new Set(['RR', 'OR', 'HR', 'ROM']);

export function escalc(row, measure, add = 0.5) {
  // row: {e1,n1,e2,n2} | {m1,sd1,n1,m2,sd2,n2} | {yi,sei}
  if (row.yi != null && row.sei != null && isFinite(row.yi) && isFinite(row.sei)) {
    return { yi: +row.yi, vi: (+row.sei) ** 2 };
  }
  if (measure === 'RR' || measure === 'OR' || measure === 'RD') {
    let a = +row.e1, c = +row.e2, n1 = +row.n1, n2 = +row.n2;
    if (![a, c, n1, n2].every(isFinite)) return null;
    let b = n1 - a, d = n2 - c;
    if (measure !== 'RD') {
      if (a === 0 && c === 0) return { yi: NaN, vi: NaN, dropped: 'double-zero' };
      if (Math.min(a, b, c, d) === 0) { a += add; b += add; c += add; d += add; }
      if (b === 0 && d === 0) return { yi: NaN, vi: NaN, dropped: 'double-all' };
    }
    const m1 = a + b, m2 = c + d;
    if (measure === 'RR') return { yi: Math.log((a / m1) / (c / m2)), vi: 1 / a - 1 / m1 + 1 / c - 1 / m2 };
    if (measure === 'OR') return { yi: Math.log((a * d) / (b * c)), vi: 1 / a + 1 / b + 1 / c + 1 / d };
    const p1 = a / m1, p2 = c / m2;
    return { yi: p1 - p2, vi: p1 * (1 - p1) / m1 + p2 * (1 - p2) / m2 };
  }
  if (measure === 'MD' || measure === 'SMD' || measure === 'ROM') {
    const m1 = +row.m1, s1 = +row.sd1, n1 = +row.n1, m2 = +row.m2, s2 = +row.sd2, n2 = +row.n2;
    if (![m1, s1, n1, m2, s2, n2].every(isFinite)) return null;
    if (measure === 'MD') return { yi: m1 - m2, vi: s1 * s1 / n1 + s2 * s2 / n2 };
    if (measure === 'ROM') return { yi: Math.log(m1 / m2), vi: s1 * s1 / (n1 * m1 * m1) + s2 * s2 / (n2 * m2 * m2) };
    const df = n1 + n2 - 2, sp = Math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / df);
    const J = 1 - 3 / (4 * df - 1), g = J * (m1 - m2) / sp;
    return { yi: g, vi: 1 / n1 + 1 / n2 + g * g / (2 * (n1 + n2)) };
  }
  return null;
}

function remlTau2(y, v, maxiter = 1000, tol = 1e-10) {
  const k = y.length;
  const mean = sum(y) / k;
  let tau2 = k > 1 ? Math.max(0, sum(y.map(x => (x - mean) ** 2)) / (k - 1) - sum(v) / k) : 0;
  for (let it = 0; it < maxiter; it++) {
    const w = v.map(x => 1 / (x + tau2)), sw = sum(w);
    // P = W - w w^T / sw  (modelo sólo intercepto)
    const Py = y.map((yi, i) => w[i] * yi - w[i] * sum(w.map((wj, j) => wj * y[j])) / sw);
    const trP = sum(w) - sum(w.map(x => x * x)) / sw;
    // tr(PP) = sum w^2 - 2 sum w^3/sw + (sum w^2)^2/sw^2
    const sw2 = sum(w.map(x => x * x)), sw3 = sum(w.map(x => x ** 3));
    const trPP = sw2 - 2 * sw3 / sw + sw2 * sw2 / (sw * sw);
    const yPPy = sum(Py.map(x => x * x));
    const adj = (yPPy - trP) / trPP;
    let step = 1, nw = tau2 + adj;
    while (nw < 0 && step > 1e-8) { step /= 2; nw = tau2 + step * adj; }
    nw = Math.max(nw, 0);
    if (Math.abs(nw - tau2) < tol) { tau2 = nw; break; }
    tau2 = nw;
  }
  return tau2;
}

export function rma(yi, vi, { method = 'REML', test = 'z', level = 0.95 } = {}) {
  const idx = yi.map((y, i) => i).filter(i => isFinite(yi[i]) && isFinite(vi[i]));
  const y = idx.map(i => yi[i]), v = idx.map(i => vi[i]), k = y.length;
  if (k === 0) return null;
  const w0 = v.map(x => 1 / x), sw0 = sum(w0);
  const b0 = sum(w0.map((w, i) => w * y[i])) / sw0;
  const QE = sum(w0.map((w, i) => w * (y[i] - b0) ** 2));
  const QEp = k > 1 ? 1 - pchisq(QE, k - 1) : NaN;
  const trP0 = sw0 - sum(w0.map(x => x * x)) / sw0;
  let tau2 = 0;
  if (k > 1 && method === 'DL') tau2 = Math.max(0, (QE - (k - 1)) / trP0);
  else if (k > 1 && method === 'REML') tau2 = remlTau2(y, v);
  const w = v.map(x => 1 / (x + tau2)), sw = sum(w);
  const b = sum(w.map((wi, i) => wi * y[i])) / sw;
  let vb = 1 / sw;
  const dfs = k - 1;
  const useT = (test === 'knha' || test === 'adhoc') && k > 1;
  let s2 = 1;
  if (useT) {
    s2 = sum(w.map((wi, i) => wi * (y[i] - b) ** 2)) / dfs;
    if (test === 'adhoc') s2 = Math.max(1, s2);
    vb *= s2;
  }
  const se = Math.sqrt(vb), z = b / se, a = (1 - level) / 2;
  const crit = useT ? qt(1 - a, dfs) : qnorm(1 - a);
  const pval = useT ? 2 * (1 - pt(Math.abs(z), dfs)) : 2 * (1 - pnorm(Math.abs(z)));
  const s2typ = k > 1 ? (k - 1) / trP0 : NaN;
  const I2 = k > 1 ? 100 * tau2 / (tau2 + s2typ) : NaN;
  // Intervalo de predicción: t con k-2 gl (Riley 2011 / IntHout 2016); requiere k >= 3
  let pi = [NaN, NaN];
  if (k >= 3) { const c = qt(1 - a, k - 2), ps = Math.sqrt(se * se + tau2); pi = [b - c * ps, b + c * ps]; }
  const weights = w.map(x => x / sw);
  return { k, est: b, se, ci: [b - crit * se, b + crit * se], z, pval, tau2, tau: Math.sqrt(tau2), QE, QEp, I2, pi, weights, method: k > 1 ? method : 'EE', test, idx, y, v, s2 };
}

// Prueba de Egger (regresión de y/se sobre 1/se); requiere >= 10 estudios para interpretarse.
export function egger(yi, vi) {
  const se = vi.map(Math.sqrt), Y = yi.map((y, i) => y / se[i]), X = se.map(s => 1 / s), k = Y.length;
  if (k < 3) return null;
  const mx = sum(X) / k, my = sum(Y) / k;
  const sxx = sum(X.map(x => (x - mx) ** 2)), sxy = sum(X.map((x, i) => (x - mx) * (Y[i] - my)));
  const slope = sxy / sxx, icpt = my - slope * mx;
  const res = Y.map((y, i) => y - icpt - slope * X[i]), s2 = sum(res.map(r => r * r)) / (k - 2);
  const seI = Math.sqrt(s2 * (1 / k + mx * mx / sxx)), t = icpt / seI;
  return { intercept: icpt, se: seI, t, p: 2 * (1 - pt(Math.abs(t), k - 2)), k };
}

// Diferencia de subgrupos (Q entre grupos, efectos aleatorios por subgrupo)
export function subgroupTest(groups) {
  const fits = groups.filter(g => g && g.k > 0);
  if (fits.length < 2) return null;
  const w = fits.map(f => 1 / (f.se * f.se)), m = sum(fits.map((f, i) => w[i] * f.est)) / sum(w);
  const Q = sum(fits.map((f, i) => w[i] * (f.est - m) ** 2));
  return { Q, df: fits.length - 1, p: 1 - pchisq(Q, fits.length - 1) };
}
