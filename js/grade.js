// Calificación de la certeza: Core GRADE (pares) y GRADE para NMA.
// Las reglas producen SUGERENCIAS trazables; el usuario puede modificar cada dominio.
import { qnorm, sum } from './stats.js?v=2026.10.16-5';

export const LEVELS = { 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Very low' };
export const SYM = { 4: '⨁⨁⨁⨁', 3: '⨁⨁⨁◯', 2: '⨁⨁◯◯', 1: '⨁◯◯◯' };
export const DOMAIN_LABEL = { rob: 'Risk of bias', inc: 'Inconsistency', ind: 'Indirectness', imp: 'Imprecision', pub: 'Publication bias', intr: 'Intransitivity', coh: 'Incoherence' };
export const SEVERITY = ['not serious', 'serious', 'very serious', 'extremely serious'];

// ---------- efectos absolutos ----------
export function riskWith(measure, rel, p0) {
  if (measure === 'RR') return Math.min(1, rel * p0);
  if (measure === 'OR') return rel * p0 / (1 - p0 + rel * p0);
  if (measure === 'HR') return 1 - Math.pow(1 - p0, rel);
  return NaN;
}
// est, lo, hi en escala de análisis (log para RR/OR/HR); devuelve diferencia absoluta (proporción o unidades)
export function absolute(measure, est, lo, hi, p0) {
  if (['RR', 'OR', 'HR'].includes(measure)) {
    const f = x => riskWith(measure, Math.exp(x), p0) - p0;
    const r = [f(est), f(lo), f(hi)];
    return { d: r[0], lo: Math.min(r[1], r[2]), hi: Math.max(r[1], r[2]), p1: p0 + r[0], binary: true };
  }
  if (measure === 'RD') return { d: est, lo, hi, p1: p0 + est, binary: true };
  return { d: est, lo, hi, binary: false };
}

// ---------- OIS ----------
export function oisBinary(p0, rrr = 0.25, alpha = 0.05, power = 0.8, increase = false) {
  const p1 = increase ? p0 / (1 - rrr) : p0 * (1 - rrr);
  if (!(p1 > 0 && p1 < 1)) return NaN;
  const pb = (p0 + p1) / 2, za = qnorm(1 - alpha / 2), zb = qnorm(power);
  const n = (za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p0 * (1 - p0) + p1 * (1 - p1))) ** 2 / (p0 - p1) ** 2;
  return 2 * Math.ceil(n);
}
export function oisContinuous(mid, sd, alpha = 0.05, power = 0.8) {
  const za = qnorm(1 - alpha / 2), zb = qnorm(power);
  return 2 * Math.ceil(2 * (za + zb) ** 2 * sd * sd / (mid * mid));
}
// Tamaño muestral efectivo de una estimación (GRADE 33): un ECA de 2 brazos iguales con el mismo IC
export function effectiveN(measure, est, lo, hi, pc, sd) {
  if (measure === 'MD') { const se = (hi - lo) / 3.92; return 2 * Math.round(2 * sd * sd / (se * se)); }
  const se = (hi - lo) / 3.92; // en escala log
  const rel = Math.exp(est);
  if (measure === 'RR') return 2 * Math.round((1 / pc + 1 / (rel * pc) - 2) / (se * se));
  const pt = pc * rel / (1 - pc + pc * rel);
  return 2 * Math.round((1 / pc + 1 / (1 - pc) + 1 / pt + 1 / (1 - pt)) / (se * se));
}

