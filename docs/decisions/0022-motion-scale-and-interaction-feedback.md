# 0022. Escala de movimiento por piel y respuesta a la interacción (Fase 8)

- **Estado:** Aceptado
- **Fecha:** 2026-11-12
- **Tipo Diátaxis:** Explanation
- **Relacionado con:** ADR 0010 (pieles), ADR 0011 (piel Web), ADR 0020 (gráficos), ADR 0023 (E2E y release)

---

## 1. Contexto y problema

La Fase 8 pide pulir animaciones, transiciones, botones, háptica y accesibilidad en las tres pieles. Un inventario del código (noviembre de 2026) encontró:

- **Movimiento sin sistema.** No había tokens de duración ni de curva para nativo. Cada componente escribía sus números: 200, 250, 280, 320, 380 y 420 ms, y distancias de 10 y 14 pt.
- **Reducir movimiento ignorado.** Solo lo respetaban los gráficos, la curva del mes y el CSS de Web. El dock, la barra Material, `RevealDown`, los botones de fila del Checklist y el acordeón del onboarding se animaban igual.
- **Botones sin respuesta en iOS.** `AppPressable` no cambiaba nada al pulsar en la piel iOS. Solo dos controles de la curva usaban `TactilePressable`.
- **Cambios en seco.** El cambio de pestaña, los errores de formulario y los avisos de éxito aparecían sin transición.
- **Háptica duplicada o mal elegida.** Varias acciones vibraban dos veces (al tocar y al confirmar), las destructivas usaban `light` y ningún error usaba `error`.
- **Accesibilidad en Web.** `react-native-web` 0.21 descarta el objeto `accessibilityState` y las props de ocultamiento: el navegador no sabía qué pestaña estaba elegida ni qué fila estaba marcada. Ningún error se anunciaba en ninguna plataforma. Eliminar una deuda no funcionaba en Web, porque `Alert.alert` allí no hace nada.

## 2. Decisiones

### 2.1. Una escala de movimiento, con curvas por piel

`tokens.ts` define `motionDuration`, `motionDistance` y `motionScale` (la escala de transitions.dev) y `motionBySkin` (curvas de entrada y salida, si se permite sobrepaso y cómo llega un diálogo). Las duraciones y distancias son las mismas en las tres pieles; cambia la curva:

| Piel | Entrada | Salida | Sobrepaso | Diálogo |
| :--- | :--- | :--- | :--- | :--- |
| iOS | `0.22, 1, 0.36, 1` | la misma | sí (resortes) | hoja que sube |
| Android | Material 3 emphasized decelerate | emphasized accelerate | no | crece en su sitio |
| Web | la curva de `webMotion` | la misma | no | crece en su sitio |

Un valor se elige **por lo que hace el movimiento**, no por el número más cercano. `motion/motionSpec.ts` traduce cada uso a una especificación (`resolveEntranceSpec`, `resolvePresenceSpec`): cerrar es más rápido que abrir, el escalonado completo no pasa de 300 ms y con Reducir movimiento no hay recorrido ni escala, solo un cambio de opacidad de 140 ms.

### 2.2. `Animated` de React Native, no Reanimated

Todo el movimiento existente usa `Animated`. Las piezas nuevas también, con driver nativo para opacidad y transformaciones. `react-native-reanimated` está instalado pero no se importa: migrar gestos y animaciones a Reanimated es un cambio mayor que este ADR no hace (ver §4).

### 2.3. Reducir movimiento se lee una vez

`BFlowThemeProvider` sigue el ajuste del sistema y lo entrega como `useBFlowTheme().reducedMotion`. `animateNextLayout()` (que envuelve `LayoutAnimation`) lleva su propio seguimiento, porque se configura fuera de React.

### 2.4. Respuesta al toque en iOS y Android dentro de `AppPressable`

En la piel iOS, un control se hunde (escala 0,97) y se atenúa (opacidad 0,82) bajo el dedo y vuelve con el resorte `snappy`. No se mueven los telones (posición absoluta), los controles deshabilitados ni los que declaran `pressEffect="none"`. Con Reducir movimiento solo se atenúa. Web conserva sus pasos de hover y presión. `TactilePressable` deja de animar por su cuenta y solo añade la háptica al tocar.

**Android deja el ripple.** La primera versión de este ADR lo conservaba. En un teléfono, al mantener el dedo sobre cualquier control (botones, filas del Checklist, columnas de los gráficos, barra de navegación) el ripple nativo pintaba un recuadro gris del tamaño del control, con esquinas rectas aunque el control fuera redondeado. Por decisión del usuario se quita: `AppPressable` ya no pasa `android_ripple` y Android usa el mismo hundimiento que iOS, con una curva y sin sobrepaso (80 ms al bajar, 150 ms al volver). El token `pressFeedback` de la piel pasa de `ripple` a `sink`. Las columnas de los gráficos (`pressEffect="none"`) no cambian al tocarlas; su respuesta es la lectura del mes elegido.

### 2.5. Piezas nuevas

