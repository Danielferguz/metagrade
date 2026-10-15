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
export function networkSVG(nodes, edges, sizes, short = t => t) {
  const W = 620, H = 520, cx = W / 2, cy = H / 2, R = 190, n = nodes.length;
  const pos = Object.fromEntries(nodes.map((t, i) => [t, [cx + R * Math.cos(2 * Math.PI * i / n - Math.PI / 2), cy + R * Math.sin(2 * Math.PI * i / n - Math.PI / 2)]]));
  const maxN = Math.max(...nodes.map(t => sizes[t] || 1)), maxK = Math.max(...edges.map(e => e.k));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="Network plot"><style>text{font:11px system-ui,sans-serif;fill:currentColor}</style>`;
  edges.forEach(e => { const [x1, y1] = pos[e.a], [x2, y2] = pos[e.b]; s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7A8CA5" stroke-width="${1.5 + 7 * e.k / maxK}"><title>${esc(e.a)} vs ${esc(e.b)}: ${e.k} stud${e.k > 1 ? 'ies' : 'y'}</title></line>`; });
  nodes.forEach(t => {
    const [x, y] = pos[t], r = 7 + 18 * Math.sqrt((sizes[t] || 1) / maxN);
    const lx = cx + (R + r + 14) * Math.cos(Math.atan2(y - cy, x - cx)), ly = cy + (R + r + 14) * Math.sin(Math.atan2(y - cy, x - cx));
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#1F3A5F"><title>${esc(t)}: ${sizes[t] || 0} participants</title></circle>`;
    s += `<text x="${lx}" y="${ly + 4}" text-anchor="${lx < cx - 10 ? 'end' : lx > cx + 10 ? 'start' : 'middle'}">${esc(short(t))}</text>`;
  });
  return s + '</svg>';
}
