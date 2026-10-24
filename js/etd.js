// Marco de la evidencia a la decisión (EtD; Alonso-Coello et al., BMJ 2016), con el formato de las GPC de IETSI-EsSalud.
// Toma los desenlaces de la tabla SoF, propone juicios (beneficios, daños, certeza, balance) y redacta la recomendación.
import { SYM, magnitude } from './grade.js?v=2026.10.24-1';
import { download } from './io.js?v=2026.10.24-1';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const VAR = ['Varía', 'Se desconoce'];
const CERT_ES = { 4: 'Alta', 3: 'Moderada', 2: 'Baja', 1: 'Muy baja' };
const SIZE_ES = ['Trivial', 'Pequeño', 'Moderado', 'Grande'];
const IMPORTANCE = ['Crítico', 'Importante', 'Subrogado'];
const IMP_MAP = { critical: 'Crítico', 'crítico': 'Crítico', critico: 'Crítico', important: 'Importante', importante: 'Importante', surrogate: 'Subrogado', subrogado: 'Subrogado', 'not important': 'Importante' };

const CRIT_PW = [
  { id: 'ben', t: 'Beneficios', q: '¿Cuán sustanciales son los beneficios ocasionados al brindar la intervención frente a brindar el comparador?', o: ['Trivial', 'Pequeño', 'Moderado', 'Grande'], x: VAR },
  { id: 'dan', t: 'Daños', q: '¿Cuán sustanciales son los daños ocasionados al brindar la intervención frente a brindar el comparador?', o: ['Grande', 'Moderado', 'Pequeño', 'Trivial'], x: VAR },
  { id: 'cer', t: 'Certeza de la evidencia', q: '¿Cuál es la certeza general de la evidencia?', o: ['Muy baja', 'Baja', 'Moderada', 'Alta'], x: ['Ningún estudio incluido'] },
  { id: 'des', t: 'Desenlaces importantes para los pacientes', q: '¿Se contó con evidencia para todos los desenlaces importantes/críticos para los pacientes?', o: ['No', 'Probablemente no', 'Probablemente sí', 'Sí'], x: [] },
  { id: 'bal', t: 'Balance de los efectos', q: '¿El balance entre beneficios y daños favorece a la intervención o al comparador? (Tomando en cuenta los beneficios, daños, certeza de la evidencia y la presencia de desenlaces importantes)', o: ['Favorece al comparador', 'Probablemente favorece al comparador', 'No favorece a la intervención ni al comparador', 'Probablemente favorece a la intervención', 'Favorece a la intervención'], x: VAR },
  { id: 'rec', t: 'Uso de recursos', q: '¿Qué tan grandes son los requerimientos de recursos (costos) de la intervención frente al comparador para un paciente (de ser una enfermedad crónica, usar el costo anual)?', o: ['Costos extensos', 'Costos moderados', 'Intervención y comparador cuestan similar o los costos son pequeños', 'Ahorros moderados', 'Ahorros extensos'], x: VAR },
  { id: 'equ', t: 'Equidad', q: 'Al preferir la intervención en lugar del comparador, ¿cuál será el impacto en la equidad? (favorecer o desfavorecer a poblaciones vulnerables: mayores, personas de escasos recursos, contextos rurales, escaso acceso a los servicios de salud)', o: ['Reduce la equidad', 'Probablemente reduce la equidad', 'Probablemente no tenga impacto en la equidad', 'Probablemente incrementa la equidad', 'Incrementa la equidad'], x: VAR },
  { id: 'ace', t: 'Aceptabilidad', q: '¿La intervención es aceptable para el personal de salud y los pacientes?', o: ['No', 'Probablemente no', 'Probablemente sí', 'Sí'], x: VAR },
  { id: 'fac', t: 'Factibilidad', q: '¿La intervención es factible de implementar?', o: ['No', 'Probablemente no', 'Probablemente sí', 'Sí'], x: VAR },
];
const MULTI = (w) => [`Todas son igualmente ${w}`, `Unas son visiblemente más ${w} que otras (mencionar cuáles)`];
const CRIT_NMA = [
  { id: 'ben', t: 'Beneficios y certeza', q: '¿Cuán sustanciales son los beneficios ocasionados al brindar cada intervención frente a brindar el comparador?', free: true },
  { id: 'dan', t: 'Daños y certeza', q: '¿Cuán sustanciales son los daños ocasionados al brindar cada intervención frente a brindar el comparador?', free: true },
  { id: 'des', t: 'Desenlaces importantes para los pacientes', q: '¿La tabla SoF considera todos los desenlaces importantes para los pacientes?', o: ['No', 'Probablemente no', 'Probablemente sí', 'Sí'], x: [] },
  { id: 'bal', t: 'Balance de los efectos', q: '¿Cuáles son las intervenciones que tienen un mejor balance de beneficios/daños? (tomar en cuenta los beneficios, daños, certeza de la evidencia y la presencia de desenlaces importantes)', free: true },
  { id: 'rec', t: 'Uso de recursos', q: '¿Qué tan grandes son los requerimientos de recursos (costos) de las intervenciones?', o: MULTI('costosas'), x: [] },
  { id: 'equ', t: 'Equidad', q: '¿Cuál sería el impacto en la equidad en salud de preferir cada intervención?', o: MULTI('equitativas'), x: [] },
  { id: 'ace', t: 'Aceptabilidad', q: '¿Cuán aceptables son las intervenciones para el personal de salud y los pacientes?', o: MULTI('aceptables'), x: [] },
  { id: 'fac', t: 'Factibilidad', q: '¿Cuán factibles de implementar son las intervenciones?', o: MULTI('factibles'), x: [] },
];
const HEAD = [['pregunta', 'Pregunta'], ['poblacion', 'Población'], ['intervencion', 'Intervención'], ['comparador', 'Comparador'], ['escenario', 'Escenario'], ['perspectiva', 'Perspectiva'], ['coi', 'Potenciales conflictos de interés']];

