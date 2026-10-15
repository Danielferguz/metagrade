// NMA frecuentista basado en contrastes (GLS, equivalente a netmeta), efectos aleatorios con tau² común (REML),
// covarianza exacta de ensayos multibrazo, Q por diseño (diseño-por-tratamiento), node-splitting por retro-cálculo,
// P-scores. Port de engine.py (NMA de vacunas HBV).
import { inv, mul, mulv, T, dot, blockDiag, goldenMin, pnorm, pchisq, qt, sum } from './stats.js?v=2026.10.16-4';

export function armStats(arms, outcome, cc = 0.5) {
  // arms: [{t, r, n}] binario | [{t, m, sd, n}] continuo
  if (outcome === 'binary') {
    let r = arms.map(a => +a.r), n = arms.map(a => +a.n);
    if (r.some((x, i) => x === 0 || x === n[i])) { r = r.map(x => x + cc); n = n.map(x => x + 2 * cc); }
    return { y: r.map((x, i) => Math.log(x / (n[i] - x))), v: r.map((x, i) => 1 / x + 1 / (n[i] - x)) };
  }
  return { y: arms.map(a => +a.m), v: arms.map(a => (+a.sd) ** 2 / +a.n) };
}

function studyContrasts(arms, outcome, ref) {
  const { y, v } = armStats(arms, outcome);
  const tr = arms.map(a => a.t);
  const b = tr.includes(ref) ? tr.indexOf(ref) : 0;
  const idx = tr.map((_, i) => i).filter(i => i !== b);
  const yc = idx.map(i => y[i] - y[b]);
  const S = idx.map((i, r) => idx.map((j, c) => v[b] + (r === c ? v[i] : 0)));
  return { base: tr[b], ts: idx.map(i => tr[i]), y: yc, S };
}

