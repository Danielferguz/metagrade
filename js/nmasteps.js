// Evaluación GRADE de una comparación en NMA paso a paso (Izcovich et al., BMJ 2023;381:e074495, figura 1):
// A directa (A1 dominios → preliminar; A2 imprecisión → final), B indirecta (B1 lazo; B2 intransitividad → preliminar;
// B3 imprecisión → final), C red (C1 punto de partida; C2 incoherencia; C3 imprecisión → final), D mejor estimado.
// También la tabla suplementaria de estimados directos, indirectos y de red con su certeza (formato BMJ 2023;383:e076226).
import { LEVELS, SYM } from './grade.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEV = ['No serious', 'Serious', 'Very serious', 'Extremely serious'];
const SEV_COL = ['#DDEFD3', '#FFE699', '#F8C291', '#EBA0A0'];
const CERT_COL = { 4: '#93C47D', 3: '#C6E0B4', 2: '#FFE699', 1: '#D9D9D9' };
const ABBR = { 4: 'H', 3: 'M', 2: 'L', 1: 'VL' };
const has = (list, k) => (list || []).find(x => x[0] === k);
const lvlOf = (list, k) => { const x = has(list, k); if (!x) return 0; const m = /\(−(\d)\)/.exec(x[1]); return m ? +m[1] : 1; };

const chip = (name, lvl, note = '') => `<span class="schip" style="background:${lvl == null ? '#E7ECF2' : SEV_COL[lvl]}" title="${esc(note)}"><b>${name}</b><br>${lvl == null ? esc(note || 'n/a') : SEV[lvl]}${lvl ? ` (−${lvl})` : ''}</span>`;
const gbox = (kind, stage, c, extra = '') => c == null
  ? `<div class="gbox none"><b>GRADE</b><span>${kind}</span><em>${stage}</em><small>not available</small></div>`
  : `<div class="gbox" style="background:${CERT_COL[c]}"><b>GRADE</b><span>${kind}</span><em>${stage}</em><small>${SYM[c]} ${LEVELS[c]}</small>${extra}</div>`;
const arrow = '<div class="sarrow">→</div>';

