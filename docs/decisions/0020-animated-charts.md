# 0020. Gráficos animados en iOS, Android y Web (Fase 6)

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Fase 6 del plan de entrega de `PROMT BFLOW.md` («gráficos animados ios, android y web») y su sección GRÁFICOS. Sigue las reglas de los ADR [0011](0011-web-redesign-and-vector-curve.md), [0012](0012-animated-vector-curve.md) y [0014](0014-android-vector-curve.md): Web no descarga three.js y Android no monta `GLView`. No cambia la curva del mes de Resumen.
- **Autores:** Architect, UI Builder, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

La sección GRÁFICOS de `PROMT BFLOW.md` pide gráficos animados al entrar, con detalle al tocar:

- ingresos frente a gastos por mes;
- balance mensual;
- flujo de efectivo detallado (recibido, pagado y pendiente);
- distribución de gastos por concepto;
- mes actual frente al anterior;
- previsto frente a real;
- pagado frente a pendiente del mes;
- evolución de la deuda con su proyección de cierre;
- evolución de los ahorros apilados (Moto y Ahorros);
- provisión ideal de la moto frente al aporte real (descartado después a petición del usuario, ver §2.7).

Hasta ahora la app solo tenía la curva del mes en Resumen.

Hay que elegir:

1. **Con qué se dibuja.** Tiene que verse igual en las tres plataformas, respetar el «sin WebGL» de Web y Android y no sumar dependencias nativas.
2. **De dónde salen los datos.** Un gráfico no puede contradecir una tarjeta, y un mes cerrado no debe moverse.
3. **Dónde se muestran.** Hay que hacerlo sin añadir una séptima pestaña, que cambiaría la navegación de las tres pieles (AGENTS.md §7.7).

## 2. Decisiones

### 2.1. Dibujo: `react-native-svg`, sin librerías nuevas

Los gráficos se dibujan con `react-native-svg` 15.16.0, que ya es dependencia y ya dibuja la curva vectorial en Android y Web.

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Victory Native XL | Depende de `@shopify/react-native-skia`, un módulo nativo. Exige ADR de librería, alinear su AAR con `expo-modules-core` (ADR 0019) y descarga CanvasKit (WASM) en Web. |
| `react-native-gifted-charts` | Añade una dependencia y su propio estilo. Sus colores, radios y tipografía no salen de los tokens de cada piel. |
| three.js / `expo-gl` | Va en contra de los ADR 0011, 0012 y 0014. |

Se crean tres componentes en `src/design-system/components/charts/`: `BarChart` (agrupado o apilado, con línea de referencia), `LineChart` (con área y tramo proyectado) y `DonutChart`. Los valores negativos cuelgan bajo el cero; en una pila, los negativos se apilan hacia abajo, de modo que la pila sigue sumando su total. Los tres comparten:

- **`chartScale.ts`:** eje de valores con pasos redondos (1, 2 o 5 por una potencia de diez, sin fracciones de peso, hasta cinco pasos) que siempre incluye el cero. El paso de 2,5 se descarta porque la etiqueta compacta lo redondearía («$ 1.3M» para 1.250.000). También calcula bandas, trazos, arcos y cuántos meses caben.
- **`ChartParts.tsx`:** tarjeta, leyenda, lectura, etiquetas de los ejes, columnas táctiles, control segmentado, la selección (`useChartSelection`) y la ventana de meses visibles (`useChartWindow`).

Solo el dibujo animado (`BarPlot` y `LinePlot`, memoizados) se vuelve a pintar en cada cuadro. La lectura, las etiquetas y las columnas táctiles solo se pintan de nuevo cuando cambian los datos o la elección.

Las cifras van en texto de la app, no dentro del SVG. Así usan la tipografía de cada piel, que en Web nunca baja de 13 px, y los números tabulares.

### 2.2. Movimiento

`chartTransition.ts` es una clase pura que los tests avanzan cuadro a cuadro, igual que la curva vectorial (ADR 0012):