- **`Entrance`:** contenido que entra con fundido y una subida corta. `index.tsx` lo usa con `key` por pestaña.
- **`RevealDown` (formularios de añadir y editar):** se sustituyó la «cortina» anterior (alto, opacidad y deslizamiento con un solo valor en el hilo de JS, 380 ms al abrir y 280 ms al cerrar), que el usuario pidió cambiar. Ahora el espacio se despliega en 330 ms y, 80 ms después de empezar, la tarjeta aparece creciendo desde el 96 % y subiendo 8 pt con driver nativo (resorte `gentle` en iOS). Al cerrar, la tarjeta se atenúa en 150 ms y el espacio se pliega en 250 ms. El formulario de editar un movimiento, el de editar fondos y el aviso de deuda saldada, que aparecían en seco, usan la misma pieza.
- **`CheckIndicator`, `ProgressFill`, `useReplayOnChange`:** el check de las filas del Checklist, la barra de progreso de Deudas, el contador del Checklist y el icono del botón de tema.
- **`FormMessage`:** el aviso de un formulario. Se abre empujando el contenido, sacude su texto en un error, dispara la háptica `error` y se anuncia a los lectores de pantalla. Sustituye a los once textos y banners que cada pantalla pintaba a mano.
- **`animateNextLayout`:** el acordeón del onboarding, con token y sin movimiento cuando se pide reducirlo.
- **`confirmDestructive`** (`src/platform/dialogs/`): alerta del sistema en iOS y Android, `confirm` del navegador en Web.

### 2.6. Una vibración por acción

La háptica se dispara una vez, cuando la acción se confirma (`onPress`), nunca al tocar. Eliminar (movimiento, concepto, deuda, fondo, provisión, mes) y reiniciar la cuenta usan `warning`. Entrar al modo eliminar avisa; salir es un toque `light`. Un error de formulario usa `error`.

### 2.7. Estado accesible en el navegador

`AppPressable` convierte `accessibilityState` en `aria-selected`, `aria-checked`, `aria-expanded` y `aria-busy` cuando corre en Web. Lo que se oculta con `accessibilityElementsHidden` lleva además `aria-hidden`, y la curva del mes expone `aria-valuetext`.

## 3. Alternativas descartadas

- **Migrar a Reanimated ahora.** Movería el dock, la curva vectorial y los gráficos al hilo de UI, que es donde más se ganaría. Exige reescribir gestos y pruebas y medir en dispositivo. Queda como trabajo propio.
- **Escalonar la entrada de cada tarjeta.** Es el recurso genérico y cuesta un nodo animado por tarjeta en cada cambio de pestaña. Una sola entrada por pantalla dice lo mismo.
- **Duraciones distintas por piel.** Tres tablas que mantener. La diferencia que se percibe entre plataformas está en la curva y en el sobrepaso.
- **Atenuar sin escala en iOS.** Es más barato, pero en un botón pequeño no se distingue de un estado deshabilitado.

## 4. Consecuencias

- Un movimiento nuevo no escribe milisegundos: pide una especificación a `motionSpec`.
- En iOS, cada `AppPressable` crea un valor animado y pasa por un componente animado. No se midió su coste al montar listas largas.
- El fundido de entrada aplica opacidad a un contenedor con `BlurView` dentro. En iOS el desenfoque puede verse plano mientras dura; las tarjetas están sobre un fondo liso, así que no debería notarse.
- El alto del panel sigue animándose en el hilo de JS (no admite driver nativo); lo que se ve moverse, la tarjeta, va en el hilo de UI.
- Quedan fuera y siguen pendientes: etiquetas asociadas a cada campo de texto, `selected`/`checked` en los grupos de selección única, encabezados de sección, foco al abrir formularios en línea, y las mejoras de rendimiento que requieren medir en dispositivo (cifrado en JS, `BlurView` por tarjeta, contexto GL de Resumen).

## 5. Verificación

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck`, `npm run lint` | 0 errores |
| `npm test` | 63 suites en verde |
| `npm run web:demo`, piel iOS | Al pulsar «Registrar Gasto» el botón pasa a opacidad 0,82 y escala 0,97 y vuelve a 1. El contenido de la pestaña entra desde opacidad 0 y 8 pt |
| `npm run web:demo`, formulario vacío | Aparece `role="alert"` con `aria-live="assertive"` y el texto del error |
| `npm run web:demo`, piel Web | La pestaña activa lleva `aria-selected="true"`, la fila del Checklist `aria-checked` y la curva `aria-valuetext` |
| `npm run web:demo`, piel Android | Navega entre pestañas sin errores en consola |

| `npm run web:demo`, piel Android, formulario de nuevo movimiento | Se abre a su alto completo (748 px) con la tarjeta en opacidad 1, y al cerrar se desmonta. El formulario de editar también se monta y se desmonta. Ningún control lleva `android_ripple` |
| `npm run web:demo`, Checklist | Las filas muestran el aro o el disco con check; al marcar una fila el contador pasa a «7/12 completados» |

### No verificado

- **El recuadro gris de Android no se pudo reproducir aquí:** existe solo en un teléfono o emulador. Se quitó su causa (`android_ripple`), pero hay que confirmarlo en el dispositivo.
- **El movimiento de la segunda tanda no se vio:** el panel del navegador estaba oculto y no pintaba cuadros. Se comprobaron los estados inicial y final de cada animación, no su fluidez.

- **Nada se probó en un iPhone ni en un teléfono Android.** El resorte al pulsar, la háptica, el driver nativo, el fundido sobre `BlurView` y `LayoutAnimation` solo se comprobaron en el navegador o en tests.
- No se midieron cuadros por segundo ni el coste de montar las pantallas con las piezas nuevas.
- Los lectores de pantalla (VoiceOver, TalkBack, NVDA) no se usaron: se comprobó que los atributos llegan, no cómo se leen.
- La vista previa del navegador estaba en segundo plano y limita los cuadros, así que no se observó la fluidez de las transiciones.
