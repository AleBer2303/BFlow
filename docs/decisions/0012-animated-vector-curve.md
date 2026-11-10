# 0012. Curva vectorial animada en Web y como respaldo en iOS y Android

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Modifica el [ADR 0011](0011-web-redesign-and-vector-curve.md) §2.4 (la curva de Web deja de ser estática) y el [ADR 0008](0008-monthly-curve-replaces-tubes.md) §2.4 (el respaldo sin WebGL deja de ser de barras). La escena three.js de los ADR 0007 y 0008 sigue siendo la principal en iOS y Android.
- **Autores:** Architect, UI Builder y QA Engineer

---

## 1. Contexto y problema

Después de crear las versiones Android y Web, la gráfica del Resumen solo se animaba en iOS:

- **Web:** el ADR 0011 cambió la escena three.js por un SVG estático, porque el sistema visual Web pedía que «una gráfica se queda quieta». El usuario pidió recuperar la animación y eligió animar el SVG en lugar de volver a three.js.
- **Android en Expo Go:** el código es el mismo que en iOS (piel `tonal`, escena three.js). Si la escena no puede dibujar, Android queda sin animación de alguna de estas dos formas:
  - Si falla con una excepción, aparecía el respaldo de barras estáticas.
  - Si falla en silencio, el lienzo se queda vacío. Puede ocurrir porque la superficie GL nunca llega o porque un shader no enlaza, que three.js solo registra en la consola.

No hay un dispositivo Android en el entorno de desarrollo, así que no se pudo confirmar cuál de esos fallos ocurre en el teléfono del usuario. La decisión cubre todos.

## 2. Decisiones

### 2.1. Un movimiento compartido

`scene/curveMotion.ts` define la línea de tiempo que usan la escena 3D y la curva vectorial:

| Movimiento | Valor |
| :--- | :--- |
| Trazado de entrada | 1,5 s con `easeInOutCubic`; el 76 % para la línea hasta hoy y el resto para la proyección |
| Transformación entre métricas o datos del mismo mes | 0,56 s |
| Latido del marcador | 3 ciclos de 1,9 s tras la entrada, un cambio de métrica o al soltar; después reposo |
| Paso de un cuadro | Primer cuadro de 1/60 s; máximo 1/20 s; un tiempo inválido no adelanta la animación |

La escena three.js solo cambió de dónde lee estas constantes; su comportamiento en iOS no cambia.

### 2.2. Animación de la curva vectorial

`scene/vectorCurveAnimator.ts` es una clase pura, sin React, que se prueba avanzando cuadro a cuadro:

- La línea y el área se recortan en la posición revelada y la proyección se alarga después.
- El marcador aparece con el resorte `snappy` al terminar la línea y se desliza hasta el día elegido.
- El color se mezcla con el resorte `gentle` al cambiar de métrica, y cambia al instante si cambia el tema.
- El latido es un anillo que crece y se desvanece; no hay brillo ni inclinación.
- Solo pide cuadros mientras algo se mueve y no avanza mientras el escenario no tenga tamaño. En reposo no programa ningún cuadro.
- Con *Reducir Movimiento* todo se asienta de inmediato, sin latido.

Esto sustituye la regla de Web «la gráfica es estática». Las demás reglas del sistema Web se mantienen: sin brillo de neón, sin inclinación y sin animación ligada al scroll.

### 2.3. Respaldo en iOS y Android

`MonthlyCurveSection` muestra la curva vectorial animada en lugar de la escena 3D cuando ocurre cualquiera de estos fallos:

| Señal | Detección |
| :--- | :--- |
| `GLView` falla al montarse | Límite de error (ya existía) |
| La escena no se puede crear | Excepción en `onContextCreate` (ya existía) |
| Un cuadro lanza una excepción | `onRenderError` (ya existía) |
| Un shader no enlaza | **Nuevo:** `renderer.debug.onShaderError` lanza un error con el registro del driver, de modo que falla el cuadro en lugar de dejar el lienzo vacío |
| La superficie GL no llega | **Nuevo:** si no hay contexto a los `GL_CONTEXT_TIMEOUT_MS` (6 s) del montaje |

En el teléfono, la curva vectorial usa el mismo gesto que la escena 3D, extraído a `useCurveScrubResponder` (ver §6). Igual que el lienzo, la curva queda oculta para VoiceOver y TalkBack, porque los botones de métrica ya anuncian cada cifra. En Web conserva el puntero, el teclado y el rol `adjustable`.

Se elimina `MonthlyCurveFallback`, el respaldo de barras.

## 3. Consecuencias

