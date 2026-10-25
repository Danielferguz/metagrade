// Biblioteca de umbrales (MID) para revisiones sistemáticas de nefrología, cardiología y hematología.
// Criterio «lógico y conservador»: se parte de la mínima diferencia importante (MID) publicada o aceptada por consenso, se redondea hacia el valor
// MAYOR razonable (evita llamar «importante» a un cambio trivial) y se ofrecen tres umbrales: pequeño (= MID), moderado y grande.
// Binarios: se da la desutilidad (muerte = 1) y los umbrales salen de GRADE-THRESHOLD (DT = 0,0135 / 0,0321 / 0,0625 por unidad ÷ desutilidad).
// Continuos: se dan los tres umbrales en la unidad del desenlace. Son PROPUESTAS ORIENTATIVAS: valide y ajuste con su panel y su pregunta (población, contexto).
export const DT_C = [0.0135, 0.0321, 0.0625];
export const dtFromDis = (dis, unit) => DT_C.map(c => +Math.min(unit, c * unit / dis).toFixed(2));

// type: 'bin' (dis) o 'cont' (t = [pequeño, moderado, grande]); dir: 'lower' = un valor mayor es indeseable; 'higher' = deseable
const B = (area, name, dis, basis, dir = 'lower') => ({ area, name, type: 'bin', dis, dir, basis });
const C = (area, name, unit, t, basis, dir = 'higher', measure = 'MD') => ({ area, name, type: 'cont', unit, t, dir, basis, measure });
const J = 'Juicio conservador (desutilidad aproximada)';