// ---------- categoría y lenguaje ----------
// d: diferencia absoluta con signo (intervención - comparador); higherBetter: si un valor mayor es deseable
// Umbrales positivos de la imprecisión: esquema 2 (±MID) o 3 (pequeño, moderado, grande por lado)
export function thresholdSet(scheme, mid, moderate, large) {
  if (!(mid > 0)) return [];
  if (+scheme !== 3) return [mid];
  return [mid, moderate, large].filter((v, i, a) => v > 0 && (i === 0 || v > a[i - 1]));
}
// número de umbrales (±t, o el nulo si no hay umbrales) que cruza el intervalo [lo, hi]
export function crossings(lo, hi, ths) {
  const all = ths.length ? ths.flatMap(t => [-t, t]) : [0];
  return all.filter(t => lo < t && hi > t);
}
// magnitud del efecto para el marco EtD: dirección y tamaño (0 trivial, 1 pequeño, 2 moderado, 3 grande)
export function magnitude(d, ths, higherBetter) {
  const v = higherBetter ? d : -d, a = Math.abs(v);
  const size = ths.filter(t => a >= t).length;
  return { dir: size === 0 ? 'none' : v > 0 ? 'benefit' : 'harm', size: Math.min(3, size) };
}
// regla del intervalo de predicción: umbrales ±MID que cruza el IP y no cruza el IC (1 → −1; ≥2 → −2)
export function piRule(ci, pi, mid) {
  if (!pi || !isFinite(pi[0]) || !isFinite(pi[1])) return { level: 0, extra: [] };
  const ths = mid > 0 ? [mid] : [];
  const inCI = new Set(crossings(ci[0], ci[1], ths)), extra = crossings(pi[0], pi[1], ths).filter(t => !inCI.has(t));
  return { level: Math.min(2, extra.length), extra };
}

