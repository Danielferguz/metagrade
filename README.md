# MetaGRADE

Aplicación web para **meta-análisis por pares y meta-análisis en red (NMA)** con **calificación de la certeza de la evidencia** según **Core GRADE** (BMJ 2025) y el **enfoque GRADE para NMA** (incluida la guía GRADE 33 sobre imprecisión). Genera tablas *Summary of Findings* coloreadas (marco mínimamente contextualizado), notas al pie y el texto de métodos.

Todo se calcula en el navegador: los datos no salen de tu computadora. No requiere instalación ni servidor (sitio estático, compatible con GitHub Pages).

## Funciones

| Módulo | Contenido |
|---|---|
| Datos | CSV o Excel; detección automática del formato; alias de columnas en español e inglés; filtros por desenlace y subgrupo |
| Por pares | RR, OR, RD, MD, SMD, razón de medias, HR/OR/RR ajustados (varianza inversa genérica); efecto común, DL, REML; Wald, Knapp-Hartung, HKSJ ad hoc; τ², I², intervalo de predicción, Egger, bajo vs alto riesgo de sesgo, subgrupos; forest plot |
| Subgrupos y meta-regresión (pares) | Forest plot por subgrupos (cualquier columna del archivo) con diamante propio, y p de interacción (Q entre subgrupos); meta-regresión de efectos mixtos (REML/DL; Wald, Knapp-Hartung, ad hoc) con moderador numérico (gráfico de burbujas con banda del IC) o categórico, prueba ómnibus de moderadores, QE residual y R² |
| Columnas de grupo (pares) | Forest plot con columnas de intervención y control: n/N (%) en binarios, media (DE) y N en continuos, y solo N en razones ajustadas (columnas opcionales `n_int`, `n_comp`) |
| Forest estilo RevMan (pares) | Opción en «Formato de figuras»: columnas de eventos/total, media/DE/total o log[estimador]/EE, peso, estimador [IC], rombos negros por subtotal, heterogeneidad (Tau², Chi², I²), prueba del efecto global, prueba de diferencia entre subgrupos y columna de riesgo de sesgo; el tamaño de letra final (pt) se elige con el ancho «automático» |
| Sensibilidad y SoF (pares) | «Subgrupos / análisis de sensibilidad por»: riesgo de sesgo (bajo / algunas preocupaciones / alto) o cualquier columna (dosis, región…), con p de interacción. Las columnas `rob_*` se muestran como dominios A, B, C… y global en el forest RevMan; los estudios sin estimador (p. ej., doble cero) aparecen como «Not estimable». La SoF pinta solo la columna de certeza (paleta pastel), con leyenda compacta y columna de seguimiento (`followup`, mediana y rango, o texto libre por desenlace) |
| Dominios GRADE por subgrupo (pares) | La visualización de riesgo de sesgo, inconsistencia, imprecisión y sesgo de publicación se repite para ECA y observacionales y, si la p de interacción es < 0,10, para cada subgrupo (cada pestaña recalcula la sugerencia GRADE solo con esos estudios) |
| Evidencia por diseño (pares) | Con la columna `design`, los ECA y los estudios observacionales se agrupan y se califican por separado (dominios GRADE y punto de partida propios), con forest por diseño, p de interacción, tabla resumen y entrada separada en la SoF. No se aplica a las NMA |
| NMA | Modelo basado en contrastes por GLS (equivalente a netmeta), ensayos multibrazo, τ² común (REML), diseño-por-tratamiento, node-splitting, P-scores, tabla de liga, gráfico de red |
| GRADE por pares | Umbral MID o nulo sobre efectos absolutos; sugerencias por dominio (riesgo de sesgo por peso, inconsistencia por lado del umbral, indirectness, imprecisión con OIS y cociente de IC, sesgo de publicación, subir certeza) editables con justificación |
| GRADE para NMA | Certeza directa, indirecta (lazo dominante + intransitividad), red (fuente dominante + incoherencia) e imprecisión absoluta con tamaño muestral efectivo y OIS (GRADE 33); calificación editable por comparación |
| Salidas | Tabla SoF por pares y matriz SoF de NMA con leyenda de colores (paleta estándar o apta para daltonismo); Word (.doc), CSV, copiar; texto de métodos en inglés |
| NMA paso a paso | Orden de Izcovich et al. (BMJ 2023): directa (A) → indirecta (B) → red (C) → mejor estimado (D), con diagrama por comparación y tabla suplementaria tipo BMJ |
| Figuras | Descarga SVG / PNG / TIFF con DPI incrustado, ancho de columna de revista y fuente Arial |
| Marco EtD | Paso 4: evidencia a la decisión (por pares o múltiples intervenciones) con juicios sugeridos, recomendación y exportación a Word |

## Uso

Abre la página publicada (GitHub Pages) o, en local:

```bash
python3 -m http.server 8000   # luego http://localhost:8000
```

Formatos de entrada (ver pestaña *Datos*; ejemplos en `examples/`):

- Pares binario: `study, events_int, n_int, events_comp, n_comp[, rob, indirect, outcome, subgroup]`
- Pares continuo: `study, mean_int, sd_int, n_int, mean_comp, sd_comp, n_comp`
- Efectos ajustados: `study, estimate, lower, upper, n`
- NMA: `study, treatment, responders, n` (o `mean, sd, n`)`[, rob, indirect, modifier, outcome]`

## Validación

```bash
node tests/validate.mjs
```

Compara los motores JavaScript con valores de referencia de una reimplementación de metafor (REML/DL/HKSJ) y de un motor NMA en Python equivalente a netmeta, y con los ejemplos publicados de GRADE 33 (tamaño muestral efectivo y OIS). Diferencias < 1e-5. La meta-regresión (REML, Wald, Knapp-Hartung y ad hoc; moderador numérico y categórico) se valida con una referencia independiente en numpy/scipy (`tests/reference_reg.json`, generada con la verosimilitud restringida y GLS matricial), con diferencias < 1e-6.

## Advertencia

Las calificaciones automáticas son **sugerencias** basadas en reglas explícitas (ver *Métodos y ayuda*). Deben ser verificadas, modificadas cuando corresponda y justificadas por dos revisores. Core GRADE no es un producto oficial del GRADE Working Group.

## Referencias

Guyatt G, et al. Core GRADE 1–7. BMJ 2025 · Brignardello-Petersen R, et al. GRADE guidelines 33. J Clin Epidemiol 2021;139:49-56 · Puhan MA, et al. BMJ 2014;349:g5630 · Brignardello-Petersen R, et al. BMJ 2020;371:m3900 · Morgano GP, et al. GRADE-THRESHOLD. J Clin Epidemiol 2025;179:111639 · Yepes-Nuñez JJ, et al. J Clin Epidemiol 2019;115:1-13 · Rücker G. Res Synth Methods 2012;3:312-24.

## Licencia y cita

© Daniel Fernández-Guzmán. Licencia **CC BY-NC-ND 4.0** (Creative Commons Atribución-NoComercial-SinDerivadas 4.0 Internacional): se puede usar y compartir citando al autor, sin fines comerciales y sin distribuir versiones modificadas. Usar la app con sus propios datos y publicar los resultados está permitido citando MetaGRADE (ver `CITATION.cff`). Texto completo: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode. Las versiones anteriores a este cambio se distribuyeron con licencia MIT.

## Publicar una versión nueva

Después de cambiar el código, ejecute `python3 tools/bump_version.py AAAA.MM.DD-N`. Esto añade `?v=…` a todos los módulos y a la hoja de estilos para que los navegadores no sigan usando archivos antiguos en caché; la versión aparece en el pie de página.