// diagrama completo de una comparación
export function stepFlowHTML(r, X) {
  const { tr, meas, isB, unit } = X, f2 = X.f2, ci = (e, s) => `${meas} ${f2(tr(e))} (${f2(tr(e - 1.96 * s))} to ${f2(tr(e + 1.96 * s))})`;
  const abs = q => (q ? `${X.f1(q[0])} (${X.f1(q[1])} to ${X.f1(q[2])})${isB ? ' per ' + unit : ''}` : '');
  const D = r.D, opt = r.incoherent ? '' : ' dim';
  const optNote = r.incoherent ? 'Needed: direct and indirect estimates are incoherent' : 'Optional: only needed if direct and indirect estimates are incoherent';
  // A
  const A = D ? `
    <div class="sstep A"><div class="stag">A1</div><div class="stitle">Assess reasons for rating down</div><div class="chips">
      ${chip('Risk of bias', lvlOf(D.reasons, 'rob'), has(D.reasons, 'rob')?.[1] || '')}
      ${chip('Inconsistency', lvlOf(D.reasons, 'inc'), isFinite(D.dr.I2) ? `I² = ${(D.dr.I2 * 100).toFixed(0)}% (${D.dr.k} trials)` : 'single trial')}
      ${chip('Indirectness', lvlOf(D.reasons, 'ind'), has(D.reasons, 'ind')?.[1] || '')}
      ${chip('Publication bias', 0, 'Undetected (not assessed automatically)')}</div>
      <small>${D.dr.k} trial(s); ${ci(D.dr.est, D.dr.se)}</small></div>
    ${arrow}${gbox('Direct', 'Preliminary', D.c)}
    <div class="sinc${opt}" title="${optNote}">${arrow}<div class="sstep A"><div class="stag">A2</div><div class="stitle">Assess imprecision</div><div class="chips">${chip('Imprecision', r.dImp?.lvl ?? null, abs(r.dImp?.r))}</div><small>${abs(r.dImp?.r)}</small></div>${arrow}${gbox('Direct', 'Final', r.dFinal)}</div>`
    : `<div class="sstep A empty">No direct evidence for this comparison</div>`;
  // B
  const loop = (r.loop || []).map(l => `<span class="lchip" style="background:${CERT_COL[l.c]}">${esc(X.shortName(l.a))} v ${esc(X.shortName(l.b))}<br>${SYM[l.c]}</span>`).join('');
  const intr = has(r.indR, 'intr');
  const B = r.path ? `
    <div class="sstep B"><div class="stag">B1</div><div class="stitle">${r.path.length === 3 ? 'Dominant first-order loop' : 'Higher-order path'}: ${esc(r.path.map(X.shortName).join(' → '))}</div>
      <div class="chips">${loop}</div><small>Starting point: lowest preliminary certainty of the loop (${LEVELS[Math.min(...r.loop.map(l => l.c))]})${r.nsd && isFinite(r.nsd.ind) ? `; ${ci(r.nsd.ind, r.nsd.se_ind)}` : ''}</small></div>
    ${arrow}<div class="sstep B"><div class="stag">B2</div><div class="stitle">Assess intransitivity</div><div class="chips">${chip('Intransitivity', intr ? 1 : 0, intr ? intr[1] : 'Effect modifier balanced across the loop (column "modifier")')}</div></div>
    ${arrow}${gbox('Indirect', 'Preliminary', r.indC)}
    <div class="sinc${opt}" title="${optNote}">${arrow}<div class="sstep B"><div class="stag">B3</div><div class="stitle">Assess imprecision</div><div class="chips">${chip('Imprecision', r.iImp?.lvl ?? null, abs(r.iImp?.r))}</div><small>${abs(r.iImp?.r)}</small></div>${arrow}${gbox('Indirect', 'Final', r.iFinal)}</div>`
    : `<div class="sstep B empty">No indirect evidence (comparison not in a closed loop)</div>`;
  // C
  const coh = has(r.nr, 'coh'), cohf = has(r.nr, 'cohflag'), het = has(r.nr, 'inc'), impl = r.nr.filter(x => x[0] === 'imp');
  const C = `
    <div class="sstep C"><div class="stag">C1</div><div class="stitle">Select the starting point</div>
      <div class="chips">${D ? gbox('Direct', 'Preliminary', D.c) : ''}${r.path ? gbox('Indirect', 'Preliminary', r.indC) : ''}</div><small>${esc(r.basis)}</small></div>
    ${arrow}<div class="sstep C"><div class="stag">C2</div><div class="stitle">Assess incoherence</div><div class="chips">
      ${chip('Incoherence', D && r.path && r.nsd && isFinite(r.nsd.p) ? (coh ? 1 : 0) : null, r.nsd && isFinite(r.nsd.p) ? `Node-split p = ${r.nsd.p.toFixed(3)}${cohf ? ' (one source dominates)' : ''}` : 'Not estimable (only one source)')}
      ${het ? chip('Heterogeneity (PI)', lvlOf(r.nr, 'inc'), het[1]) : ''}</div></div>
    ${arrow}<div class="sstep C"><div class="stag">C3</div><div class="stitle">Assess imprecision</div><div class="chips">${chip('Imprecision', impl.reduce((a, x) => a + lvlOf([x], 'imp'), 0), impl.map(x => x[1]).join('; ') || 'CI does not cross the thresholds')}</div><small>${abs(r.r)}</small></div>
    ${arrow}${gbox('Network', 'Final', r.c)}`;
  // D
  const best = r.best, src = { network: 'Network', direct: 'Direct', indirect: 'Indirect' }[best.src];
  const Dd = `
    <div class="sstep Dd"><div class="stag">D1</div><div class="stitle">Are direct and indirect estimates incoherent?</div><div class="yn"><span class="${r.incoherent ? '' : 'on'}">No</span><span class="${r.incoherent ? 'on' : ''}">Yes</span></div>
      <small>${r.incoherent ? 'Use the estimate with the highest certainty (network, direct or indirect)' : 'Use the network estimate of effect and its certainty'}</small></div>
    ${arrow}${gbox(src, 'Final · best estimate', best.c, `<small>${esc(abs(best.r))}</small>`)}`;
  return `<div class="sflow">
    <div class="slane A"><div class="slabel"><span class="sl A">A</span>Direct estimate</div><div class="srow">${A}</div></div>
    <div class="slane B"><div class="slabel"><span class="sl B">B</span>Indirect estimate</div><div class="srow">${B}</div></div>
    <div class="slane C"><div class="slabel"><span class="sl C">C</span>Network estimate</div><div class="srow">${C}</div></div>
    <div class="slane Dd"><div class="slabel"><span class="sl Dd">D</span>Best estimate</div><div class="srow">${Dd}</div></div>
    <p class="muted">Pink-bordered steps (A2, B3) are only needed when direct and indirect estimates prove incoherent. Hover over a domain to see the reason.</p></div>`;
}