| Movimiento | Valor |
| :--- | :--- |
| Entrada | Cada valor crece desde cero en 0,7 s, con un desfase de 40 ms entre valores. El desfase total no pasa de 0,32 s. |
| Datos nuevos (otro mes, un movimiento completado) | 0,45 s desde donde estén los valores; un valor nuevo crece desde cero |
| Curva | `easeOutCubic`, sin rebote, en las tres pieles (cumple la regla de Web, DESIGN.md §10.4) |
| Cuadros | `requestAnimationFrame` solo mientras algo se mueve. En reposo no se programa ningún cuadro, y no se anima hasta que el gráfico tiene tamaño. |
| *Reducir Movimiento* | Se dibuja el estado final de inmediato |

La dona no lleva desfase: sus ángulos acumulados tienen que quedar ordenados, así que el anillo se dibuja en el sentido del reloj desde arriba.

`useReducedMotionPreference` pasa de `features/summary/hooks` a `design-system/platform`, para que la curva y los gráficos lo compartan. La ruta anterior se conserva como reexportación.

### 2.3. Interacción y accesibilidad

- **Lectura:** encima de cada gráfico, la lectura muestra las cifras de un mes. Por defecto es el último mes (el activo); en la deuda, el último mes medido. No es una región viva: con el puntero se anunciaría a cada movimiento, y el lector de pantalla ya lee las mismas cifras en la columna enfocada.
- **Elegir un mes:** un toque, un clic o Enter fija el mes, y volver a tocarlo lo suelta. El puntero y el foco del teclado lo muestran mientras siguen encima, sin fijarlo. Al salir (o con `blur`) vuelve el mes fijado o, si no hay ninguno, el último. Por eso un clic sobre el mes que ya muestra el puntero lo fija en lugar de soltarlo. Una elección que deja de existir (menos meses tras cambiar de mes activo) se ignora.
- **Columnas táctiles:** son `AppPressable` (AGENTS.md §7.3), una por mes, con la altura completa del gráfico. Cada una anuncia sus cifras («Octubre 2026: Recibido $ 4.000.000, …»).
- **Dibujo:** el SVG queda oculto para VoiceOver y TalkBack. Las columnas ya dicen lo mismo y, así, el dato no depende del color.
- **Dona:** cada fila de la leyenda es el objetivo táctil de su tramo y mide el mínimo de la piel (44 o 48).
- **Ventana de meses:** el historial trae como máximo 6 meses. Cada gráfico muestra solo los más recientes que caben con el objetivo táctil completo de la piel (44 pt o 48 dp) por columna. A 320 de ancho caben 4; en escritorio, los 6. El gráfico de la deuda conserva siempre el último mes medido junto al punto estimado. Cada columna ocupa además los 168 pt de alto del gráfico.
- **Punto estimado:** su etiqueta lleva el año («Feb ’27»), porque puede caer en otro año. La columna sigue a una sola distancia del mes activo, falte 1 mes o falten 40: la distancia real está en el subtítulo y en la lectura («en 4 meses»).

### 2.4. Datos: funciones puras sobre las calculadoras existentes

`src/domain/analytics/chartSeries.ts` no añade fórmulas: reordena las cifras que ya calculan las pestañas.

- **`buildMonthlyHistory`:** devuelve como máximo 6 meses, hasta el mes activo.
  - Un mes cerrado anterior al activo lee su `MonthSnapshot`: el saldo congelado es el que se arrastró.
  - El mes activo se calcula siempre en vivo, aunque esté cerrado. Un mes cerrado se puede volver a abrir desde el historial y editarse, y los gráficos deben coincidir con las tarjetas de la misma pantalla, que también se calculan en vivo.
  - Un mes abierto se calcula con `calculateMonthlyBudgetSummary`, `calculateDebtsSummary` y `calculateMonthlySavingsSummary`, igual que las pestañas.