let S = null, CTX = null;
const persist = () => CTX.save('mg-etd', S);

// ---------- sugerencias ----------
function outcomesPW() {
  return CTX.sof.filter(s => s.type === 'pairwise' && `${s.intervention} || ${s.comparator}` === S.cmp).map(s => {
    const ths = s.magThs && s.magThs.length ? s.magThs : [];
    const mg = isFinite(s.d) && ths.length ? magnitude(s.d, ths, s.higherBetter) : { dir: s.cat === 'benefit' ? 'benefit' : s.cat === 'harm' ? 'harm' : 'none', size: s.cat === 'nodiff' ? 0 : 1 };
    return { ...s, mg, imp: S.importance[s.outcome] || IMP_MAP[String(s.importance || '').toLowerCase()] || 'Crítico' };
  });
}
const sizeWord = (mg) => (mg.dir === 'none' ? 'trivial' : `${mg.dir === 'benefit' ? 'beneficio' : 'daño'} ${SIZE_ES[mg.size].toLowerCase()}`);
function suggestPW(O) {
  if (!O.length) return { ben: 'Se desconoce', dan: 'Se desconoce', cer: 'Ningún estudio incluido' };
  const rel = O.filter(o => o.imp !== 'Subrogado');
  const use = rel.length ? rel : O;
  // beneficio/daño: la mayor magnitud entre desenlaces críticos/importantes con certeza al menos baja
  const pick = dir => { const v = use.filter(o => o.mg.dir === dir && o.c >= 2).map(o => o.mg.size); return v.length ? Math.max(...v) : 0; };
  const b = pick('benefit'), d = pick('harm');
  const crit = use.filter(o => o.imp === 'Crítico');
  const cmin = Math.min(...(crit.length ? crit : use).map(o => o.c));
  const diff = b - d, sure = cmin >= 3 && Math.abs(diff) >= 2;
  const bal = diff > 0 ? (sure ? 'Favorece a la intervención' : 'Probablemente favorece a la intervención') : diff < 0 ? (sure ? 'Favorece al comparador' : 'Probablemente favorece al comparador') : 'No favorece a la intervención ni al comparador';
  return { ben: SIZE_ES[b], dan: SIZE_ES[d], cer: CERT_ES[cmin], bal, b, d, cmin };
}
function evidencePW(O, sg) {
  const ben = O.filter(o => o.mg.dir === 'benefit'), harm = O.filter(o => o.mg.dir === 'harm'), none = O.filter(o => o.mg.dir === 'none');
  const line = o => `• ${o.outcome} (${o.imp.toLowerCase()}): ${o.absolute}; certeza ${CERT_ES[o.c].toLowerCase()} (${SYM[o.c]}) → ${sizeWord(o.mg)}. ${o.plain || ''}`;
  const head = `En resumen, ${S.head.intervencion || 'la intervención'} comparado con ${S.head.comparador || 'el comparador'}:`;
  return {
    ben: O.length ? [head, ...(ben.length ? ben.map(line) : ['• Ningún desenlace muestra un beneficio importante.']), ...none.map(line)].join('\n') : 'No se añadieron desenlaces a la tabla SoF.',
    dan: O.length ? (harm.length ? harm.map(line).join('\n') : 'Ningún desenlace de la tabla SoF muestra un daño importante. Considere evidencia adicional sobre efectos adversos.') : '',
    cer: O.length ? `Entre los desenlaces críticos (${O.filter(o => o.imp === 'Crítico').map(o => o.outcome).join(', ') || 'ninguno marcado; se usaron todos'}), se consideró la menor certeza de la evidencia (${(CERT_ES[sg.cmin] || '').toLowerCase()}).\nSi todos los desenlaces críticos apuntan en la misma dirección, puede usarse la certeza más alta entre ellos.` : '',
    bal: O.length ? `Beneficios: ${SIZE_ES[sg.b]?.toLowerCase()}; daños: ${SIZE_ES[sg.d]?.toLowerCase()}; certeza global: ${(CERT_ES[sg.cmin] || '').toLowerCase()}. (Sugerencia: diferencia de magnitudes beneficio − daño; «favorece» sin «probablemente» solo con certeza moderada/alta y diferencia ≥2 categorías.)` : '',
  };
}
function evidenceNMA() {
  const blocks = CTX.sof.filter(s => s.type === 'nma');
  if (!blocks.length) return { ben: 'No se añadieron matrices NMA a la tabla SoF.', dan: '', bal: '' };
  const ben = [], dan = [], score = {};
  blocks.forEach(b => b.cols.forEach(col => {
    const cell = t => (b.cells[t] || {})[col.ref];
    const by = (cat) => b.rowsOrder.filter(t => cell(t) && cell(t).cat === cat && cell(t).c >= 2).map(t => {
      const x = cell(t), mg = isFinite(x.d) && b.magThs && b.magThs.length ? magnitude(x.d, b.magThs, b.higherBetter) : null;
      score[t] = (score[t] || 0) + (cat === 'benefit' ? 1 : -1) * (mg ? mg.size : 1);
      return `${t} (${mg ? SIZE_ES[mg.size].toLowerCase() + ', ' : ''}certeza ${CERT_ES[x.c].toLowerCase()})`;
    });
    const B = by('benefit'), H = by('harm');
    ben.push(`• ${b.outcome}, frente a ${col.ref}: ${B.length ? B.join('; ') : 'ninguna intervención con beneficio importante (certeza al menos baja)'}`);
    if (H.length) dan.push(`• ${b.outcome}, frente a ${col.ref}: ${H.join('; ')}`);
  }));
  const rank = Object.entries(score).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  return {
    ben: `Intervenciones con beneficio importante (marco mínimamente contextualizado; certeza baja o mayor):\n${ben.join('\n')}`,
    dan: dan.length ? `Intervenciones con daño importante:\n${dan.join('\n')}` : 'Ninguna intervención muestra daño importante en las matrices añadidas. Considere evidencia adicional sobre efectos adversos.',
    bal: rank.length ? `Tienen mejor balance de beneficios/daños (sugerencia por suma de magnitudes con certeza al menos baja):\n${rank.map(t => '* ' + t).join('\n')}` : 'Ninguna intervención muestra un balance claramente favorable.',
  };
}