export class NMA {
  constructor(studies, outcome = 'binary', ref = null, { method = 'REML', tau2 = null } = {}) {
    // studies: Map/obj study -> [{t, r, n} | {t, m, sd, n}]
    this.studies = studies; this.outcome = outcome;
    const ts = new Set(); for (const arms of Object.values(studies)) arms.forEach(a => ts.add(a.t));
    this.T = [...ts].sort();
    this.ref = ref && this.T.includes(ref) ? ref : this.T[0];
    this.par = this.T.filter(t => t !== this.ref);
    this.p = Object.fromEntries(this.par.map((t, i) => [t, i]));
    const rows = [], Y = [], blocks = [], Mb = [];
    this.rowinfo = [];
    for (const [s, arms] of Object.entries(studies)) {
      const c = studyContrasts(arms, outcome, this.ref);
      c.ts.forEach((t, i) => {
        const x = new Array(this.par.length).fill(0);
        if (t !== this.ref) x[this.p[t]] += 1;
        if (c.base !== this.ref) x[this.p[c.base]] -= 1;
        rows.push(x); this.rowinfo.push([s, t, c.base]); Y.push(c.y[i]);
      });
      blocks.push(c.S);
      const m = c.S.length; Mb.push(c.S.map((r, i) => r.map((_, j) => (i === j ? 1 : 0.5))));
    }
    this.X = rows; this.y = Y; this.S = blockDiag(blocks); this.M = blockDiag(Mb);
    this.k = Object.keys(studies).length; this.nContr = Y.length;
    this.fe = this._fit(0);
    this.Q = this.fe.Q; this.dfQ = this.nContr - this.par.length;
    if (tau2 != null) this.tau2 = tau2;
    else if (method === 'FE') this.tau2 = 0;
    else this.tau2 = this._reml();
    this.re = this._fit(this.tau2);
    this.d = this.re.d; this.C = this.re.C;
    this.method = method;
  }
  _fit(tau2) {
    const V = this.S.map((r, i) => r.map((x, j) => x + tau2 * this.M[i][j]));
    const W = inv(V), XtW = mul(T(this.X), W), XtWX = mul(XtW, this.X), C = inv(XtWX);
    const d = mulv(C, mulv(XtW, this.y));
    const e = this.y.map((yy, i) => yy - dot(this.X[i], d));
    return { d, C, Q: dot(e, mulv(W, e)), W, logdetV: W.logdet, logdetXtWX: C.logdet, e };
  }
  _reml() {
    if (this.dfQ <= 0) return 0;
    const nll = tau => { const f = this._fit(tau * tau); return 0.5 * (f.logdetV + f.logdetXtWX + f.Q); };
    // búsqueda en rejilla + sección áurea (robusto ante óptimos en el borde)
    let best = 0, bv = nll(0);
    for (let g = 0.05; g <= 4; g += 0.05) { const val = nll(g); if (val < bv) { bv = val; best = g; } }
    if (best === 0) { const t = goldenMin(nll, 0, 0.05); return nll(t) < bv ? t * t : 0; }
    const t = goldenMin(nll, Math.max(0, best - 0.05), best + 0.05);
    return t * t;
  }
  vec(t) { const v = new Array(this.par.length).fill(0); if (t !== this.ref) v[this.p[t]] = 1; return v; }
  est(a, b) {
    const c = this.vec(a).map((x, i) => x - this.vec(b)[i]);
    return [dot(c, this.d), Math.sqrt(Math.max(0, dot(c, mulv(this.C, c))))];
  }
  pscore(higherBetter = true) {
    const P = {};
    for (const a of this.T) {
      const vals = this.T.filter(b => b !== a).map(b => { const [m, s] = this.est(a, b); return pnorm(higherBetter ? m / s : -m / s); });
      P[a] = sum(vals) / vals.length;
    }
    return P;
  }
  I2() { return this.Q > 0 && this.dfQ > 0 ? Math.max(0, (this.Q - this.dfQ) / this.Q) : 0; }
  designDecomp() {
    const designs = {};
    for (const [s, arms] of Object.entries(this.studies)) {
      const key = arms.map(a => a.t).sort().join(' :: ');
      (designs[key] = designs[key] || []).push(s);
    }
    let Qh = 0, dfh = 0;
    for (const [key, ss] of Object.entries(designs)) {
      if (ss.length < 2) continue;
      const sub = Object.fromEntries(ss.map(s => [s, this.studies[s]]));
      const m = new NMA(sub, this.outcome, key.split(' :: ')[0], { method: 'FE' });
      Qh += m.Q; dfh += m.dfQ;
    }
    const Qi = this.Q - Qh, dfi = this.dfQ - dfh;
    const p = (q, df) => df > 0 ? 1 - pchisq(q, df) : NaN;
    return { Q: this.Q, df: this.dfQ, p: p(this.Q, this.dfQ), Q_het: Qh, df_het: dfh, p_het: p(Qh, dfh), Q_inc: Qi, df_inc: dfi, p_inc: p(Qi, dfi), n_designs: Object.keys(designs).length };
  }
  direct(a, b) {
    const ys = [], vs = [], ss = [];
    for (const [s, arms] of Object.entries(this.studies)) {
      const tr = arms.map(x => x.t);
      if (!(tr.includes(a) && tr.includes(b))) continue;
      const { y, v } = armStats(arms, this.outcome);
      const ia = tr.indexOf(a), ib = tr.indexOf(b);
      ys.push(y[ia] - y[ib]); vs.push(v[ia] + v[ib]); ss.push(s);
    }
    if (!ys.length) return null;
    const w = vs.map(v => 1 / (v + this.tau2)), m = sum(w.map((x, i) => x * ys[i])) / sum(w), se = Math.sqrt(1 / sum(w));
    const w0 = vs.map(v => 1 / v), m0 = sum(w0.map((x, i) => x * ys[i])) / sum(w0);
    const Q = sum(w0.map((x, i) => x * (ys[i] - m0) ** 2)), df = ys.length - 1;
    const I2 = Q > 0 && df > 0 ? Math.max(0, (Q - df) / Q) : NaN;
    return { est: m, se, k: ys.length, studies: ss, I2, ys, vs, weights: w.map(x => x / sum(w)) };
  }
  netsplit() {
    const out = [];
    for (let i = 0; i < this.T.length; i++) for (let j = i + 1; j < this.T.length; j++) {
      const a = this.T[i], b = this.T[j], dr = this.direct(a, b);
      if (!dr) continue;
      const [mn, sn] = this.est(a, b), vd = dr.se ** 2, vn = sn ** 2;
      if (vd - vn <= 1e-10) { out.push({ a, b, net: mn, se_net: sn, dir: dr.est, se_dir: dr.se, ind: NaN, se_ind: NaN, diff: NaN, p: NaN, k: dr.k, prop_dir: 1 }); continue; }
      const vi = 1 / (1 / vn - 1 / vd), mi = vi * (mn / vn - dr.est / vd), diff = dr.est - mi, sed = Math.sqrt(vd + vi);
      out.push({ a, b, net: mn, se_net: sn, dir: dr.est, se_dir: dr.se, ind: mi, se_ind: Math.sqrt(vi), diff, p: 2 * (1 - pnorm(Math.abs(diff) / sed)), k: dr.k, prop_dir: vn / vd });
    }
    return out;
  }
  hkFactor() {
    const e = this.y.map((yy, i) => yy - dot(this.X[i], this.d));
    const q = dot(e, mulv(this.re.W, e)), df = this.nContr - this.par.length;
    return { f: df > 0 ? Math.max(1, q / df) : 1, df };
  }
  predInt(a, b) {
    const [m, s] = this.est(a, b), df = this.k - 2;
    if (df < 1) return [NaN, NaN];
    const c = qt(0.975, df), ps = Math.sqrt(s * s + this.tau2);
    return [m - c * ps, m + c * ps];
  }
  edges() {
    const E = {};
    for (const [s, arms] of Object.entries(this.studies)) {
      const tr = arms.map(a => a.t);
      for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) {
        const key = [tr[i], tr[j]].sort().join(' || ');
        E[key] = E[key] || { a: [tr[i], tr[j]].sort()[0], b: [tr[i], tr[j]].sort()[1], k: 0, studies: [] };
        E[key].k++; E[key].studies.push(s);
      }
    }
    return Object.values(E);
  }
  nodeSize() {
    const n = {}, k = {};
    for (const arms of Object.values(this.studies)) arms.forEach(a => { n[a.t] = (n[a.t] || 0) + (+a.n); k[a.t] = (k[a.t] || 0) + 1; });
    return { n, k };
  }
}