- **`buildExpenseDistribution`:** agrupa los gastos por concepto. Un gasto pagado cuenta su monto real y uno pendiente, su monto previsto. Los 5 mayores tienen tramo propio y el resto va a «Otros», salvo si solo queda uno. Los tramos suman exactamente el total, que es pagado + pendiente (3.370.000 en octubre de 2026).
- **`buildPaidVsPendingSplit`:** separa lo pagado de lo pendiente (celdas B4 y B5 del Excel).
- **`buildMonthComparison`:** compara el último mes con el anterior. Devuelve `null` si solo hay un mes.
- **`buildDebtTrajectory`:** devuelve la deuda de cada mes y un punto proyectado en cero en el mes de cierre estimado. Usa la misma proyección que la tarjeta de Deudas (`projectDebtPayoff`): en octubre de 2026, 4 meses, hasta febrero de 2027.

Valores dorados de octubre de 2026 que cubren los tests:

| Cifra | Valor |
| :--- | :--- |
| Ingresos recibidos | 4.000.000 |
| Gastos pagados | 2.920.000 |
| Gastos pendientes | 450.000 |
| Flujo neto | 1.080.000 |
| Deuda | 6.200.000 |
| Moto | 2.300.000 |
| Ahorros | 2.080.000 |
| Total de ahorros | 4.380.000 |

`useChartHistory` (`features/budget/hooks`) se suscribe solo a los *slices* que lee, con la misma disciplina de selectores que la auditoría de rendimiento (R-15).

### 2.5. Dónde se muestran: en el contexto de cada dato

| Pestaña | Gráficos |
| :--- | :--- |
| Cierre (`analytics`), sección «Gráficos» bajo el cierre y el historial | Flujo de Dinero (recibido, pagado y pendiente por mes, que cubre también «ingresos vs gastos»); balance mensual; previsto vs real (con un control para elegir gastos o ingresos); pagado vs pendiente; distribución de gastos; comparación del último mes con el anterior, titulada con los dos meses («Noviembre 2026 vs Octubre 2026») |
| Deudas | Evolución de la deuda con la proyección punteada |
| Ahorros | Evolución de ahorros apilada |

- No hay pestaña nueva y la navegación de las pieles no cambia.
- Las vistas existentes, sus `testID` y la acción principal de cada pantalla no cambian: los gráficos se añaden en el contenedor de cada pestaña.
- En escritorio, `ResponsiveColumns` reparte las tarjetas en dos columnas.

### 2.6. Texto mínimo en los gráficos de evolución

Tras verlos, el usuario pidió aligerar «Flujo de Dinero», «Balance mensual» y «Evolución de ahorros». Ahora solo tienen el título, la lectura del mes elegido y el dibujo:

- **Sin subtítulo:** el título basta.
- **Sin leyenda:** la lectura ya pone nombre a cada color (`showLegend={false}`).
- **Sin notas:** se quitan «Mes abierto», «Mes cerrado» y «Total».
- **Una sola cifra en «Balance mensual»:** solo hay una serie, así que la lectura muestra el mes y el monto en `title2`, sin el nombre de la serie (`readout="value"`). VoiceOver y TalkBack siguen oyendo «Flujo neto» en cada columna.

### 2.7. Gráfico retirado: provisión ideal vs aporte real

El usuario pidió eliminar de Ahorros el gráfico de la provisión ideal frente al aporte real, porque no le gustó. Se quitó también el campo `reserveContribution` del historial, que solo lo alimentaba. Un mes cerrado anterior al activo ya no recalcula sus ahorros.

### 2.8. Token nuevo: `colors.chart.categorical`

Los tramos de la dona de distribución no tienen significado financiero, así que no pueden usar los colores semánticos. Se añaden seis tonos por paleta, en las seis paletas (tres pieles, claro y oscuro). Su contrato está en `skinTokens.test.ts`:

