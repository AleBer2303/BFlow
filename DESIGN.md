# Sistema de Diseño Visual de BFlow (`DESIGN.md`)

> **Fuente de Verdad Visual:** Ningún componente en `src/features/` ni `src/app/` puede usar colores hexadecimales, tamaños de fuente, radios o espaciados hardcodeados. Todo valor visual proviene estrictamente de [`src/design-system/tokens.ts`](file:///C:/Users/D0604763/Documents/BFlow/BFlow/src/design-system/tokens.ts).

---

## 1. Filosofía Estética: Apple iOS 26 Liquid Glass & Minimalismo Suizo

BFlow fusiona la **precisión tipográfica suiza** (claridad matemática, retícula estricta, ritmo vertical) con la **física óptica de Apple Liquid Glass** (refracción de luz en tiempo real, bordes especulares continuos, materiales translúcidos multicapa y cinemática ProMotion de 120 Hz).

### Principios Rectores:
1. **Claridad Financiera Instantánea (*Glanceable Finance*):** El usuario debe comprender su posición de caja (Flujo Neto, checklist y deudas) en menos de 1,5 segundos. Menos adornos, más jerarquía y datos tabulares inmutables.
2. **Minimalismo Neutro y Suave (*Soft Precision*):** Se eliminan gradientes estridentes y saturaciones fluorescentes. Predominan los tonos obsidiana y grafito neutro en modo oscuro, y alabastro perla en modo claro.
3. **Respuesta Sensorial Háptica:** Cada pulsación, alternancia de mes o confirmación contable tiene peso físico, amortiguación cinemática (*spring physics*) y retroalimentación táctil microcalibrada.
4. **Dispositivo de Referencia:** iPhone 16 Pro Max (`440 × 956 pt`, ProMotion `120 Hz`, Isla Dinámica, borde de pantalla de radio continuo).

---

## 2. Arquitectura del Color: Modo Oscuro y Modo Claro Refinados (Estética Sobria y Amigable)

Diseñado bajo la norma **WCAG 2.2 AA / AAA** con ratios de contraste verificados. Se erradican por completo los marcos de neón perimetrales, los brillos estilo HUD/cyberpunk/gaming y los tonos flúor saturados, adoptando el lenguaje visual de finanzas sobrias (Apple Wallet / Linear / Stripe / Wise).

### 2.1 Paleta de Superficies y Fondos

| Token | Modo Oscuro (`dark`) | Modo Claro (`light`) | Contraste / Propósito |
| :--- | :--- | :--- | :--- |
| `background.primary` | `#0D0F12` (Obsidiana Carbón Cálido) | `#F8F8F6` (Marfil Alabastro Editorial) | Lienzo principal base inmersivo, cálido y amable a la vista. |
| `background.secondary` | `#14171C` (Grafito Ahumado) | `#EFEFEA` (Platino Lino Cálido) | Contenedores de sección y áreas agrupadas. |
| `background.elevated` | `#1B1F26` (Titanio Pizarra) | `#FFFFFF` (Porcelana Pura) | Elementos elevados y tarjetas secundarias. |

### 2.2 Superficies Translúcidas (`<GlassSurface />`)

| Token de Vidrio | Modo Oscuro (`dark`) | Modo Claro (`light`) | Efecto Óptico |
| :--- | :--- | :--- | :--- |
| `glass.surfaceTint` | `rgba(24, 28, 35, 0.70)` | `rgba(255, 255, 255, 0.76)` | Vidrio translúcido ahumado satinado primario sin niebla lechosa. |
| `glass.surfaceElevatedTint`| `rgba(32, 38, 48, 0.82)` | `rgba(255, 255, 255, 0.90)` | Cápsulas flotantes, modales y navbars. |
| `glass.specularBorder` | `rgba(255, 255, 255, 0.08)` | `rgba(255, 255, 255, 0.85)` | Reflejo perimetral fino continuo (sutil, sin brillos estridentes). |
| `glass.subtleBorder` | `rgba(255, 255, 255, 0.045)` | `rgba(20, 24, 33, 0.06)` | Delimitador hairline suave sin ruido visual. |
| `glass.blurIntensity` | `40` | `50` | Difuminado gaussiano sedoso calibrado en `expo-blur`. |
| `glass.blurTint` | `'dark'` | `'light'` | Tinte de difuminado óptico de fondo. |

### 2.3 Tipografía y Contraste de Texto

| Token | Modo Oscuro (`dark`) | Modo Claro (`light`) | Ratio WCAG | Rol Funcional |
| :--- | :--- | :--- | :--- | :--- |
| `text.primary` | `#F4F5F7` (Blanco Platino Lino) | `#12151B` (Tinta Obsidiana) | **> 15:1 (AAA)** | Montos hero, títulos, valores clave. |
| `text.secondary` | `#9BA3AF` (Cachemira Grafito) | `#4E5562` (Grafito Fino Cálido) | **> 6.8:1 (AAA)** | Subtítulos, nombres de ítems, etiquetas. |
| `text.muted` | `#636B79` (Titanio Metadatos) | `#737B8B` (Pizarra Suave) | **> 4.5:1 (AA)** | Metadatos secundarios, placeholders, fechas. |
| `text.inverse` | `#0D0F12` | `#FFFFFF` | **> 15:1 (AAA)** | Texto sobre botones o pastillas de alto contraste. |

### 2.4 Paleta Semántica Financiera (Mineral Noble & Acordes Cálidos)

Tonalidades minerales calibradas para erradicar cualquier sensación de interfaz de videojuegos, gaming arcade o distopía cyberpunk:

| Token Semántico | Modo Oscuro | Modo Claro | Fondo Suave (`Soft`) Oscuro | Fondo Suave (`Soft`) Claro | Significado en BFlow |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `semantic.income` | `#2EBD85` (Salvia Esmeralda Noble) | `#16825B` (Bosque Salvia Profundo) | `rgba(46, 189, 133, 0.10)` | `rgba(22, 130, 91, 0.08)` | Ingresos recibidos y variaciones positivas. |
| `semantic.expense` | `#E06A6A` (Terracota Carmesí Suave) | `#B83A3A` (Arcilla Carmesí) | `rgba(224, 106, 106, 0.10)` | `rgba(184, 58, 58, 0.08)` | Gastos pagados y salidas de caja. |
| `semantic.completed` | `#2EBD85` (Salvia Esmeralda Noble) | `#16825B` (Bosque Salvia Profundo) | `rgba(46, 189, 133, 0.08)` | `rgba(22, 130, 91, 0.08)` | Ítems completados en el Checklist. |
| `semantic.pending` | `#E5A84B` (Ámbar Dorado Miel) | `#B4690E` (Ocre Miel Dorado) | `rgba(229, 168, 75, 0.10)` | `rgba(180, 105, 14, 0.08)` | Ítems pendientes por pagar o recibir. |
| `semantic.debt` | `#D9824C` (Canela Siena Tostada) | `#A34E17` (Cuero Canela Profundo) | `rgba(217, 130, 76, 0.10)` | `rgba(163, 78, 23, 0.08)` | Obligaciones financieras y amortizaciones. |
| `semantic.moto` | `#4F8FEA` (Zafiro Clásico Suave) | `#2B6CB0` (Zafiro Clásico Azul) | `rgba(79, 143, 234, 0.10)` | `rgba(43, 108, 176, 0.08)` | Fondo Moto Ideal y provisiones recurrentes. |
| `semantic.savings` | `#9D7FE6` (Lavanda Amatista Noble) | `#6D49B8` (Amatista Terciopelo) | `rgba(157, 127, 230, 0.10)` | `rgba(109, 73, 184, 0.08)` | Fondos de ahorro general y reserva líquida. |

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
   - Todos los botones de sólo icono (`ThemeToggleIconButton`, `EyeIcon`) cuentan con `accessibilityLabel` descriptivo en español neutro.

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
} as const;
```

### 6.2 Soporte de Reducción de Movimiento (`prefers-reduced-motion`):
Si el usuario tiene activado *Reducir Movimiento* en iOS (`useReducedMotion()`):
- Se cancelan todas las oscilaciones de traslación y escala espacial.
- Se sustituyen por transiciones lineales de opacidad suave: `withTiming(..., { duration: 140, easing: Easing.out(Easing.quad) })`.

### 6.3 Matriz de Retroalimentación Háptica (`expo-haptics`):

| Intención / Acción | Llamada de Haptic | Sensación Táctil |
| :--- | :--- | :--- |
| **Scroll en selector de rueda** (`IosWheelPickerModal`) | `Haptics.selectionAsync()` | Tic táctil ultraligero y mecánico en cada paso. |
| **Desmarcar ítem del checklist** | `Haptics.impactAsync(Light)` | Golpe suave de liberación. |
| **Alternar tema claro/oscuro** | `Haptics.impactAsync(Light)` | Feedback sutil de cambio de modo. |
| **Marcar ítem como completado** | `Haptics.notificationAsync(Success)` | Doble pulso de confirmación y recompensa. |
| **Cierre de mes contable exitoso** | `Haptics.notificationAsync(Success)` | Confirmación solemne de consolidación. |
| **Eliminar ítem o revertir cierre** | `Haptics.notificationAsync(Warning)` | Pulso de advertencia para evitar errores. |

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
2. **`Checklist Interactive Row`:**
   - Checkbox táctil de radio continuo `sm: 10` con animación de escala *snappy*.
   - Nombre del concepto con jerarquía `headline`.
   - Monto tabular a la derecha con color semántico según estado.
3. **`IosWheelPickerModal`:**
   - Cápsula flotante translúcida de radio `xl: 28` centrada con padding inferior de 36pt.
   - Lente especular central delimitado con bordes `hairlineWidth`.
   - Atenuación angular y de opacidad (1.0 centro, 0.42 adyacente, 0.16 extremo) simulando perspectiva cilíndrica.
4. **`AppTextInput` + `KeyboardAwareScrollView`:**
   - Auto-scroll inteligente: los inputs ubicados en la mitad superior de la pantalla no sufren saltos innecesarios.
   - Los inputs ocultos por el teclado se desplazan con una holgura limpia de 24pt sin generar vacíos gigantes.

---

## 9. Matriz de Decisiones y Anti-Patrones UI/UX a Evitar

| Práctica / Elemento | Lo que HACE BFlow (Aprobado) | Lo que NUNCA hace BFlow (Anti-patrón) |
| :--- | :--- | :--- |
| **Colores de fondo** | Obsidiana cálida `#0D0F12` / Marfil alabastro `#F8F8F6`. | Fondos azulados o negros puros `#000000` sin profundidad de vidrio. |
| **Bordes y Estados Activos** | Bordes silenciosos (`specularBorder` / `subtleBorder`) con fondos suaves. | Bordes saturados al 100% que crean halos neón tipo HUD gamer/cyberpunk. |
| **Alineación de cifras** | Alineación tabular a la derecha (`fontVariant: ['tabular-nums']`). | Números flotantes proporcionales que saltan al cambiar dígitos. |
| **Iconografía** | SVG puros monocromáticos adaptables al tema. | Emojis utilizados como sustitutos de iconos de sistema. |
| **Áreas táctiles** | Mínimo `44 × 44 pt` con `hitSlop` preventivo. | Botones diminutos menores a 36pt pegados sin espaciado. |
| **Animaciones** | Resortes rápidos (< 300ms) amortiguados con inercia. | Animaciones lineales o lentas (> 500ms) que demoran la acción del usuario. |
