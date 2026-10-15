// Gráficos SVG: forest plot por pares, forest de NMA frente a la referencia y gráfico de la red.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function scaleFn(lo, hi, x0, x1, log) {
  const f = log ? Math.log : (v => v);
  const a = f(lo), b = f(hi);
  return v => x0 + (f(v) - a) / (b - a) * (x1 - x0);
}
function niceTicks(lo, hi, log) {
  if (log) {
    const cand = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
    return cand.filter(v => v >= lo * 0.999 && v <= hi * 1.001);
  }
  const span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const m = span / step > 20 ? 5 : span / step > 8 ? 2 : 1, st = step * m, out = [];
  for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(10));
  return out;
}

// rows: [{label, est, lo, hi, w (0-1), rob}] en escala natural (ratio si log=true); pooled: {est, lo, hi, pi:[lo,hi]}
export function forestSVG({ rows, pooled, log, measure, leftLabel = 'Favours intervention', rightLabel = 'Favours control', title = '' }) {
  const W = 860, rowH = 22, top = 46, n = rows.length, H = top + (n + 3) * rowH + 40;
  const x0 = 380, x1 = 640;
  const vals = rows.flatMap(r => [r.lo, r.hi]).concat(pooled ? [pooled.lo, pooled.hi] : []).filter(v => isFinite(v) && (!log || v > 0));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (log) { lo = Math.min(lo, 0.9); hi = Math.max(hi, 1.1); lo = Math.max(lo, 0.005); hi = Math.min(hi, 200); }
  else { lo = Math.min(lo, 0); hi = Math.max(hi, 0); const pad = (hi - lo) * 0.05; lo -= pad; hi += pad; }
  const sx = scaleFn(lo, hi, x0, x1, log), clamp = v => Math.max(x0, Math.min(x1, sx(Math.max(v, log ? 1e-9 : -Infinity))));
  const fmt = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="Forest plot">`;
  s += `<style>text{font:12px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.m{fill:var(--muted,#666)}</style>`;
  if (title) s += `<text x="8" y="16" class="h">${esc(title)}</text>`;
  s += `<text x="8" y="38" class="h">Study</text><text x="250" y="38" class="h">Weight</text><text x="${x1 + 20}" y="38" class="h">${esc(measure)} (95% CI)</text>`;
  const ref = log ? 1 : 0;
  s += `<line x1="${sx(ref)}" x2="${sx(ref)}" y1="${top - 6}" y2="${top + (n + 1.6) * rowH}" stroke="currentColor" stroke-width="1"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH + 10, sz = 4 + 10 * Math.sqrt(r.w || 0);
    s += `<text x="8" y="${y + 4}">${esc(r.label)}</text><text x="250" y="${y + 4}" class="m">${r.w != null ? (r.w * 100).toFixed(1) + '%' : ''}</text>`;
    if (isFinite(r.est)) {
      s += `<line x1="${clamp(r.lo)}" x2="${clamp(r.hi)}" y1="${y}" y2="${y}" stroke="currentColor"/>`;
      s += `<rect x="${sx(r.est) - sz / 2}" y="${y - sz / 2}" width="${sz}" height="${sz}" fill="#1F3A5F"/>`;
      s += `<text x="${x1 + 20}" y="${y + 4}">${fmt(r.est)} (${fmt(r.lo)} to ${fmt(r.hi)})</text>`;
    } else s += `<text x="${x1 + 20}" y="${y + 4}" class="m">not estimable</text>`;
    if (r.rob) { const col = /high|serious|critical/i.test(r.rob) ? '#C0392B' : /some|unclear|moderate/i.test(r.rob) ? '#E0A800' : '#2E8B57'; s += `<circle cx="345" cy="${y}" r="6" fill="${col}"><title>Risk of bias: ${esc(r.rob)}</title></circle>`; }
  });
  if (pooled) {
    const y = top + (n + 0.8) * rowH;
    s += `<polygon points="${sx(pooled.lo)},${y} ${sx(pooled.est)},${y - 7} ${sx(pooled.hi)},${y} ${sx(pooled.est)},${y + 7}" fill="#1F3A5F"/>`;
    s += `<text x="8" y="${y + 4}" class="h">${esc(pooled.label || 'Pooled (random effects)')}</text><text x="${x1 + 20}" y="${y + 4}" class="h">${fmt(pooled.est)} (${fmt(pooled.lo)} to ${fmt(pooled.hi)})</text>`;
    if (pooled.pi && isFinite(pooled.pi[0])) {
      const yp = y + rowH;
      s += `<line x1="${clamp(pooled.pi[0])}" x2="${clamp(pooled.pi[1])}" y1="${yp}" y2="${yp}" stroke="#1F3A5F" stroke-width="3" opacity=".45"/>`;
      s += `<text x="8" y="${yp + 4}" class="m">95% prediction interval</text><text x="${x1 + 20}" y="${yp + 4}" class="m">${fmt(pooled.pi[0])} to ${fmt(pooled.pi[1])}</text>`;
    }
    if (pooled.het) s += `<text x="8" y="${y + 2 * rowH + 4}" class="m">${esc(pooled.het)}</text>`;
  }
  const ya = top + (n + 2.4) * rowH + 6;
  s += `<line x1="${x0}" x2="${x1}" y1="${ya}" y2="${ya}" stroke="currentColor"/>`;
  niceTicks(lo, hi, log).forEach(v => { s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${ya}" y2="${ya + 4}" stroke="currentColor"/><text x="${sx(v)}" y="${ya + 16}" text-anchor="middle">${v}</text>`; });
  s += `<text x="${sx(ref) - 6}" y="${ya + 32}" text-anchor="end" class="m">← ${esc(leftLabel)}</text><text x="${sx(ref) + 6}" y="${ya + 32}" class="m">${esc(rightLabel)} →</text>`;
  return s + '</svg>';
}

// Gráfico de red: nodos en círculo, tamaño ∝ participantes, grosor ∝ n.º de estudios
export function networkSVG(nodes, edges, sizes, short = t => t, edgeColor = null) {
  const W = 620, H = 520, cx = W / 2, cy = H / 2, R = 190, n = nodes.length;
  const pos = Object.fromEntries(nodes.map((t, i) => [t, [cx + R * Math.cos(2 * Math.PI * i / n - Math.PI / 2), cy + R * Math.sin(2 * Math.PI * i / n - Math.PI / 2)]]));
  const maxN = Math.max(...nodes.map(t => sizes[t] || 1)), maxK = Math.max(...edges.map(e => e.k));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="Network plot"><style>text{font:11px system-ui,sans-serif;fill:currentColor}</style>`;
  edges.forEach(e => { const [x1, y1] = pos[e.a], [x2, y2] = pos[e.b]; s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${(edgeColor && edgeColor(e)) || '#7A8CA5'}" stroke-width="${1.5 + 7 * e.k / maxK}"><title>${esc(e.a)} vs ${esc(e.b)}: ${e.k} stud${e.k > 1 ? 'ies' : 'y'}</title></line>`; });
  nodes.forEach(t => {
    const [x, y] = pos[t], r = 7 + 18 * Math.sqrt((sizes[t] || 1) / maxN);
    const lx = cx + (R + r + 14) * Math.cos(Math.atan2(y - cy, x - cx)), ly = cy + (R + r + 14) * Math.sin(Math.atan2(y - cy, x - cx));
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#1F3A5F"><title>${esc(t)}: ${sizes[t] || 0} participants</title></circle>`;
    s += `<text x="${lx}" y="${ly + 4}" text-anchor="${lx < cx - 10 ? 'end' : lx > cx + 10 ? 'start' : 'middle'}">${esc(short(t))}</text>`;
  });
  return s + '</svg>';
}