- contraste de al menos 3:1 sobre la página, el fondo secundario y las tarjetas (WCAG 1.4.11);
- seis tonos distintos, con al menos 25° de tono entre vecinos;
- sin violeta ni lavanda en Web.

Los demás gráficos usan los colores semánticos de siempre: ingreso, gasto, pendiente, completado, deuda, reserva y ahorro.

## 3. Consecuencias

- Las tres pieles dibujan lo mismo con su material. Las tarjetas son `GlassSurface`: vidrio en iOS, tonal en Android y plano en Web.
- No hay dependencias nuevas. Web sigue sin descargar three.js, porque los gráficos no importan nada de `features/summary/scene`. No se midió el peso del paquete Web antes y después.
- Cada gráfico vuelve a pintarse unos 0,7 s al entrar y 0,45 s al cambiar los datos. En reposo no hay trabajo. Al abrir Cierre se animan seis gráficos a la vez.
- El nombre del fondo de reserva aparece también en la lectura del gráfico de Ahorros. Un test de autenticación que lo buscaba por texto en toda la pantalla ahora lo busca dentro de su tarjeta.
- **Riesgo residual de *Reducir Movimiento*:** la preferencia se lee de forma asíncrona. Si un gráfico obtiene su tamaño antes de la respuesta, la entrada empieza y salta al estado final. No se guardó la preferencia a nivel de módulo, porque haría que los tests dependieran de su orden.
- **Revisión:** se pidió una revisión con el agente `code-reviewer` antes de cerrar. Sus hallazgos de gravedad media están corregidos y probados: mes activo cerrado y editado, negativos apilados, elección fuera de rango, clic tras el puntero y objetivo táctil. También los de gravedad baja salvo dos: la caché de *Reducir Movimiento* (ver arriba) y la distancia del punto estimado, que se decidió conservar.
- **Sin verificar en un dispositivo:** se validó con tests en Jest y en el navegador (`npm run web:demo` con las pieles `ios` oscuro a 375, `android` claro a 320 y `web` claro en escritorio). Faltan la fluidez en un iPhone o Android real, la háptica de selección y el comportamiento de VoiceOver y TalkBack.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| Dominio (`domain/analytics/__tests__/chartSeries.test.ts`) | Valores dorados de octubre; mes cerrado desde el snapshot y noviembre con el arrastre; mes activo cerrado y editado, calculado en vivo; ventana de meses, incluido el cambio de año; distribución exacta y «Otros»; comparación; proyección de la deuda; montos no enteros rechazados |
| Movimiento y geometría (`design-system/__tests__/chartMath.test.ts`) | Entrada escalonada, transición desde valores intermedios, sin rebote, cuadros acotados, *Reducir Movimiento*, escalas, arcos y trazos |
| Componentes (`design-system/__tests__/charts.test.tsx`) | En las tres pieles y con temporizadores falsos: entrada, lectura, toque, puntero y foco, clic tras el puntero, `blur`, elección que deja de existir, ventana de meses por ancho, etiquetas accesibles, apilado con negativos, proyección y cero cuadros en reposo |
| Pantallas (`analyticsChartsPanel`, `debtTrendChart`, `savingsTrendCharts`) | Cifras doradas en las tres pieles, control de gastos o ingresos, comparación y estados vacíos |
| App completa (`chartsFlow.test.tsx`) | Las tres pestañas en las tres pieles; completar un pendiente actualiza los gráficos; cerrar el mes añade noviembre y la comparación |
| Contrato de tokens (`skinTokens.test.ts`) | `chart.categorical`: 3:1, tonos distintos y sin violeta en Web |
| Navegador (`web:demo`) | Sin desbordamiento horizontal a 320; *hover* en Web; sin errores de consola |
| `npm run typecheck`, `npm run lint`, `npm test -- --coverage --ci` | Sin errores. 56 suites y 638 tests. Cobertura de `src/domain`: 98,87 % de sentencias y 98,93 % de líneas (`domain/analytics`: 100 %) |