export function category(d, mid, higherBetter, ciLo, ciHi) {
  const s = higherBetter ? 1 : -1;
  if (!(mid > 0)) {
    if (ciLo <= 0 && ciHi >= 0) return 'nodiff';
    return d * s > 0 ? 'benefit' : 'harm';
  }
  if (d * s >= mid) return 'benefit';
  if (d * s <= -mid) return 'harm';
  return 'nodiff';
}
export function legendText(cat, c, comparator, nma = false) {
  if (c <= 1) return 'The evidence is very uncertain';
  const adv = { 4: 'Definitely', 3: 'Probably', 2: 'May be' }[c];
  const ben = nma ? 'more effective than' : 'more beneficial than', harm = nma ? 'less effective than' : 'more harmful than';
  return `${adv} ${cat === 'benefit' ? ben : cat === 'harm' ? harm : 'no different from'} ${comparator}`;
}
export function plainStatement(cat, c, intervention, outcome, threshold, d = 0) {
  if (c <= 1) return `The evidence is very uncertain about the effect of ${intervention} on ${outcome}.`;
  const imp = threshold === 'MID' ? 'important ' : '';
  const X = cap(intervention);
  if (cat === 'nodiff') return `${X} ${c === 4 ? 'has' : c === 3 ? 'probably has' : 'may have'} little to no ${imp}effect on ${outcome}.`;
  const verb = c === 4 ? 'results' : c === 3 ? 'probably results' : 'may result';
  const w = `${imp}${d < 0 ? 'reduction' : 'increase'}`;
  return `${X} ${verb} in ${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w} in ${outcome}.`;
}
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// ---------- Core GRADE por pares ----------
// fit: salida de rma(); studies: [{study, yi, vi, rob, indirect, n}] en el mismo orden que fit.idx
export function gradePairwise(cfg) {
  const { fit, studies, measure, design = 'RCT', threshold = 'MID', mid = 0, p0 = NaN, higherBetter = true,
    robDominance = 0.65, someConcernsAsHigh = false, oisRRR = 0.25, power = 0.8, sdForOIS = NaN, eggerRes = null,
    industrySmall = false, surrogate = false, doseResponse = false, unit = 100, scheme = 2, moderate = NaN, large = NaN, usePI = true } = cfg;
  const w = fit.weights, k = fit.k;
  const ab = absolute(measure, fit.est, fit.ci[0], fit.ci[1], p0);
  const scale = ab.binary ? unit : 1;
  const D = { d: ab.d * scale, lo: ab.lo * scale, hi: ab.hi * scale };
  const out = { domains: {}, notes: [], close: [] };
  const isHigh = r => /high|serious|critical/i.test(r || '') || (someConcernsAsHigh && /some|unclear|moderate/i.test(r || ''));

  // Riesgo de sesgo (Core GRADE 4)
  const highShare = sum(studies.map((s, i) => isHigh(s.rob) ? w[i] : 0));
  const lowShare = 1 - highShare;
  let rob = 0, robWhy;
  if (highShare > robDominance) {
    rob = 1; robWhy = `Studies at high risk of bias contributed ${(highShare * 100).toFixed(0)}% of the weight (dominant, >${(robDominance * 100).toFixed(0)}%)`;
    if (Math.abs(highShare - robDominance) < 0.1) out.close.push('rob');
  } else {
    robWhy = studies.some((s) => isHigh(s.rob))
      ? `Studies at high risk of bias contributed ${(highShare * 100).toFixed(0)}% of the weight; appreciable evidence from low-risk studies (${(lowShare * 100).toFixed(0)}%) — compare low- vs high-risk results before deciding`
      : 'No study at high risk of bias';
  }
  if (design === 'NRSI' && rob === 0) robWhy += '; residual confounding is reflected in the low starting level';
  out.domains.rob = { level: rob, why: robWhy, highShare };

  // Inconsistencia (Core GRADE 3): criterios visuales operacionalizados
  let inc = 0, incWhy = 'Single study: not applicable';
  if (k >= 2) {
    const ths = threshold === 'MID' && mid > 0 ? [-mid, mid] : [0];
    const cat = x => ths.filter(t => x > t).length;
    const absStudy = studies.map(s => absolute(measure, s.yi, s.yi, s.yi, p0).d * scale);
    const pooledCat = cat(D.d);
    const same = sum(studies.map((s, i) => cat(absStudy[i]) === pooledCat ? w[i] : 0));
    let nonOverlap = false;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const si = Math.sqrt(studies[i].vi), sj = Math.sqrt(studies[j].vi);
      if (studies[i].yi + 1.96 * si < studies[j].yi - 1.96 * sj || studies[j].yi + 1.96 * sj < studies[i].yi - 1.96 * si) nonOverlap = true;
    }
    const I2 = fit.I2;
    if (same >= 0.8 || (!nonOverlap && I2 < 30)) {
      inc = 0;
      incWhy = `${(same * 100).toFixed(0)}% of the weight from studies on the same side of the threshold as the pooled estimate${nonOverlap ? '' : '; confidence intervals overlap'}; I² = ${I2.toFixed(0)}% (secondary criterion)`;
      if (same < 0.85 && same >= 0.8) out.close.push('inc');
    } else {
      inc = 1;
      incWhy = `Point estimates on different sides of the threshold (${(same * 100).toFixed(0)}% of the weight on the side of the pooled estimate)${nonOverlap ? ', some confidence intervals do not overlap' : ''}; I² = ${I2.toFixed(0)}%. Explore a priori subgroup hypotheses before rating down`;
    }
    // intervalo de predicción frente a ±MID (o el nulo) en escala absoluta
    let piAbs = null, pr = { level: 0, extra: [] };
    if (k >= 3 && fit.method !== 'EE' && isFinite(fit.pi[0])) {
      const a = absolute(measure, fit.est, fit.pi[0], fit.pi[1], p0);
      piAbs = [a.lo * scale, a.hi * scale];
      if (usePI) pr = piRule([D.lo, D.hi], piAbs, threshold === 'MID' ? mid : 0);
    }
    if (pr.level > inc) {
      inc = pr.level;
      const f = x => (Math.abs(x) < 10 ? x.toFixed(1) : x.toFixed(0));
      incWhy = `The 95% prediction interval (${f(piAbs[0])} to ${f(piAbs[1])}${ab.binary ? ' per ' + unit : ''}) crosses ${pr.level === 2 ? 'both MID thresholds' : threshold === 'MID' && mid > 0 ? 'an MID threshold' : 'the null'} that the confidence interval of the pooled estimate does not cross (−${pr.level}); ` + incWhy.charAt(0).toLowerCase() + incWhy.slice(1);
    } else if (piAbs && usePI) incWhy += `; 95% prediction interval ${pr.level ? `also crosses ${pr.level === 2 ? 'both MID thresholds' : 'an MID threshold'} not crossed by the CI (−${pr.level})` : 'does not cross thresholds beyond those crossed by the CI'}`;
    out.domains.inc = { level: inc, why: incWhy, same, nonOverlap, I2, piAbs, piLevel: pr.level };
  } else out.domains.inc = { level: 0, why: incWhy };

  // Indirectness (Core GRADE 5)
  const indShare = sum(studies.map((s, i) => (s.indirect && !/^(0|no|false|low|)$/i.test(String(s.indirect).trim())) ? w[i] : 0));
  let ind = indShare > 0.5 ? 1 : 0;
  let indWhy = indShare > 0 ? `${(indShare * 100).toFixed(0)}% of the weight from studies flagged as indirect (population, intervention, comparator or outcome)` : 'Studies match the target PICO';
  if (surrogate) { ind = Math.max(ind, 1); indWhy = 'Outcome is a surrogate for the patient-important outcome' + (indShare > 0 ? '; ' + indWhy : ''); }
  out.domains.ind = { level: ind, why: indWhy, share: indShare };

  // Imprecisión (Core GRADE 2; GRADE 34/35)
  let imp = 0, impWhy, oisVal = NaN;
  const crosses = t => D.lo < t && D.hi > t;
  const fmt = x => (Math.abs(x) < 10 ? x.toFixed(1) : x.toFixed(0));
  const unitTxt = ab.binary ? ` per ${unit}` : '';
  const ths = threshold === 'MID' ? thresholdSet(scheme, mid, moderate, large) : [];
  if (threshold === 'MID' && mid > 0 && ths.length > 1) {
    const cr = crossings(D.lo, D.hi, ths), n = cr.length;
    imp = Math.min(3, n);
    impWhy = n ? `95% CI of the absolute effect (${fmt(D.lo)} to ${fmt(D.hi)}${unitTxt}) crosses ${n} decision threshold${n > 1 ? 's' : ''} (${cr.map(t => (t > 0 ? '+' : '−') + fmt(Math.abs(t))).join(', ')}; small ±${fmt(ths[0])}, moderate ±${fmt(ths[1] ?? NaN)}, large ±${fmt(ths[2] ?? NaN)})` : '';
  } else if (threshold === 'MID' && mid > 0) {
    const n = [-mid, mid].filter(crosses).length;
    imp = n;
    impWhy = n ? `95% CI of the absolute effect (${fmt(D.lo)} to ${fmt(D.hi)}${unitTxt}) crosses ${n === 2 ? 'both the lower and the upper MID (±' + mid + ')' : 'one MID threshold (±' + mid + ')'}` : '';
  } else {
    if (crosses(0)) {
      imp = 1; impWhy = '95% CI of the absolute effect crosses the null';
      if (mid > 0 && D.lo < -mid && D.hi > mid) { imp = 2; impWhy += ' and includes both important benefit and important harm'; }
    }
  }
  const ntot = sum(studies.map(s => +s.n || 0));
  if (!imp) {
    if (ab.binary && ['RR', 'OR', 'HR'].includes(measure)) {
      const rel = Math.exp(fit.est), rrr = rel < 1 ? 1 - rel : 1 - 1 / rel;
      const ratio = Math.exp(fit.ci[1] - fit.ci[0]);
      const cut = measure === 'OR' ? 2.5 : 3;
      if (rrr > 0.3) {
        const ois = oisBinary(p0, oisRRR, 0.05, power, rel > 1); oisVal = ois;
        if (ratio >= cut) { imp = 2; impWhy = `Large effect (relative change ${(rrr * 100).toFixed(0)}%) with upper/lower CI ratio ${ratio.toFixed(1)} (≥${cut}): sample size far below the optimal information size`; }
        else if (ntot && ntot < ois) { imp = 1; impWhy = `Although the CI does not cross the threshold, the effect is large (relative change ${(rrr * 100).toFixed(0)}%) and the total sample size (${ntot}) is below the optimal information size (${ois}; RRR ${oisRRR * 100}%, α 0.05, power ${power * 100}%)`; if (ntot > 0.9 * ois) out.close.push('imp'); }
        else impWhy = `CI does not cross the threshold; large effect but optimal information size met (${ntot} ≥ ${ois})`;
      } else impWhy = `95% CI (${fmt(D.lo)} to ${fmt(D.hi)}${unitTxt}) does not cross the threshold; modest effect, OIS not required`;
    } else {
      const ois = isFinite(sdForOIS) && mid > 0 ? oisContinuous(mid, sdForOIS, 0.05, power) : 800; oisVal = ois;
      if (ntot && ntot < ois) { imp = ntot < 0.5 * ois ? 2 : 1; impWhy = `CI does not cross the threshold but the total sample size (${ntot}) is below the optimal information size (${ois}${isFinite(sdForOIS) ? '' : ', rule of thumb 400 per group'})`; }
      else impWhy = `95% CI (${fmt(D.lo)} to ${fmt(D.hi)}) does not cross the threshold${ntot ? '; sample size adequate' : ''}`;
    }
  }
  out.domains.imp = { level: imp, why: impWhy, ntot, ois: oisVal, ths };

  // Sesgo de publicación (Core GRADE 4)
  let pub = 0, pubWhy = k >= 10 ? 'Funnel plot/Egger test do not suggest small-study effects' : 'Fewer than 10 studies: statistical assessment not feasible; undetected';
  if (k >= 10 && eggerRes && eggerRes.p < 0.10) { pub = 1; pubWhy = `Egger test p = ${eggerRes.p.toFixed(2)}: small-study effects; publication bias suspected`; }
  if (industrySmall) { pub = 1; pubWhy = 'Most or all studies small and industry-sponsored: publication bias strongly suspected'; }
  out.domains.pub = { level: pub, why: pubWhy };

  // Subir (solo no aleatorizados)
  let up = 0, upWhy = '';
  const start = design === 'RCT' || design === 'NRSI_TTE' ? 4 : 2;
  if (start === 2 && rob === 0 && imp === 0 && ['RR', 'OR', 'HR'].includes(measure)) {
    const r = Math.exp(fit.est);
    if (r >= 5 || r <= 0.2) { up = 2; upWhy = 'Very large effect (RR ≥5 or ≤0.2)'; }
    else if (r >= 2 || r <= 0.5) { up = 1; upWhy = 'Large effect (RR ≥2 or ≤0.5)'; }
  }
  if (start === 2 && doseResponse) { up = Math.min(2, up + 1); upWhy += (upWhy ? '; ' : '') + 'Dose–response gradient'; }
  out.up = { level: up, why: upWhy };
  out.start = start;
  out.abs = D; out.ab = ab; out.unit = unit;
  return out;
}

