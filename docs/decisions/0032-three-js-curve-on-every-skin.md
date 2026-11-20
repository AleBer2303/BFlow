# 0032. La escena three.js de la curva del mes vuelve a Android y llega a Web

- **Estado:** Aceptado (a prueba en Android)
- **Fecha:** Noviembre 2026
- **Contexto:** Modifica los ADR [0011](0011-web-redesign-and-vector-curve.md), [0012](0012-animated-vector-curve.md) y [0014](0014-android-vector-curve.md) y el recorte de bundle del [ADR 0028](0028-archived-history-window-and-widget-sync-coalescing.md).
- **Autores:** Architect, UI Builder y QA Engineer

---

## 1. Contexto

El usuario pidió que la curva del mes se vea en 3D, con el brillo y la inclinación de iOS, también en Android y en Web. Hasta ahora esas dos pieles dibujaban la curva vectorial plana:

- **Android (ADR 0014):** en Expo Go la superficie de `expo-gl` no refrescaba los cuadros y la curva se veía quieta. La causa dentro de `expo-gl` quedó sin determinar y nunca se probó el `.apk`.
- **Web (ADR 0011 y 0012):** se evitó descargar three.js.

Además, la curva de iOS se veía plana desde e16a7c8 porque iba dentro de `ScrollRevealSection`, que le aplicaba opacidad y escala con el scroll. Se sacó de ese envoltorio (`curveStageWrapper.test.tsx`).

## 2. Decisión

1. `platformSkins.android.curveStage` y `platformSkins.web.curveStage` pasan a `scene-3d`. La escena es la misma de iOS; solo el fondo del lienzo toma el de la piel para fundirse con la página.
2. `MonthlyCurveStageLoader.android.tsx` importa la escena como en iOS. Web la sigue cargando como fragmento aparte (`React.lazy`), así que el inicio de sesión y el primer pintado no la pagan.
3. La curva vectorial queda como **respaldo** en las tres pieles: si la superficie GL no llega en `GL_CONTEXT_TIMEOUT_MS`, el shader no enlaza o un cuadro falla, `MonthlyCurveSection` la muestra.

## 3. Coste medido

`npx expo export -p web` (modo vitrina):

| Fragmento | Tamaño | gzip |
| :--- | ---: | ---: |
| `MonthlyCurveStage` (three.js y la escena) | 870 KB | 198 KB |
| Resto de la app (`entry`, `__common`, `index`, `_layout`) | 4,1 MB | 930 KB |

En Web, abrir el Resumen descarga unos 198 KB comprimidos más, después del primer pintado. En Android, three.js vuelve al bundle de Hermes (el ADR 0028 lo había sacado); Hermes mapea su bytecode a demanda.

## 4. Riesgo y salida

- **Android puede volver a verse quieta.** El fallo del ADR 0014 no lanza error: la escena dibuja y la superficie no se refresca, así que el respaldo automático no lo detecta. Si en el teléfono la curva no se anima, basta volver `platformSkins.android.curveStage` a `vector`.
- **Web lento:** si la carga se nota, lo mismo con `platformSkins.web.curveStage`.
- La regla keep de `expo.modules.gl.**` (ADR 0013) vuelve a ser necesaria en el `.apk`; sigue en `plugins/withAndroidKeepRules.js`.
- `curveFrameProbe` vuelve a medir en Android en desarrollo: la línea `[Curva] …` en Metro permite comparar con el ADR 0014.

## 6. Lienzo transparente y optimización (seguimiento)

A pedido del usuario, la curva deja de tener fondo propio para que la galaxia de `AmbientParticles` se vea detrás, en las tres pieles:

- `setClearColor(backdrop, 0)` y, en Web, `webglContextAttributes` con `alpha: true` y `premultipliedAlpha: true`. `expo-gl` ya crea la superficie no opaca en iOS (`eaglLayer.isOpaque = false`) y Android (`TextureView` con `isOpaque = false`).
- La línea, el brillo, la proyección y la rejilla de puntos escriben color premultiplicado (`color * alpha, alpha`) en lugar de mezclar con el color de la página. Las cintas usan `MaxEquation` en los dos temas (antes `MinEquation` en claro), así un pliegue nunca se aclara; la rejilla usa "over" premultiplicado. El color de fondo solo queda en el anillo que separa el marcador.

Optimización sin cambiar el aspecto:

| Cambio | Efecto |
| :--- | :--- |
| La escena importa los módulos ES de three.js uno a uno (`three/src/...`) en lugar de la entrada `three` (Metro no hace tree-shaking) | Fragmento web de la curva: 870 KB → 678 KB (198 → 161 KB gzip); también menos bytecode en Hermes. Guardia en `scripts/worklet-closure-guard.test.mjs` |
| Partículas en Web con keyframes CSS | Cero trabajo de JavaScript por cuadro (antes, ~35 animaciones con el driver JS) |
| Partículas memoizadas con nodos animados estables | Un render del shell ya no recrea interpolaciones ni reinicia ciclos |
| La galaxia se monta 600 ms tras el primer pintado | No compite con el arranque |

Verificado en Chromium con `npx expo export -p web` (modo vitrina, temas claro y oscuro): lienzo con `alpha: true`, estrellas visibles a través de la curva, 36 animaciones CSS en marcha y keyframes aplicados. **Sin verificar** en iPhone ni Android.

## 5. Validación

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck`, `npm run lint`, `npm test` | Sin errores |
| Token por piel (`skinTokens.test.ts`) | `scene-3d` en las tres pieles |
| Escenario por piel (`vectorCurve.test.tsx`, `workspacePlatforms.test.tsx`) | Las tres pieles montan el `GLView`; sin contexto GL, Android y Web caen a la curva vectorial con su gesto |

**Sin verificar:** la escena en un teléfono Android (Expo Go y `.apk`) y en un navegador real.
