# 0030. El dock de iOS es Liquid Glass y se anima en el hilo de UI

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Modifica el ADR [0022](0022-motion-scale-and-interaction-feedback.md) §2.2 («`Animated` de React Native, no Reanimated») solo para el dock de iOS, y el ADR [0024](0024-android-floating-dock-flat-indicator.md) §2.2 («un solo componente para iOS y Android»). Exigido por `AGENTS.md` §5.2 (dependencia que pasa a usarse) y §7.7 (cambio del patrón de interacción de una piel).
- **Autores:** Architect, UI Builder, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

En iOS el dock y su lente se sentían mal animados:

1. **El arrastre corría en el hilo de JS.** El lente seguía al dedo con un `requestAnimationFrame` que hacía `setValue` en cada cuadro. Al tocar una pestaña, la app renderiza la pantalla nueva en ese mismo hilo, y el lente perdía cuadros justo entonces.
2. **No era vidrio.** En tema claro el dock era un relleno al 97 % de opacidad. `expo-glass-effect` estaba instalado pero nadie lo importaba.
3. **No había rebote al presionar,** y el lente crecía ×1,12 dentro de una cápsula que lo recortaba.

Se pidió un dock Liquid Glass como el de las apps de iOS 26/27, con rebote al presionar, un deslizamiento muy suave y el efecto del vidrio sobre los iconos al pasar la lupa. Se eligió con el usuario: Reanimated, vidrio nativo con respaldo, una lupa que sobresale como en iOS 26 y un rebote sutil. El aspecto final se ajustó probando en un iPhone 16 Pro con iOS 27.2 y Expo Go 58.0.5.

## 2. Decisión

1. **Dos componentes detrás de `FloatingLiquidGlassDock`.** El punto de entrada elige por `skinSpec.surfaceMaterial`: `LiquidGlassDock` (iOS) o `FlatPillDock` (Android, sin cambios respecto al ADR 0024). Comparten `dock/dockGeometry.ts` (constantes y la geometría de referencia para JS y tests) y `dock/DockTabContent.tsx` (iconos y etiquetas). Las features no cambian.
2. **Reanimated 4 y Gesture Handler 3 en el dock de iOS.** El gesto (`usePanGesture`), el seguimiento del dedo, el estiramiento, el rebote, el lente y el aumento de los iconos corren en el hilo de UI. Solo vuelven a JS, con `scheduleOnRN`, la háptica y el color de la pestaña al cruzarla, la selección al soltar y el encendido del vidrio del lente.
3. **El toque sigue seleccionando en `onPressIn`** del `Pressable` de cada pestaña: sin espera, y es lo que usan VoiceOver y los tests. El gesto solo se activa a partir de 6 px en horizontal. Su `onBegin` hunde la cápsula, infla el lente y lo manda a la pestaña tocada sin esperar a JS. Si el toque no seleccionó nada, el lente vuelve.
4. **Material** (`src/platform/glass/LiquidGlassMaterial.native.tsx`, decidido una vez por arranque):

   | Dispositivo | Material |
   | :--- | :--- |
   | iOS 26+ con la API de vidrio | `GlassView` de `expo-glass-effect`: cápsula `regular`; lente `regular` en oscuro y `clear` en claro (`liquidDockPalette`) |
   | iOS anterior | `BlurView` más un relleno translúcido |
   | Reducir transparencia | Relleno opaco |
   | Web (`?skin=ios`) | Relleno translúcido sin desenfoque |

   - **Con vidrio del sistema no se dibuja nada propio encima.** La cápsula no recorta el vidrio ni le pone línea, y el lente no lleva borde ni brillo. El sistema redondea su vidrio y pone sus propios reflejos. Nuestras líneas de 1 px se veían duras y, escaladas con el lente, borrosas. El respaldo con `BlurView` sí conserva contorno y brillo.
   - **Ninguna capa de vidrio anima su opacidad,** porque un `UIVisualEffectView` con alfa menor que 1 se ve roto. El vidrio se enciende y se apaga cambiando su estilo (`none` ⇄ `clear`) con la transición nativa (`variantTransitionSeconds`).