export function finalCertainty(g, overrides = {}) {
  const lv = d => (overrides[d] != null ? +overrides[d] : g.domains[d] ? g.domains[d].level : 0);
  const down = ['rob', 'inc', 'ind', 'imp', 'pub', 'intr', 'coh'].reduce((s, d) => s + lv(d), 0);
  const up = overrides.up != null ? +overrides.up : g.up ? g.up.level : 0;
  return Math.max(1, Math.min(4, g.start - down + up));
}

// Notas al pie (inglés, para el manuscrito)
export function footnotes(g, overrides = {}) {
  const notes = [];
  for (const d of ['rob', 'inc', 'ind', 'imp', 'pub', 'intr', 'coh']) {
    if (!g.domains[d]) continue;
    const lv = overrides[d] != null ? +overrides[d] : g.domains[d].level;
    if (lv > 0) notes.push(`${DOMAIN_LABEL[d]} (−${lv}): ${overrides[d + '_why'] || g.domains[d].why}.`);
  }
  const up = overrides.up != null ? +overrides.up : g.up ? g.up.level : 0;
  if (up > 0) notes.push(`Rated up (+${up}): ${g.up.why}.`);
  if (g.start === 2) notes.unshift('Non-randomised studies: certainty started at low.');
  return notes;
}

