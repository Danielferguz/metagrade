// Meta-análisis por pares: escalc + rma (EE, DL, REML; Wald, Knapp-Hartung, HKSJ ad hoc).
// Port de la implementación validada contra metafor (BAFF-APRIL, metafx.py).
import { qnorm, pnorm, qt, pt, pf, pchisq, sum } from './stats.js?v=2026.10.25-4';

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
  return { intercept: icpt, slope, se: seI, t, p: 2 * (1 - pt(Math.abs(t), k - 2)), k, tcrit: qt(0.975, k - 2) };
}

// Diferencia de subgrupos (Q entre grupos, efectos aleatorios por subgrupo)
export function subgroupTest(groups) {
  const fits = groups.filter(g => g && g.k > 0);
  if (fits.length < 2) return null;
  const w = fits.map(f => 1 / (f.se * f.se)), m = sum(fits.map((f, i) => w[i] * f.est)) / sum(w);
  const Q = sum(fits.map((f, i) => w[i] * (f.est - m) ** 2));
  return { Q, df: fits.length - 1, p: 1 - pchisq(Q, fits.length - 1) };
}

// ---------- Meta-regresión (modelo de efectos mixtos, como rma(yi, vi, mods=) de metafor) ----------
// X: matriz k×p con intercepto en la primera columna. Devuelve coeficientes, QM (ómnibus de los moderadores),
// QE residual, τ² residual y R² (reducción del τ² frente al modelo sin moderadores).
const matInv = A => {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null; // moderadores colineales
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map(r => r.slice(n));
};
const mm = (A, B) => A.map(r => B[0].map((_, j) => sum(r.map((x, t) => x * B[t][j]))));
const tr_ = A => A[0].map((_, j) => A.map(r => r[j]));
export function metaReg(yi, vi, X, { method = 'REML', test = 'z', level = 0.95 } = {}) {
  const idx = yi.map((_, i) => i).filter(i => isFinite(yi[i]) && isFinite(vi[i]) && X[i].every(isFinite));
  const y = idx.map(i => yi[i]), v = idx.map(i => vi[i]), Z = idx.map(i => X[i]), k = y.length, p = Z[0].length;
  if (k <= p) return null;
  const Xt = tr_(Z);
  // P = W − W X (X'WX)⁻¹ X'W para un τ² dado
  const proj = tau2 => {
    const w = v.map(x => 1 / (x + tau2)), XtW = Xt.map(r => r.map((x, i) => x * w[i])), A = matInv(mm(XtW, Z));
    if (!A) return null;
    const WX = Z.map((r, i) => r.map(x => x * w[i])), WXA = mm(WX, A);
    const P = w.map((wi, i) => w.map((_, j) => (i === j ? wi : 0) - sum(WXA[i].map((a, t) => a * WX[j][t]))));
    return { w, A, P };
  };
  const q = (P) => sum(y.map((yi_, i) => yi_ * sum(P[i].map((pij, j) => pij * y[j]))));
  const trace = P => sum(P.map((r, i) => r[i]));
  const P0 = proj(0); if (!P0) return null;
  let tau2 = 0;
  if (method === 'DL') tau2 = Math.max(0, (q(P0.P) - (k - p)) / trace(P0.P));
  else if (method === 'REML') {
    for (let it = 0; it < 1000; it++) {
      const { P } = proj(tau2), Py = P.map(r => sum(r.map((x, j) => x * y[j])));
      const trPP = sum(P.map((r, i) => sum(r.map((x, j) => x * P[j][i]))));
      const adj = (sum(Py.map(x => x * x)) - trace(P)) / trPP;
      let step = 1, nw = tau2 + adj;
      while (nw < 0 && step > 1e-8) { step /= 2; nw = tau2 + step * adj; }
      nw = Math.max(nw, 0);
      if (Math.abs(nw - tau2) < 1e-10) { tau2 = nw; break; }
      tau2 = nw;
    }
  }
  const { w, A } = proj(tau2);
  const XtWy = Xt.map(r => sum(r.map((x, i) => x * w[i] * y[i]))), beta = A.map(r => sum(r.map((a, j) => a * XtWy[j])));
  const res = y.map((yi_, i) => yi_ - sum(Z[i].map((x, j) => x * beta[j])));
  const knha = test === 'knha' || test === 'adhoc', df = k - p;
  let s2 = 1; if (knha) { s2 = sum(res.map((r, i) => w[i] * r * r)) / df; if (test === 'adhoc') s2 = Math.max(1, s2); }
  const vb = A.map(r => r.map(a => a * s2)), se = vb.map((r, i) => Math.sqrt(r[i]));
  const a = (1 - level) / 2, crit = knha ? qt(1 - a, df) : qnorm(1 - a);
  const zval = beta.map((b, i) => b / se[i]);
  const pval = zval.map(z => (knha ? 2 * (1 - pt(Math.abs(z), df)) : 2 * (1 - pnorm(Math.abs(z)))));
  // ómnibus de los moderadores (todos los coeficientes salvo el intercepto)
  const m = p - 1; let QM = NaN, QMp = NaN;
  if (m > 0) {
    const Vm = matInv(vb.slice(1).map(r => r.slice(1))), bm = beta.slice(1);
    if (Vm) { QM = sum(bm.map((b, i) => b * sum(Vm[i].map((x, j) => x * bm[j])))); QMp = knha ? 1 - pf(QM / m, m, df) : 1 - pchisq(QM, m); if (knha) QM /= m; }
  }
  // QE residual con pesos de efecto fijo y τ² del modelo sin moderadores para R²
  const w0 = v.map(x => 1 / x), XtW0 = Xt.map(r => r.map((x, i) => x * w0[i])), A0 = matInv(mm(XtW0, Z)), b0 = A0.map(r => sum(r.map((x, j) => x * sum(XtW0[j].map((xx, i) => xx * y[i])))));
  const QE = sum(y.map((yi_, i) => w0[i] * (yi_ - sum(Z[i].map((x, j) => x * b0[j]))) ** 2)), QEp = df > 0 ? 1 - pchisq(QE, df) : NaN;
  const base = rma(y, v, { method, test: 'z' }), R2 = base.tau2 > 0 ? Math.max(0, 100 * (base.tau2 - tau2) / base.tau2) : 0;
  const s2typ = df / trace(proj(0).P), I2 = 100 * tau2 / (tau2 + s2typ);
  return { k, p, beta, se, ci: beta.map((b, i) => [b - crit * se[i], b + crit * se[i]]), z: zval, pval, QM, QMp, m, QE, QEp, df, tau2, tau2_0: base.tau2, R2, I2, vb, test, method, idx };
}

// Matriz de diseño a partir de los valores del moderador: numérico (centrado en la media) o categórico (referencia = categoría más frecuente)
export function designMatrix(values, type) {
  if (type === 'num') {
    const x = values.map(v => parseFloat(String(v).replace(',', '.'))), ok = x.filter(isFinite), mean = sum(ok) / ok.length;
    return { X: x.map(v => [1, v - mean]), terms: ['Intercept (at mean)', 'Slope'], mean, type };
  }
  const lv = [...new Set(values.filter(v => v !== '' && v != null))], cnt = l => values.filter(v => v === l).length;
  lv.sort((a, b) => cnt(b) - cnt(a)); const ref = lv[0];
  return { X: values.map(v => (v === '' || v == null ? [NaN] : [1, ...lv.slice(1).map(l => +(v === l))])), terms: ['Intercept (' + ref + ')', ...lv.slice(1).map(l => l + ' vs ' + ref)], levels: lv, ref, type };
}
