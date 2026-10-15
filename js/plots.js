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
    const t = cand.filter(v => v >= lo * 0.999 && v <= hi * 1.001);
    return t.length > 8 ? t.filter(v => [0.01, 0.1, 1, 10, 100].includes(v) || (t.length <= 10 && [0.5, 2].includes(v))) : t;
  }
  const span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const m = span / step > 20 ? 5 : span / step > 8 ? 2 : 1, st = step * m, out = [];
  for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(10));
  return out;
}

// rows: [{label, est, lo, hi, w (0-1), rob}] en escala natural (ratio si log=true); pooled: {est, lo, hi, pi:[lo,hi]}
export function forestSVG({ rows, pooled, log, measure, leftLabel = 'Favours intervention', rightLabel = 'Favours control', title = '' }) {
  const compact = !rows.some(r => r.w != null || r.rob);
  const lw = Math.max(70, Math.min(260, 7 * Math.max(...rows.map(r => String(r.label).length), 5)));
  const W = compact ? lw + 470 : 860, rowH = 22, top = 46, n = rows.length, H = top + (n + (pooled ? 3 : 1.2)) * rowH + 40;
  const x0 = compact ? lw + 14 : 380, x1 = compact ? lw + 274 : 640;
  const vals = rows.flatMap(r => [r.lo, r.hi]).concat(pooled ? [pooled.lo, pooled.hi] : []).filter(v => isFinite(v) && (!log || v > 0));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (log) { lo = Math.min(lo, 0.9); hi = Math.max(hi, 1.1); lo = Math.max(lo, 0.005); hi = Math.min(hi, 200); }
  else { lo = Math.min(lo, 0); hi = Math.max(hi, 0); const pad = (hi - lo) * 0.05; lo -= pad; hi += pad; }
  const sx = scaleFn(lo, hi, x0, x1, log), clamp = v => Math.max(x0, Math.min(x1, sx(Math.max(v, log ? 1e-9 : -Infinity))));
  const fmt = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="Forest plot">`;
  s += `<style>text{font:12px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.m{fill:var(--muted,#666)}</style>`;
  if (title) s += `<text x="8" y="16" class="h">${esc(title)}</text>`;
  s += `<text x="8" y="38" class="h">${compact ? 'Intervention' : 'Study'}</text>${compact ? '' : '<text x="250" y="38" class="h">Weight</text>'}<text x="${x1 + 20}" y="38" class="h">${esc(measure)} (95% CI)</text>`;
  const ref = log ? 1 : 0;
  s += `<line x1="${sx(ref)}" x2="${sx(ref)}" y1="${top - 6}" y2="${top + (n + (pooled ? 1.6 : 0.2)) * rowH}" stroke="currentColor" stroke-width="1"/>`;
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
  const ya = top + (n + (pooled ? 2.4 : 0.4)) * rowH + 6;
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
  const ys = []; let acc = top; rows.forEach(r => { const h = r.h || rowH; ys.push(acc + h / 2 - 3); acc += h; });
  const bodyH = acc - top;
  const vals = rows.flatMap(r => [r.lo, r.hi, ...(r.pi || [])]).filter(isFinite);
  let lo = Math.min(...vals, mid > 0 ? -(ths.length > 1 ? 1.15 * tmax : 1.6 * mid) : 0), hi = Math.max(...vals, mid > 0 ? (ths.length > 1 ? 1.15 * tmax : 1.6 * mid) : 0);
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const sx = scaleFn(lo, hi, x0, x1, false), cl = v => Math.max(x0, Math.min(x1, sx(v)));
  const yb = top + bodyH, H = yb + 70;
  const good = higherBetter ? 1 : -1;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="${esc(title || 'Threshold plot')}">`;
  s += `<style>text{font:12px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.m{fill:var(--muted,#666);font-size:11px}.z{fill:#1B2430;font-size:11px}</style>`;
  if (title) s += `<text x="8" y="18" class="h">${esc(title)}</text>`;
  // zonas
  const L = mid > 0 ? -mid : 0, R = mid > 0 ? mid : 0;
  const zLeft = good > 0 ? 'harm' : 'benefit', zRight = good > 0 ? 'benefit' : 'harm';
  const zr = (a, b, c) => { const xa = cl(a), xb = cl(b); if (xb > xa) s += `<rect x="${xa}" y="${top - 6}" width="${xb - xa}" height="${bodyH + 6}" fill="${c}"/>`; };
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
    const y = ys[i];
    if (r.sep && i) s += `<line x1="8" x2="${W - 8}" y1="${y - (r.h || rowH) / 2 + 1}" y2="${y - (r.h || rowH) / 2 + 1}" stroke="#b9c2cc" stroke-width=".7"/>`;
    if (r.chip) s += `<circle cx="${x0 - 12}" cy="${y}" r="5" fill="${r.chip}"><title>Risk of bias</title></circle>`;
    s += `<text x="${r.indent ? 22 : 8}" y="${y + 4}" class="${r.bold ? 'h' : r.indent ? 'm' : ''}">${esc(r.label)}</text>`;
    if (r.sub) s += `<text x="8" y="${y + 16}" class="m">${esc(r.sub)}</text>`;
    if (!isFinite(r.d)) { if (r.empty) s += `<text x="${(x0 + x1) / 2}" y="${y + 4}" text-anchor="middle" class="m">${esc(r.empty)}</text>`; return; }
    if (r.pi) s += `<line x1="${cl(r.pi[0])}" x2="${cl(r.pi[1])}" y1="${y}" y2="${y}" stroke="#1F3A5F" stroke-width="7" opacity=".18"><title>95% prediction interval</title></line>`;
    s += `<line x1="${cl(r.lo)}" x2="${cl(r.hi)}" y1="${y}" y2="${y}" stroke="#1B2430" stroke-width="${r.bold ? 2.4 : 1.4}"/>`;
    [r.lo, r.hi].forEach(v => { if (v >= lo && v <= hi) s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${y - 4}" y2="${y + 4}" stroke="#1B2430"/>`; });
    const rad = r.w != null ? 3 + 8 * Math.sqrt(r.w) : r.bold ? 7 : 5.5;
    if (r.kind === 'direct' || r.kind === 'indirect') {
      const X = sx(r.d), col = r.fill ? '#' + r.fill : '#FFFFFF';
      s += r.kind === 'direct' ? `<rect x="${X - 5}" y="${y - 5}" width="10" height="10" fill="${col}" stroke="#1B2430"/>` : `<polygon points="${X},${y - 6} ${X + 6},${y + 5} ${X - 6},${y + 5}" fill="${col}" stroke="#1B2430"/>`;
    } else s += r.bold && !r.fill ? `<polygon points="${sx(r.d) - 8},${y} ${sx(r.d)},${y - 6} ${sx(r.d) + 8},${y} ${sx(r.d)},${y + 6}" fill="#1F3A5F"/>`
      : `<circle cx="${sx(r.d)}" cy="${y}" r="${rad}" fill="${r.fill ? '#' + r.fill : '#1F3A5F'}" stroke="#1B2430" stroke-width="1"/>`;
    s += `<text x="${x1 + 12}" y="${y + 4}" class="${r.bold ? 'h' : r.kind ? 'm' : ''}">${signed(r.d)} (${signed(r.lo)} to ${signed(r.hi)})</text>`;
    if (r.right) s += `<text x="${x1 + 12}" y="${y + 16}" class="m">${esc(r.right)}</text>`;
    if (r.badge && r.kind) s += `<text x="${W - 70}" y="${y + 4}" text-anchor="middle" class="m">${esc(r.badge.text)}</text>`;
    else if (r.badge) s += `<rect x="${W - 132}" y="${y - 11}" width="124" height="20" rx="4" fill="#${r.badge.fill}" stroke="#b9c2cc"/><text x="${W - 70}" y="${y + 3}" text-anchor="middle" class="z">${esc(r.badge.text)}</text>`;
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

// Funnel plot con pseudo-IC 95 % y recta de regresión de Egger.
// pts: [{y, se, label, col}] en escala del análisis (log para razones); center: estimador combinado;
// eg: {intercept, se, p, k} (Egger: y/se = a + b·(1/se) ⇒ y = b + a·se)
export function funnelSVG({ pts, center = 0, log = false, measure = '', eg = null, title = '', xlabel = '', note = '' }) {
  const W = 760, H = 470, x0 = 70, x1 = W - 30, y0 = 50, y1 = H - 90;
  const seMax = Math.max(...pts.map(p => p.se)) * 1.08 || 1;
  const xs = pts.flatMap(p => [p.y]).concat([center - 1.96 * seMax, center + 1.96 * seMax]);
  let lo = Math.min(...xs), hi = Math.max(...xs); const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  const sx = v => x0 + (v - lo) / (hi - lo) * (x1 - x0), sy = se => y0 + se / seMax * (y1 - y0);
  const tf = v => (log ? Math.exp(v) : v);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="${esc(title || 'Funnel plot')}">`;
  s += `<style>text{font:12px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.m{fill:var(--muted,#666);font-size:11px}</style>`;
  if (title) s += `<text x="8" y="18" class="h">${esc(title)}</text>`;
  // embudo (pseudo-IC 95 %)
  s += `<polygon points="${sx(center)},${sy(0)} ${sx(center - 1.96 * seMax)},${sy(seMax)} ${sx(center + 1.96 * seMax)},${sy(seMax)}" fill="#E7ECF2" stroke="#9AA6B5" stroke-dasharray="4 3"/>`;
  s += `<line x1="${sx(center)}" x2="${sx(center)}" y1="${sy(0)}" y2="${sy(seMax)}" stroke="#1F3A5F" stroke-width="1.4"/>`;
  if (log || lo < 0 && hi > 0) { const z = 0; if (z > lo && z < hi) s += `<line x1="${sx(z)}" x2="${sx(z)}" y1="${sy(0)}" y2="${sy(seMax)}" stroke="currentColor" stroke-width=".6" stroke-dasharray="2 3"/>`; }
  // recta de Egger
  if (eg && isFinite(eg.intercept) && isFinite(eg.slope)) {
    const a = eg.intercept, b = eg.slope, se1 = 0, se2 = seMax;
    s += `<line x1="${sx(b + a * se1)}" y1="${sy(se1)}" x2="${sx(b + a * se2)}" y2="${sy(se2)}" stroke="#C0392B" stroke-width="1.6" stroke-dasharray="7 4"><title>Egger regression line</title></line>`;
  }
  pts.forEach(p => { s += `<circle cx="${sx(p.y)}" cy="${sy(p.se)}" r="5.5" fill="${p.col || '#1F3A5F'}" stroke="#1B2430" stroke-width=".8" opacity=".9"><title>${esc(p.label)}: ${tf(p.y).toFixed(2)} (SE ${p.se.toFixed(3)})</title></circle>`; });
  // ejes
  s += `<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="currentColor"/><line x1="${x0}" x2="${x0}" y1="${y0}" y2="${y1}" stroke="currentColor"/>`;
  const tk = log ? niceTicks(Math.exp(lo), Math.exp(hi), true).map(Math.log) : niceTicks(lo, hi, false);
  tk.forEach(v => { if (v < lo || v > hi) return; s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${y1}" y2="${y1 + 4}" stroke="currentColor"/><text x="${sx(v)}" y="${y1 + 17}" text-anchor="middle">${+tf(v).toFixed(2)}</text>`; });
  niceTicks(0, seMax, false).forEach(v => { if (v > seMax) return; s += `<line x1="${x0 - 4}" x2="${x0}" y1="${sy(v)}" y2="${sy(v)}" stroke="currentColor"/><text x="${x0 - 7}" y="${sy(v) + 4}" text-anchor="end">${+v.toFixed(3)}</text>`; });
  s += `<text x="${(x0 + x1) / 2}" y="${y1 + 36}" text-anchor="middle">${esc(xlabel || measure)}</text>`;
  s += `<text transform="translate(18 ${(y0 + y1) / 2}) rotate(-90)" text-anchor="middle">Standard error</text>`;
  const egTxt = eg ? `Egger's test: intercept ${eg.intercept.toFixed(2)} (95% CI ${(eg.intercept - eg.tcrit * eg.se).toFixed(2)} to ${(eg.intercept + eg.tcrit * eg.se).toFixed(2)}), p = ${eg.p < 0.001 ? '<0.001' : eg.p.toFixed(3)}; k = ${eg.k}` : 'Egger\'s test not estimable (fewer than 3 studies)';
  s += `<text x="${x0}" y="${y1 + 58}" class="h" style="fill:${eg && eg.p < 0.1 ? '#B03A2E' : 'currentColor'}">${esc(egTxt)}</text>`;
  if (note) s += `<text x="${x0}" y="${y1 + 76}" class="m">${esc(note)}</text>`;
  return s + '</svg>';
}

// Node-splitting gráfico: por comparación, estimado directo (□), indirecto (△) y de red (◆) con columnas
// k directa, Directa, Indirecta, Red (IC 95 %), % directa y p. rows: [{label, k, dir:[e,lo,hi], ind:[e,lo,hi]|null, net:[e,lo,hi], pdir, p}]
export function nodesplitSVG({ rows, log = false, measure = 'OR', title = '', pcut = 0.1 }) {
  const rowH = 30, top = title ? 56 : 36, n = rows.length;
  const lw = Math.max(110, Math.min(260, 6.6 * Math.max(...rows.map(r => r.label.length), 10)));
  const kx = lw + 18, x0 = lw + 44, x1 = x0 + 230, c1 = x1 + 16, c2 = c1 + 128, c3 = c2 + 128, c4 = c3 + 136, c5 = c4 + 58, W = c5 + 52;
  const vals = rows.flatMap(r => [r.dir, r.ind, r.net].filter(Boolean).flatMap(v => [v[1], v[2]])).filter(v => isFinite(v) && (!log || v > 0));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (log) { lo = Math.max(Math.min(lo, 0.9), 0.01); hi = Math.min(Math.max(hi, 1.1), 100); } else { lo = Math.min(lo, 0); hi = Math.max(hi, 0); const pd = (hi - lo) * 0.05; lo -= pd; hi += pd; }
  const sx = scaleFn(lo, hi, x0, x1, log), cl = v => Math.max(x0, Math.min(x1, sx(Math.max(v, log ? 1e-9 : -Infinity))));
  const f = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)), ci = v => (v ? `${f(v[0])} (${f(v[1])}, ${f(v[2])})` : '–');
  const H = top + n * rowH + 84;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="${esc(title || 'Node-splitting')}">`;
  s += `<style>text{font:11.5px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.m{fill:var(--muted,#666);font-size:11px}.r{fill:#B03A2E;font-weight:700}</style>`;
  if (title) s += `<text x="8" y="16" class="h">${esc(title)}</text>`;
  const hy = top - 12;
  s += `<text x="8" y="${hy}" class="h">Comparison</text><text x="${kx}" y="${hy}" class="h" text-anchor="middle">k</text><text x="${(x0 + x1) / 2}" y="${hy}" class="h" text-anchor="middle">${esc(measure)} (95% CI)</text>`;
  s += `<text x="${c1}" y="${hy}" class="h">Direct</text><text x="${c2}" y="${hy}" class="h">Indirect</text><text x="${c3}" y="${hy}" class="h">Network</text><text x="${c4}" y="${hy}" class="h">% direct</text><text x="${c5}" y="${hy}" class="h">p</text>`;
  const ref = log ? 1 : 0;
  s += `<line x1="${sx(ref)}" x2="${sx(ref)}" y1="${top - 4}" y2="${top + n * rowH}" stroke="currentColor" stroke-width=".8"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2;
    if (i % 2 === 0) s += `<rect x="4" y="${y - rowH / 2}" width="${W - 8}" height="${rowH}" fill="#8896A8" opacity=".08"/>`;
    s += `<text x="8" y="${y + 4}">${esc(r.label)}</text><text x="${kx}" y="${y + 4}" text-anchor="middle">${r.k}</text>`;
    const draw = (v, dy, shape, col) => {
      if (!v || !isFinite(v[0])) return;
      const yy = y + dy, X = sx(v[0]);
      s += `<line x1="${cl(v[1])}" x2="${cl(v[2])}" y1="${yy}" y2="${yy}" stroke="${col}" stroke-width="1.4"/>`;
      s += shape === 'sq' ? `<rect x="${X - 3.5}" y="${yy - 3.5}" width="7" height="7" fill="${col}"/>` : shape === 'tri' ? `<polygon points="${X},${yy - 4.5} ${X + 4.5},${yy + 3.5} ${X - 4.5},${yy + 3.5}" fill="${col}"/>` : `<polygon points="${X - 5},${yy} ${X},${yy - 4} ${X + 5},${yy} ${X},${yy + 4}" fill="${col}"/>`;
    };
    draw(r.dir, -8, 'sq', '#1F3A5F'); draw(r.ind, 0, 'tri', '#C0631B'); draw(r.net, 8, 'dia', '#111111');
    s += `<text x="${c1}" y="${y + 4}">${ci(r.dir)}</text><text x="${c2}" y="${y + 4}">${r.ind ? ci(r.ind) : 'no indirect'}</text><text x="${c3}" y="${y + 4}" class="h">${ci(r.net)}</text>`;
    s += `<text x="${c4}" y="${y + 4}">${isFinite(r.pdir) ? (r.pdir * 100).toFixed(0) + '%' : '–'}</text><text x="${c5}" y="${y + 4}" class="${r.p < pcut ? 'r' : ''}">${isFinite(r.p) ? (r.p < 0.001 ? '<0.001' : r.p.toFixed(3)) : '–'}</text>`;
  });
  const ya = top + n * rowH + 4;
  s += `<line x1="${x0}" x2="${x1}" y1="${ya}" y2="${ya}" stroke="currentColor"/>`;
  niceTicks(lo, hi, log).forEach(v => { s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${ya}" y2="${ya + 4}" stroke="currentColor"/><text x="${sx(v)}" y="${ya + 16}" text-anchor="middle">${v}</text>`; });
  const ly = ya + 38;
  s += `<rect x="8" y="${ly - 7}" width="7" height="7" fill="#1F3A5F"/><text x="20" y="${ly}">Direct</text><polygon points="${78},${ly - 8} ${82.5},${ly} ${73.5},${ly}" fill="#C0631B"/><text x="88" y="${ly}">Indirect</text><polygon points="${150},${ly - 4} ${155},${ly - 8} ${160},${ly - 4} ${155},${ly}" fill="#111"/><text x="166" y="${ly}">Network</text>`;
  s += `<text x="240" y="${ly}" class="m">p: disagreement between direct and indirect estimates (back-calculation); red if p &lt; ${pcut}.</text><text x="240" y="${ly + 15}" class="m">% direct: contribution of direct evidence to the network estimate.</text>`;
  return s + '</svg>';
}
