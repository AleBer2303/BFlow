# 0007. Escena 3D "Panorama del mes" en Resumen con three.js sobre expo-gl

- **Estado:** Aceptado. La forma de la visualización (§2.2 y §2.5) fue sustituida por el [ADR 0008](0008-monthly-curve-replaces-tubes.md).
- **Fecha:** Noviembre 2026
- **Contexto:** Sustitución del checklist mensual de la pestaña Resumen
- **Autores:** Architect, UI Builder y QA Engineer

---

## 1. Contexto y problema

La pestaña Resumen terminaba con una lista larga, `Checklist Mensual`, que duplicaba la pestaña Checklist. Se decidió quitarla de Resumen, conservando el contador `Checklist N de M` en la tarjeta de Flujo Neto, y usar ese espacio para una visualización interactiva con la información esencial del usuario. Esa visualización también reemplaza a las tarjetas `Control Deudas` y `Control Ahorros`.

Restricciones que condicionan la solución:

1. Debe funcionar en Modo A (Expo Go y Web) y en Modo B (`.ipa`), sin módulos exclusivos de Modo B.
2. No puede agotar batería ni degradar el scroll: la vista principal se abre muchas veces al día.
3. Una gráfica 3D puede engañar; tiene que respetar las proporciones y seguir siendo legible sin color.
4. El lienzo WebGL es opaco para VoiceOver, así que la información necesita un equivalente nativo.

## 2. Decisiones

### 2.1. Dependencias: `three` directo sobre `expo-gl`

Se agregan `three` (versión exacta, sus minors rompen API), `expo-gl` (la versión de Expo SDK 58) y `@types/three` (desarrollo).

| Opción | Evidencia | Resultado |
| :--- | :--- | :--- |
| `three` + `expo-gl` | Una sola escena imperativa; la documentación oficial de `expo-gl` indica «Included in Expo Go». | **Elegida** |
| `expo-three` | `expo-three@8.0.0` declara `three ^0.166.0`. Solo aportaría un adaptador de `canvas` de pocas líneas. | Descartada |
| `@react-three/fiber` | `@9.8.2` es compatible (`react <19.4`), pero exige además `expo-asset` y `expo-file-system` y añade un segundo reconciler para una única escena. | Descartada |
| Spline | Requiere descargar la escena por red y no acepta datos del usuario en vivo. | Descartada |

### 2.2. Forma de la visualización: tubos de vidrio con líquido

Cuatro tubos en dos grupos: **Este mes** (Ingresos, Gastos) y **Patrimonio** (Ahorros, Deudas).

- La altura del líquido es proporcional al monto, con una escala compartida en **Este mes**. La cámara es de campo estrecho (20°) y está elevada con lente desplazada (`setViewOffset`) en lugar de inclinada: las verticales se mantienen paralelas y las alturas siguen siendo comparables en cualquier punto de la pantalla.
- Los grupos usan escalas independientes porque comparan magnitudes distintas (flujo mensual frente a saldos). Se separan físicamente en dos bases, como múltiplos pequeños, para no sugerir un eje compartido.
- **Patrimonio** se mide contra la deuda de apertura del mes (`openingTotalDebt`). El saldo de ahorros incluye el flujo neto, de modo que una escala que dependiera de los ahorros movería el tubo de Deudas con cada ingreso aunque la deuda no cambie. Ahorros se recorta al máximo si supera esa deuda de apertura.
- En Ingresos y Gastos, un aro marca el monto previsto.
- Se descartó una dona 3D porque la perspectiva distorsiona los ángulos.

### 2.3. Capas

| Capa | Archivo | Responsabilidad |
| :--- | :--- | :--- |
| Dominio | `src/domain/overview/monthlyOverview.ts` | Función pura: montos enteros a niveles de llenado por grupo. |
| Feature, escena | `src/features/summary/scene/` | three.js imperativo, sin React Native. |
| Feature, vista | `src/features/summary/components/` | `GLView`, gestos, lectura, etiquetas y respaldo 2D. |

### 2.4. Optimización