// ---------- Visualización de dominios GRADE ----------
export const ZONE = { benefit: '#E3F1DC', nodiff: '#FFF4CC', harm: '#FBE1E1' };
export const ROB_COL = { low: '#2E8B57', some: '#E0A800', high: '#C0392B', na: '#9AA6B5' };
export const robClass = r => (/high|serious|critical/i.test(r || '') ? 'high' : /some|unclear|moderate/i.test(r || '') ? 'some' : /low/i.test(r || '') ? 'low' : 'na');
const sgn = v => (Math.abs(v) >= 10 ? Math.round(v).toString() : v.toFixed(1));
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + sgn(Math.abs(v));

// Texto de la regla de imprecisión: qué umbrales cruza el IC
export function crossLabel(lo, hi, mid, ths = null) {
  if (ths && ths.length > 1) {
    const n = ths.flatMap(t => [-t, t]).filter(t => lo < t && hi > t).length;
    return n ? `Crosses ${n} threshold${n > 1 ? 's' : ''} → −${Math.min(3, n)}` : 'CI within one zone → 0';
  }
  if (mid > 0) {
    const a = lo < -mid && hi > -mid, b = lo < mid && hi > mid;
    if (a && b) return 'Crosses both MIDs → −2';
    if (a || b) return `Crosses ${b ? '+' : '−'}MID → −1`;
    return 'CI within one zone → 0';
  }
  return lo < 0 && hi > 0 ? 'Crosses the null → −1' : 'Excludes the null → 0';
}

