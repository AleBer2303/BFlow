# 0010. Pieles por plataforma (iOS, Android, Web) y contrato responsive

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Amplía el [ADR 0001](0001-dual-mode-architecture-and-apple-free-tier.md) (doble modo) y continúa el [ADR 0009](0009-android-build-environment.md) (base de Android). El rediseño concreto de la piel Web está en el [ADR 0011](0011-web-redesign-and-vector-curve.md).
- **Autores:** Architect, UI Builder, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

BFlow nació como app de iPhone con estética Liquid Glass. Tras declarar Android (ADR 0009) el mismo código se veía igual en las tres plataformas: vidrio translúcido y dock flotante en Android, y un layout de teléfono estirado en un navegador de escritorio. Además había defectos responsive reales:

- El dock quedaba pegado a la izquierda en ventanas de más de ~600 pt (un `position: 'absolute'` con `left`, `right` y `maxWidth` no se centra).
- El título `BFlow · <mes>` no podía encogerse y empujaba el botón de tema fuera de pantalla con meses largos en iPhones de 375 pt.
- En teléfonos estrechos o con saldos grandes las cifras de las tarjetas de Ingresos y Gastos se partían en dos líneas.
- En Android no se reservaba el área de la barra de estado ni la de gestos (dibujo de borde a borde).
- Había controles declarados por debajo del objetivo táctil mínimo (chips de 34–38 pt, botones de icono de 36 pt).

Se pidió que el proyecto sea multiplataforma, que Android tenga una identidad propia **sin Liquid Glass** y que la Web se rediseñe por completo.

## 2. Decisiones

### 2.1. Una piel por plataforma, resuelta en el tema

`useBFlowTheme()` devuelve ahora `skin` (`'ios' | 'android' | 'web'`) y entrega la paleta, los radios, la escala tipográfica y el objetivo táctil **de esa piel**. Las features siguen leyendo `colors`, `radius` y `typography` del tema y no ramifican por plataforma.

| | iOS | Android | Web |
| :--- | :--- | :--- | :--- |
| Material de superficie | Liquid Glass (tinte translúcido + `BlurView`) | Material 3: contenedor tonal **opaco**, sin blur | Tarjeta plana sobre línea de 1 px |
| Navegación | Dock flotante con lente | Barra de navegación Material anclada | Cabecera con palabras (≥ 840 px) o barra al pie |
| Respuesta al toque | Resorte + háptica | Ripple | Paso de hover y de pulsación |
| Radios (`xs…xl`) | 6 / 10 / 16 / 22 / 28 | 4 / 8 / 12 / 16 / 28 | 2 / 4 / 6 / 8 / 8 |
| Tipografía | SF Pro, display en negrita | Roboto, escala Material 3 | Geist, display 500 |
| Objetivo táctil | 44 pt | 48 dp | 44 px |

- La piel se resuelve con `resolvePlatformSkin(Platform.OS)`. `BFlowThemeProvider` acepta `skin` para forzarla en tests.
- Los tokens `colors.glass.*` conservan su nombre por compatibilidad, pero en Android y Web son rellenos **opacos** y `blurIntensity` vale 0. Un test lo exige.
- Se añade `colors.accent` (`primary`, `onPrimary`, `container`, `onContainer`, `text`): el único color de acción de cada piel.
- Los colores semánticos (ingreso, gasto, deuda…) mantienen su significado en las tres pieles; solo cambia el tono para conservar contraste AA sobre cada fondo.

### 2.2. Componentes que encapsulan la diferencia

| Componente | Qué resuelve |
| :--- | :--- |
| `GlassSurface` | Elige el material según la piel. `BlurView` solo se monta en iOS. |
| `AppPressable` | Sustituye a `Pressable` en `src/features/` y `src/app/`. Añade ripple (Android) o pasos de hover y pulsación (Web) y garantiza el objetivo táctil mínimo. |
| `usePrimaryActionLook()` | Aspecto del botón principal de una vista: cápsula de vidrio (iOS), botón relleno Material (Android), único botón relleno con el acento (Web). |
| `WorkspaceShell` (`src/features/shell/`) | Marco de todas las pantallas: cabecera, columna de contenido centrada y navegación de la piel. |
| `MaterialNavigationBar`, `WebAppHeader`, `WebTabBar` | Navegación de Android y Web. Comparten con el dock la lista `WORKSPACE_TABS` y los `testID` `workspace-tab-<id>`. |
| `ResponsiveColumns` | Coloca paneles en columnas cuando caben y los apila cuando no. |

