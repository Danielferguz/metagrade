// Ayudante visual para fijar los umbrales de decisión (pequeño = MID, moderado, grande).
// Dicotómicos: GRADE-THRESHOLD (Morgano et al., J Clin Epidemiol 2025): DT1 = 1,35, DT2 = 3,21, DT3 = 6,25 por 100 ÷ disutilidad.
// Continuos: diferencia de medias estandarizada 0,2 / 0,5 / 0,8 (convención de Cohen) × DE, o directamente en DME.
const DT = [0.0135, 0.0321, 0.0625];
// anclas orientativas de disutilidad (0 = sin daño, 1 = muerte); deben ajustarse con utilidades publicadas o preferencias del panel
export const ANCHORS = [
  { v: 1, lab: 'Muerte', ex: 'referencia de GRADE-THRESHOLD (disutilidad 1)' },
  { v: 0.8, lab: 'Crónico muy grave', ex: 'ACV discapacitante, demencia, falla renal en diálisis (≈0,7–0,9)' },
  { v: 0.5, lab: 'Grave con secuelas', ex: 'IAM no fatal, amputación, fractura de cadera (≈0,4–0,6)' },
  { v: 0.3, lab: 'Grave transitorio', ex: 'hospitalización, sangrado mayor, injuria renal aguda (≈0,2–0,35)' },
  { v: 0.1, lab: 'Moderado transitorio', ex: 'infección tratable, hipoglucemia no severa (≈0,05–0,15)' },
  { v: 0.03, lab: 'Leve', ex: 'náuseas, cefalea, molestia local (<0,05)' },
];
const ZC = ['#FFF2CC', '#E2EFDA', '#C6E0B4', '#93C47D'];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = v => (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(2));