// ---------- recomendación ----------
function recommendation(sg) {
  const J = id => S.j[id] ?? sg[id];
  const bal = J('bal') || '', cer = J('cer') || CERT_ES[sg.cmin] || '';
  const favor = /favorece a la intervención/.test(bal) && !/^No/.test(bal), against = /favorece al comparador/.test(bal);
  const certIdx = ['Muy baja', 'Baja', 'Moderada', 'Alta'].indexOf(cer) + 1;
  const neg = ['No', 'Probablemente no'];
  const barriers = neg.includes(J('ace')) || neg.includes(J('fac')) || /reduce/i.test(J('equ') || '') && !/no tenga/.test(J('equ') || '') || /extensos/.test(J('rec') || '') && favor;
  const strong = certIdx >= 3 && /^Favorece/.test(bal) && !barriers;
  const dir = favor ? 'a favor' : against ? 'en contra' : '(a favor o en contra: decida el panel)';
  const pob = S.head.poblacion || '[población]', I = S.head.intervencion || '[intervención]', C = S.head.comparador || '[comparador]';
  const verb = strong ? 'recomendamos' : 'sugerimos';
  const text = `En ${pob}, ${verb} ${against ? 'no brindar' : 'brindar'} ${I} en lugar de ${C}.`;
  const ben = (J('ben') || '').toLowerCase(), dan = (J('dan') || '').toLowerCase();
  const just = `Dirección: En ${pob}, los beneficios de brindar ${I} en lugar de ${C} se consideraron ${ben || '[…]'} y los daños se consideraron ${dan || '[…]'}. Por ello, se emitió una recomendación ${dir}.\n\nFuerza: Debido a que la certeza general de la evidencia fue ${cer.toLowerCase() || '[…]'}${strong ? ' y el balance claramente favorece a la intervención, sin barreras importantes de recursos, equidad, aceptabilidad o factibilidad, esta recomendación fue fuerte.' : ', esta recomendación fue condicional.'}`;
  const sym = { 'Alta': '⨁⨁⨁⨁', 'Moderada': '⨁⨁⨁◯', 'Baja': '⨁⨁◯◯', 'Muy baja': '⨁◯◯◯' }[cer] || '';
  return { text, label: `Recomendación ${strong ? 'fuerte' : 'condicional'} ${favor ? 'a favor' : against ? 'en contra' : ''}`.trim(), cert: `Certeza de la evidencia: ${cer.toLowerCase()} (${sym})`, just, strong };
}