### 2.3. Contrato responsive único

`resolveResponsiveLayout(width, height, skin)` es una función pura; `useResponsiveLayout()` la alimenta con el tamaño real de la ventana.

- **Clases de tamaño** (Material 3): `compact` < 600 ≤ `medium` < 840 ≤ `expanded`.
- **Columna de contenido** centrada y con tope: 560 (iOS), 600 (Android), 1280 (Web).
- **Márgenes laterales:** 16 en teléfonos nativos y 24 desde `medium`; en Web 24 / 48 / 80 (y 16 por debajo de 360 px).
- **Tarjetas con cifras:** comparten fila solo mientras cada cifra cabe en una línea (`minCardWidthForAmounts`); si no, cada tarjeta ocupa su fila.
- **Cifras hero:** en iOS y Android se encogen para no partirse (`CurrencyText fitOneLine`); nunca se truncan.
- **Ancho mínimo soportado:** 320 pt.

### 2.4. Objetivo táctil mínimo

`AppPressable` compara el tamaño que declara un control con el mínimo de la piel:

- iOS y Android conservan el tamaño visual y amplían el área con `hitSlop` (lo que ya pedía `DESIGN.md` §5.1).
- Web no tiene `hitSlop`: el control crece hasta 44 px.

### 2.5. Android sin Liquid Glass

- Sin `BlurView`, sin borde especular, sin lente ni dock flotante.
- Barra superior Material y barra de navegación anclada **dentro del flujo** (el contenido no queda tapado), con indicador en píldora y ripple.
- La raíz reserva `insets.top` y la barra de navegación reserva `insets.bottom` (`useSafeInsets`, seguro sin `SafeAreaProvider`).
- `syncSystemChrome` pinta la vista raíz nativa con el fondo del tema (`expo-system-ui`, ya instalado por el ADR 0009).
- La curva 3D del Resumen se conserva: la plataforma cambia de material, no de funciones.

### 2.6. Modo vitrina para validar las tres pieles

`EXPO_PUBLIC_BFLOW_DEMO=1` (`npm run web:demo`) arranca con el usuario demo local y el seed de octubre 2026, sin Firebase, y acepta `?skin=ios|android|web` y `?theme=dark|light`. Permite revisar y auditar las tres pieles desde un navegador en Windows sin credenciales. Sin la variable, ambos mecanismos están inertes.

## 3. Alternativas descartadas

- **Ramificar con `Platform.OS` en cada pantalla:** dispersa la decisión en 13.000 líneas y no se puede probar bajo Jest (que corre como iOS).
- **Librería de componentes Material (`react-native-paper`):** añade una dependencia grande y un segundo sistema de tokens para cambiar superficies, navegación y botones, que ya resuelven los componentes propios.
- **Archivos `.android.tsx` / `.web.tsx` por pantalla:** triplica el mantenimiento de las vistas; solo se usa la extensión de plataforma donde cambia la API del sistema (`systemChrome`).

## 4. Consecuencias

- Las tres pieles comparten datos, flujos, `testID` y tests funcionales; lo que difiere está acotado a tokens y a seis componentes.
- Todo control interactivo nuevo debe usar `AppPressable` y todo panel nuevo debe leer su tamaño de `useResponsiveLayout()` o `ResponsiveColumns`.
- **Límite de verificación:** la piel Android se validó con tests (RNTL) y en el navegador con `?skin=android`. No se ejecutó en un dispositivo ni emulador Android: el ripple real, los insets de borde a borde y la háptica quedan por comprobar en hardware.
- `expo-haptics` sigue activo en Android con los mismos patrones calibrados para el Taptic Engine; puede requerir ajuste al probar en dispositivo.
- La orientación sigue fija en vertical (`app.json`); el contrato responsive ya cubre tabletas, plegables y horizontal si se habilitan.
