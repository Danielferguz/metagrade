// Figuras de exactitud diagnóstica: forest pareado Se/Sp con riesgo de sesgo, cruce de umbrales de decisión y pictograma de 100 personas.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const style = fs => `<style>text{font:${fs}px system-ui,sans-serif;fill:currentColor}.h{font-weight:600}.s{font-size:${+(fs * 0.88).toFixed(2)}px}.m{fill:var(--muted,#666)}</style>`;
const head = (W, H, fs, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+W.toFixed(1)} ${+H.toFixed(1)}" data-fs="${fs}" class="plot" role="img" aria-label="${esc(label)}" style="max-width:${Math.round(W * 1.15)}px">${style(fs)}`;
const wrap = (t, n) => { const w = String(t).split(/\s+/), out = []; let cur = ''; for (const x of w) { if ((cur + ' ' + x).trim().length > n && cur) { out.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); } if (cur) out.push(cur); return out; };
export const BLUE = '#1F6FD0';
// riesgo de sesgo como semáforo: [color, símbolo]
const robLook = r => (/high|alto|serious|critical/i.test(r || '') ? ['#C4402C', '−'] : /low|bajo|accept/i.test(r || '') ? ['#6CC24A', '+'] : r ? ['#FBEE5C', '?'] : null);

// groups: [{label, rows:[{label, tp, fn, fp, tn, se:[e,lo,hi], sp:[e,lo,hi], wse, wsp (0–1), rob}], sub:{label, se, sp, tp, fn, fp, tn, het:[txt, txt]}}]; overall: igual que sub
export function dtaPaired({ title = '', groups, overall, fs = 12, rob = true }) {
  const k = fs / 12, rh = 18 * k, f3 = v => (isFinite(v) ? v.toFixed(3) : '–'), ci = a => `[${f3(a[1])}; ${f3(a[2])}]`, w1 = v => (isFinite(v) ? (v * 100).toFixed(1) : '');
  const labelled = groups.length > 1 || groups.some(g => g.label), allRows = groups.flatMap(g => g.rows);
  const nameW = Math.max(120 * k, 6.3 * k * Math.max(...allRows.map(r => String(r.label).length + (labelled ? 2 : 0)), ...groups.map(g => String(g.label || '').length), 20));
  const colW = [34, 34, 46, 104, 52].map(x => x * k), plotW = 150 * k, panelW = colW.reduce((a, b) => a + b, 0) + 10 * k + plotW;
  const x0 = 8 * k, pS = x0 + nameW, pP = pS + panelW + 16 * k, xr = pP + panelW + 16 * k, W = xr + (rob ? 70 * k : 8 * k);
  const top = (title ? 26 : 8) * k, hy = top + 14 * k;
  let y = hy + 12 * k, s = '';
  const cell = (px, cells, yy, bold) => { let x = px; cells.forEach((t, i) => { x += colW[i]; s += `<text x="${x}" y="${yy}" text-anchor="end"${bold ? ' class="h"' : ''}>${esc(t)}</text>`; }); return x + 10 * k; };
  const diamond = (cx, cy, r, fill) => `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="${fill}"/>`;
  const hdr = (px, a, b, c) => { cell(px, [a, b, c, '95% CI', 'Weight'], hy, true); };
  hdr(pS, 'TP', 'FN', 'Sens'); hdr(pP, 'FP', 'TN', 'Spec');
  s += `<text x="${x0}" y="${hy}" class="h">Studies</text>${rob ? `<text x="${xr}" y="${hy}" class="h">Risk of bias</text>` : ''}`;
  s += `<line x1="${x0}" x2="${W - 8 * k}" y1="${hy + 6 * k}" y2="${hy + 6 * k}" stroke="currentColor" stroke-width=".6"/>`;
  const plots = []; // posiciones de los gráficos
  const PX = [pS, pP].map(px => px + colW.reduce((a, b) => a + b, 0) + 10 * k);
  const xin = (px, v) => px + Math.min(1, Math.max(0, v)) * plotW;
  const first = y;
  const row = (r, indent, bold) => {
    const yy = y + 4 * k, cy = y;
    s += `<text x="${x0 + indent}" y="${yy}"${bold ? ' class="h"' : ''}>${esc(r.label)}</text>`;
    [['se', pS, [r.tp, r.fn], r.wse], ['sp', pP, [r.fp, r.tn], r.wsp]].forEach(([key, px, nn, w], i) => {
      const e = r[key]; cell(px, [isFinite(nn[0]) ? nn[0] : '', isFinite(nn[1]) ? nn[1] : '', f3(e[0]), ci(e), w1(w)], yy, bold);
      if (r.isSub) s += `<polygon points="${xin(PX[i], e[1])},${cy} ${xin(PX[i], e[0])},${cy - 5 * k} ${xin(PX[i], e[2])},${cy} ${xin(PX[i], e[0])},${cy + 5 * k}" fill="#BDBDBD" stroke="#555" stroke-width=".8"/>`;
      else { const sz = (3.5 + 4.5 * Math.sqrt((r[i ? 'wsp' : 'wse'] || 0.05))) * k; s += `<line x1="${xin(PX[i], e[1])}" x2="${xin(PX[i], e[2])}" y1="${cy}" y2="${cy}" stroke="#000" stroke-width="${+(1.1 * k).toFixed(2)}"/>${diamond(xin(PX[i], e[0]), cy, sz, BLUE)}`; }
    });
    const q = rob && !r.isSub && robLook(r.rob); if (q) s += `<circle cx="${xr + 8 * k}" cy="${cy}" r="${6 * k}" fill="${q[0]}" stroke="#000" stroke-width="${+(1.1 * k).toFixed(2)}"/><text x="${xr + 8 * k}" y="${cy + 4 * k}" text-anchor="middle" style="font-weight:700;fill:#000">${q[1]}</text>`;
    y += rh;
  };
  const subRow = (g, o) => { row({ ...o, isSub: true, wse: 1, wsp: 1 }, 0, true); if (o.het) { s += `<text x="${pS}" y="${y - 2 * k}" class="s m">${esc(o.het[0])}</text><text x="${pP}" y="${y - 2 * k}" class="s m">${esc(o.het[1])}</text>`; y += rh * 0.85; } };
  groups.forEach(g => {
    if (labelled && g.label) { s += `<text x="${x0}" y="${y + 4 * k}" class="h">${esc(g.label)}</text>`; y += rh; }
    g.rows.forEach(r => row(r, labelled ? 8 * k : 0));
    if (g.sub && labelled) { y += 2 * k; subRow(g, g.sub); y += 6 * k; }
  });
  if (overall) { y += 4 * k; subRow(null, overall); }
  const yEnd = y, ya = yEnd + 2 * k;
  [pS, pP].forEach((_, i) => {
    const px = PX[i], est = overall?.[i ? 'sp' : 'se']?.[0];
    if (isFinite(est)) s += `<line x1="${xin(px, est)}" x2="${xin(px, est)}" y1="${first - 8 * k}" y2="${ya}" stroke="#000" stroke-dasharray="2 2" stroke-width=".7"/>`;
    s += `<line x1="${px}" x2="${px + plotW}" y1="${ya}" y2="${ya}" stroke="currentColor"/>`;
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(v => { s += `<line x1="${px + v * plotW}" x2="${px + v * plotW}" y1="${ya}" y2="${ya + 4 * k}" stroke="currentColor"/><text x="${px + v * plotW}" y="${ya + 16 * k}" text-anchor="middle" class="s">${v}</text>`; });
    s += `<text x="${px + plotW / 2}" y="${ya + 30 * k}" text-anchor="middle" class="s m">${i ? 'Specificity' : 'Sensitivity'}</text>`;
  });
  let H = ya + 38 * k;
  if (rob && allRows.some(r => r.rob)) { s += `<text x="${x0}" y="${H}" class="s m">Risk of bias: (+) low or acceptable, (?) unclear / some concerns, (−) high</text>`; H += 12 * k; }
  if (title) s = `<text x="8" y="${18 * k}" class="h">${esc(title)}</text>` + s;
  return head(W, H, fs, title || 'Paired forest plot of sensitivity and specificity') + s + '</svg>';
}

