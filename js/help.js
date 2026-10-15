export const HELP_HTML = `
<h2>Qué hace MetaGRADE</h2>
<p>Realiza meta-análisis por pares y meta-análisis en red (NMA) a partir de archivos CSV o Excel y propone la calificación de la certeza de la evidencia según <b>Core GRADE</b> (Guyatt et al., BMJ 2025) y el <b>enfoque GRADE para NMA</b> (Puhan 2014; Brignardello-Petersen 2018, 2020; GRADE 33). Todos los cálculos se hacen en tu navegador: los datos no se envían a ningún servidor.</p>
<p><b>Las calificaciones automáticas son sugerencias.</b> Cada dominio se puede modificar con su justificación, que pasa a la nota al pie. Dos revisores deben confirmarlas.</p>

<h2>Métodos estadísticos</h2>
<ul>
<li><b>Por pares:</b> RR, OR (corrección 0,5 solo en estudios con celdas cero; se excluyen los de doble cero), RD, MD, SMD (g de Hedges), razón de medias, y efectos ajustados (HR/OR/RR con IC) por varianza inversa genérica. Efecto común, DerSimonian-Laird o REML; IC de Wald, Knapp-Hartung o HKSJ ad hoc. I² según metafor, τ², Q, intervalo de predicción (t, k−2 gl), prueba de Egger (≥10 estudios), comparación de estudios de bajo vs alto riesgo de sesgo y prueba de subgrupos. Validado frente a una reimplementación de metafor (diferencias &lt;1e-11).</li>
<li><b>NMA:</b> modelo basado en contrastes por mínimos cuadrados generalizados (equivalente a netmeta), covarianza exacta en ensayos multibrazo, efectos aleatorios con τ² común (REML), descomposición diseño-por-tratamiento de Q, node-splitting por retro-cálculo, P-scores, tabla de liga, gráfico de la red. Validado frente al motor en Python de una NMA publicada (diferencias &lt;1e-6).</li>
</ul>

<h2>Reglas GRADE implementadas (sugerencias)</h2>
<h3>Umbral y blanco de la certeza (Core GRADE 2)</h3>
<p>Se califica la certeza respecto a la <b>MID</b> (efecto importante vs poco o ningún efecto) o al <b>valor nulo</b>, siempre sobre el <b>efecto absoluto</b> (diferencia de riesgos con el riesgo basal indicado, o diferencia de medias). La MID puede derivarse con GRADE-THRESHOLD: DT1 = 1,35 por 100 ÷ disutilidad.</p>
<h3>Por pares (Core GRADE 2–5)</h3>
<ul>
<li><b>Riesgo de sesgo:</b> se baja si los estudios de alto riesgo dominan (&gt;65 % del peso, configurable). Si hay evidencia apreciable de bajo riesgo, se muestra la comparación bajo vs alto riesgo para decidir si usar solo los de bajo riesgo.</li>
<li><b>Inconsistencia:</b> proporción del peso con estimadores del mismo lado del umbral que el estimador combinado (≥80 % → no serio), solapamiento de IC; I² solo como criterio secundario. <b>Intervalo de predicción</b> (opcional, activado por defecto, ≥3 estudios y efectos aleatorios): si el IP 95 % del efecto absoluto cruza un umbral ±MID que el IC del estimador combinado no cruza, −1; si cruza ambos ±MID que el IC no cruzaba, −2. Se aplica el mayor de los dos criterios (no se suman).</li>
<li><b>Evidencia indirecta:</b> &gt;50 % del peso de estudios marcados como indirectos, o desenlace sustituto.</li>
<li><b>Imprecisión:</b> dos esquemas. <i>2 umbrales</i>: el IC 95 % del efecto absoluto cruza un ±MID (−1) o ambos (−2). <i>3 umbrales por lado</i> (pequeño = MID, moderado y grande; GRADE-THRESHOLD DT1/DT2/DT3; en binarios, por defecto MID × 2,38 y × 4,63): −1 por cada umbral cruzado, máximo −3. Si no cruza pero el efecto es grande (cambio relativo &gt;30 %), se compara el N total con el tamaño óptimo de información (OIS; RRR 25 %, α 0,05, potencia 80 %); cociente de IC ≥3 (RR) o ≥2,5 (OR) → −2. Continuos: OIS con MID y DE, o regla de 400 por grupo.</li>
<li><b>Sesgo de publicación:</b> Egger p &lt;0,10 con ≥10 estudios, o estudios pequeños financiados por la industria.</li>
<li><b>Subir</b> (solo no aleatorizados sin bajadas por sesgo ni imprecisión): RR ≥2 o ≤0,5 (+1), ≥5 o ≤0,2 (+2); dosis-respuesta (+1).</li>
</ul>
<h3>NMA (GRADE para NMA; GRADE 33)</h3>
<ul>
<li><b>Directa:</b> riesgo de sesgo (&gt;50 % del peso de alto riesgo), indirectness (&gt;50 %), inconsistencia (I² &gt;50 % con ≥2 ensayos; revise el forest plot).</li>
<li><b>Indirecta:</b> la menor certeza de las comparaciones directas del lazo de primer orden dominante (o del camino más corto); −1 por <b>intransitividad</b> si el camino combina estudios con distintos niveles del modificador de efecto (columna <code>modifier</code>).</li>
<li><b>Red:</b> parte de la fuente que domina (&gt;60 % de contribución) o de la mayor de las dos si contribuyen de forma similar; −1 por <b>incoherencia</b> si node-split p &lt; umbral y ambas fuentes contribuyen (20–80 %).</li>
<li><b>Inconsistencia de la estimación de red:</b> el intervalo de predicción frente a ±MID (misma regla que por pares), sin volver a bajar si la evidencia directa ya bajó por inconsistencia.</li>
<li><b>Imprecisión:</b> umbrales cruzados por el IC del efecto absoluto (esquema de 2 umbrales: −1/−2; −3 si va de beneficio grande a daño grande; esquema de 3 umbrales: −1 por umbral cruzado, máx. −3). Sin cruces y efecto grande: tamaño muestral efectivo de la estimación de red frente al OIS.</li>
</ul>
<h3>Visualización de los dominios</h3>
<p>Tras ejecutar el análisis aparecen paneles gráficos (inspirados en la Figura S1 de las NMA publicadas):</p>
<ul>
<li><b>Riesgo de sesgo:</b> barra del peso por categoría (bajo / algunas dudas / alto) con la línea de dominancia, peso de cada estudio y comparación bajo vs alto riesgo en escala absoluta. En NMA, las aristas de la red y cada comparación directa se colorean por riesgo de sesgo.</li>
<li><b>Inconsistencia:</b> estimadores absolutos de cada estudio frente a las zonas de ±MID (verde = beneficio importante, amarillo = poca o ninguna diferencia, rojo = daño importante), peso por zona frente al criterio del 80 %, e I² como criterio secundario. En NMA, I² de cada comparación directa y gráfico directa vs indirecta vs red (node-splitting).</li>
<li><b>Imprecisión:</b> IC 95 % del efecto absoluto frente a ±MID con la regla aplicada («cruza +MID → −1», «cruza ambos → −2»), el recuadro de certeza coloreado y, cuando corresponde, el N (o tamaño muestral efectivo en NMA) frente al OIS. En NMA, todas las comparaciones frente al comparador en un solo gráfico tipo resumen gráfico.</li>
</ul>
<h3>Paso 4: marco de la evidencia a la decisión (EtD)</h3>
<p>Toma los desenlaces de la tabla SoF y arma el EtD con el formato de las GPC de IETSI-EsSalud: presentación (pregunta, población, intervención, comparador, escenario, perspectiva, conflictos de interés), importancia de cada desenlace (crítico / importante / subrogado), y los criterios beneficios, daños, certeza, desenlaces importantes, balance, uso de recursos, equidad, aceptabilidad y factibilidad, con juicio, evidencia y consideraciones adicionales. Reglas de las sugerencias:</p>
<ul>
<li><b>Beneficios / daños:</b> la mayor magnitud (trivial, pequeño, moderado, grande según los tres umbrales) entre los desenlaces no subrogados con certeza baja o mayor.</li>
<li><b>Certeza global:</b> la menor certeza entre los desenlaces críticos.</li>
<li><b>Balance:</b> magnitud del beneficio − magnitud del daño; «favorece» sin «probablemente» solo con certeza moderada/alta y una diferencia ≥2 categorías.</li>
<li><b>Recomendación:</b> dirección según el balance; fuerte solo con certeza moderada/alta, balance claro y sin barreras de recursos, equidad, aceptabilidad o factibilidad; en otro caso, condicional. Textos de justificación y recomendación editables; exportación a Word.</li>
<li>Para NMA, versión de múltiples intervenciones: lista de intervenciones con beneficio o daño importante por desenlace y comparador, y las de mejor balance.</li>
</ul>
<h3>Código de colores (marco mínimamente contextualizado)</h3>
<p>El color lo fija el estimador puntual absoluto respecto a ±MID (verde = beneficio, rojo = daño/menos eficaz, amarillo = sin diferencia importante) y la intensidad la certeza; certeza muy baja en gris. La frase en lenguaje claro sigue Core GRADE 6: «reduce / probablemente reduce / puede reducir / la evidencia es muy incierta».</p>

<h2>Advertencias</h2>
<ul>
<li>El riesgo basal cambia el efecto absoluto y la imprecisión: justifique su fuente (estudio observacional representativo, mediana de los brazos control, etc.). Con OR &gt;1 y riesgos basales altos, un basal más bajo <i>aumenta</i> el beneficio absoluto.</li>
<li>No se combinan ECA y estudios observacionales automáticamente; analícelos por separado (GRADE guidance 44).</li>
<li>Rankings y P-scores no sustituyen magnitud ni certeza.</li>
</ul>

<h2>Referencias principales</h2>
<ul class="tight">
<li>Guyatt G, et al. Core GRADE 1–7. BMJ 2025;389:e081903–e083867.</li>
<li>Brignardello-Petersen R, et al. GRADE guidelines 33: imprecision in a network meta-analysis. J Clin Epidemiol 2021;139:49-56.</li>
<li>Puhan MA, et al. BMJ 2014;349:g5630 · Brignardello-Petersen R, et al. J Clin Epidemiol 2018;93:36-44 · BMJ 2020;371:m3900.</li>
<li>Alonso-Coello P, et al. GRADE Evidence to Decision (EtD) frameworks 1 y 2. BMJ 2016;353:i2016, i2089.</li>
<li>Morgano GP, et al. GRADE-THRESHOLD. J Clin Epidemiol 2025;179:111639.</li>
<li>Yepes-Nuñez JJ, et al. Summary of findings table for NMA. J Clin Epidemiol 2019;115:1-13.</li>
<li>Rücker G. Network meta-analysis, electrical networks and graph theory. Res Synth Methods 2012;3:312-24.</li>
<li>Viechtbauer W. Conducting meta-analyses in R with the metafor package. J Stat Softw 2010;36:1-48.</li>
</ul>`;