- **Renderizado bajo demanda:** el bucle de `requestAnimationFrame` solo corre mientras hay resortes en movimiento. En reposo no hay llamadas a GL.
- **Pausa fuera de primer plano:** con `AppState` distinto de `active` no se dibuja, lo que además evita llamadas GL prohibidas en iOS con la app en segundo plano.
- **Geometría y materiales compartidos**, sin luces, sombras dinámicas, texturas, transmisión ni posprocesado. Los shaders son mínimos y sin iluminación.
- **Sin `discard`:** el nivel del líquido se aplica en el vertex shader, lo que conserva el early-Z en GPUs móviles.
- **Carga diferida en Web:** `three` va en un chunk aparte que solo se pide al abrir Resumen.
- **Liberación explícita** de geometrías, materiales y renderer al salir de la pestaña.

### 2.5. Accesibilidad y respaldo

- Las etiquetas alineadas bajo cada tubo son botones nativos de `44 pt`, con el monto en `accessibilityLabel`. Son el equivalente de VoiceOver y la forma de seleccionar sin apuntar al lienzo.
- `AccessibilityInfo` activa el modo sin movimiento: sin entrada animada ni oleaje. Se usa en lugar de `useReducedMotion()` de Reanimated porque Reanimated no se usa en `src/`.
- Si WebGL no está disponible, se muestra un respaldo 2D con `View` y las mismas proporciones.
- El gesto horizontal gira la escena y el vertical sigue desplazando la página (`PanResponder`, igual que el dock).

### 2.6. Color

La escena usa solo los tokens existentes de `tokens.ts`. Con el validador de paleta, el par adyacente Ingresos/Gastos queda por debajo del umbral de daltonismo (deuteranopia: ΔE 4,6 en oscuro y 5,5 en claro). No se cambian los tokens semánticos, que se usan en toda la app. La identidad nunca depende del color: cada tubo tiene posición fija y etiqueta directa.

El lienzo es opaco y se limpia con `background.primary`, igual que la página. Así se integra sin depender del soporte de canal alfa de `GLView` en cada plataforma.

### 2.7. Compatibilidad con Expo Go

`expo-gl` anterior a 58.0.4 hace que un contexto WebGL 2 sea `instanceof WebGLRenderingContext`, y three.js (r163 o posterior) lo rechaza como WebGL 1. Expo SDK 58 declara `expo-gl ~58.0.3` para su binario nativo, de modo que Expo Go puede ejecutar ese nativo aunque el proyecto instale el JavaScript de 58.0.4. Como solución, `createOverviewRenderer` oculta el global `WebGLRenderingContext` únicamente mientras construye el renderer, y solo en contextos nativos que declaran `supportsWebGL2`. Un contexto WebGL 1 real se sigue rechazando y usa el respaldo 2D. La solución podrá retirarse cuando el binario de Expo Go incluya `expo-gl` 58.0.4 o posterior.

## 3. Consecuencias

- La pestaña Checklist sigue siendo el único lugar para marcar movimientos; Resumen pasa a ser de solo lectura.
- `three` aumenta el peso del paquete nativo. En Web no afecta la carga inicial por el chunk diferido.
- No hay lecturas ni escrituras adicionales en Firestore: la escena consume los resúmenes ya calculados.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck` | 0 errores |
| `npm run lint` | 0 errores (103 archivos) |
| `npm test` | Suites de dominio, escena y Resumen aprobadas |
| Cobertura de `monthlyOverview.ts` | 100 % en sentencias, ramas, funciones y líneas |
| Bundle iOS con Hermes y Web | Compilan; Metro resuelve `three.module.js`, no el stub `three.cjs` |
| Contrato con `expo-gl` | Inicializar, dibujar, actualizar y liberar usa solo métodos y parámetros implementados en sus fuentes nativas (`expoGlContract.test.ts`) |
| Web en Chromium | Dibujo, toque, arrastre, temas, `320 pt`, reducción de movimiento y respaldo sin WebGL verificados |

El detalle de las mediciones está en la sección 9 de `PERF_BASELINE.md`.

**Sin verificar:** la escena no se ejecutó en un iPhone, en Expo Go ni en el `.ipa`, porque el desarrollo se hizo en Windows. El test de contrato reduce ese riesgo pero no compila GLSL ni prueba gestos táctiles reales; debe comprobarse en dispositivo.
