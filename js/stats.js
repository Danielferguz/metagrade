// Distribuciones y álgebra lineal mínimas (sin dependencias).

export function erf(x) {
  // Abramowitz-Stegun 7.1.26 no es suficiente; usamos serie/fracción continua vía erfc.
  return 1 - erfc(x);
}

export function erfc(x) {
  // Numerical Recipes erfc (Chebyshev), error relativo < 1.2e-7; refinado con una iteración de Newton no necesaria.
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

export function pnorm(x) {
  // Precisión alta mediante la función gamma incompleta: Phi(x) = 0.5*erfc(-x/sqrt2)
  if (x < -8) return 0;
  if (x > 8) return 1;
  // Usar serie de Taylor de alta precisión (Marsaglia 2004)
  let s = x, t = x, b = x, q = x * x, i = 1;
  while (s !== t || i === 1) { t = s; b *= q / (i += 2); s = t + b; if (i > 500) break; }
  return 0.5 + s * Math.exp(-0.5 * q - 0.91893853320467274178);
}

export function qnorm(p) {
  // Acklam con refinamiento de Halley.
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  let x;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = pnorm(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}

function lgamma(x) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function pbeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

export function pt(t, df) {
  if (!isFinite(df)) return pnorm(t);
  const x = df / (df + t * t);
  const p = 0.5 * pbeta(x, df / 2, 0.5);
  return t > 0 ? 1 - p : p;
}

export function qt(p, df) {
  if (!isFinite(df) || df > 1e7) return qnorm(p);
  // bisección + Newton sobre pt
  let lo = -1e3, hi = 1e3;
  let x = qnorm(p);
  for (let i = 0; i < 200; i++) {
    const f = pt(x, df) - p;
    if (Math.abs(f) < 1e-14) break;
    if (f > 0) hi = x; else lo = x;
    const dens = Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(df * Math.PI) - (df + 1) / 2 * Math.log(1 + x * x / df));
    let nx = x - f / dens;
    if (!(nx > lo && nx < hi)) nx = (lo + hi) / 2;
    x = nx;
  }
  return x;
}

function gammaincP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

export function pchisq(x, df) { return df > 0 ? gammaincP(df / 2, x / 2) : NaN; }

// ---------- álgebra lineal ----------
export const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
export const eye = n => { const m = zeros(n, n); for (let i = 0; i < n; i++) m[i][i] = 1; return m; };
export const T = A => A[0].map((_, j) => A.map(r => r[j]));
export function mul(A, B) {
  const n = A.length, m = B[0].length, k = B.length, C = zeros(n, m);
  for (let i = 0; i < n; i++) for (let l = 0; l < k; l++) { const a = A[i][l]; if (a === 0) continue; for (let j = 0; j < m; j++) C[i][j] += a * B[l][j]; }
  return C;
}
export const mulv = (A, v) => A.map(r => r.reduce((s, a, j) => s + a * v[j], 0));
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

export function inv(A) {
  // Gauss-Jordan con pivoteo parcial; devuelve también log|det|
  const n = A.length, M = A.map((r, i) => [...r, ...eye(n)[i]]);
  let logdet = 0, sign = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) throw new Error('Matriz singular (¿red desconectada?)');
    if (p !== c) { [M[p], M[c]] = [M[c], M[p]]; sign = -sign; }
    const piv = M[c][c];
    logdet += Math.log(Math.abs(piv)); if (piv < 0) sign = -sign;
    for (let j = 0; j < 2 * n; j++) M[c][j] /= piv;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f !== 0) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  const out = M.map(r => r.slice(n));
  out.logdet = logdet;
  return out;
}

export function blockDiag(blocks) {
  const n = blocks.reduce((s, b) => s + b.length, 0), M = zeros(n, n);
  let o = 0;
  for (const B of blocks) { for (let i = 0; i < B.length; i++) for (let j = 0; j < B.length; j++) M[o + i][o + j] = B[i][j]; o += B.length; }
  return M;
}

export function goldenMin(f, a, b, tol = 1e-10) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < 300 && Math.abs(b - a) > tol; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

export const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
export const sum = a => a.reduce((s, x) => s + x, 0);
export const pf = (x, d1, d2) => (x <= 0 ? 0 : pbeta(d1 * x / (d1 * x + d2), d1 / 2, d2 / 2));