// barra de zonas trivial / pequeño / moderado / grande
function zonesSVG(t, unitLbl) {
  const W = 620, x0 = 10, x1 = W - 10, max = t[2] * 1.35, sx = v => x0 + v / max * (x1 - x0);
  const edges = [0, ...t, max], names = ['Trivial', 'Small', 'Moderate', 'Large'];
  let s = `<svg viewBox="0 0 ${W} 74" class="plot" role="img" aria-label="Decision thresholds"><style>text{font:12px system-ui,sans-serif;fill:currentColor}.z{fill:#1B2430;font-size:11.5px;font-weight:600}</style>`;
  names.forEach((n, i) => { const a = sx(edges[i]), b = sx(edges[i + 1]); s += `<rect x="${a}" y="8" width="${b - a}" height="26" fill="${ZC[i]}" stroke="#b9c2cc"/><text x="${(a + b) / 2}" y="25" text-anchor="middle" class="z">${n}</text>`; });
  t.forEach((v, i) => { s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="4" y2="40" stroke="#1B2430" stroke-width="1.5"/><text x="${sx(v)}" y="54" text-anchor="middle">${['T1 (MID)', 'T2', 'T3'][i]} = ${fmt(v)}</text>`; });
  s += `<text x="${x1}" y="70" text-anchor="end" style="font-size:11px;fill:var(--muted,#666)">${esc(unitLbl)} (same thresholds apply in the direction of harm)</text>`;
  return s + '</svg>';
}
function anchorsSVG(val, gid = 'dg') {
  const W = 620, x0 = 14, x1 = W - 14, sx = v => x0 + v * (x1 - x0);
  let s = `<svg viewBox="0 0 ${W} 64" class="plot" role="img" aria-label="Disutility scale"><style>text{font:11px system-ui,sans-serif;fill:currentColor}</style>`;
  s += `<defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="#E2EFDA"/><stop offset=".5" stop-color="#FFE699"/><stop offset="1" stop-color="#E59393"/></linearGradient></defs>`;
  s += `<rect x="${x0}" y="22" width="${x1 - x0}" height="10" rx="5" fill="url(#${gid})"/>`;
  ANCHORS.forEach((a, i) => { const x = sx(a.v); s += `<line x1="${x}" x2="${x}" y1="18" y2="36" stroke="#5B6675"/><text x="${x}" y="${i % 2 ? 50 : 14}" text-anchor="${a.v > 0.95 ? 'end' : a.v < 0.05 ? 'start' : 'middle'}">${esc(a.lab)}</text>`; });
  if (isFinite(val)) s += `<polygon points="${sx(val) - 6},${40} ${sx(val) + 6},${40} ${sx(val)},${31}" fill="#1F3A5F"/><text x="${sx(val)}" y="62" text-anchor="middle" style="font-weight:700">${val.toFixed(2)}</text>`;
  return s + '</svg>';
}

// pre: '' (pares) o 'nm-' (NMA). ids de los campos destino: MID, moderado y grande
export function mountThreshold(root, pre, targets) {
  const id = x => `${pre}${x}`;
  root.innerHTML = `
    <div class="row gap wrap"><label>Tipo de desenlace <select id="${id('dt-mode')}"><option value="bin">Dicotómico: disutilidad (GRADE-THRESHOLD)</option><option value="cont">Continuo: DME 0,2 / 0,5 / 0,8</option></select></label></div>
    <div data-mode="bin">
      <div class="row gap wrap"><label>Disutilidad del estado (0–1) <input id="${id('dt-dis')}" type="number" step="0.01" min="0.01" max="1" value="1"></label>
        <input type="range" id="${id('dt-slider')}" min="0.01" max="1" step="0.01" value="1" style="flex:1;min-width:200px">
        <label><input type="checkbox" id="${id('dt-desirable')}"> desenlace deseable (usar utilidad de alcanzarlo)</label></div>
      <div class="anchors">${ANCHORS.map(a => `<button type="button" class="ghost anc" data-v="${a.v}" title="${esc(a.ex)}"><b>${a.v}</b> ${esc(a.lab)}<small>${esc(a.ex)}</small></button>`).join('')}</div>
      <div class="dt-scale"></div>
    </div>
    <div data-mode="cont" hidden>
      <div class="row gap wrap"><label>DE combinada del desenlace (unidades naturales) <input id="${id('dt-sd')}" type="number" step="any" placeholder="p. ej., 10"></label>
        <label><input type="checkbox" id="${id('dt-smd')}"> la medida es DME (usar 0,2 / 0,5 / 0,8 directamente)</label></div>
      <p class="muted">DME 0,2 = pequeño, 0,5 = moderado, 0,8 = grande (convención de Cohen). Si existe una MID publicada y anclada en pacientes, prefiérala como T1 y use la DME solo como apoyo.</p>
    </div>
    <div class="dt-zones"></div>
    <div class="row gap wrap"><button class="primary" type="button" id="${id('dt-calc')}">Aplicar umbrales</button><span id="${id('dt-out')}" class="muted"></span></div>
    <p class="muted">Los tres umbrales rellenan MID (pequeño), moderado y grande de este desenlace. Para calificar la imprecisión con los tres, elija el esquema «3 umbrales por lado». Anclas de disutilidad orientativas: ajústelas con utilidades publicadas (p. ej., EQ-5D, Tufts CEA Registry) o con las preferencias del panel.</p>`;
  const $r = s => root.querySelector(s);
  const unit = () => +(targets.unitFn ? targets.unitFn() : document.getElementById(targets.unit)?.value || 100);
  if (targets.mode) $r(`#${id('dt-mode')}`).value = targets.mode;
  if (targets.dis > 0) { $r(`#${id('dt-dis')}`).value = targets.dis; $r(`#${id('dt-slider')}`).value = targets.dis; }
  if (targets.sd > 0) $r(`#${id('dt-sd')}`).value = targets.sd;
  if (targets.smd) $r(`#${id('dt-smd')}`).checked = true;
  const state = () => {
    const mode = $r(`#${id('dt-mode')}`).value;
    if (mode === 'bin') {
      const u = +$r(`#${id('dt-dis')}`).value;
      if (!(u > 0)) return null;
      const t = DT.map(c => Math.min(unit(), c * unit() / u));
      return { t, lbl: `Absolute risk difference per ${unit()}`, txt: `DT1 ${fmt(t[0])} · DT2 ${fmt(t[1])} · DT3 ${fmt(t[2])} por ${unit()} (disutilidad ${u})` };
    }
    const smd = $r(`#${id('dt-smd')}`).checked, sd = +$r(`#${id('dt-sd')}`).value;
    if (!smd && !(sd > 0)) return null;
    const t = [0.2, 0.5, 0.8].map(k => (smd ? k : +(k * sd).toFixed(3)));
    return { t, lbl: smd ? 'Standardised mean difference' : `Mean difference (SD = ${sd})`, txt: smd ? 'DME 0,2 / 0,5 / 0,8' : `DM ${t.map(fmt).join(' / ')} (= DME 0,2 / 0,5 / 0,8 × DE ${sd})` };
  };
  const draw = () => {
    const mode = $r(`#${id('dt-mode')}`).value;
    root.querySelectorAll('[data-mode]').forEach(d => d.hidden = d.dataset.mode !== mode);
    if (mode === 'bin') $r('.dt-scale').innerHTML = anchorsSVG(+$r(`#${id('dt-dis')}`).value, `dg-${pre || 'pw'}`);
    const st = state(); $r('.dt-zones').innerHTML = st ? zonesSVG(st.t, st.lbl) : '';
  };
  $r(`#${id('dt-mode')}`).addEventListener('change', draw);
  $r(`#${id('dt-dis')}`).addEventListener('input', e => { $r(`#${id('dt-slider')}`).value = e.target.value; draw(); });
  $r(`#${id('dt-slider')}`).addEventListener('input', e => { $r(`#${id('dt-dis')}`).value = e.target.value; draw(); });
  root.querySelectorAll('.anc').forEach(b => b.addEventListener('click', () => { $r(`#${id('dt-dis')}`).value = b.dataset.v; $r(`#${id('dt-slider')}`).value = b.dataset.v; draw(); }));
  [`#${id('dt-sd')}`, `#${id('dt-smd')}`].forEach(s => $r(s).addEventListener('input', draw));
  if (targets.unit) document.getElementById(targets.unit)?.addEventListener('change', draw);
  $r(`#${id('dt-calc')}`).addEventListener('click', () => {
    const st = state(); if (!st) { $r(`#${id('dt-out')}`).textContent = 'Complete la disutilidad o la DE.'; return; }
    const t = st.t.map(v => +v.toFixed(3));
    if (targets.apply) targets.apply(t, { mode: $r(`#${id('dt-mode')}`).value, dis: +$r(`#${id('dt-dis')}`).value, sd: +$r(`#${id('dt-sd')}`).value, smd: $r(`#${id('dt-smd')}`).checked });
    else { document.getElementById(targets.mid).value = t[0]; document.getElementById(targets.mod).value = t[1]; document.getElementById(targets.large).value = t[2]; }
    $r(`#${id('dt-out')}`).textContent = `Aplicado: ${st.txt}`;
  });
  draw();
}