// items: [{title, est, lo, hi, a, u, unit}] — línea numérica con las zonas aceptable / intermedia / inaceptable y el IC del estimador
export function dtaThreshold({ items, fs = 12 }) {
  const k = fs / 12, W = 640 * k, L = 18 * k, R = 18 * k, pw = W - L - R, bh = 30 * k, ph = 122 * k;
  let s = '';
  items.forEach((it, i) => {
    const y0 = 10 * k + i * ph, xmax = Math.max(it.hi * 1.12, it.u * 1.45, it.est * 1.1, 1), sx = v => L + Math.min(v, xmax) / xmax * pw, by = y0 + 36 * k;
    const cross = [it.a, it.u].filter(t => it.lo < t && it.hi > t).length;
    s += `<text x="${L}" y="${y0 + 10 * k}" class="h">${esc(it.title)}</text>`;
    s += `<rect x="${sx(0)}" y="${by}" width="${sx(it.a) - sx(0)}" height="${bh}" fill="#DDEFD6" stroke="#6A9E5B"/><rect x="${sx(it.a)}" y="${by}" width="${sx(it.u) - sx(it.a)}" height="${bh}" fill="#FFF1C2" stroke="#C9A227"/><rect x="${sx(it.u)}" y="${by}" width="${sx(xmax) - sx(it.u)}" height="${bh}" fill="#F7D6D3" stroke="#C0574E"/>`;
    const lab = (x0, x1, t) => `<text x="${(sx(x0) + sx(x1)) / 2}" y="${by + bh / 2 + 4 * k}" text-anchor="middle" class="s">${t}</text>`;
    s += lab(0, it.a, 'Acceptable') + lab(it.a, it.u, 'Uncertain') + lab(it.u, xmax, 'Unacceptable');
    [[it.a, '≤'], [it.u, '≥']].forEach(([t, g]) => { s += `<line x1="${sx(t)}" x2="${sx(t)}" y1="${by - 5 * k}" y2="${by + bh + 22 * k}" stroke="#C0392B" stroke-width="${+(1.6 * k).toFixed(2)}" stroke-dasharray="4 2"/><text x="${sx(t)}" y="${by - 8 * k}" text-anchor="middle" class="s" style="fill:#C0392B;font-weight:700">${g}${+(+t).toFixed(1)}</text>`; });
    const cy = by + bh + 14 * k, cr = [sx(it.lo), sx(it.hi)];
    s += `<line x1="${cr[0]}" x2="${cr[1]}" y1="${cy}" y2="${cy}" stroke="#000" stroke-width="${+(2 * k).toFixed(2)}"/><line x1="${cr[0]}" x2="${cr[0]}" y1="${cy - 5 * k}" y2="${cy + 5 * k}" stroke="#000" stroke-width="${+(1.4 * k).toFixed(2)}"/><line x1="${cr[1]}" x2="${cr[1]}" y1="${cy - 5 * k}" y2="${cy + 5 * k}" stroke="#000" stroke-width="${+(1.4 * k).toFixed(2)}"/>`;
    const dx = sx(it.est), r = 6 * k; s += `<polygon points="${dx},${cy - r} ${dx + r},${cy} ${dx},${cy + r} ${dx - r},${cy}" fill="${BLUE}" stroke="#fff" stroke-width=".8"/>`;
    s += `<text x="${(cr[0] + cr[1]) / 2}" y="${cy + 19 * k}" text-anchor="middle" class="s">${(+it.est).toFixed(1)} (${(+it.lo).toFixed(1)} to ${(+it.hi).toFixed(1)}) ${esc(it.unit || 'per 100')}</text>`;
    const msg = cross ? `The 95% CI crosses ${cross} threshold${cross > 1 ? 's' : ''} → rate down imprecision by ${Math.min(cross, 2)}` : 'The 95% CI does not cross a threshold → no imprecision downgrade', col = cross ? '#B3261E' : '#2E7D32';
    s += `<text x="${W - R}" y="${y0 + 10 * k}" text-anchor="end" class="s" style="fill:${col};font-weight:600">${esc(msg)}</text>`;
  });
  return head(W, items.length * ph + 6 * k, fs, 'Confidence intervals relative to decision thresholds') + s + '</svg>';
}