export function isConnected(studies) {
  const adj = {};
  for (const arms of Object.values(studies)) {
    const tr = arms.map(a => a.t);
    tr.forEach(t => { adj[t] = adj[t] || new Set(); tr.forEach(u => u !== t && adj[t].add(u)); });
  }
  const nodes = Object.keys(adj);
  if (!nodes.length) return { ok: false, components: [] };
  const seen = new Set(), comps = [];
  for (const n0 of nodes) {
    if (seen.has(n0)) continue;
    const comp = [], st = [n0]; seen.add(n0);
    while (st.length) { const n = st.pop(); comp.push(n); adj[n].forEach(m => { if (!seen.has(m)) { seen.add(m); st.push(m); } }); }
    comps.push(comp);
  }
  return { ok: comps.length === 1, components: comps };
}

// Riesgo basal de un brazo: proporción combinada (logit, DL) o mediana
export function armBaseline(studies, t, which = 'pt') {
  const a = [];
  for (const arms of Object.values(studies)) arms.forEach(x => { if (x.t === t) a.push([+x.r, +x.n]); });
  if (!a.length) return NaN;
  if (which === 'median') { const ps = a.map(([r, n]) => r / n).sort((x, y) => x - y); const k = ps.length; return k % 2 ? ps[(k - 1) / 2] : (ps[k / 2 - 1] + ps[k / 2]) / 2; }
  const y = a.map(([r, n]) => Math.log((r + 0.5) / (n - r + 0.5))), v = a.map(([r, n]) => 1 / (r + 0.5) + 1 / (n - r + 0.5));
  const w = v.map(x => 1 / x), m = sum(w.map((x, i) => x * y[i])) / sum(w);
  const Q = sum(w.map((x, i) => x * (y[i] - m) ** 2)), df = y.length - 1;
  const t2 = df > 0 ? Math.max(0, (Q - df) / (sum(w) - sum(w.map(x => x * x)) / sum(w))) : 0;
  const w2 = v.map(x => 1 / (x + t2)), m2 = sum(w2.map((x, i) => x * y[i])) / sum(w2), se = Math.sqrt(1 / sum(w2));
  const f = x => 1 / (1 + Math.exp(-x));
  return { lo: f(m2 - 1.959964 * se), pt: f(m2), hi: f(m2 + 1.959964 * se) }[which];
}