// ---------- GRADE para NMA ----------
// cfg: { m (NMA), rob: {study: level}, indirect: {study: flag}, modifier: {study: value}, mid, large, unit,
//        baseline: t => p0, higherBetter, incP (0.05), robShare (0.5), oisRRR }
export function gradeNMA(cfg, pairs) {
  const { m, rob = {}, indirect = {}, modifier = {}, mid = 0, large = 0, unit = 100, baseline, higherBetter = true,
    incP = 0.10, robShare = 0.5, oisRRR = 0.25, power = 0.8, sd = NaN, scheme = 2, moderate = NaN, usePI = true } = cfg;
  const thsN = thresholdSet(scheme, mid, moderate, large);
  const isHigh = r => /high|serious|critical/i.test(r || '');
  const isInd = v => v && !/^(0|no|false|low|)$/i.test(String(v).trim());
  const measure = m.outcome === 'binary' ? 'OR' : 'MD';
  const dcert = {};
  const key = (a, b) => [a, b].sort().join(' || ');
  for (const e of m.edges()) {
    const dr = m.direct(e.a, e.b); if (!dr) continue;
    let c = 4; const reasons = [];
    const hs = sum(dr.studies.map((s, i) => isHigh(rob[s]) ? dr.weights[i] : 0));
    if (hs > robShare) { c--; reasons.push(['rob', `Risk of bias (−1): ${(hs * 100).toFixed(0)}% of the weight from trials at high risk of bias (${dr.studies.filter(s => isHigh(rob[s])).join('; ')})`]); }
    const is = sum(dr.studies.map((s, i) => isInd(indirect[s]) ? dr.weights[i] : 0));
    if (is > 0.5) { c--; reasons.push(['ind', `Indirectness (−1): ${dr.studies.filter(s => isInd(indirect[s])).map(s => s + (typeof indirect[s] === 'string' && indirect[s].length > 2 ? ', ' + indirect[s] : '')).join('; ')}`]); }
    if (dr.k >= 2 && dr.I2 > 0.5) { c--; reasons.push(['inc', `Inconsistency (−1): I² = ${(dr.I2 * 100).toFixed(0)}% across ${dr.k} trials (check the forest plot)`]); }
    dcert[key(e.a, e.b)] = { c: Math.max(1, c), reasons, dr };
  }
  const adj = {};
  for (const [k2, d] of Object.entries(dcert)) { const [a, b] = k2.split(' || '); (adj[a] = adj[a] || {})[b] = d.dr.se ** 2; (adj[b] = adj[b] || {})[a] = d.dr.se ** 2; }
  const ns = Object.fromEntries(m.netsplit().map(x => [key(x.a, x.b), x]));
  const dd = m.designDecomp();
  const shortest = (a, b, skip) => {
    // Dijkstra con peso = varianza
    const dist = { [a]: 0 }, prev = {}, Q = new Set(Object.keys(adj));
    while (Q.size) {
      let u = null; for (const q of Q) if (dist[q] != null && (u == null || dist[q] < dist[u])) u = q;
      if (u == null) break; Q.delete(u); if (u === b) break;
      for (const [v, wv] of Object.entries(adj[u] || {})) { if (key(u, v) === skip) continue; const nd = dist[u] + wv; if (dist[v] == null || nd < dist[v]) { dist[v] = nd; prev[v] = u; } }
    }
    if (dist[b] == null) return null;
    const p = [b]; while (p[0] !== a) p.unshift(prev[p[0]]); return p;
  };
  const out = [];
  for (const [a, b] of pairs) {
    const kk = key(a, b), [e, s] = m.est(a, b), D0 = dcert[kk];
    // orientar la evidencia directa como a vs b (las aristas se guardan en orden alfabético)
    const D = D0 ? { ...D0, dr: m.direct(a, b) } : null;
    // indirecta: lazo de primer orden dominante o camino más corto
    let path = null;
    const common = Object.keys(adj[a] || {}).filter(c => c !== b && adj[b] && adj[b][c] != null);
    if (common.length) { const c = common.reduce((x, y) => (adj[a][x] + adj[b][x] <= adj[a][y] + adj[b][y] ? x : y)); path = [a, c, b]; }
    else path = shortest(a, b, kk);
    let indC = null; const indR = []; let loop = [];
    if (path) {
      const edges = path.slice(1).map((x, i) => key(path[i], x));
      loop = path.slice(1).map((x, i) => ({ a: path[i], b: x, c: dcert[key(path[i], x)].c, reasons: dcert[key(path[i], x)].reasons, k: dcert[key(path[i], x)].dr.k }));
      indC = Math.min(...edges.map(x => dcert[x].c));
      indR.push(['path', `${path.length === 3 ? 'First-order loop' : 'Higher-order path'}: ${path.join(' → ')} (lowest direct certainty ${LEVELS[indC]})`]);
      const mods = new Set(edges.flatMap(x => dcert[x].dr.studies.map(st => modifier[st]).filter(v => v != null && v !== '')));
      if (mods.size > 1) { indC = Math.max(1, indC - 1); indR.push(['intr', `Intransitivity (−1): the indirect path combines trials with different levels of the effect modifier (${[...mods].join(', ')})`]); }
    }
    const ns0 = ns[kk];
    const nsd = ns0 && ns0.a !== a ? { ...ns0, a, b, dir: -ns0.dir, ind: -ns0.ind, net: -ns0.net, diff: -ns0.diff } : ns0;
    const hasInd = path && (!D || (nsd && isFinite(nsd.ind)));
    let start, basis;
    if (D && hasInd) {
      const pd = nsd.prop_dir;
      if (pd > 0.6) { start = D.c; basis = `direct dominates (${(pd * 100).toFixed(0)}%)`; }
      else if (pd < 0.4) { start = indC; basis = `indirect dominates (${((1 - pd) * 100).toFixed(0)}%)`; }
      else { start = Math.max(D.c, indC); basis = 'similar contribution: higher of direct and indirect'; }
    } else if (D) { start = D.c; basis = 'direct only'; }
    else { start = indC ?? 1; basis = 'indirect only'; }
    // razones que realmente determinan el punto de partida (para las notas al pie)
    let applied = [];
    const intr = indR.filter(x => x[0] === 'intr');
    if (basis.startsWith('direct')) applied = D.reasons;
    else if (basis.startsWith('indirect')) applied = intr;
    else applied = D.c >= indC ? D.reasons : intr;
    let c = start; const nr = [];
    if (D && hasInd && isFinite(nsd.p)) {
      if (nsd.p < incP && nsd.prop_dir >= 0.2 && nsd.prop_dir <= 0.8) { c--; nr.push(['coh', `Incoherence (−1): direct and indirect estimates differ (node-split p = ${nsd.p.toFixed(2)})`]); }
      else if (nsd.p < incP) nr.push(['cohflag', `Node-split p = ${nsd.p.toFixed(2)} but one source dominates; not rated down (review)`]);
    }
    // imprecisión en escala absoluta
    const p0 = m.outcome === 'binary' ? baseline(b) : NaN;
    const ab = absolute(measure, e, e - 1.96 * s, e + 1.96 * s, p0), sc = ab.binary ? unit : 1;
    const r = [ab.d * sc, ab.lo * sc, ab.hi * sc];
    // heterogeneidad: intervalo de predicción de la estimación de red frente a ±MID
    let piAbs = null;
    if (m.tau2 > 0) {
      const pi = m.predInt(a, b);
      if (isFinite(pi[0])) { const pa = absolute(measure, e, pi[0], pi[1], p0); piAbs = [pa.lo * sc, pa.hi * sc]; }
    }
    if (usePI && piAbs) {
      const pr = piRule([r[1], r[2]], piAbs, mid), already = applied.some(x => x[0] === 'inc') ? 1 : 0, lvl = Math.max(0, pr.level - already);
      if (lvl) { c -= lvl; nr.push(['inc', `Inconsistency (−${lvl}): the 95% prediction interval of the network estimate crosses ${pr.level === 2 ? 'both MID thresholds' : mid > 0 ? 'an MID threshold' : 'the null'} that the confidence interval does not cross`]); }
    }
    let ess = NaN, ois = NaN, impLvl = 0;
    if (+scheme === 3 && thsN.length > 1) {
      const cr = crossings(r[1], r[2], thsN), lvl = Math.min(3, cr.length);
      if (lvl) { c -= lvl; impLvl = lvl; nr.push(['imp', `Imprecision (−${lvl}): 95% CI of the absolute effect crosses ${cr.length} decision threshold${cr.length > 1 ? 's' : ''} (small ±${thsN[0]}, moderate ±${thsN[1] ?? '–'}, large ±${thsN[2] ?? '–'}${ab.binary ? ' per ' + unit : ''})`]); }
    }
    const ths = mid > 0 ? [-mid, mid] : [0];
    const cross = +scheme === 3 && thsN.length > 1 ? 0 : ths.filter(t => r[1] < t && r[2] > t).length;
    if (impLvl) { /* ya calificado con el esquema de 3 umbrales */ } else if (cross) {
      let lvl = cross;
      if (cross === 2 && large > 0 && r[1] < -large && r[2] > large) lvl = 3;
      c -= lvl; impLvl = lvl;
      nr.push(['imp', `Imprecision (−${lvl}): 95% CI of the absolute effect crosses ${cross === 2 ? 'both decision thresholds' : 'one decision threshold'} (±${mid || 0}${ab.binary ? ' per ' + unit : ''})${lvl === 3 ? ' and spans large benefit to large harm' : ''}`]);
    } else {
      let why = '';
      if (measure === 'OR') {
        const rel = Math.exp(e), rrr = rel < 1 ? 1 - rel : 1 - 1 / rel, ratio = Math.exp(3.92 * s);
        if (rrr > 0.3) {
          if (ratio >= 2.5) { c -= 2; impLvl = 2; nr.push(['imp', `Imprecision (−2): large effect with upper/lower CI ratio ${ratio.toFixed(1)} (≥2.5 for OR): optimal information size not met`]); why = 'x'; }
          else {
            ess = effectiveN('OR', e, e - 1.96 * s, e + 1.96 * s, p0); ois = oisBinary(p0, oisRRR, 0.05, power, rel > 1);
            if (ess < ois) { c -= 1; impLvl = 1; nr.push(['imp', `Imprecision (−1): large effect; effective sample size of the estimate (${ess}) below the optimal information size (${ois})`]); }
          }
        }
      } else if (isFinite(sd) && mid > 0) {
        ess = effectiveN('MD', e, e - 1.96 * s, e + 1.96 * s, NaN, sd); ois = oisContinuous(mid, sd, 0.05, power);
        if (ess < ois) { c -= 1; impLvl = 1; nr.push(['imp', `Imprecision (−1): effective sample size (${ess}) below the optimal information size (${ois})`]); }
      }
    }
    c = Math.max(1, c);
    // pasos A2 y B3 (Izcovich 2023): imprecisión de los estimados directo e indirecto; solo se usan si hay incoherencia
    const impOf = (est, se) => {
      if (!isFinite(est) || !isFinite(se)) return null;
      const q = absolute(measure, est, est - 1.96 * se, est + 1.96 * se, p0), rr = [q.d * sc, q.lo * sc, q.hi * sc];
      let lvl;
      if (+scheme === 3 && thsN.length > 1) lvl = Math.min(3, crossings(rr[1], rr[2], thsN).length);
      else { const n = ths.filter(t => rr[1] < t && rr[2] > t).length; lvl = n === 2 && large > 0 && rr[1] < -large && rr[2] > large ? 3 : n; }
      return { est, se, r: rr, lvl };
    };
    const dImp = D ? impOf(D.dr.est, D.dr.se) : null;
    const dFinal = dImp ? Math.max(1, D.c - dImp.lvl) : null;
    const iImp = !D ? impOf(e, s) : nsd && isFinite(nsd.ind) ? impOf(nsd.ind, nsd.se_ind) : null;
    const iFinal = iImp && indC != null ? Math.max(1, indC - iImp.lvl) : null;
    // paso D: mejor estimado; si directo e indirecto son incoherentes, el de mayor certeza final
    const incoherent = !!(D && hasInd && nsd && isFinite(nsd.p) && nsd.p < incP);
    let best = { src: 'network', c, est: e, se: s, r };
    if (incoherent) {
      const cand = [best, dFinal != null ? { src: 'direct', c: dFinal, est: dImp.est, se: dImp.se, r: dImp.r } : null, iFinal != null ? { src: 'indirect', c: iFinal, est: iImp.est, se: iImp.se, r: iImp.r } : null].filter(Boolean);
      best = cand.reduce((x, y) => (y.c > x.c ? y : x));
    }
    const cat = category(r[0], mid, higherBetter, r[1], r[2]);
    const ndir = D ? sum(D.dr.studies.flatMap(st => m.studies[st].filter(x => x.t === a || x.t === b).map(x => +x.n))) : 0;
    out.push({ a, b, est: e, se: s, ess, ois, impLvl, piAbs, ths: thsN, loop, dImp, dFinal, iImp, iFinal, incoherent, best, bestCat: category(best.r[0], mid, higherBetter, best.r[1], best.r[2]), D, path, indC, indR, nsd, start, basis, c, nr, applied, r, p0, cat, ndir, kdir: D ? D.dr.k : 0, measure });
  }
  return { rows: out, dd, dcert };
}
