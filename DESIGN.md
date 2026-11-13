# Sistema de Diseño Visual de BFlow (`DESIGN.md`)

> **Fuente de Verdad Visual:** Ningún componente en `src/features/` ni `src/app/` puede usar colores hexadecimales, tamaños de fuente, radios o espaciados hardcodeados. Todo valor visual proviene estrictamente de [`src/design-system/tokens.ts`](file:///C:/Users/D0604763/Documents/BFlow/BFlow/src/design-system/tokens.ts).

> **Tres pieles, un producto:** BFlow tiene una identidad visual por plataforma. Las secciones 1 a 9 describen la piel **iOS** (Liquid Glass), que es la de referencia. La sección 10 define las pieles **Android** (Material 3, sin vidrio) y **Web** (sistema plano), y la sección 11 el contrato responsive común. Los tokens se leen siempre de `useBFlowTheme()`, que entrega los de la piel activa.

---

## 1. Filosofía Estética: Apple iOS 26 Liquid Glass & Minimalismo Suizo

BFlow fusiona la **precisión tipográfica suiza** (claridad matemática, retícula estricta, ritmo vertical) con la **física óptica de Apple Liquid Glass** (refracción de luz en tiempo real, bordes especulares continuos, materiales translúcidos multicapa y cinemática ProMotion de 120 Hz).

### Principios Rectores:
1. **Claridad Financiera Instantánea (*Glanceable Finance*):** El usuario debe comprender su posición de caja (Flujo Neto, checklist y deudas) en menos de 1,5 segundos. Menos adornos, más jerarquía y datos tabulares inmutables.
2. **Minimalismo Neutro y Suave (*Soft Precision*):** Se eliminan gradientes estridentes y saturaciones fluorescentes. Predominan los tonos obsidiana y grafito neutro en modo oscuro, y arena piedra cálida en modo claro.
3. **Respuesta Sensorial Háptica:** Cada pulsación, alternancia de mes o confirmación contable tiene peso físico, amortiguación cinemática (*spring physics*) y retroalimentación táctil microcalibrada.
4. **Dispositivo de Referencia:** iPhone 16 Pro Max (`440 × 956 pt`, ProMotion `120 Hz`, Isla Dinámica, borde de pantalla de radio continuo).

---

## 2. Arquitectura del Color: Modo Oscuro y Modo Claro Refinados (Estética Sobria y Amigable)

Diseñado bajo la norma **WCAG 2.2 AA / AAA** con ratios de contraste verificados. Se erradican por completo los marcos de neón perimetrales, los brillos estilo HUD/cyberpunk/gaming y los tonos flúor saturados, adoptando el lenguaje visual de finanzas sobrias (Apple Wallet / Linear / Stripe / Wise).

### 2.1 Paleta de Superficies y Fondos

| Token | Modo Oscuro (`dark`) | Modo Claro (`light`) | Contraste / Propósito |
| :--- | :--- | :--- | :--- |
| `background.primary` | `#0D0F12` (Obsidiana Carbón Cálido) | `#E7E6E0` (Arena Piedra Cálida) | Lienzo principal base inmersivo, cálido y amable a la vista (sin blanco puro para reducir fatiga visual). |
| `background.secondary` | `#14171C` (Grafito Ahumado) | `#DCDBD3` (Lino Tostado) | Contenedores de sección y áreas agrupadas. |
| `background.elevated` | `#1B1F26` (Titanio Pizarra) | `#EFECE3` (Marfil Arena) | Elementos elevados y tarjetas secundarias. |

### 2.2 Superficies Translúcidas (`<GlassSurface />`)

| Token de Vidrio | Modo Oscuro (`dark`) | Modo Claro (`light`) | Efecto Óptico |
| :--- | :--- | :--- | :--- |
| `glass.surfaceTint` | `rgba(24, 28, 35, 0.70)` | `rgba(238, 234, 224, 0.94)` | Vidrio translúcido ahumado satinado primario sin niebla lechosa. |
| `glass.surfaceElevatedTint`| `rgba(32, 38, 48, 0.82)` | `rgba(247, 244, 236, 0.98)` | Cápsulas flotantes, modales y navbars. |
| `glass.specularBorder` | `rgba(255, 255, 255, 0.08)` | `rgba(90, 75, 45, 0.24)` | Contorno cálido visible (separa botones y tarjetas elevadas del fondo) perimetral fino continuo (sutil, sin brillos estridentes). |
| `glass.subtleBorder` | `rgba(255, 255, 255, 0.045)` | `rgba(60, 50, 30, 0.14)` | Delimitador hairline suave sin ruido visual. |
| `glass.blurIntensity` | `40` | `12` | Difuminado gaussiano sedoso calibrado en `expo-blur`. |
| `glass.blurTint` | `'dark'` | `'light'` | Tinte de difuminado óptico de fondo. |

### 2.3 Tipografía y Contraste de Texto

| Token | Modo Oscuro (`dark`) | Modo Claro (`light`) | Ratio WCAG | Rol Funcional |
| :--- | :--- | :--- | :--- | :--- |
| `text.primary` | `#F4F5F7` (Blanco Platino Lino) | `#12151B` (Tinta Obsidiana) | **> 15:1 (AAA)** | Montos hero, títulos, valores clave. |
| `text.secondary` | `#9BA3AF` (Cachemira Grafito) | `#4E5562` (Grafito Fino Cálido) | **> 6.8:1 (AAA)** | Subtítulos, nombres de ítems, etiquetas. |
| `text.muted` | `#636B79` (Titanio Metadatos) | `#5A6272` (Pizarra Suave) | **> 4.5:1 (AA)** | Metadatos secundarios, placeholders, fechas. |
| `text.inverse` | `#0D0F12` | `#FFFFFF` | **> 15:1 (AAA)** | Texto sobre botones o pastillas de alto contraste. |

### 2.4 Paleta Semántica Financiera (Mineral Noble & Acordes Cálidos)

Tonalidades minerales calibradas para erradicar cualquier sensación de interfaz de videojuegos, gaming arcade o distopía cyberpunk:

| Token Semántico | Modo Oscuro | Modo Claro | Fondo Suave (`Soft`) Oscuro | Fondo Suave (`Soft`) Claro | Significado en BFlow |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `semantic.income` | `#2EBD85` (Salvia Esmeralda Noble) | `#127551` (Bosque Salvia Profundo) | `rgba(46, 189, 133, 0.10)` | `rgba(18, 117, 81, 0.10)` | Ingresos recibidos y variaciones positivas. |
| `semantic.expense` | `#E06A6A` (Terracota Carmesí Suave) | `#A83232` (Arcilla Carmesí) | `rgba(224, 106, 106, 0.10)` | `rgba(168, 50, 50, 0.10)` | Gastos pagados y salidas de caja. |
| `semantic.completed` | `#2EBD85` (Salvia Esmeralda Noble) | `#127551` (Bosque Salvia Profundo) | `rgba(46, 189, 133, 0.08)` | `rgba(18, 117, 81, 0.10)` | Ítems completados en el Checklist. |
| `semantic.pending` | `#E5A84B` (Ámbar Dorado Miel) | `#8F5206` (Ocre Miel Dorado) | `rgba(229, 168, 75, 0.10)` | `rgba(143, 82, 6, 0.10)` | Ítems pendientes por pagar o recibir. |
| `semantic.debt` | `#D9824C` (Canela Siena Tostada) | `#92440F` (Cuero Canela Profundo) | `rgba(217, 130, 76, 0.10)` | `rgba(146, 68, 15, 0.10)` | Obligaciones financieras y amortizaciones. |
| `semantic.moto` | `#4F8FEA` (Zafiro Clásico Suave) | `#245F9F` (Zafiro Clásico Azul) | `rgba(79, 143, 234, 0.10)` | `rgba(36, 95, 159, 0.10)` | Fondo Moto Ideal y provisiones recurrentes. |
| `semantic.savings` | `#9D7FE6` (Lavanda Amatista Noble) | `#5F3DA6` (Amatista Terciopelo) | `rgba(157, 127, 230, 0.10)` | `rgba(95, 61, 166, 0.10)` | Fondos de ahorro general y reserva líquida. |

---

## 3. Jerarquía Tipográfica y Ritmo Vertical (SF Pro + Tabular Nums)

Toda cifra monetaria implementa obligatoriamente `fontVariant: ['tabular-nums']` para erradicar el baile horizontal de dígitos en animaciones de conteo y listas. Todos los componentes de texto respetan `allowFontScaling={true}` para soporte nativo de **Apple Dynamic Type**.

### Escala Tipográfica Calibrada:

| Variante | Tamaño (`pt`) | Line Height (`pt`) | Peso | Tracking (`letterSpacing`) | Uso en BFlow |
| :--- | ---: | ---: | :--- | ---: | :--- |
| `heroCurrency` | `38` | `44` | `700` (Bold) | `-1.0` | Cifra maestra de Flujo Neto en caja (`$ 1.080.000`). |
| `title1` | `28` | `34` | `700` (Bold) | `-0.6` | Título de pantalla principal (`BFlow · Octubre 2026`). |
| `title2` | `22` | `28` | `600` (Semibold) | `-0.4` | Títulos de sección (`Ingresos Fijos`, `Control Deudas`). |
| `headline` | `17` | `22` | `600` (Semibold) | `-0.2` | Nombres de conceptos y montos en tarjeta. |
| `body` | `15` | `21` | `400` (Regular) | `-0.1` | Textos explicativos, notas contables, descripciones. |
| `callout` | `14` | `19` | `500` (Medium) | `0.0` | Montos auxiliares, previsiones y subtotales. |
| `caption` | `13` | `18` | `500` (Medium) | `+0.1` | Fechas (`Pagado 21 oct`), contadores de progreso. |
| `micro` | `11` | `14` | `600` (Semibold) | `+0.35` | Píldoras de badges (`→ Fondo Moto`, `Múltiple/mes`). |

> **Regla de Tracking Óptico:** Los tamaños grandes (*Display*) usan tracking negativo cerrado (`-1.0` a `-0.4`) para máxima contundencia visual; los tamaños micro usan tracking expandido positivo (`+0.35`) para garantizar nitidez en pantallas Retina a 11pt.

---

## 4. Espaciado y Geometría de Radios Continuos (Squircles)

### 4.1 Escala de Espaciado (Retícula Armónica de 8pt con Sub-Pasos de 4pt):
- `xxs: 2pt` — Micro espaciado entre icono y texto.
- `xs: 4pt` — Gaps internos en píldoras compactas y chips.
- `sm: 8pt` — Separación entre elementos adyacentes de un mismo grupo.
- `md: 12pt` — Padding interno de campos de texto y gap estándar.
- `lg: 16pt` — Padding lateral de pantalla y tarjetas Liquid Glass.
- `xl: 24pt` — Separación entre secciones principales y margin inferior de inputs.
- `xxl: 32pt` — Espacio de respiración entre bloques estructurales.
- `xxxl: 44pt` — Clearance superior de cabecera e Isla Dinámica.
- `huge: 56pt` — Espaciado de cierre inferior de scrollviews con navegación flotante.

### 4.2 Radios de Curvatura Continua (`borderCurve: 'continuous'`):
Apple utiliza curvas superelípticas (*squircles*). En BFlow aplicamos la **Regla de Radios Concéntricos**:
$$\text{Radio Interior} = \max(0, \text{Radio Exterior} - \text{Padding})$$

| Token | Valor (`pt`) | Elementos de Aplicación |
| :--- | ---: | :--- |
| `radius.xs` | `6` | Micro tags, indicadores de progreso internos. |
| `radius.sm` | `10` | Checkboxes interactivos, tooltips, chips de filtro. |
| `radius.md` | `16` | Campos `AppTextInput`, botones secundarios, sub-tarjetas. |
| `radius.lg` | `22` | Tarjetas maestras `<GlassSurface />`, paneles de resumen. |
| `radius.xl` | `28` | Cápsulas flotantes (`IosWheelPickerModal`), hojas modales. |
| `radius.pill` | `999` | Píldoras de estado (`StatusBadge`), botones circulares, toggles. |

---

## 5. Accesibilidad Universal y Estándares Táctiles (WCAG 2.2 AA / AAA)

1. **Objetivo Táctil Mínimo (`MIN_TOUCH_TARGET_PT = 44`):**
   - Todo control interactivo (checkbox, botón de cierre, tab, celda) tiene dimensiones físicas mínimas de `44 × 44 pt`.
   - Si el elemento gráfico es menor (ej. icono de 20pt), se compensa con `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}`.
2. **Separación Táctil Mínima:** Ningún elemento interactivo adyacente tiene menos de `8pt` de distancia para evitar toques accidentales.
3. **No Dependencia Exclusiva del Color:**
   - Todo estado (`Pagado`, `Pendiente`, `Deuda`) combina color semántico + icono SVG o etiqueta textual explícita.
4. **Semántica para Lectores de Pantalla (VoiceOver / TalkBack):**
   - Todo elemento interactivo declara `accessibilityRole` (`button`, `tab`, `checkbox`, `header`).
   - Los elementos de estado declaran `accessibilityState={{ selected, checked, disabled }}`.
   - Todos los botones de sólo icono (`ThemeToggleIconButton`, `EyeIcon`) cuentan con `accessibilityLabel` descriptivo en español neutro, que nombra la acción y su objeto («Eliminar SOAT»).
   - **Web:** `react-native-web` descarta el objeto `accessibilityState`. `AppPressable` lo convierte en `aria-selected`, `aria-checked`, `aria-expanded` y `aria-busy`. Lo que se oculta con `accessibilityElementsHidden` lleva además `aria-hidden`.
   - **Errores y avisos:** se muestran con `FormMessage`, que los anuncia al aparecer (región viva en Android y Web, anuncio explícito en iOS).
5. **Confirmaciones destructivas:** `confirmDestructive` (`src/platform/dialogs/`), nunca `Alert.alert` directo: en Web `Alert` no hace nada.

---

## 6. Cinemática de Animaciones (60 / 120 fps ProMotion) y Haptics

### 6.1 Resortes Físicos en React Native Reanimated:

```ts
export const springConfigs = {
  // Micro-interacciones táctiles (checkbox, toggle, chip tap)
  snappy: {
    damping: 20,
    stiffness: 260,
    mass: 0.8,
  },
  // Entrada de tarjetas, acordeones, transiciones de vista
  gentle: {
    damping: 24,
    stiffness: 170,
    mass: 0.95,
  },
  // Hojas modales emergentes y cápsulas flotantes
  sheet: {
    damping: 30,
    stiffness: 160,
    mass: 1.1,
  },
  // Lente líquido del dock: asentamiento suave con sobrepaso casi imperceptible
  liquidSettle: { damping: 16, stiffness: 170, mass: 1 },
  // "Lift" (crece ×1.12 / ×1.06) y estiramiento elástico por velocidad (×1.2 / ×0.92)
  liquidLift: { damping: 14, stiffness: 190, mass: 0.9 },
} as const;
```

**Lente del dock (Liquid Glass):** cápsula translúcida con borde superior especular, brillo curvo superior, sombra interior inferior y resplandor de refracción que aparece al levantarse bajo el dedo. Sigue la posición continua del dedo mediante suavizado exponencial por frame (sin reiniciar resortes en cada evento táctil) y solo hace *snap* al tab más cercano al soltar. En los extremos del dock el rebote se conserva, pero el recorrido se limita para que el lente (incluido su crecimiento por *lift*/estiramiento) nunca cruce el borde interior; el sobrepaso se convierte en una compresión horizontal (*squash* hasta ×0.84) como una gota contra la pared.

### 6.2 Soporte de Reducción de Movimiento (`prefers-reduced-motion`):
`BFlowThemeProvider` sigue el ajuste *Reducir Movimiento* del sistema (iOS, Android y Web) y lo entrega como `useBFlowTheme().reducedMotion`. Con el ajuste activo:
- No hay traslación, escala, resorte ni sacudida. Queda un cambio de opacidad de `REDUCED_MOTION_DURATION_MS` (140 ms).
- El dock y la píldora de la barra Material saltan a su sitio. El acordeón del onboarding (`animateNextLayout`) cambia de una vez.
- Los gráficos y la curva del mes dibujan su estado final.

### 6.3 Matriz de Retroalimentación Háptica (`expo-haptics`):

| Intención / Acción | Llamada de Haptic | Sensación Táctil |
| :--- | :--- | :--- |
| **Scroll en selector de rueda** (`IosWheelPickerModal`) | `Haptics.selectionAsync()` | Tic táctil ultraligero y mecánico en cada paso. |
| **Desmarcar ítem del checklist** | `Haptics.impactAsync(Light)` | Golpe suave de liberación. |
| **Alternar tema claro/oscuro** | `Haptics.impactAsync(Light)` | Feedback sutil de cambio de modo. |
| **Recorrer la curva del mes o cambiar de métrica** | `Haptics.selectionAsync()` | Tic ligero por cada día nuevo bajo el dedo y al confirmar una métrica; soltar no vibra. |
| **Marcar ítem como completado** | `Haptics.notificationAsync(Success)` | Doble pulso de confirmación y recompensa. |
| **Cierre de mes contable exitoso** | `Haptics.notificationAsync(Success)` | Confirmación solemne de consolidación. |
| **Eliminar** (movimiento, concepto, deuda, fondo, provisión, mes) **o reiniciar la cuenta** | `Haptics.notificationAsync(Warning)` | Pulso de advertencia para evitar errores. |
| **Entrar al modo eliminar** | `Haptics.notificationAsync(Warning)` | Aviso de que el siguiente toque borra. Salir del modo es un `impactAsync(Light)`. |
| **Error de un formulario** (`FormMessage`) | `Haptics.notificationAsync(Error)` | Triple pulso, una vez por error nuevo. |

**Reglas:** una vibración por acción, cuando la acción se confirma (`onPress`), nunca al tocar (`onPressIn`). Una acción que ya confirmó con `Success` no añade otra en su aviso de éxito. No hay háptica al escribir.

### 6.4 Escala de movimiento (`motionDuration`, `motionDistance`, `motionScale`, `motionBySkin`)

Un movimiento nuevo no escribe milisegundos: pide su especificación a `src/design-system/motion/motionSpec.ts`. El valor se elige por lo que hace el movimiento, no por el número más cercano. Decisión en el [ADR 0022](docs/decisions/0022-motion-scale-and-interaction-feedback.md).

| Token | Valor | Uso |
| :--- | :--- | :--- |
| `motionDuration.stagger` | 40 ms | Desfase entre elementos que entran uno tras otro (tope: 6 elementos) |
| `motionDuration.micro` | 80 ms | Un tramo de la sacudida de error; espera de la tarjeta de un panel; bajada de un botón en Android |
| `motionDuration.quick` | 150 ms | Cierre de un diálogo; la tarjeta de un panel al cerrarse; salida de un control de fila |
| `motionDuration.fast` | 250 ms | Cambio de pestaña, apertura de un diálogo o de la tarjeta de un panel, pliegue del espacio de un panel, píldora de la barra Material, acordeón, cambio de icono |
| `motionDuration.medium` | 350 ms | Cierre de un aviso flotante |
| `motionDuration.slow` | 400 ms | Un bloque que llega a una pantalla ya visible (`Entrance kind="section"`) |
| `motionDuration.emphasis` | 500 ms | Momentos únicos de énfasis: la barra de progreso que crece |
| `motionDistance.small` / `base` | 6 / 8 pt | Sacudida de error; cambio de pestaña, tarjeta de un panel y control de fila |
| `motionDistance.medium` | 12 pt | Un bloque que llega a una pantalla ya visible |
| `motionDistance.large` | 30 pt | Hoja que sube (diálogo en iOS) |
| `motionScale.dialog` / `menu` | 0,96 / 0,97 | Diálogo que crece en su sitio (Android, Web) y tarjeta de un panel; control de fila |
| `pressSinkMotion` | escala 0,97 · opacidad 0,82 | Botón bajo el dedo en iOS y Android |

| Piel | Curva de entrada | Curva de salida | Sobrepaso | Diálogo |
| :--- | :--- | :--- | :--- | :--- |
| iOS | `0.22, 1, 0.36, 1` | la misma | Sí, con resortes | Hoja que sube |
| Android | `0.05, 0.7, 0.1, 1` | `0.3, 0, 0.8, 0.15` | No | Crece en su sitio |
| Web | `0.2, 0.8, 0.2, 1` | la misma | No | Crece en su sitio |

**Piezas:**
- **`Entrance`:** fundido y subida corta al montar. `kind="screen"` para una pantalla que sustituye a otra (cambio de pestaña, con `key`), `kind="section"` para un bloque que llega a una pantalla ya visible. Una entrada por pantalla; las tarjetas no se escalonan una a una.
- **`RevealDown`:** un panel que se abre empujando el contenido (formularios de añadir y editar, avisos). Son dos movimientos a la vez:
  - **El espacio se despliega:** el alto va de 0 al del contenido en 330 ms, con la curva de la piel.
  - **La tarjeta se asienta:** 80 ms después, el contenido aparece mientras crece desde el 96 % y sube 8 pt, con driver nativo. En iOS aterriza con el resorte `gentle`; en Android y Web, con su curva y sin sobrepaso.
  - **Al cerrar:** la tarjeta se atenúa en 150 ms y el espacio se pliega detrás en 250 ms. Mientras se cierra muestra su último contenido.
- **`FormMessage`:** el aviso de un formulario. `tone="error"` sacude el texto y vibra; `tone="success"` solo se abre. Siempre se anuncia a los lectores de pantalla.
- **`AppPressable`:** respuesta al toque por piel. En iOS el control se hunde y vuelve con resorte. En Android se hunde igual, con curva y sin sobrepaso (80 ms al bajar, 150 ms al volver); **no hay ripple**, porque el ripple nativo pintaba un recuadro gris de esquinas rectas sobre los controles redondeados mientras se mantenía el dedo. En Web, pasos de hover y presión. `pressEffect="none"` para superficies que no son un botón (columnas de un gráfico).
- **`CheckIndicator`:** la marca de una fila que se puede completar: aro vacío si está pendiente, disco relleno con el check si está hecha. Al cambiar en pantalla el disco aparece creciendo (con sobrepaso suave en iOS) y se va más rápido de lo que llegó.
- **`ProgressFill`:** el tramo lleno de una barra de progreso; crece desde el inicio una vez, al llegar su pantalla.
- **`useReplayOnChange`:** un valor que se repite de 0 a 1 cuando cambia una clave. Lo usan el contador del Checklist (`StatusBadge pulseOnChange`, que se hincha un 10 %) y el botón de tema (el icono nuevo gira un cuarto de vuelta y crece).
- **`animateNextLayout()`:** anima el siguiente cambio de layout (filas que se añaden, acordeones). No hace nada en Web.

**Reglas:** cerrar es más rápido que abrir; un cierre nunca se retrasa; el sobrepaso es solo de iOS y solo en entradas; nada se mueve por el scroll.

---

## 7. Arquitectura Técnica de Superficies Liquid Glass (Doble Modo)

### Modo B (`.ipa` nativo con iOS 26 en GitHub Actions):
Renderiza `expo-glass-effect` (`GlassView` nativo de Apple) interactuando directamente con el compositor de Metal en el GPU:
- Refracción óptica real del wallpaper y elementos subyacentes.
- Reflexión especular dinámica en los bordes según la orientación del dispositivo.

### Modo A (Expo Go / Web):
Fallback arquitectural idéntico visualmente mediante `expo-blur`:
- `BlurView` con intensidad calibrada (`48` en Dark / `55` en Light).
- Borde superior e izquierdo especular de `1px` con `specularBorder`.
- Borde perimetral delimitador ultrafino con `subtleBorder`.
- Tinte de superficie translúcido multicapa que neutraliza la fatiga visual.

---

## 8. Catálogo de Componentes Visuales de BFlow

1. **`Net Flow Hero Card`:**
   - Monto en `heroCurrency` con espaciado respirable superior e inferior.
   - Badge de progreso del checklist integrado en la esquina superior derecha.
   - Tinte de flujo proyectado en `caption` con contraste secundario garantizado.
2. **`Checklist Interactive Row` & Acciones Centralizadas:**
   - Filas limpias y de ancho completo sin botones redundantes por ítem, eliminando la sobrecarga visual.
   - Fila táctil ergonómica con radio continuo `md: 16` y respuesta háptica calibrada al confirmar toques (`hapticService.trigger`).
   - Nombre del concepto, badges contextuales y monto tabular a la derecha con color semántico según estado.
   - Botones tipo pill de **Editar** y **Eliminar** centralizados en las cabeceras de sección (Ingresos y Gastos), que activan un modo contextual *in-situ* sobre las mismas listas sin duplicar ítems: el botón Eliminar conserva su identidad roja distintiva (`semantic.expenseSoft` con icono y texto `semantic.expense`, que al activarse se llena de color sólido). En modo eliminar los ítems existentes se tiñen en rojo suave (`semantic.expenseSoft` con borde `semantic.expense`) y revelan el icono de papelera a la derecha, y en modo editar revelan el icono de lápiz a la derecha para abrir el formulario modal de edición. Un segundo toque en el botón desactiva el modo de forma inmediata y limpia.
   - Formularios modales unificados de **Nuevo Movimiento** y **Editar Movimiento** (`add-movement-modal-card`, `edit-entry-modal-card`) con estética iOS 26 Liquid Glass: Hero Amount Card con previsualización en vivo, glifo monetario tabular destacado, agrupación Gestalt de campos, selectores en cápsula continua (`MIN_TOUCH_TARGET_PT`), micro-interacciones hápticas y chips de vinculación ergonómicos, sin listas de ítems repetidas para un registro directo y limpio.
3. **`IosWheelPickerModal`:**
   - Cápsula flotante translúcida de radio `xl: 28` centrada con padding inferior de 36pt.
   - Lente especular central delimitado con bordes `hairlineWidth`.
   - Atenuación angular y de opacidad (1.0 centro, 0.42 adyacente, 0.16 extremo) simulando perspectiva cilíndrica.
4. **`AppTextInput` + `KeyboardAwareScrollView`:**
   - Auto-scroll inteligente: los inputs ubicados en la mitad superior de la pantalla no sufren saltos innecesarios.
   - Los inputs ocultos por el teclado se desplazan con una holgura limpia de 24pt sin generar vacíos gigantes.
5. **Curva del mes (`MonthlyCurveSection`):**
   - Sustituye en Resumen a la lista del checklist y a las tarjetas `Control Deudas` y `Control Ahorros`. Una cifra en `heroCurrency`, una línea luminosa sobre una cuadrícula de puntos y un selector de cinco métricas: **Flujo, Ingresos, Gastos, Ahorros y Deudas**. Ver [ADR 0008](docs/decisions/0008-monthly-curve-replaces-tubes.md).
   - Se dibuja una serie a la vez, con su propia escala desde cero. La línea sólida llega hasta hoy y la punteada proyecta el cierre si se completa lo pendiente. Deudas solo baja con abonos reales.
   - Colores exclusivamente de tokens: `semantic.income` (Flujo e Ingresos), `semantic.expense`, `semantic.reserve` y `semantic.debt`. El lienzo es opaco y se limpia con `background.primary` para integrarse con la página.
   - **Interacción:** al tocar la gráfica se muestra el día bajo el dedo y se bloquea el scroll de la página hasta soltar (`useScrollLock`). Arrastrar recorre el mes día a día según la posición horizontal, atenúa lo posterior e inclina levemente la curva; más allá de hoy solo existe el cierre previsto. Al soltar, regresa a hoy. La página se desplaza tocando fuera de la gráfica.
   - **Accesibilidad:** cada botón del selector mide mínimo `52 pt` y anuncia monto y cierre previsto en `accessibilityLabel`, de modo que la identidad no depende del color. Con *Reducir Movimiento* no hay trazado de entrada, transformación, inclinación ni latido.
   - **Respaldo (iOS):** si la escena 3D no puede dibujar (sin WebGL, shader que no enlaza, superficie GL que no llega en 6 s o error en un cuadro), se muestra la curva vectorial animada con el mismo gesto horizontal. Ver [ADR 0012](docs/decisions/0012-animated-vector-curve.md).
   - **Por piel (`platformSkins[piel].curveStage`):** lo anterior describe la escena three.js, que es solo de iOS (`scene-3d`). Android y Web (`vector`) dibujan la misma curva como vector plano y animado (§10.4): mismo trazado de entrada, transformación y latido, sin brillo ni inclinación. Android la recorre con el dedo, con el mismo gesto y bloqueo de scroll que iOS ([ADR 0014](docs/decisions/0014-android-vector-curve.md)); Web, con el puntero y el teclado, y en escritorio convierte el selector en una tabla de métricas con su cifra actual.
6. **Gráficos animados (`src/design-system/components/charts/`):** ver [ADR 0020](docs/decisions/0020-animated-charts.md).
   - Hay tres tipos: `BarChart` (agrupado o apilado, con una línea de referencia punteada; los negativos cuelgan bajo el cero y en una pila se apilan hacia abajo), `LineChart` (con área y un tramo proyectado punteado) y `DonutChart` (con leyenda). Todos se dibujan con `react-native-svg`, igual en las tres pieles y sin WebGL.
   - **Meses visibles:** cada gráfico muestra los meses más recientes que caben con el objetivo táctil completo de la piel por columna (4 a 320 de ancho, hasta 6 en escritorio).
   - Cada gráfico va en una `ChartCard`, que es una `GlassSurface` elevada, con título `headline` y, solo si hace falta, un subtítulo `caption`. Debajo del título, la **lectura** muestra un mes con sus cifras en `callout` tabular. Por defecto es el mes activo.
   - **Texto mínimo:** «Flujo de Dinero», «Balance mensual» y «Evolución de ahorros» solo llevan el título, la lectura y el dibujo, sin subtítulo, leyenda ni notas. Con una sola serie, la lectura es el mes y el monto en `title2` (`readout="value"`).
   - **Ejes:** el eje de valores va a la derecha (52 pt) en `micro` `text.muted`, con pasos redondos y el cero siempre visible. La cuadrícula usa `glass.subtleBorder` y la línea de cero, `text.muted`. Debajo van los meses en `micro`; el activo, en `text.primary`.
   - **Interacción:** cada mes es una columna `AppPressable` de alto completo. Un toque, un clic o Enter fija el mes, y volver a tocarlo lo suelta. El puntero y el foco lo muestran mientras siguen encima, sin fijarlo. Los meses no elegidos bajan al 38 % de opacidad. En la dona, cada fila de la leyenda (alto mínimo de la piel) elige su tramo: el tramo engrosa de 18 a 24 pt, el resto baja al 35 % y el centro muestra el monto y el porcentaje.
   - **Movimiento:** al entrar, cada valor crece desde cero en 0,7 s, con 40 ms de desfase entre valores. Con datos nuevos, los valores se mueven en 0,45 s. La curva es `easeOutCubic`, sin rebote, en las tres pieles. Con *Reducir Movimiento* se dibuja el estado final.
   - **Colores:** las series con significado usan `semantic`: recibido `income`, pagado `expense`, pendiente `pending`, deuda `debt`, reserva `reserve` y ahorro `savings`. Las series sin significado usan `chart.categorical` (§10.5).
   - **Accesibilidad:** el SVG queda oculto para los lectores de pantalla. Cada columna o fila anuncia sus cifras, de modo que el dato no depende del color.
   - **Dónde aparecen:**
     - **Cierre** (sección «Gráficos»): Flujo de Dinero, balance mensual, previsto vs real, pagado vs pendiente, distribución de gastos y la comparación de los dos últimos meses («Noviembre 2026 vs Octubre 2026»).
     - **Deudas:** evolución de la deuda con la proyección de cierre.
     - **Ahorros:** evolución de ahorros apilada.

---

## 9. Matriz de Decisiones y Anti-Patrones UI/UX a Evitar

| Práctica / Elemento | Lo que HACE BFlow (Aprobado) | Lo que NUNCA hace BFlow (Anti-patrón) |
| :--- | :--- | :--- |
| **Colores de fondo** | Obsidiana cálida `#0D0F12` / Arena piedra `#E7E6E0`. | Fondos azulados o negros puros `#000000` sin profundidad de vidrio. |
| **Bordes y Estados Activos** | Bordes silenciosos (`specularBorder` / `subtleBorder`) con fondos suaves. | Bordes saturados al 100% que crean halos neón tipo HUD gamer/cyberpunk. |
| **Alineación de cifras** | Alineación tabular a la derecha (`fontVariant: ['tabular-nums']`). | Números flotantes proporcionales que saltan al cambiar dígitos. |
| **Iconografía** | SVG puros monocromáticos adaptables al tema. | Emojis utilizados como sustitutos de iconos de sistema. |
| **Áreas táctiles** | Mínimo `44 × 44 pt` con `hitSlop` preventivo. | Botones diminutos menores a 36pt pegados sin espaciado. |
| **Animaciones** | Resortes rápidos (< 300ms) amortiguados con inercia. | Animaciones lineales o lentas (> 500ms) que demoran la acción del usuario. |

---

## 10. Pieles por Plataforma (iOS · Android · Web)

Decisiones en los ADR [0010](docs/decisions/0010-platform-skins-and-responsive-layout.md) y [0011](docs/decisions/0011-web-redesign-and-vector-curve.md). La piel se resuelve en `src/design-system/platform/platformSkin.ts` y sus tokens viven en `src/design-system/tokens.ts` (`palettesBySkin`, `radiusBySkin`, `typographyBySkin`, `platformSkins`).

### 10.1 Qué cambia y qué no

| | iOS | Android | Web |
| :--- | :--- | :--- | :--- |
| Material | Liquid Glass: tinte translúcido + blur + borde especular | Material 3: contenedor tonal **opaco**; la variante elevada sube un tono y usa `elevation: 2` | Tarjeta plana, línea de 1 px, sin sombra |
| Navegación | Dock flotante con lente líquido | Barra superior + barra de navegación anclada con indicador en píldora | Cabecera opaca con línea; palabras desde 840 px, barra al pie por debajo |
| Toque | Se hunde y atenúa con resorte (escala 0,97, opacidad 0,82) | Se hunde y atenúa igual, con curva y sin sobrepaso; sin ripple | Hover (140 ms) y pulsación (90 ms, escala 0,985), sin rebote |
| Botón principal | Cápsula de vidrio | Relleno con el acento, totalmente redondeado | El único botón relleno con el acento, radio 4 |
| Radios `xs / sm / md / lg / xl / pill` | 6 / 10 / 16 / 22 / 28 / 999 | 4 / 8 / 12 / 16 / 28 / 999 | 2 / 4 / 6 / 8 / 8 / 4 |
| Objetivo táctil | 44 pt | 48 dp | 44 px |
| Curva del mes (`curveStage`) | `scene-3d`: escena three.js (respaldo: curva vectorial) | `vector`: curva vectorial (SVG) animada, gesto táctil | `vector`: curva vectorial (SVG) animada, puntero y teclado |
| Gráficos (ADR 0020) | SVG animado en tarjeta de vidrio; toque | SVG animado en tarjeta tonal; toque | SVG animado en tarjeta plana; toque, puntero y teclado |

**No cambia entre pieles:** los datos, los flujos, el significado de los colores semánticos, el espaciado (§4.1), los números tabulares y los `testID`.

**Prohibido fuera de iOS:** `BlurView`, superficies translúcidas, borde especular, lente y dock flotante. Los tokens `colors.glass.*` conservan el nombre, pero en Android y Web son rellenos opacos y `blurIntensity` es 0.

### 10.2 Token de acento (`colors.accent`)

El único color de acción de cada piel: selección de navegación, foco y botón principal.

| Token | iOS oscuro / claro | Android oscuro / claro | Web oscuro / claro |
| :--- | :--- | :--- | :--- |
| `accent.primary` | `#388AF6` / `#245F9F` | `#8CD5B4` / `#1B6B51` | `#256F82` / `#256F82` |
| `accent.onPrimary` | `#0D0F12` / `#FFFFFF` | `#003827` / `#FFFFFF` | `#FFFFFF` / `#FFFFFF` |
| `accent.container` | `rgba(79,143,234,0.16)` / `rgba(36,95,159,0.14)` | `#1F4F3E` / `#CDE9DB` | `rgba(95,179,198,0.16)` / `rgba(37,111,130,0.14)` |
| `accent.text` | `#5C9DF2` / `#245F9F` | `#8CD5B4` / `#1B6B51` | `#5FB3C6` / `#1D5F70` |

### 10.3 Piel Android (Material 3)

| Token | Oscuro | Claro |
| :--- | :--- | :--- |
| `background.primary` | `#101411` | `#F6FBF4` |
| `background.secondary` | `#181D19` | `#EFF5EE` |
| `background.elevated` | `#1E2420` | `#E9EFE8` |
| `glass.surfaceTint` (contenedor) | `#1A201C` | `#EAF0E9` |
| `glass.surfaceElevatedTint` | `#232925` | `#E2E9E1` |
| `text.primary / secondary / muted` | `#E0E4DD` / `#C0C9BF` / `#939C92` | `#171D19` / `#404943` / `#566058` |

Contraste medido (primario / secundario / atenuado): sobre la página **14,4 / 10,9 / 6,6** (oscuro) y **16,3 / 8,9 / 6,2** (claro); sobre tarjeta **12,9 / 9,7 / 5,8** y **14,8 / 8,1 / 5,7**. Texto sobre el acento: **7,7** y **6,4**.

Escala tipográfica (Roboto del sistema, sin `fontFamily` forzada):

| Variante | Tamaño / interlínea | Peso | Tracking | Rol Material |
| :--- | :--- | :--- | ---: | :--- |
| `display` | 45 / 52 | 400 | 0 | Display medium |
| `heroCurrency` | 36 / 44 | 400 | 0 | Display small |
| `title1` | 28 / 36 | 400 | 0 | Headline medium |
| `title2` | 22 / 28 | 400 | 0 | Title large |
| `headline` | 16 / 24 | 500 | 0,15 | Title medium |
| `body` | 14 / 20 | 400 | 0,25 | Body medium |
| `callout` | 14 / 20 | 500 | 0,1 | Label large |
| `caption` | 12 / 16 | 500 | 0,5 | Label medium |
| `micro` | 11 / 16 | 500 | 0,5 | Label small |

Componentes: barra de navegación de 80 dp, opaca (`background.elevated`), en el flujo del layout, con `insets.bottom` propio; indicador de 56 × 32 con `accent.container`; la píldora existe solo en el destino seleccionado (el estado nunca depende de una animación).

### 10.4 Piel Web (sistema `design-taste-frontend`)

Paleta `putty-black-teal`, tipografía `geist`, radios `sharp`, botones `solid`, repartidos por la skill (historial en `.taste-skill/history.json`).

| Token | Oscuro | Claro |
| :--- | :--- | :--- |
| `background.primary` | `#0A0A0A` | `#DEDAD3` |
| `background.secondary` / tarjeta | `#151515` | `#D3CEC6` |
| `background.elevated` | `#1F1F1E` | `#E7E4DE` |
| `glass.subtleBorder` (línea) | tinta al 14 % | tinta al 11 % |
| `glass.specularBorder` (línea fuerte) | tinta al 26 % | tinta al 20 % |
| `text.primary / secondary / muted` | `#DEDAD3` / `#B3AFA9` / `#93918C` | `#0A0A0A` / `#3B3835` / `#55514C` |
| `semantic.savings` | `#E08FB8` | `#8A3A66` |

Contraste medido (primario / secundario / atenuado): sobre la página **14,2 / 9,1 / 6,3** (oscuro) y **14,2 / 8,4 / 5,7** (claro); sobre tarjeta **13,1 / 8,4 / 5,8** y **12,6 / 7,4 / 5,0**. Texto sobre el acento: **5,7**.

Escala tipográfica (Geist; `system-ui` mientras carga):

| Variante | Tamaño / interlínea | Peso | Tracking |
| :--- | :--- | :--- | ---: |
| `display` | 52 / 56 | 500 | −2,2 |
| `heroCurrency` | 38 / 44 | 500 | −1,3 |
| `title1` | 28 / 34 | 500 | −0,8 |
| `title2` | 20 / 28 | 500 | −0,3 |
| `headline` | 18 / 26 | 500 | −0,2 |
| `body` | 16 / 24 | 400 | 0 |
| `callout` | 15 / 22 | 500 | 0 |
| `caption` | 14 / 20 | 500 | 0 |
| `micro` | 13 / 18 | 500 | 0 |

Reglas propias de la Web:

1. Interfaz 90–95 % neutra y un solo acento. **Nunca violeta ni lavanda** (por eso `savings` es rosa aquí).
2. Texto de lectura a 16 px; nada por debajo de 13 px; pesos 400 y 500.
3. Un único botón relleno por vista (`usePrimaryActionLook`); el resto, superficie con línea.
4. Cabecera opaca de 72 px (56 px por debajo de 640 px) con línea inferior; sin blur, sombra ni píldora flotante.
5. Movimiento (`webMotion`): 140 / 200 / 90 ms con `cubic-bezier(0.2, 0.8, 0.2, 1)`. Nada rebota, se inclina ni se anima con el scroll. Hay dos excepciones, y en ambas, con `prefers-reduced-motion`, el dibujo aparece quieto:
   - La curva del mes se dibuja al entrar, se transforma al cambiar de métrica y su marcador late 3 veces (ADR 0012).
   - Los gráficos crecen al entrar y se mueven al cambiar los datos, sin rebote (ADR 0020).
6. Foco de teclado: anillo de 2 px con el acento (`:focus-visible`).
7. Curva del mes vectorial: línea de 2 px, área al 10 %, proyección punteada en `text.muted`, marcador con anillo de latido. Se recorre con el puntero o con las flechas.

### 10.5 Colores de gráficos (`colors.chart`)

`chart.categorical` tiene seis tonos, en orden, para las series sin significado financiero, como los tramos de «Distribución de gastos». Se definen en las seis paletas y su contrato está en `skinTokens.test.ts`:

- contraste de al menos **3:1** sobre la página, el fondo secundario y las tarjetas (WCAG 1.4.11);
- seis tonos distintos, con al menos 25° de tono entre vecinos;
- sin violeta ni lavanda en Web.

| Piel / tema | Tonos (1 → 6) |
| :--- | :--- |
| iOS oscuro | `#4F8FEA` `#2BB3A6` `#E5A84B` `#E07A9A` `#9D7FE6` `#9CC45A` |
| iOS claro | `#245F9F` `#0F7A70` `#8F5206` `#A8345F` `#5F3DA6` `#5A6E12` |
| Android oscuro | `#6FA4F0` `#4FC3B5` `#E5A84B` `#E88AA6` `#AD93EA` `#A5CB66` |
| Android claro | `#245F9F` `#0B6E66` `#8F5206` `#A8345F` `#5F3DA6` `#556A10` |
| Web oscuro | `#6FA4F0` `#5FB3C6` `#E5A84B` `#E08FB8` `#A5CB66` `#C2B89A` |
| Web claro | `#1F5590` `#0E6B5E` `#7A4504` `#8A3A66` `#4C5E0E` `#5E574C` |

Si una serie tiene significado (ingreso, gasto, pendiente, deuda, reserva o ahorro), se usa su color `semantic` y no uno categórico.

---

## 11. Contrato Responsive

Función pura `resolveResponsiveLayout` y hook `useResponsiveLayout()` en `src/design-system/layout/responsiveLayout.ts`.

| Ancho de ventana | Clase | Columnas | Margen iOS / Android | Margen Web |
| :--- | :--- | ---: | ---: | ---: |
| < 360 | `compact` | 4 | 16 | 16 |
| 360 – 599 | `compact` | 4 | 16 | 24 |
| 600 – 639 | `medium` | 8 | 24 | 24 |
| 640 – 839 | `medium` | 8 | 24 | 48 |
| 840 – 1023 | `expanded` | 12 | 24 | 48 |
| ≥ 1024 | `expanded` | 12 | 24 | 80 |

- **Ancho mínimo soportado:** 320.
- **Columna de contenido** centrada con tope de 560 (iOS), 600 (Android) y 1.280 (Web).
- **Separación entre columnas:** 12 en `compact`, 24 desde `medium`.
- **Tarjetas con cifras:** comparten fila solo si cada cifra cabe en una línea (`minCardWidthForAmounts`); si no, cada una ocupa su fila. Una cifra nunca se parte ni se trunca.
- **Paneles** (`ResponsiveColumns`): dos columnas cuando cada una conserva 400 de ancho; una columna en caso contrario.
- **Resumen en escritorio** (columna ≥ 920): cifras en fila 6 / 3 / 3 y curva en panel partido 4 / 8.
- **Web:** navegación en la cabecera desde 840; barra al pie por debajo, solo con iconos por debajo de 360.

### Lista de comprobación para cualquier pantalla nueva

1. Probarla a 320, 360, 390, 600, 840, 1.024 y 1.440 de ancho en las tres pieles (`npm run web:demo` con `?skin=`).
2. Sin scroll horizontal ni elementos fuera de la ventana.
3. Ninguna cifra monetaria partida en dos líneas.
4. Todo control interactivo es un `AppPressable` y alcanza el objetivo táctil de la piel.
5. Ningún `BlurView` ni superficie translúcida fuera de la piel iOS.
6. Modo claro y oscuro revisados en las tres pieles.
