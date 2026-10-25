// Lectura de CSV/XLSX y normalización de columnas (alias en español e inglés).

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(x => x.trim() !== '')).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    if (!window.XLSX) throw new Error('No se pudo cargar la librería de Excel (SheetJS). Guarde el archivo como CSV.');
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheets = {};
    for (const sn of wb.SheetNames) sheets[sn] = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '', raw: true });
    return { sheets };
  }
  return { sheets: { [file.name]: parseCSV(await file.text()) } };
}

const ALIAS = {
  study: ['study', 'estudio', 'author', 'autor', 'trial', 'ensayo', 'id', 'studlab'],
  outcome: ['outcome', 'desenlace', 'outcome_id', 'resultado'],
  subgroup: ['subgroup', 'subgrupo', 'comparison', 'comparacion', 'comparación'],
  e1: ['events_int', 'e1', 'ei', 'event.e', 'events1', 'eventos_int', 'events_intervention', 'r1'],
  n1: ['n_int', 'n1', 'ni', 'n.e', 'total_int', 'n_intervention'],
  e2: ['events_comp', 'e2', 'ec', 'event.c', 'events2', 'eventos_comp', 'events_control', 'r2'],
  n2: ['n_comp', 'n2', 'nc', 'n.c', 'total_comp', 'n_control'],
  m1: ['mean_int', 'm1', 'mean.e', 'media_int', 'mean1'],
  sd1: ['sd_int', 'sd1', 'sd.e', 'de_int', 'sd1'],
  m2: ['mean_comp', 'm2', 'mean.c', 'media_comp', 'mean2'],
  sd2: ['sd_comp', 'sd2', 'sd.c', 'de_comp'],
  tp: ['tp', 'true_positive', 'true_positives', 'vp'],
  fp: ['fp', 'false_positive', 'false_positives'],
  fn: ['fn', 'false_negative', 'false_negatives'],
  tn: ['tn', 'true_negative', 'true_negatives', 'vn'],
  x: ['cases', 'casos', 'n_cases', 'positive', 'x'],
  pt: ['person_years', 'person_time', 'py', 'persontime', 'tiempo_persona', 'person_months', 'personyears'],
  yi: ['yi', 'te', 'logeffect', 'log_effect'],
  sei: ['sei', 'sete', 'se', 'ee'],
  est: ['estimate', 'est', 'hr', 'effect', 'efecto'],
  lower: ['lower', 'lci', 'ci_lower', 'lo', 'li', 'ic_inf'],
  upper: ['upper', 'uci', 'ci_upper', 'hi', 'ls', 'ic_sup'],
  n: ['n', 'n_total', 'samplesize', 'sample_size', 'total', 'tamano'],
  fu: ['followup', 'follow_up', 'follow-up', 'seguimiento', 'followup_months', 'followup_weeks', 'followup_years', 'followup_days', 'follow_up_months', 'follow_up_years'],
  rob: ['rob', 'risk_of_bias', 'riesgo_sesgo', 'riesgo_de_sesgo', 'overall_rob'],
  indirect: ['indirect', 'indirectness', 'indirecto', 'evidencia_indirecta'],
  design: ['design', 'diseño', 'diseno', 'study_design'],
  treatment: ['treatment', 'tratamiento', 'intervention', 'intervencion', 'intervención', 'arm', 'node', 'nodo'],
  r: ['responders', 'events', 'eventos', 'r', 'event', 'respondedores'],
  mean: ['mean', 'media', 'm'],
  sd: ['sd', 'de'],
  modifier: ['modifier', 'modificador', 'population', 'poblacion', 'población', 'effect_modifier'],
  // configuración opcional por desenlace (repetida en las filas del desenlace)
  o_importance: ['importance', 'importancia'],
  o_dir: ['direction', 'direccion', 'dirección'],
  o_mid: ['mid', 'dmi'],
  o_dis: ['disutility', 'disutilidad'],
  o_p0: ['baseline_risk', 'riesgo_basal', 'p0'],
  o_int: ['intervention_name', 'nombre_intervencion'],
  o_comp: ['comparator_name', 'nombre_comparador'],
};

export function mapColumns(rows) {
  const cols = Object.keys(rows[0] || {});
  const lc = Object.fromEntries(cols.map(c => [c.toLowerCase().replace(/\s+/g, '_'), c]));
  const map = {};
  for (const [k, al] of Object.entries(ALIAS)) for (const a of al) if (lc[a] != null && map[k] == null && !Object.values(map).includes(lc[a])) { map[k] = lc[a]; break; }
  return map;
}

export function normalize(rows, map) {
  const num = v => { if (v === '' || v == null) return NaN; const x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return x; };
  const NUM = new Set(['tp', 'fp', 'fn', 'tn', 'x', 'pt', 'e1', 'n1', 'e2', 'n2', 'm1', 'sd1', 'm2', 'sd2', 'yi', 'sei', 'est', 'lower', 'upper', 'n', 'r', 'mean', 'sd', 'o_mid', 'o_dis', 'o_p0']);
  return rows.map(r => {
    const o = { _raw: r }; // fila original: permite agrupar o hacer meta-regresión por cualquier columna
    for (const [k, c] of Object.entries(map)) o[k] = NUM.has(k) ? num(r[c]) : String(r[c] ?? '').trim();
    return o;
  });
}

export function detectType(map) {
  if (map.tp && map.fp && map.fn && map.tn) return { kind: 'dta' };
  if (map.e1 && map.e2) return { kind: 'pairwise', data: 'binary' };
  if (map.m1 && map.m2) return { kind: 'pairwise', data: 'continuous' };
  if (map.yi && map.sei) return { kind: 'pairwise', data: 'generic' };
  if (map.est && map.lower && map.upper) return { kind: 'pairwise', data: 'ratio-ci' };
  if (!map.treatment && !map.e1 && (map.x || map.r) && (map.n || map.pt)) return { kind: 'prop', data: map.pt ? 'rate' : 'prop' };
  if (map.treatment && (map.r || map.mean)) return { kind: 'nma', outcome: map.r ? 'binary' : 'continuous' };
  return { kind: 'unknown' };
}

export function download(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const toCSV = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => { const v = r[c] ?? ''; return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v; }).join(','))].join('\n');