5. **Movimiento** (`springConfigs.liquid*`, `springConfigs.dock*` y `liquidDockMotion` en `tokens.ts`):

   | Momento | Qué pasa | Resorte (ζ) |
   | :--- | :--- | :--- |
   | Tocar | La cápsula baja a ×0,975 y el lente se infla ×1,18 × 1,36, más alto que el dock | `dockPressIn` (0,69), `liquidLift` (0,56) |
   | Arrastrar | El lente sigue al dedo con un resorte recalculado en cada evento (conserva la velocidad) y se estira hasta +16 % con ella | `liquidFollow` (0,79), `liquidStretch` (0,74) |
   | Soltar | El lente se asienta con el impulso del dedo, se encoge con un rebote y la cápsula rebota un poco más allá de su tamaño | `liquidSettle` (0,67), `liquidRelease` (0,50), `dockRelease` (0,41) |
   | Extremos | El recorrido se limita y el sobrepaso se convierte en compresión (hasta ×0,84) con un ligero abultamiento | — |

   Con *Reducir movimiento* no hay inflado, hundimiento ni estiramiento y el lente salta a su sitio. Bajo Jest todo es estático y el gesto corre en JS (`runOnJS`).
6. **El lente está debajo de los iconos; su superficie de vidrio, encima y solo mientras se toca.** En reposo el icono se ve tal cual: con vidrio transparente encima se veía distorsionado. Al tocar, una capa con el marco y el movimiento exactos del lente (`dock-lens-surface`) pasa de `none` a `clear` en 0,18 s y refracta los iconos por los que pasa, como la barra de iOS 26/27. Al soltar se apaga igual. Su tinte (`lensSurfaceTint`) evita que el lente se aclare. Solo existe con vidrio del sistema.
7. **Iconos.** El icono y la etiqueta pasan al color de acento de golpe en la pestaña bajo el lente, sin fundido: un SVG que se funde o se escala se rasteriza y se ve pixelado. Bajo el lente inflado, el icono crece hasta un 16 % según su distancia al lente. No se usa `scale`: el `Svg` ocupa su tamaño mayor y Reanimated anima su `viewBox` (`useAnimatedProps` sobre `Animated.createAnimatedComponent(Svg)`). Cada cambio vuelve a dibujar el vector a resolución completa. El `viewBox` de reposo también va como prop normal, para el primer dibujo y cada render de React. En web no se anima (el `Svg` es DOM y esas props no existen allí).
8. **Paquetes alineados con Expo SDK 58.0.26** (`npx expo install`): `expo`, `expo-router`, `expo-blur`, `expo-haptics`, `expo-linking`, `expo-secure-store`, `expo-sqlite`, `expo-status-bar`, `react-native-safe-area-context` y `jest-expo` (en `devDependencies`). `expo install` añadió el plugin `expo-status-bar` a `app.json`. No se tocaron `jest` 30, `@types/jest` 30 ni `typescript` 6 (saltos mayores de herramientas de desarrollo).
9. **Jest.** `jest.config.js` usa el resolver de Reanimated (elige su compilación de Jest y la de Worklets). `jest.setup.js` carga el `jestSetup` de Gesture Handler, da a Worklets un runtime de UI vacío y simula `expo-glass-effect`. Los tests del dock usan temporizadores falsos para aplicar los valores compartidos, `getAnimatedStyle` para leerlos y `createGestureController` para el arrastre.

### 2.1. Alternativas descartadas

| Alternativa | Motivo |
| :--- | :--- |
| Seguir con `Animated` y afinar resortes | El seguimiento del dedo seguiría en JS y se trabaría al renderizar la pestaña nueva |
| Migrar también la píldora de Android | No se pidió y no hay dispositivo Android para validarla; su comportamiento no cambia |
| Seleccionar desde el gesto en lugar de `Pressable` | VoiceOver y los tests dependen de `onPress`; un `Pan` con distancia mínima 0 cancelaría el `Pressable` |
| Aumentar los iconos con `scale` (aunque sea reduciendo desde un dibujo mayor) | Se veían pixelados en el dispositivo: el `scale` remuestrea el icono rasterizado |
| Copia del icono en color de acento que se funde con la distancia al lente | Pixelado en el dispositivo durante el fundido |
| Una segunda lupa de vidrio sobre los iconos que se forma al arrastrar | Aclaraba la lupa, se notaba como una transformación al pasar de presionar a deslizar y el usuario no quería otra lupa |
| La misma lupa siempre encima de los iconos con vidrio `clear` | El icono en reposo se veía distorsionado |
| Vidrio del lente en `GlassContainer` con la cápsula | Fusionaría el lente con el dock |

## 3. El cierre de Expo Go al arrancar (causa y regla)

