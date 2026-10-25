// Meta-análisis de proporciones (prevalencia) y de tasas de incidencia: transformaciones logit (PLO), doble arcoseno de Freeman-Tukey (PFT),
// proporción cruda (PRAW), log-tasa (IRLN), raíz de la tasa (IRS) y tasa cruda (IR). Combinación con rma() y retrotransformación.
import { rma } from './pairwise.js?v=2026.10.25-6';
import { qnorm } from './stats.js?v=2026.10.25-6';

export const PROP_TR = { PLO: 'Logit', PFT: 'Doble arcoseno (Freeman-Tukey)', PRAW: 'Proporción cruda' };
export const RATE_TR = { IRLN: 'Log de la tasa', IRS: 'Raíz cuadrada de la tasa', IR: 'Tasa cruda' };

// efecto y varianza de un estudio; x = casos, n = denominador (proporción) o tiempo-persona (tasa)
export function propES(x, n, tr) {
  if (!(n > 0) || !(x >= 0) || (x > n && !RATE_TR[tr])) return null;
  if (tr === 'PLO') { let a = x, m = n; if (a === 0 || a === m) { a += 0.5; m += 1; } return { yi: Math.log(a / (m - a)), vi: 1 / a + 1 / (m - a) }; }
  if (tr === 'PFT') return { yi: Math.asin(Math.sqrt(x / (n + 1))) + Math.asin(Math.sqrt((x + 1) / (n + 1))), vi: 1 / (n + 0.5) };
  if (tr === 'PRAW') { const a = x === 0 || x === n ? x + 0.5 : x, m = x === 0 || x === n ? n + 1 : n, p = a / m; return { yi: x / n, vi: p * (1 - p) / m }; }
  if (tr === 'IRLN') { const a = x === 0 ? 0.5 : x; return { yi: Math.log(a / n), vi: 1 / a }; }
  if (tr === 'IRS') return { yi: Math.sqrt(x / n), vi: 1 / (4 * n) };
  if (tr === 'IR') return { yi: x / n, vi: Math.max(x, 0.5) / (n * n) };
  return null;
}
// retrotransformación; nh = media armónica de los tamaños (solo PFT, fórmula de Miller 1978)
export function backTr(tr, y, nh) {
  if (tr === 'PLO') return 1 / (1 + Math.exp(-y));
  if (tr === 'PFT') { const t = Math.min(Math.max(y, 0), Math.PI), s = Math.sin(t), c = Math.cos(t), v = 1 - (s + (s - 1 / s) / nh) ** 2; return t === 0 ? 0 : t === Math.PI ? 1 : Math.min(1, Math.max(0, 0.5 * (1 - Math.sign(c) * Math.sqrt(Math.max(v, 0))))); }
  if (tr === 'IRLN') return Math.exp(y);
  if (tr === 'IRS') return y * y;
  return y;
}
// IC de Wilson de un estudio (proporciones)
export function wilson(x, n, level = 0.95) {
  const z = qnorm(1 - (1 - level) / 2), p = x / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}
// IC aproximado de Byar para una tasa (casos x, tiempo t)
export function byar(x, t, level = 0.95) {
  const z = qnorm(1 - (1 - level) / 2), lo = x === 0 ? 0 : x * (1 - 1 / (9 * x) - z / (3 * Math.sqrt(x))) ** 3, x1 = x + 1;
  return [lo / t, x1 * (1 - 1 / (9 * x1) + z / (3 * Math.sqrt(x1))) ** 3 / t];
}
// estudios → ajuste combinado en la escala original (proporción 0–1 o tasa por unidad de tiempo-persona)
export function poolProp(xs, ns, tr, { method = 'REML', test = 'z' } = {}) {
  const es = xs.map((x, i) => propES(x, ns[i], tr)), ok = es.map((e, i) => (e ? i : -1)).filter(i => i >= 0);
  if (!ok.length) return null;
  const fit = rma(ok.map(i => es[i].yi), ok.map(i => es[i].vi), { method, test }), nh = ok.length / ok.reduce((a, i) => a + 1 / ns[i], 0), b = y => backTr(tr, y, nh);
  const Q = fit.QE, k = fit.k, I2q = k > 1 && Q > 0 ? Math.max(0, 100 * (Q - (k - 1)) / Q) : 0;
  return { fit, I2q, idx: ok, nh, est: b(fit.est), lo: b(fit.ci[0]), hi: b(fit.ci[1]), pi: fit.k >= 3 ? [b(fit.pi[0]), b(fit.pi[1])] : null, back: b };
}