export const MIDS = [
  // ---- binarios: general y cardiovascular
  B('General', 'Mortalidad por todas las causas', 1.0, 'Muerte = 1 por definición'),
  B('Cardiología', 'Mortalidad cardiovascular', 1.0, 'Muerte = 1 por definición'),
  B('Cardiología', 'Infarto de miocardio no fatal', 0.4, J),
  B('Cardiología', 'Ictus no fatal (cualquiera)', 0.5, J),
  B('Cardiología', 'Ictus discapacitante', 0.7, J),
  B('Cardiología', 'Hospitalización por insuficiencia cardiaca', 0.3, J),
  B('Cardiología', 'Evento cardiovascular mayor (MACE, compuesto)', 0.5, 'Compuesto: use la desutilidad del componente dominante; 0,5 es conservador'),
  B('Cardiología', 'Hemorragia intracraneal', 0.8, J),
  B('Cardiología', 'Fibrilación auricular incidente', 0.15, J),
  B('Cardiología', 'Revascularización no planificada', 0.2, J),
  // ---- binarios: nefrología
  B('Nefrología', 'Insuficiencia renal / enfermedad renal terminal (diálisis o trasplante)', 0.6, 'Utilidad de diálisis ≈ 0,4–0,6; se toma 0,6'),
  B('Nefrología', 'Disminución sostenida ≥ 40 % del eGFR o duplicación de creatinina', 0.3, 'Desenlace subrogado de falla renal; juicio conservador'),
  B('Nefrología', 'Compuesto renal (falla renal, ≥ 40 % eGFR, muerte renal)', 0.4, 'Compuesto: componente dominante'),
  B('Nefrología', 'Lesión renal aguda', 0.2, J),
  B('Nefrología', 'Hiperpotasemia que requiere tratamiento', 0.1, J),
  B('Nefrología', 'Hospitalización por cualquier causa', 0.2, J),
  B('Nefrología', 'Amputación de miembro inferior', 0.4, J),
  B('Nefrología', 'Fractura', 0.2, J),
  B('Nefrología', 'Hipoglucemia grave', 0.15, J),
  B('Nefrología', 'Cetoacidosis diabética', 0.15, J),
  B('Nefrología', 'Infección genital micótica', 0.1, 'Evento leve y tratable; desutilidades < 0,1 dan umbrales irrealmente altos'),
  B('Nefrología', 'Infección urinaria', 0.1, 'Evento leve y tratable; desutilidades < 0,1 dan umbrales irrealmente altos'),
  B('General', 'Eventos adversos graves', 0.3, J),
  // ---- binarios: hematología
  B('Hematología', 'Tromboembolismo venoso sintomático (TVP o EP)', 0.3, J),
  B('Hematología', 'Hemorragia mayor (ISTH)', 0.3, J),
  B('Hematología', 'Hemorragia no mayor clínicamente relevante', 0.05, J),
  B('Hematología', 'Necesidad de transfusión de hematíes', 0.1, J),
  B('Hematología', 'Independencia transfusional (beneficio)', 0.1, J, 'higher'),
  B('Hematología', 'Infección grave en neutropenia', 0.2, J),
  // ---- continuos: nefrología
  C('Nefrología', 'Pendiente anual del eGFR', 'mL/min/1,73 m² por año', [0.75, 1.5, 3], 'Consenso FDA/NKF (Levey 2020): 0,5–1,0 mL/min/año se asocia a menor riesgo de falla renal; se toma 0,75'),
  C('Nefrología', 'Cambio absoluto del eGFR', 'mL/min/1,73 m²', [3, 5, 10], 'Juicio conservador (cambio de categoría KDIGO ≈ 15)'),
  C('Nefrología', 'Cambio porcentual de la albuminuria (UACR)', '% de cambio', [20, 30, 50], 'FDA/NKF y KDIGO: reducción ≥ 30 % es clínicamente relevante; 20 % como pequeño'),
  C('Nefrología', 'Potasio sérico', 'mmol/L', [0.3, 0.5, 1.0], 'Variación biológica y umbrales clínicos (3,5–5,0)', 'lower'),
  C('Nefrología', 'Fósforo sérico', 'mg/dL', [0.5, 1.0, 1.5], 'Juicio conservador (rango objetivo 3,5–5,5)', 'lower'),
  C('Nefrología', 'Bicarbonato sérico', 'mmol/L', [2, 3, 5], 'Juicio conservador (objetivo ≥ 22)'),
  // ---- continuos: cardiovascular y metabólico
  C('Cardiología', 'Presión arterial sistólica', 'mmHg', [5, 10, 15], 'Conservador: 5 mmHg (≈ 3 mmHg basta en preguntas poblacionales)', 'lower'),
  C('Cardiología', 'LDL-colesterol', 'mmol/L', [0.5, 1.0, 1.5], 'CTT: ≈ 22 % menos eventos vasculares mayores por mmol/L', 'lower'),
  C('Cardiología', 'NT-proBNP (cambio porcentual)', '% de cambio', [20, 30, 50], 'Variación biológica ≈ 25–30 %', 'lower'),
  C('Cardiología', 'KCCQ (resumen clínico o global)', 'puntos 0–100', [5, 10, 20], 'Spertus: 5 pequeño, 10 moderado, 20 grande'),
  C('Cardiología', 'Prueba de marcha de 6 minutos', 'm', [30, 50, 75], 'MCID publicado 25–50 m; se toma el rango alto'),
  C('Cardiología', 'Fracción de eyección del ventrículo izquierdo', 'puntos porcentuales', [3, 5, 8], 'Variabilidad de la medición ≈ 3–5 puntos'),
  C('Metabólico', 'Hemoglobina glucosilada (HbA1c)', '% (puntos)', [0.3, 0.5, 1.0], 'Regulación (FDA no inferioridad 0,3) y MID clínica ≈ 0,5', 'lower'),
  C('Metabólico', 'Peso corporal (cambio porcentual)', '% de cambio', [3, 5, 10], 'Pérdida ≥ 5 % se considera clínicamente significativa', 'lower'),
  C('General', 'Calidad de vida o síntomas (escala 0–100)', 'puntos', [5, 10, 20], 'Genérico; si la escala tiene MID propia, úsela. Alternativa: DME 0,2 / 0,5 / 0,8'),
  // ---- continuos: hematología
  C('Hematología', 'Hemoglobina', 'g/dL', [1.0, 2.0, 3.0], 'MCID habitual en anemia ≈ 1 g/dL'),
  C('Hematología', 'Recuento de plaquetas', '×10⁹/L', [20, 50, 100], 'Umbrales clínicos de respuesta/seguridad (30–50 ×10⁹/L); orientativo'),
  C('Hematología', 'Unidades de hematíes transfundidas por paciente', 'unidades', [1, 2, 4], 'Una unidad es la mínima intervención discreta', 'lower'),
  C('Hematología', 'Tiempo en rango terapéutico (anticoagulación)', 'puntos porcentuales', [5, 10, 20], 'Orientativo (TTR ≈ 65–70 % buen control)'),
];
export const midLabel = m => `${m.area} · ${m.name}${m.type === 'bin' ? ' [binario]' : ` [${m.unit}]`}`;
// umbrales {mid, mod, large} del preset; para binarios depende de la escala absoluta (por 100 o por 1000)
export const midValues = (m, unit = 100) => { const t = m.type === 'bin' ? dtFromDis(m.dis, unit) : m.t; return { mid: t[0], mod: t[1], large: t[2] }; };