// scenarios: [{title, sub, c:{tp,fn,fp,tn}}]; texts: {tp, fn, fp, tn} consecuencias (se muestran bajo las figuras)
export const PEOPLE_COL = { tp: '#3C9D5D', fn: '#C4402C', fp: '#F0932B', tn: '#B8C4D6' };
export function dtaPeople({ scenarios, texts = {}, fs = 12 }) {
  const k = fs / 12, cell = 17 * k, gw = 10 * cell, pw = gw + 74 * k, W = scenarios.length * pw + 10 * k, T = 54 * k;
  const person = (cx, cy, col) => `<circle cx="${cx}" cy="${cy - 4.6 * k}" r="${2.6 * k}" fill="${col}"/><path d="M${cx - 3.4 * k} ${cy + 6 * k}v${-6.2 * k}a${3.4 * k} ${3.4 * k} 0 0 1 ${6.8 * k} 0v${6.2 * k}z" fill="${col}"/>`;
  let s = '';
  scenarios.forEach((sc, j) => {
    const x0 = 10 * k + j * pw, y0 = T, seq = [...Array(sc.c.tp).fill('tp'), ...Array(sc.c.fn).fill('fn'), ...Array(sc.c.fp).fill('fp'), ...Array(sc.c.tn).fill('tn')];
    s += `<text x="${x0}" y="${16 * k}" class="h">${esc(sc.title)}</text>`;
    wrap(sc.sub || '', Math.floor(pw / (5.4 * k))).slice(0, 2).forEach((t, q) => { s += `<text x="${x0}" y="${(30 + q * 13) * k}" class="s m">${esc(t)}</text>`; });
    seq.forEach((c, i) => { s += person(x0 + (i % 10) * cell + cell / 2, y0 + Math.floor(i / 10) * cell + cell / 2, PEOPLE_COL[c]); });
    const nD = sc.c.tp + sc.c.fn, nH = sc.c.fp + sc.c.tn, yy = y0 + 10 * cell + 14 * k;
    s += `<text x="${x0}" y="${yy}" class="s"><tspan style="fill:${PEOPLE_COL.fn};font-weight:700">${sc.c.fn} missed</tspan> of ${nD} affected (${nD ? Math.round(100 * sc.c.fn / nD) : 0}%)</text><text x="${x0}" y="${yy + 14 * k}" class="s"><tspan style="fill:${PEOPLE_COL.fp};font-weight:700">${sc.c.fp} false alarm${sc.c.fp === 1 ? '' : 's'}</tspan> of ${nH} unaffected (${nH ? Math.round(100 * sc.c.fp / nH) : 0}%)</text>`;
  });
  let y = T + 10 * cell + 52 * k;
  const leg = [['tp', 'True positive', texts.tp], ['fn', 'False negative', texts.fn], ['fp', 'False positive', texts.fp], ['tn', 'True negative', texts.tn]];
  leg.forEach(([c, name, t]) => {
    const lines = wrap(`${name}: ${t || ''}`, Math.floor((W - 40 * k) / (5.4 * k)));
    s += `<g>${person(18 * k, y - 3 * k, PEOPLE_COL[c])}</g>`;
    lines.forEach((l, i) => { s += `<text x="${34 * k}" y="${y + i * 13 * k}" class="s">${esc(l)}</text>`; });
    y += Math.max(1, lines.length) * 13 * k + 7 * k;
  });
  return head(W, y + 4 * k, fs, 'Consequences of test results in 100 people') + s + '</svg>';
}