// ---------- vista ----------
function critHTML(c, sug, ev) {
  const val = S.j[c.id] ?? sug[c.id];
  const auto = S.j[c.id] == null && sug[c.id] != null;
  const judg = c.free
    ? `<textarea data-ev="${c.id}" rows="6">${esc(S.ev[c.id] ?? ev[c.id] ?? '')}</textarea>`
    : `<div class="opts">${[...c.o, ...(c.x || [])].map((o, i) => `${i === c.o.length && c.x.length ? '<hr>' : ''}<label><input type="radio" name="etd-${c.id}" value="${esc(o)}" ${o === val ? 'checked' : ''}> ${esc(o)}${o === sug[c.id] ? ' <span class="sug">sugerido</span>' : ''}</label>`).join('')}</div>${auto ? '<small class="muted">Sugerencia automática: confirme o cambie.</small>' : ''}`;
  const evid = c.free ? '' : `<textarea data-ev="${c.id}" rows="5" placeholder="Evidencia">${esc(S.ev[c.id] ?? ev[c.id] ?? '')}</textarea>`;
  return `<div class="etd-crit"><div class="etd-q"><b>${c.t}:</b> ${esc(c.q)}</div>
  <div class="etd-grid"><div><div class="etd-h">Juicio</div>${judg}</div><div><div class="etd-h">Evidencia</div>${evid || '<small class="muted">Texto a la izquierda (generado desde la tabla SoF; editable)</small>'}</div>
  <div><div class="etd-h">Consideraciones adicionales</div><textarea data-cons="${c.id}" rows="5" placeholder="Juicio del grupo elaborador (GEG)">${esc(S.cons[c.id] || '')}</textarea></div></div></div>`;
}
function summaryHTML(crit, sug) {
  return `<table class="etd-sum"><tbody>${crit.filter(c => !c.free).map(c => { const v = S.j[c.id] ?? sug[c.id]; return `<tr><th>${c.t}</th>${[...c.o, ...(c.x || [])].map(o => `<td class="${o === v ? 'on' : ''}">${esc(o)}</td>`).join('')}</tr>`; }).join('')}</tbody></table>`;
}
function outcomesTable(O) {
  if (!O.length) return '';
  return `<table class="data etd-out"><thead><tr><th>Desenlace</th><th>Importancia</th><th>Efecto absoluto (IC 95 %)</th><th>Magnitud</th><th>Certeza</th></tr></thead><tbody>${O.map(o => `<tr><td>${esc(o.outcome)}</td><td><select data-imp="${esc(o.outcome)}">${IMPORTANCE.map(x => `<option ${x === o.imp ? 'selected' : ''}>${x}</option>`).join('')}</select></td><td>${esc(o.absolute)}</td><td>${sizeWord(o.mg)}</td><td><span class="badge" style="background:#${CTX.fillFor(o.cat, o.c)}">${SYM[o.c]} ${CERT_ES[o.c]}</span></td></tr>`).join('')}</tbody></table>
  <p class="muted">Magnitud según los umbrales pequeño (MID), moderado y grande en escala absoluta (GRADE-THRESHOLD; en binarios, por defecto MID × 2,38 y × 4,63). Marque la importancia: la certeza global usa los desenlaces críticos.</p>`;
}
function docHTML(crit, sug, ev, rec, O) {
  const hd = HEAD.map(([k, l]) => `<tr><th>${l}</th><td>${esc(S.head[k] || '')}</td></tr>`).join('');
  const body = crit.map(c => {
    const v = S.j[c.id] ?? sug[c.id];
    const judg = c.free ? esc(S.ev[c.id] ?? ev[c.id] ?? '').replace(/\n/g, '<br>') : [...c.o, ...(c.x || [])].map(o => `${o === v ? '●' : '○'} ${esc(o)}`).join('<br>');
    const evid = c.free ? '' : esc(S.ev[c.id] ?? ev[c.id] ?? '').replace(/\n/g, '<br>');
    return `<tr><th colspan="3">${c.t}: ${esc(c.q)}</th></tr><tr><td class="h">Juicio</td><td class="h">Evidencia</td><td class="h">Consideraciones adicionales</td></tr><tr><td>${judg}</td><td>${evid}</td><td>${esc(S.cons[c.id] || '').replace(/\n/g, '<br>')}</td></tr>`;
  }).join('');
  return `<h2>Tabla de la Evidencia a la Decisión (Evidence to Decision, EtD)</h2><p><b>Presentación:</b></p><table>${hd}</table>
  ${O.length ? `<p><b>Desenlaces:</b></p><table><tr><th>Desenlace</th><th>Importancia</th><th>Efecto absoluto</th><th>Certeza</th><th>Interpretación</th></tr>${O.map(o => `<tr><td>${esc(o.outcome)}</td><td>${o.imp}</td><td>${esc(o.absolute)}</td><td>${SYM[o.c]} ${CERT_ES[o.c]}</td><td>${esc(o.plain || '')}</td></tr>`).join('')}</table>` : ''}
  <p><b>Evaluación:</b></p><table>${body}</table><p><b>Resumen de los juicios:</b></p>${summaryHTML(crit, sug)}
  <p><b>Recomendación:</b></p><table><tr><th>Justificación de la dirección y fuerza de la recomendación</th><th>Recomendación</th></tr><tr><td>${esc(S.recJust ?? rec.just).replace(/\n/g, '<br>')}</td><td>${esc(S.recText ?? rec.text)}<br><br><b>${esc(S.recLabel ?? rec.label)}</b><br>${esc(rec.cert)}</td></tr></table>`;
}