Al probar en el iPhone, Expo Go se cerraba tras «iOS Bundled», sin mensaje. El informe del sistema (`SIGABRT`) mostraba el hilo principal ejecutando JavaScript desde un `CADisplayLink` (el bucle de cuadros del runtime de UI de Worklets) y un error de JS sin capturar (`HermesRuntimeImpl::throwPendingError` → `std::terminate`). Las compilaciones de producción como Expo Go no protegen esa llamada, así que cualquier error ahí cierra la app.

Se aisló por partes (sin Reanimated abría; con el dock retrasado se cerraba al montarlo; luego estilo por estilo) hasta `computeLensFrame`. La causa la muestra el código que el plugin de Babel de Worklets genera para el runtime de UI:

```js
(function computeLensFrame_dockGeometryTs3({position, …, tabCount=DOCK_TABS.length}){
  const [DOCK_TABS, liquidDockMotion, LENS_EDGE_ROOM] = this.__closure; …
```

El valor por defecto de un parámetro se evalúa **antes** de que el cuerpo desempaquete `this.__closure`. En el runtime de UI no hay ningún `DOCK_TABS` global: `ReferenceError` y aborto. En Jest y en web los worklets corren como funciones normales y no falla. `getDockIndexFromScreenX` tenía el mismo defecto.

**Regla:** un worklet nunca lee en sus parámetros (valores por defecto) una variable capturada. Los worklets del dock de iOS viven en `LiquidGlassDock.tsx` y no tienen parámetros por defecto. `dockGeometry.ts` dejó de ser worklet: lo usan JS y los tests, y un test de paridad comprueba que `lensTransformAt` (UI) y `computeLensFrame` (JS) dan la misma geometría. La guardia `scripts/worklet-closure-guard.test.mjs` (en `npm run test:scripts` y en CI) compila cada archivo con worklets con el preset de la app y falla si alguno lee una variable capturada en sus parámetros.

Las sospechas que se descartaron por el camino quedan anotadas: no era un desfase de versiones con Expo Go (el JS de Reanimated 4.7.0 y 4.7.1 solo difiere en `timing.ts`), ni el orden de carga de los módulos, ni el modo de desarrollo (también fallaba con `--no-dev`). El cierre que aparecía con el commit `4951a3f` (ADR 0028) sin el dock dejó de reproducirse con el dock corregido. No se identificó otra causa distinta para él.

## 4. Consecuencias

- `react-native-reanimated`, `react-native-worklets` y `react-native-gesture-handler` pasan a usarse en `src/`, solo en `dock/LiquidGlassDock.tsx`. El resto del movimiento sigue con `Animated` (ADR 0022). `expo-gl` ya cargaba Reanimated en iOS.
- `buildLensGeometry` (nodos de `Animated`) se sustituye por `lensTransformAt` (UI) y `computeLensFrame` (JS).
- `WorkspaceNavIcons` acepta `svgComponent` y `svgProps` para que el dock les pase un `Svg` animado.
- La regla 5 del lint admite `expo-blur` en `LiquidGlassMaterial.native.tsx`; la regla 4 ya restringía `expo-glass-effect` a archivos `.native`.
- Los worklets de Jest sustituyen `requestAnimationFrame` por su propia versión en las suites que importan Reanimated.

## 5. Validación

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:scripts`, `npm run test:phase0` | Sin errores |
| iPhone 16 Pro, iOS 27.2, Expo Go 58.0.5 (modo normal) | Abre; el usuario validó el rebote, la lupa, el arrastre, el vidrio sobre los iconos al tocar, el aumento nítido de los iconos y los colores en claro y oscuro |
| Dock de iOS (`floatingLiquidGlassDock.test.tsx`) | Estados accesibles; capas y transformaciones del lente; cápsula sin recorte ni línea con vidrio del sistema; límites y compresión del lente; paridad UI/JS; inflado más alto que el dock; aumento por `viewBox` sin `scale`, nunca por encima del tamaño dibujado; tinte discreto; superficie de vidrio encendida solo al tocar; ζ de cada resorte; selección al tocar una vez; arrastre con un tic por pestaña; cancelación del sistema |
| Worklets (`worklet-closure-guard.test.mjs`) | Ningún worklet lee variables capturadas en sus parámetros; la guardia detecta el patrón que cerraba Expo Go |
| Dock de Android y renders (`renderCommits.test.tsx`) | Sin cambios de comportamiento; el dock no se re-renderiza con el contador de pendientes |
| Navegador (`npm run web:demo`, `?skin=ios`) | Sin errores en consola |

**Sin verificar:** el respaldo con `BlurView` en iOS < 26, el `.ipa` (compilación propia con estos módulos nativos) y el dock de Android en un teléfono.