// Panel de umbrales (Figura S1 B): efectos absolutos con IC frente a ±MID y zonas sombreadas.
// rows: [{label, sub, d, lo, hi, w, fill, chip, right, badge:{text, fill}, bold, pi:[lo,hi]}]
const ZONES3 = { benefit: ['#E3F1DC', '#CDE5BF', '#B2D69E'], harm: ['#FBE1E1', '#F4C6C6', '#EBA9A9'] };
export function thresholdSVG({ rows, mid = 0, ths = null, higherBetter = false, xlabel = '', title = '' }) {
  ths = ths && ths.length ? ths : mid > 0 ? [mid] : [];
  mid = ths[0] || 0;
  const tmax = ths.length ? ths[ths.length - 1] : 0;
  const W = 900, rowH = 30, top = title ? 34 : 14, n = rows.length, x0 = 230, x1 = 570;
  const vals = rows.flatMap(r => [r.lo, r.hi, ...(r.pi || [])]).filter(isFinite);
  let lo = Math.min(...vals, mid > 0 ? -(ths.length > 1 ? 1.15 * tmax : 1.6 * mid) : 0), hi = Math.max(...vals, mid > 0 ? (ths.length > 1 ? 1.15 * tmax : 1.6 * mid) : 0);
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const sx = scaleFn(lo, hi, x0, x1, false), cl = v => Math.max(x0, Math.min(x1, sx(v)));
  const yb = top + n * rowH, H = yb + 70;
  const good = higherBetter ? 1 : -1;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="${esc(title || 'Threshold plot')}">`;
  s += `<style>text{font:12px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.m{fill:var(--muted,#666);font-size:11px}.z{fill:#1B2430;font-size:11px}</style>`;
  if (title) s += `<text x="8" y="18" class="h">${esc(title)}</text>`;
  // zonas
  const L = mid > 0 ? -mid : 0, R = mid > 0 ? mid : 0;
  const zLeft = good > 0 ? 'harm' : 'benefit', zRight = good > 0 ? 'benefit' : 'harm';
  const zr = (a, b, c) => { const xa = cl(a), xb = cl(b); if (xb > xa) s += `<rect x="${xa}" y="${top - 6}" width="${xb - xa}" height="${n * rowH + 6}" fill="${c}"/>`; };
  if (ths.length > 1) {
    const edges = [lo, ...ths.slice().reverse().map(t => -t)];
    edges.forEach((a, i) => zr(a, edges[i + 1] ?? L, ZONES3[zLeft][ths.length - 1 - i] || ZONES3[zLeft][0]));
    const er = [...ths, hi];
    er.slice(0, -1).forEach((a, i) => zr(a, er[i + 1], ZONES3[zRight][i]));
  } else { zr(lo, L, ZONE[zLeft]); zr(R, hi, ZONE[zRight]); }
  if (mid > 0) zr(L, R, ZONE.nodiff);
  (mid > 0 ? ths.flatMap(t => [-t, t]) : [0]).forEach(t => { s += `<line x1="${cl(t)}" x2="${cl(t)}" y1="${top - 6}" y2="${yb}" stroke="#5B6675" stroke-dasharray="4 3"/>`; });
  if (mid > 0) s += `<line x1="${sx(0)}" x2="${sx(0)}" y1="${top - 6}" y2="${yb}" stroke="#5B6675" stroke-width=".6"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2 - 3;
    if (r.chip) s += `<circle cx="${x0 - 12}" cy="${y}" r="5" fill="${r.chip}"><title>Risk of bias</title></circle>`;
    s += `<text x="8" y="${y + 4}" class="${r.bold ? 'h' : ''}">${esc(r.label)}</text>`;
    if (r.sub) s += `<text x="8" y="${y + 16}" class="m">${esc(r.sub)}</text>`;
    if (!isFinite(r.d)) return;
    if (r.pi) s += `<line x1="${cl(r.pi[0])}" x2="${cl(r.pi[1])}" y1="${y}" y2="${y}" stroke="#1F3A5F" stroke-width="7" opacity=".18"><title>95% prediction interval</title></line>`;
    s += `<line x1="${cl(r.lo)}" x2="${cl(r.hi)}" y1="${y}" y2="${y}" stroke="#1B2430" stroke-width="${r.bold ? 2.4 : 1.4}"/>`;
    [r.lo, r.hi].forEach(v => { if (v >= lo && v <= hi) s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${y - 4}" y2="${y + 4}" stroke="#1B2430"/>`; });
    const rad = r.w != null ? 3 + 8 * Math.sqrt(r.w) : r.bold ? 7 : 5.5;
    s += r.bold && !r.fill ? `<polygon points="${sx(r.d) - 8},${y} ${sx(r.d)},${y - 6} ${sx(r.d) + 8},${y} ${sx(r.d)},${y + 6}" fill="#1F3A5F"/>`
      : `<circle cx="${sx(r.d)}" cy="${y}" r="${rad}" fill="${r.fill ? '#' + r.fill : '#1F3A5F'}" stroke="#1B2430" stroke-width="1"/>`;
    s += `<text x="${x1 + 12}" y="${y + 4}" class="${r.bold ? 'h' : ''}">${signed(r.d)} (${signed(r.lo)} to ${signed(r.hi)})</text>`;
    if (r.right) s += `<text x="${x1 + 12}" y="${y + 16}" class="m">${esc(r.right)}</text>`;
    if (r.badge) s += `<rect x="${W - 132}" y="${y - 11}" width="124" height="20" rx="4" fill="#${r.badge.fill}" stroke="#b9c2cc"/><text x="${W - 70}" y="${y + 3}" text-anchor="middle" class="z">${esc(r.badge.text)}</text>`;
  });
  s += `<line x1="${x0}" x2="${x1}" y1="${yb + 2}" y2="${yb + 2}" stroke="currentColor"/>`;
  niceTicks(lo, hi, false).forEach(v => { s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${yb + 2}" y2="${yb + 6}" stroke="currentColor"/><text x="${sx(v)}" y="${yb + 18}" text-anchor="middle">${v}</text>`; });
  if (xlabel || ths.length > 1) s += `<text x="${(x0 + x1) / 2}" y="${yb + 34}" text-anchor="middle" class="m">${esc(xlabel)}${ths.length > 1 ? ` · thresholds ±${ths.map(v => +(+v).toFixed(2)).join(', ±')}` : ''}</text>`;
  const fm = v => +(+v).toFixed(2);
  const lg = ths.length > 1
    ? [[ZONES3.benefit[0], 'Small'], [ZONES3.benefit[1], 'Moderate'], [ZONES3.benefit[2], 'Large benefit'], [ZONE.nodiff, `Trivial (±${fm(mid)})`], [ZONES3.harm[0], 'Small'], [ZONES3.harm[1], 'Moderate'], [ZONES3.harm[2], 'Large harm']].filter((x, i) => ths.length > 2 || (i !== 2 && i !== 6))
    : [[ZONE.benefit, 'Important benefit'], ...(mid > 0 ? [[ZONE.nodiff, `Little or no difference (±${fm(mid)})`]] : []), [ZONE.harm, 'Important harm']];
  let lx = ths.length > 1 ? 8 : x0; lg.forEach(([c, t]) => { s += `<rect x="${lx}" y="${yb + 46}" width="14" height="12" fill="${c}" stroke="#b9c2cc"/><text x="${lx + 18}" y="${yb + 56}" class="m">${esc(t)}</text>`; lx += 26 + t.length * (ths.length > 1 ? 5.9 : 6.2); });
  return s + '</svg>';
}

// Barra apilada 0–100 % con marcador (p. ej., umbral de dominancia del riesgo de sesgo)
export function shareBarSVG({ segments, marker = null, title = '' }) {
  const W = 900, x0 = 8, x1 = W - 8, y = title ? 26 : 8, h = 26, H = y + h + (marker ? 34 : 12);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="${esc(title || 'Share bar')}">`;
  s += `<style>text{font:12px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.in{fill:#fff;font-weight:600;font-size:11.5px}.m{fill:var(--muted,#666);font-size:11px}</style>`;
  if (title) s += `<text x="${x0}" y="16" class="h">${esc(title)}</text>`;
  let x = x0;
  segments.filter(g => g.value > 0).forEach(g => {
    const w = g.value * (x1 - x0);
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${g.color}"><title>${esc(g.label)}: ${(g.value * 100).toFixed(1)}%</title></rect>`;
    const t = `${g.label} ${(g.value * 100).toFixed(0)}%`;
    if (w > t.length * 6.6 + 8) s += `<text x="${x + 6}" y="${y + 17}" class="in" style="fill:${g.text || '#fff'}">${esc(t)}</text>`;
    else if (w > 34) s += `<text x="${x + 4}" y="${y + 17}" class="in" style="fill:${g.text || '#fff'}">${(g.value * 100).toFixed(0)}%</text>`;
    x += w;
  });
  s += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" fill="none" stroke="#b9c2cc"/>`;
  if (marker) {
    const mx = x0 + marker.at * (x1 - x0);
    s += `<line x1="${mx}" x2="${mx}" y1="${y - 4}" y2="${y + h + 6}" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>`;
    s += `<text x="${mx}" y="${y + h + 20}" text-anchor="${marker.at > 0.75 ? 'end' : 'middle'}" class="m">${esc(marker.label)}</text>`;
  }
  return s + '</svg>';
}

// Indicador de I² (criterio secundario de inconsistencia)
export function i2GaugeSVG(I2, title = 'secondary criterion of inconsistency') {
  const W = 900, x0 = 8, x1 = W - 8, y = 26, h = 16, sx = v => x0 + v / 100 * (x1 - x0);
  const bands = [[0, 30, '#E3F1DC', 'might not be important'], [30, 50, '#FFF4CC', 'moderate'], [50, 75, '#FCE4C4', 'substantial'], [75, 100, '#FBD0CC', 'considerable']];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 74" class="plot" role="img" aria-label="I squared gauge"><style>text{font:12px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.m{fill:var(--muted,#666);font-size:11px}.z{fill:#1B2430;font-size:11px}</style>`;
  s += `<text x="${x0}" y="16" class="h">${isFinite(I2) ? `I² = ${I2.toFixed(0)}% — ` : ''}${esc(title)}</text>`;
  bands.forEach(([a, b, c, t]) => { s += `<rect x="${sx(a)}" y="${y}" width="${sx(b) - sx(a)}" height="${h}" fill="${c}"/><text x="${(sx(a) + sx(b)) / 2}" y="${y + 12}" text-anchor="middle" class="z">${t}</text>`; });
  s += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" fill="none" stroke="#b9c2cc"/>`;
  [0, 25, 50, 75, 100].forEach(v => { s += `<text x="${sx(v)}" y="${y + h + 14}" text-anchor="${v === 0 ? 'start' : v === 100 ? 'end' : 'middle'}" class="m">${v}%</text>`; });
  if (isFinite(I2)) { const mx = sx(Math.max(0, Math.min(100, I2))); s += `<rect x="${mx - 2}" y="${y - 4}" width="4" height="${h + 8}" fill="currentColor"/>`; }
  return s + '</svg>';
}

// Tamaño muestral frente al tamaño óptimo de información
export function oisSVG({ n, ois, nLabel = 'Total participants', title = 'Optimal information size' }) {
  const W = 900, x0 = 170, x1 = W - 90, mx = Math.max(n, ois) * 1.05, sx = v => x0 + v / mx * (x1 - x0), ok = n >= ois;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 96" class="plot" role="img" aria-label="Optimal information size"><style>text{font:12px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.m{fill:var(--muted,#666);font-size:11px}</style>`;
  s += `<text x="8" y="16" class="h">${esc(title)}</text>`;
  s += `<text x="8" y="44">${esc(nLabel)}</text><rect x="${x0}" y="31" width="${sx(n) - x0}" height="18" fill="${ok ? '#93C47D' : '#E59393'}"/><text x="${sx(n) + 6}" y="44">${Math.round(n)}</text>`;
  s += `<text x="8" y="72">OIS required</text><rect x="${x0}" y="59" width="${sx(ois) - x0}" height="18" fill="#9AA6B5"/><text x="${sx(ois) + 6}" y="72">${Math.round(ois)}</text>`;
  s += `<line x1="${sx(ois)}" x2="${sx(ois)}" y1="26" y2="82" stroke="currentColor" stroke-dasharray="4 3"/>`;
  s += `<text x="${x1 + 80}" y="16" text-anchor="end" class="h" style="fill:${ok ? '#2E8B57' : '#B03A2E'}">${ok ? 'OIS met' : `${(n / ois * 100).toFixed(0)}% of OIS`}</text>`;
  return s + '</svg>';
}
