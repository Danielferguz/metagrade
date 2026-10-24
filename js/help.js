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
<li><b>Sesgo de publicación:</b> Egger p &lt;0,10 con ≥10 estudios, o estudios pequeños financiados por la industria. La pestaña «Sesgo de publicación» muestra el <b>funnel plot</b> (pseudo-IC 95 %, puntos coloreados por riesgo de sesgo) con la recta y la prueba de <b>Egger</b> (regresión clásica: efecto/EE frente a 1/EE; intercepto, IC 95 % y p). Con &lt;10 estudios se muestra con advertencia de baja potencia. En NMA: <b>funnel ajustado por comparación</b> (Chaimani 2013), con cada contraste de estudio centrado en la estimación de red y Egger sobre los valores centrados.</li>
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
<h3>Subgrupos, meta-regresión y evidencia por diseño (solo pares)</h3>
<ul>
<li><b>Subgrupos:</b> elija cualquier columna del archivo (región, población, dosis, <code>design</code>…). Cada subgrupo se combina por separado con su propio τ² y se muestra en el forest plot con su diamante; la <b>p de interacción</b> es la prueba Q de diferencia entre subgrupos. Con pocos estudios por subgrupo tiene poca potencia; juzgue la credibilidad con ICEMAN antes de presentar estimaciones separadas.</li>
<li><b>Meta-regresión:</b> modelo de efectos mixtos con un moderador numérico (se centra en la media; gráfico de burbujas con la recta y su IC 95 %) o categórico (categoría más frecuente como referencia). Se informan β (exp(β) en razones), prueba ómnibus de moderadores, heterogeneidad residual y R². Use ≥10 estudios por moderador; es una asociación entre estudios, no causal.</li>
<li><b>Columnas de intervención y control:</b> n/N (%) en binarios, media (DE) y N en continuos y solo N en razones ajustadas (columnas opcionales <code>n_int</code> y <code>n_comp</code>). Las filas combinadas muestran los totales.</li>
<li><b>Evidencia por diseño:</b> con la columna <code>design</code> (RCT / cohorte / caso-control / NRSI…) y ambos tipos de estudio, se añade una sección que califica por separado los ECA (inician en alta) y los observacionales (inician en baja; alta si se evalúan con ROBINS-I y emulan un ensayo), con sus propios dominios GRADE editables, forest por diseño, p de interacción y filas separadas en la SoF. Cuando los ECA aportan certeza alta o moderada, los observacionales rara vez la modifican. No se aplica a las NMA.</li>
</ul>
<h3>Visualización de los dominios</h3>
<p>Tras ejecutar el análisis aparecen paneles gráficos (inspirados en la Figura S1 de las NMA publicadas):</p>
<ul>
<li><b>Riesgo de sesgo:</b> barra del peso por categoría (bajo / algunas dudas / alto) con la línea de dominancia, peso de cada estudio y comparación bajo vs alto riesgo en escala absoluta. En NMA, las aristas de la red y cada comparación directa se colorean por riesgo de sesgo.</li>
<li><b>Inconsistencia:</b> estimadores absolutos de cada estudio frente a las zonas de ±MID (verde = beneficio importante, amarillo = poca o ninguna diferencia, rojo = daño importante), peso por zona frente al criterio del 80 %, e I² como criterio secundario. En NMA, I² de cada comparación directa y gráfico directa vs indirecta vs red (node-splitting).</li>
<li><b>Imprecisión:</b> IC 95 % del efecto absoluto frente a ±MID con la regla aplicada («cruza +MID → −1», «cruza ambos → −2»), el recuadro de certeza coloreado y, cuando corresponde, el N (o tamaño muestral efectivo en NMA) frente al OIS. En NMA, todas las comparaciones frente al comparador en un solo gráfico tipo resumen gráfico.</li>
</ul>
<h3>NMA paso a paso (Izcovich et al., BMJ 2023;381:e074495)</h3>
<p>Para cada comparación la app sigue el orden de la figura 1 de la guía y lo muestra en un diagrama (A→D) y en una tabla resumen (clic en una fila para ver su diagrama):</p>
<ul>
<li><b>A · Directa.</b> A1: riesgo de sesgo, inconsistencia, evidencia indirecta y sesgo de publicación → certeza directa <i>preliminar</i>. A2 (solo si hay incoherencia): imprecisión → certeza directa <i>final</i>.</li>
<li><b>B · Indirecta.</b> B1: lazo de primer orden dominante (o camino de mayor orden) y la menor certeza preliminar de sus comparaciones directas. B2: intransitividad → certeza indirecta <i>preliminar</i>. B3 (solo si hay incoherencia): imprecisión → <i>final</i>.</li>
<li><b>C · Red.</b> C1: punto de partida según la dominancia (directa &gt;60 %, indirecta &gt;60 % o la mayor si contribuyen de forma similar). C2: incoherencia (node-split) y, si está activada, heterogeneidad por intervalo de predicción. C3: imprecisión → certeza de red <i>final</i>.</li>
<li><b>D · Mejor estimado.</b> Si directa e indirecta no son incoherentes, se usa la estimación de red. Si lo son (node-split p &lt; umbral), se presenta el estimado (red, directo o indirecto) con mayor certeza final; la tabla SoF y la matriz NMA lo indican.</li>
</ul>
<p>La <b>tabla SoF de NMA</b> es una sola por red: filas = intervenciones, columnas = desenlaces (y comparador si se eligen varios), con notas al pie unificadas.</p>
<p><b>Tabla suplementaria</b> (formato de BMJ 2023;383:e076226): estimado directo (IC 95 %), n.º de ECA, participantes por brazo, I², certeza directa, estimado indirecto, certeza indirecta, estimado NMA y su certeza, con notas al pie (a, b, c…). En la pestaña 3 se reúnen además los <b>perfiles de evidencia GRADE</b> de los meta-análisis por pares; todo se exporta a Word (horizontal) o CSV.</p>
<h3>Figuras para revistas</h3>
<p>Debajo de cada gráfico: SVG (vectorial), PNG y TIFF con la resolución incrustada. Elija el ancho (1 columna 85 mm, 1,5 columnas 120 mm, 2 columnas 174 mm o personalizado), la resolución (300/600/1000 dpi) y la fuente (Arial, Helvetica o Times). Se exportan con fondo blanco y texto negro; la app indica el tamaño de letra resultante.</p>
<h3>Umbrales: GRADE-THRESHOLD (dicotómicos) y DME (continuos)</h3>
<p>El ayudante «Calcular los umbrales» muestra visualmente las zonas trivial / pequeño / moderado / grande. <b>Dicotómicos:</b> elija la disutilidad del estado (0 = sin daño, 1 = muerte) con el control deslizante o con anclas orientativas (muerte 1; crónico muy grave ≈0,7–0,9; grave con secuelas ≈0,4–0,6; grave transitorio ≈0,2–0,35; moderado transitorio ≈0,05–0,15; leve &lt;0,05); T1 = 1,35, T2 = 3,21 y T3 = 6,25 por 100 ÷ disutilidad. <b>Continuos:</b> DME 0,2 / 0,5 / 0,8 (Cohen), convertida a unidades naturales con la DE combinada, o directamente si la medida es DME; si existe una MID publicada anclada en pacientes, prefiérala como T1. Las anclas son orientativas: ajústelas con utilidades publicadas o con las preferencias del panel.</p>
<h3>Configuración por desenlace</h3>
<p>En el paso 2, debajo de la configuración global, cada desenlace tiene un <b>desplegable</b> con su importancia (Critical / Important / Surrogate), dirección, medida (pares), MID y umbrales moderado y grande, disutilidad (dicotómicos) o DE para DME 0,2/0,5/0,8 (continuos) con botón «→ umbrales», riesgo basal y nombres de intervención y comparador. Los valores iniciales salen de las columnas opcionales del archivo o de la configuración global. Marque o desmarque cada desenlace y pulse «Ejecutar todos los desenlaces y añadir a SoF»; también puede ejecutar uno solo desde su desplegable.</p>
<p><b>Riesgo basal por desenlace</b> (dicotómicos): mediana del riesgo en los grupos comparadores, grupo comparador del estudio más grande, percentil 25 de los riesgos de los grupos comparadores o valor manual (p. ej., de una cohorte o registro representativo de la población de interés); en NMA, además, la proporción combinada de los brazos del comparador. El desplegable muestra el valor resultante de cada opción; la tabla SoF y el perfil de evidencia indican el método usado. El riesgo basal cambia el efecto absoluto y, por tanto, la imprecisión y la categoría de color.</p>
<h3>Paso 2 por desenlace</h3>
<p>En «Datos» marque los desenlaces a analizar. Tras «Ejecutar todos los desenlaces», una barra de pestañas permite cambiar de desenlace en el paso 2 sin volver a ejecutar; los juicios modificados se conservan (✓ = ya añadido a la tabla SoF).</p>
<h3>NMA: directo, indirecto y red</h3>
<p>El gráfico de imprecisión muestra para cada comparación el estimado directo (□), el indirecto (△) y el de red (●) en escala absoluta, con su certeza; si no hay evidencia directa o indirecta se indica. El <b>node-splitting gráfico</b> (k directa, directa, indirecta, red, % directa y p) y su tabla se descargan para el material suplementario (también se incluyen en la pestaña 3).</p>
<h3>Varios desenlaces a la vez</h3>
<p>«Ejecutar todos los desenlaces y añadir a SoF» analiza cada valor de la columna <code>outcome</code> con la configuración actual, más estas columnas opcionales por desenlace: <code>importance</code> (Critical / Important / Surrogate), <code>direction</code> (higher / lower), <code>mid</code>, <code>disutility</code> (calcula MID, umbral moderado y grande con GRADE-THRESHOLD), <code>baseline_risk</code>, <code>intervention_name</code>, <code>comparator_name</code>. Los ejemplos incluyen 5–7 desenlaces por base para ver completas la tabla SoF, las tablas suplementarias y el EtD.</p>
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
<li>Izcovich A, et al. A guide and pragmatic considerations for applying GRADE to network meta-analysis. BMJ 2023;381:e074495.</li>
<li>Alonso-Coello P, et al. GRADE Evidence to Decision (EtD) frameworks 1 y 2. BMJ 2016;353:i2016, i2089.</li>
<li>Morgano GP, et al. GRADE-THRESHOLD. J Clin Epidemiol 2025;179:111639.</li>
<li>Yepes-Nuñez JJ, et al. Summary of findings table for NMA. J Clin Epidemiol 2019;115:1-13.</li>
<li>Rücker G. Network meta-analysis, electrical networks and graph theory. Res Synth Methods 2012;3:312-24.</li>
<li>Viechtbauer W. Conducting meta-analyses in R with the metafor package. J Stat Softw 2010;36:1-48.</li>
</ul>`;