- Si la escena 3D no puede dibujar en un teléfono, este sigue mostrando una curva animada en lugar de un hueco o de barras quietas. En desarrollo, la consola indica el motivo: «MonthlyCurveStage: se usa la curva vectorial.».
- Un teléfono muy lento que tarde más de 6 s en crear el contexto GL pasa a la curva vectorial durante esa visita al Resumen.
- La piel Web descarga 3.437 bytes gzip más (de 590.130 a 593.567, un 0,6 %) y sigue sin descargar three.js (`PERF_BASELINE.md` §11).
- La animación vuelve a renderizar el SVG en cada cuadro mientras se mueve, unos 7 s tras la entrada contando el latido. En reposo no hay trabajo.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck`, `npm run lint`, `npm test -- --coverage --ci` | Sin errores; 40 suites y 440 tests |
| Animador paso a paso (`vectorCurveAnimator.test.ts`) | Entrada, proyección, aparición del marcador, 3 latidos y reposo; transformación y mezcla de color; marcador en el día elegido; *Reducir Movimiento*; cambio de tamaño y de tema |
| Escenario vectorial (`vectorCurve.test.tsx`) | Con temporizadores falsos: trazado progresivo, latido, cero cuadros en reposo, puntero, teclado y gesto táctil |
| Respaldo (`monthlyCurveSection.test.tsx`, `monthlyCurveStage.test.tsx`, `vectorCurve.test.tsx`) | Las cinco señales llevan a la curva vectorial; con contexto creado no hay cambio |
| Shader que no enlaza (`expoGlContract.test.ts`) | El cuadro falla con el registro del driver y la escena queda inactiva |
| Web en Chromium (390 px, modo vitrina) | Trazado en unos 1,4 s, aparición del marcador, 3 latidos y reposo; mezcla de color al cambiar de métrica; recorrido con el puntero; sin desborde horizontal |
| Piel Android en Chromium | Con WebGL usa la escena 3D; con WebGL desactivado usa la curva vectorial animada con latido |

**Sin verificar:** no se ejecutó en un teléfono Android ni en un iPhone. No se sabe cuál de los fallos del §1 ocurría en Expo Go Android, ni si con este cambio se verá la escena 3D o la curva vectorial; en ambos casos habrá animación. También puede ocurrir que el teléfono tenga activado *Quitar animaciones*. Android lo informa como *Reducir Movimiento* y entonces la curva aparece quieta, que es lo esperado.

## 5. Seguimiento en Expo Go Android

Tras este cambio, el usuario reportó lo siguiente en Expo Go Android, con las animaciones del sistema activas:

- Se dibuja la escena 3D con brillo, así que no se usa el respaldo.
- Al cambiar de métrica, la curva y la cifra grande saltan al valor final sin animarse.
- Al volver a la pestaña Resumen, la entrada sí se ve animada.

La cifra no usa GL, pero sí `requestAnimationFrame`. Que también salte apunta a cómo llegan los cuadros en Android y no al dibujo. Las causas posibles siguen abiertas:

- Las marcas de tiempo avanzan más rápido que el reloj real.
- Hay huecos largos entre cuadros.
- Los temporizadores se detienen mientras la actividad está en pausa.

Se descartó que cada cuadro haga llamadas GL que bloqueen el hilo de JavaScript: tras el calentamiento, un cuadro no usa ninguna de las 25 funciones bloqueantes de `expo-gl`.

Para decidirlo con datos, `components/curveFrameProbe.ts` escribe en la terminal de Metro una línea `[Curva] …` por cada animación. Solo funciona en desarrollo y fuera de Web. Compara las marcas de tiempo con `Date.now()` y cuenta cuadros, fps y el hueco máximo. Se retirará cuando se corrija la causa.

**Resultado:** el medidor descartó las tres causas. JavaScript envía los cuadros a tiempo y es la superficie de `expo-gl` la que no se refresca en pantalla. Desde el [ADR 0014](0014-android-vector-curve.md) la piel Android usa la curva vectorial como escenario y la escena three.js queda solo en iOS.

## 6. Tocar la gráfica bloquea el scroll

En iOS, arrastrar la gráfica en horizontal también desplazaba la página. Antes, la gráfica solo tomaba el gesto tras 8 pt claramente horizontales. Un arrastre algo diagonal llegaba antes al `UIScrollView` nativo, y la página se movía mientras el usuario leía la curva.

Desde este cambio, `useCurveScrubResponder` funciona así en la escena 3D y en la curva vectorial con gesto táctil:

- La gráfica toma el toque desde el primer contacto y muestra el día bajo el dedo.
- Arrastrar en cualquier dirección recorre el mes según la posición horizontal.
- Al soltar, o si el sistema retira el gesto, vuelve a hoy.
- Mientras el dedo está sobre la gráfica, la página no se desplaza. `KeyboardAwareScrollView` ofrece `useScrollLock`: un bloqueo apilable que aplica `scrollEnabled = false` primero de forma nativa, para ganarle al reconocimiento del arrastre, y luego en el estado de React.
- El bloqueo se libera al soltar, al perder el gesto o si la gráfica se desmonta a mitad del gesto.

**Consecuencia:** para desplazar la página hay que tocar fuera de la gráfica. Un toque sin arrastre muestra ese día mientras dura.

**Validación:** tests del gesto y del bloqueo (`monthlyCurveStage.test.tsx`, `vectorCurve.test.tsx`, `scrollLock.test.tsx`). En Chromium, con la piel iOS y el mouse, el contenedor deja de ser desplazable mientras se presiona sobre la gráfica, un arrastre diagonal recorre los días y al soltar todo vuelve a la normalidad.

**Sin verificar:** no se probó en un iPhone con el dedo.