// resumen compacto de todas las comparaciones (figuras 2–5 de Izcovich 2023)
export function stepsTableHTML(rows, X, keyFor) {
  const sv = l => `<span class="mchip" style="background:${l == null ? '#E7ECF2' : SEV_COL[l]}">${l == null ? '–' : l ? '−' + l : '✓'}</span>`;
  const cb = c => (c == null ? '<span class="mchip">–</span>' : `<span class="mchip" style="background:${CERT_COL[c]}">${ABBR[c]}</span>`);
  return `<div class="tablewrap" style="max-height:none"><table class="data stable"><thead>
  <tr><th rowspan="2">Comparison</th><th colspan="5" class="hA">A · Direct (A1)</th><th colspan="3" class="hB">B · Indirect (B1–B2)</th><th colspan="5" class="hC">C · Network</th><th class="hD">D</th></tr>
  <tr><th class="hA">RoB</th><th class="hA">Inc</th><th class="hA">Ind</th><th class="hA">Pub</th><th class="hA">Prelim.</th><th class="hB">Loop</th><th class="hB">Intr</th><th class="hB">Prelim.</th><th class="hC">Start</th><th class="hC">Incoh.</th><th class="hC">PI</th><th class="hC">Imprec.</th><th class="hC">Final</th><th class="hD">Best</th></tr></thead><tbody>
  ${rows.map((r, i) => { const D = r.D; const coh = has(r.nr, 'coh'); return `<tr data-step="${keyFor(i)}" class="clickable"><td><b>${esc(X.shortName(r.a))}</b> v ${esc(X.shortName(r.b))}</td>
    ${D ? `${sv(lvlOf(D.reasons, 'rob'))}${sv(lvlOf(D.reasons, 'inc'))}${sv(lvlOf(D.reasons, 'ind'))}${sv(0)}${cb(D.c)}`.replace(/<span/g, '<td><span').replace(/<\/span>/g, '</span></td>') : '<td colspan="5" class="muted">no direct evidence</td>'}
    ${r.path ? `<td>${cb(Math.min(...r.loop.map(l => l.c)))}</td><td>${sv(has(r.indR, 'intr') ? 1 : 0)}</td><td>${cb(r.indC)}</td>` : '<td colspan="3" class="muted">—</td>'}
    <td>${cb(r.start)}</td><td>${sv(D && r.path && r.nsd && isFinite(r.nsd.p) ? (coh ? 1 : 0) : null)}</td><td>${sv(lvlOf(r.nr, 'inc') || 0)}</td><td>${sv(r.nr.filter(x => x[0] === 'imp').reduce((a, x) => a + lvlOf([x], 'imp'), 0))}</td><td>${cb(r.c)}</td>
    <td>${cb(r.best.c)}${r.best.src !== 'network' ? ` <small>${r.best.src}</small>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div><p class="muted">✓ not serious; −1/−2/−3 levels rated down; H/M/L/VL high, moderate, low, very low. Click a row to see its step-by-step diagram.</p>`;
}

// tabla suplementaria: estimados directo, indirecto y de red con su certeza
export function supplTable(B, X) {
  const { tr, meas, m } = X, f2 = X.f2;
  const ci = (e, s) => (isFinite(e) && isFinite(s) ? `${f2(tr(e))} (${f2(tr(e - 1.96 * s))}, ${f2(tr(e + 1.96 * s))})` : '-');
  const notes = []; const L = t => { let i = notes.indexOf(t); if (i < 0) { notes.push(t); i = notes.length - 1; } return 'abcdefghijklmnopqrstuvwxyz'[i]; };
  const sevw = l => ['', 'serious', 'very serious', 'extremely serious'][l];
  const rows = B.res.rows.map(r => {
    const D = r.D;
    let dirN = ['-', '-'];
    if (D) dirN = [r.a, r.b].map(t => D.dr.studies.reduce((acc, st) => acc + (m.studies[st].find(x => x.t === t)?.n || 0), 0));
    const dL = D ? D.reasons.map(x => L(`${sevw(lvlOf([x], x[0]))} ${{ rob: 'risk of bias', inc: 'inconsistency', ind: 'indirectness' }[x[0]]}`)) : [];
    const iL = r.path ? [L(`contributing direct evidence of ${LEVELS[Math.min(...r.loop.map(l => l.c))].toLowerCase()} certainty`), ...(has(r.indR, 'intr') ? [L('serious intransitivity')] : [])] : [];
    const nL = [];
    if (has(r.nr, 'coh')) nL.push(L('serious incoherence'));
    if (has(r.nr, 'inc')) nL.push(L(`${sevw(lvlOf(r.nr, 'inc'))} inconsistency (prediction interval)`));
    r.nr.filter(x => x[0] === 'imp').forEach(x => nL.push(L(`${sevw(lvlOf([x], 'imp'))} imprecision`)));
    if (!nL.length && r.start < 4) nL.push(L(`network rating starts from the ${/indirect/.test(r.basis) ? 'indirect' : 'direct'} estimate (${LEVELS[r.start].toLowerCase()} certainty)`));
    const best = r.best.src !== 'network' ? L(`${r.best.src} estimate presented as best estimate owing to incoherence (${LEVELS[r.best.c].toLowerCase()} certainty)`) : null;
    return {
      cmp: r.a, dir: D ? ci(D.dr.est, D.dr.se) : '-', k: D ? D.dr.k : '-', n1: dirN[0], n2: dirN[1], i2: D && D.dr.k > 1 && isFinite(D.dr.I2) ? (D.dr.I2 * 100).toFixed(0) : '-',
      dcoe: D ? `${ABBR[D.c]}${dL.length ? ' ' + dL.join(',') : ''}` : '-',
      ind: r.nsd && isFinite(r.nsd.ind) ? ci(r.nsd.ind, r.nsd.se_ind) : !D ? ci(r.est, r.se) : '-',
      icoe: r.path ? `${ABBR[r.indC]}${iL.length ? ' ' + iL.join(',') : ''}` : '-',
      nma: ci(r.est, r.se), ncoe: `${ABBR[r.c]}${nL.length ? ' ' + nL.join(',') : ''}`, best: best ? `${ABBR[r.best.c]} ${best}` : '',
    };
  });
  const title = `Direct, indirect, and network meta-analysis estimates with their certainty of evidence for ${X.outcome}`;
  const head = ['Active treatments vs ' + B.ref, `Direct evidence, ${meas} (95% CI)`, 'No. of RCTs', 'No. of participants, arm 1', 'No. of participants, arm 2', 'I² (%)', 'Direct COE', `Indirect evidence, ${meas} (95% CI)`, 'Indirect COE', `NMA, ${meas} (95% CI)`, 'COE for NMA'];
  const anyBest = rows.some(x => x.best);
  const html = `<p class="stitle2"><b>${esc(title)}</b></p><table class="suppl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}${anyBest ? '<th>Best estimate</th>' : ''}</tr></thead><tbody>
    ${rows.map(x => `<tr><td>${esc(x.cmp)}</td><td>${x.dir}</td><td>${x.k}</td><td>${x.n1}</td><td>${x.n2}</td><td>${x.i2}</td><td>${x.dcoe}</td><td>${x.ind}</td><td>${x.icoe}</td><td>${x.nma}</td><td>${x.ncoe}</td>${anyBest ? `<td>${esc(x.best)}</td>` : ''}</tr>`).join('')}</tbody></table>
    <div class="notes"><p>COE = certainty of evidence; H = high; M = moderate; L = low; VL = very low; NMA = network meta-analysis; RCT = randomised controlled trial. ${meas === 'OR' ? 'OR = odds ratio' : 'MD = mean difference'}. Direct and indirect COE are preliminary ratings (without imprecision) used to inform the network rating (Izcovich et al., BMJ 2023).</p>
    <p>Notes: ${notes.map((n, i) => `${'abcdefghijklmnopqrstuvwxyz'[i]} ${esc(n)}`).join('; ')}.</p></div>`;
  return { html, rows, head, title, notes };
}