export function renderEtD(root, ctx) {
  CTX = ctx;
  S = S || ctx.load('mg-etd', null) || { head: {}, j: {}, ev: {}, cons: {}, importance: {}, mode: null };
  const pw = ctx.sof.filter(s => s.type === 'pairwise'), nm = ctx.sof.filter(s => s.type === 'nma');
  if (!S.mode) S.mode = pw.length || !nm.length ? 'pw' : 'nma';
  const cmps = [...new Set(pw.map(s => `${s.intervention} || ${s.comparator}`))];
  if (!cmps.includes(S.cmp)) { S.cmp = cmps[0]; if (pw.length) { S.head.intervencion = pw[0].intervention; S.head.comparador = pw[0].comparator; } }
  S.head.escenario ||= ''; S.head.perspectiva ||= 'Recomendación clínica poblacional';
  const O = S.mode === 'pw' ? outcomesPW() : [];
  const crit = S.mode === 'pw' ? CRIT_PW : CRIT_NMA;
  const sg = S.mode === 'pw' ? suggestPW(O) : {};
  const ev = S.mode === 'pw' ? evidencePW(O, sg) : evidenceNMA();
  const rec = recommendation(sg);
  root.innerHTML = `<div class="card"><div class="row between wrap"><h2>Marco de la evidencia a la decisión (EtD)</h2>
    <div class="row gap wrap"><label>Tipo <select id="etd-mode"><option value="pw" ${S.mode === 'pw' ? 'selected' : ''}>Intervención vs comparador (por pares)</option><option value="nma" ${S.mode === 'nma' ? 'selected' : ''}>Múltiples intervenciones (NMA)</option></select></label>
    ${S.mode === 'pw' && cmps.length > 1 ? `<label>Comparación <select id="etd-cmp">${cmps.map(c => `<option value="${esc(c)}" ${c === S.cmp ? 'selected' : ''}>${esc(c.replace(' || ', ' vs '))}</option>`).join('')}</select></label>` : ''}
    <button class="ghost" id="etd-doc">Descargar Word (.doc)</button><button class="ghost" id="etd-regen">Regenerar textos</button><button class="ghost danger" id="etd-clear">Reiniciar</button></div></div>
    <p class="muted">Basado en GRADE EtD (Alonso-Coello et al., BMJ 2016) con el formato de las GPC de IETSI-EsSalud. Los desenlaces se toman de la tabla SoF (paso 3). Los juicios «sugeridos» son propuestas: el grupo elaborador decide y justifica.</p>
    <h3>Presentación</h3><div class="form">${HEAD.map(([k, l]) => `<label>${l}<input data-head="${k}" value="${esc(S.head[k] || '')}"></label>`).join('')}</div>
    ${outcomesTable(O)}</div>
    <div class="card"><h2>Evaluación</h2>${crit.map(c => critHTML(c, sg, ev)).join('')}</div>
    <div class="card"><h2>Resumen de los juicios</h2><div class="tablewrap" style="max-height:none">${summaryHTML(crit, sg)}</div></div>
    <div class="card"><h2>Recomendación</h2><div class="cols2"><div><div class="etd-h">Justificación de la dirección y fuerza</div><textarea id="etd-just" rows="9">${esc(S.recJust ?? rec.just)}</textarea></div>
    <div><div class="etd-h">Recomendación</div><textarea id="etd-text" rows="3">${esc(S.recText ?? rec.text)}</textarea><input id="etd-label" value="${esc(S.recLabel ?? rec.label)}" style="width:100%;margin-top:8px"><p><b>${esc(rec.cert)}</b></p>
    <p class="muted">Sugerencia: fuerte solo con certeza moderada/alta, balance claro («Favorece…») y sin barreras de recursos, equidad, aceptabilidad o factibilidad. GRADE admite recomendaciones fuertes con certeza baja en situaciones paradigmáticas; justifíquelo.</p></div></div></div>`;
  const rerender = () => { persist(); renderEtD(root, CTX); };
  root.querySelector('#etd-mode').addEventListener('change', e => { S.mode = e.target.value; rerender(); });
  root.querySelector('#etd-cmp')?.addEventListener('change', e => { S.cmp = e.target.value; const [i, c] = S.cmp.split(' || '); S.head.intervencion = i; S.head.comparador = c; S.j = {}; S.ev = {}; S.cons = {}; delete S.recJust; delete S.recText; delete S.recLabel; rerender(); });
  root.querySelectorAll('[data-head]').forEach(el => el.addEventListener('change', () => { S.head[el.dataset.head] = el.value; rerender(); }));
  root.querySelectorAll('[data-imp]').forEach(el => el.addEventListener('change', () => { S.importance[el.dataset.imp] = el.value; rerender(); }));
  root.querySelectorAll('input[type=radio][name^="etd-"]').forEach(el => el.addEventListener('change', () => { S.j[el.name.slice(4)] = el.value; delete S.recJust; delete S.recText; delete S.recLabel; rerender(); }));
  root.querySelectorAll('[data-ev]').forEach(el => el.addEventListener('input', () => { S.ev[el.dataset.ev] = el.value; persist(); }));
  root.querySelectorAll('[data-cons]').forEach(el => el.addEventListener('input', () => { S.cons[el.dataset.cons] = el.value; persist(); }));
  root.querySelector('#etd-just').addEventListener('input', e => { S.recJust = e.target.value; persist(); });
  root.querySelector('#etd-text').addEventListener('input', e => { S.recText = e.target.value; persist(); });
  root.querySelector('#etd-label').addEventListener('input', e => { S.recLabel = e.target.value; persist(); });
  root.querySelector('#etd-regen').addEventListener('click', () => { S.ev = {}; delete S.recJust; delete S.recText; delete S.recLabel; rerender(); });
  root.querySelector('#etd-clear').addEventListener('click', () => { if (confirm('¿Borrar todos los juicios y textos del EtD?')) { S = { head: {}, j: {}, ev: {}, cons: {}, importance: {}, mode: null }; rerender(); } });
  root.querySelector('#etd-doc').addEventListener('click', () => {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Calibri,sans-serif;font-size:10pt}table{border-collapse:collapse;width:100%;margin-bottom:8pt}td,th{border:1px solid #9aa4ae;padding:3pt;vertical-align:top;font-size:9pt;text-align:left}th{background:#DCE6F1}td.h{font-weight:bold;background:#F2F2F2}td.on{background:#1F3A5F;color:#fff;font-weight:bold}</style></head><body>${docHTML(crit, sg, ev, rec, O)}</body></html>`;
    download('marco_EtD.doc', html, 'application/msword');
  });
}
