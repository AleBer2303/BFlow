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
- provisión ideal de la moto frente al aporte real.

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

Se crean tres componentes en `src/design-system/components/charts/`: `BarChart` (agrupado o apilado, con valores negativos y línea de referencia), `LineChart` (con área y tramo proyectado) y `DonutChart`. Comparten:

- **`chartScale.ts`:** eje de valores con pasos redondos (1, 2, 2,5 o 5 por una potencia de diez, sin fracciones de peso, hasta cinco pasos) que siempre incluye el cero. También calcula bandas, trazos y arcos.
- **`ChartParts.tsx`:** tarjeta, leyenda, lectura, etiquetas de los ejes, columnas táctiles y control segmentado.

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

- **Lectura:** encima de cada gráfico, la lectura muestra las cifras de un mes. Por defecto es el último mes (el activo); en la deuda, el último mes medido. Tocar una columna la elige y volver a tocarla la suelta. En Web, el puntero y el foco del teclado también eligen. La lectura se anuncia como región `polite`.
- **Columnas táctiles:** son `AppPressable` (AGENTS.md §7.3), una por mes, con la altura completa del gráfico. Cada una anuncia sus cifras («Octubre 2026: Recibido $ 4.000.000, …»).
- **Dibujo:** el SVG queda oculto para VoiceOver y TalkBack. Las columnas ya dicen lo mismo y, así, el dato no depende del color.
- **Dona:** cada fila de la leyenda es el objetivo táctil de su tramo y mide el mínimo de la piel (44 o 48).
- **Ventana de meses:** los gráficos de historial muestran como máximo 6 meses. A 320 de ancho, cada columna mide unos 34 pt de ancho y los 168 pt de alto del gráfico.

### 2.4. Datos: funciones puras sobre las calculadoras existentes

`src/domain/analytics/chartSeries.ts` no añade fórmulas: reordena las cifras que ya calculan las pestañas.

- **`buildMonthlyHistory`:** devuelve como máximo 6 meses, hasta el mes activo.
  - Un mes cerrado lee su `MonthSnapshot`: el saldo congelado es el que se arrastró.
  - Un mes abierto se calcula con `calculateMonthlyBudgetSummary`, `calculateDebtsSummary` y `calculateMonthlySavingsSummary`, igual que las pestañas.
  - El aporte a la reserva sale de los movimientos del mes, porque el snapshot no lo guarda.
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
| Aporte a Moto | 700.000 |
| Brecha frente al ideal (872.667) | −172.667 |

`useChartHistory` (`features/budget/hooks`) se suscribe solo a los *slices* que lee, con la misma disciplina de selectores que la auditoría de rendimiento (R-15).

### 2.5. Dónde se muestran: en el contexto de cada dato

| Pestaña | Gráficos |
| :--- | :--- |
| Cierre (`analytics`), sección «Gráficos» bajo el cierre y el historial | Flujo de efectivo (recibido, pagado y pendiente por mes, que cubre también «ingresos vs gastos»); balance mensual; previsto vs real (con un control para elegir gastos o ingresos); pagado vs pendiente; distribución de gastos; este mes vs el anterior |
| Deudas | Evolución de la deuda con la proyección punteada |
| Ahorros | Evolución de ahorros apilada; provisión ideal vs aporte real, con el ideal como línea punteada |

- No hay pestaña nueva y la navegación de las pieles no cambia.
- Las vistas existentes, sus `testID` y la acción principal de cada pantalla no cambian: los gráficos se añaden en el contenedor de cada pestaña.
- En escritorio, `ResponsiveColumns` reparte las tarjetas en dos columnas.

### 2.6. Token nuevo: `colors.chart.categorical`

Los tramos de la dona de distribución no tienen significado financiero, así que no pueden usar los colores semánticos. Se añaden seis tonos por paleta, en las seis paletas (tres pieles, claro y oscuro). Su contrato está en `skinTokens.test.ts`:

- contraste de al menos 3:1 sobre la página, el fondo secundario y las tarjetas (WCAG 1.4.11);
- seis tonos distintos, con al menos 25° de tono entre vecinos;
- sin violeta ni lavanda en Web.

Los demás gráficos usan los colores semánticos de siempre: ingreso, gasto, pendiente, completado, deuda, reserva y ahorro.

## 3. Consecuencias

- Las tres pieles dibujan lo mismo con su material. Las tarjetas son `GlassSurface`: vidrio en iOS, tonal en Android y plano en Web.
- No hay dependencias nuevas. Web sigue sin descargar three.js, porque los gráficos no importan nada de `features/summary/scene`. No se midió el peso del paquete Web antes y después.
- Cada gráfico vuelve a pintarse unos 0,7 s al entrar y 0,45 s al cambiar los datos. En reposo no hay trabajo. Al abrir Cierre se animan seis gráficos a la vez.
- El nombre del fondo de reserva aparece también en la leyenda de Ahorros. Un test de autenticación que lo buscaba por texto en toda la pantalla ahora lo busca dentro de su tarjeta.
- **Sin verificar en un dispositivo:** se validó con tests en Jest y en el navegador (`npm run web:demo` con las pieles `ios` oscuro a 375, `android` claro a 320 y `web` claro en escritorio). Faltan la fluidez en un iPhone o Android real, la háptica de selección y el comportamiento de VoiceOver y TalkBack.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| Dominio (`domain/analytics/__tests__/chartSeries.test.ts`) | Valores dorados de octubre; mes cerrado desde el snapshot y noviembre con el arrastre; ventana de meses, incluido el cambio de año; distribución exacta y «Otros»; comparación; proyección de la deuda; montos no enteros rechazados |
| Movimiento y geometría (`design-system/__tests__/chartMath.test.ts`) | Entrada escalonada, transición desde valores intermedios, sin rebote, cuadros acotados, *Reducir Movimiento*, escalas, arcos y trazos |
| Componentes (`design-system/__tests__/charts.test.tsx`) | En las tres pieles y con temporizadores falsos: entrada, lectura, toque, puntero y foco, etiquetas accesibles, apilado y negativos, proyección y cero cuadros en reposo |
| Pantallas (`analyticsChartsPanel`, `debtTrendChart`, `savingsTrendCharts`) | Cifras doradas en las tres pieles, control de gastos o ingresos, comparación y estados vacíos |
| App completa (`chartsFlow.test.tsx`) | Las tres pestañas en las tres pieles; completar un pendiente actualiza los gráficos; cerrar el mes añade noviembre y la comparación |
| Contrato de tokens (`skinTokens.test.ts`) | `chart.categorical`: 3:1, tonos distintos y sin violeta en Web |
| Navegador (`web:demo`) | Sin desbordamiento horizontal a 320; *hover* en Web; sin errores de consola |
| `npm run typecheck`, `npm run lint`, `npm test -- --coverage --ci` | Sin errores. 56 suites y 623 tests. Cobertura de `src/domain`: 98,87 % de sentencias y 98,93 % de líneas (`domain/analytics`: 100 %) |
