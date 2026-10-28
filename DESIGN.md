# Sistema de Diseño Visual de BFlow (`DESIGN.md`)

> **Fuente de Verdad Visual:** Ningún componente en `src/features/` ni `src/app/` puede usar colores hexadecimales, tamaños de fuente, radios o espaciados hardcodeados. Todo valor visual proviene de [`src/design-system/tokens.ts`](file:///C:/Users/D0604763/Documents/BFlow/BFlow/src/design-system/tokens.ts).

---

## 1. Filosofía Estética: Apple iOS 26 Liquid Glass

- **Dispositivo de Referencia:** iPhone 16 Pro Max (`440 × 956 pt`, pantalla Super Retina XDR ProMotion `120 Hz`, Isla Dinámica).
- **Superficies Translúcidas (`<GlassSurface />`):**
  - **Modo B (`.ipa` nativo en iOS 26):** Renderiza `expo-glass-effect` (`GlassView` nativo del sistema con refracción óptica en tiempo real y borde especular).
  - **Modo A (Expo Go / Web):** Fallback automático a `expo-blur` (`BlurView` con `intensity={48}`) + tinte translúcido y borde interno especular de `1px`.
- **Modo Oscuro Primero (Dark Mode First) con Soporte Completo de Modo Claro:**
  - En modo oscuro el fondo base usa tonos abisales (`#060911` → `#0D1322`) con halos de luz ambiental sutiles para que las tarjetas Liquid Glass refracten profundidad real.

---

## 2. Convención Semántica de Colores y Estados

| Token Semántico | Uso en BFlow | Modo Oscuro (`dark`) | Modo Claro (`light`) |
| :--- | :--- | :--- | :--- |
| `semantic.income` | Ingresos (`Salario Principal`, `Prima`) y variaciones positivas | `#30D158` (Apple Emerald) | `#1E8E3E` |
| `semantic.expense` | Gastos ejecutados y salidas de caja | `#FF6961` (Apple Coral) | `#D93025` |
| `semantic.completed` | Estado `Pagado` / `Recibido` (`status === 'completed'`) | `#30D158` | `#1E8E3E` |
| `semantic.pending` | Estado `Pendiente` (`status === 'pending'`) | `#FFD60A` (Apple Amber) | `#B06000` |
| `semantic.debt` | Deuda FUNFAMI (`CB300F - MOTO`, `ESP. IA`) | `#FF9F0A` (Apple Orange) | `#C25E00` |
| `semantic.moto` | Fondo `Moto` y Provisión `IDEAL` Moto | `#64D2FF` (Apple Cyan) | `#0071E3` |
| `semantic.savings` | Fondo `Ahorros` y Flujo Neto positivo | `#5E5CE6` (Apple Indigo) | `#3634A3` |

---

## 3. Jerarquía Tipográfica (SF Pro / System Font + Dynamic Type)

Todos los componentes tipográficos respetan `allowFontScaling` y usan `fontVariant: ['tabular-nums']` en cifras monetarias para que las columnas y animaciones numéricas nunca bailen horizontalmente:

| Variante | Tamaño (`pt`) | Line Height (`pt`) | Peso | Uso |
| :--- | ---: | ---: | :--- | :--- |
| `heroCurrency` | `36` | `42` | `700` (Bold) | Flujo Neto (`$ 1.080.000`), Total Ahorros (`$ 4.380.000`), Total Deuda (`$ 6.200.000`) |
| `title1` | `28` | `34` | `700` (Bold) | Título de pantalla (`Octubre 2026`, `Deuda FUNFAMI`) |
| `title2` | `22` | `28` | `600` (Semibold) | Títulos de sección (`Ingresos Fijos`, `Gastos Fijos`, `Moto Ideal`) |
| `headline` | `17` | `22` | `600` (Semibold) | Nombre de concepto en el checklist y montos de tarjeta |
| `body` | `15` | `20` | `400` (Regular) | Descripciones, notas y subtítulos |
| `caption` | `13` | `18` | `500` (Medium) | Etiquetas de estado (`Pagado 21 oct`, `6 de 12 completados`, badges) |
| `micro` | `11` | `14` | `600` (Semibold) | Píldoras de metadatos (`→ Fondo Moto`, `Múltiple/mes`) |

---

## 4. Espaciado, Radios y Accesibilidad (`44pt` Mínimo)

- **Escala de espaciado (`spacing`):** `xs: 4`, `sm: 8`, `md: 12`, `lg: 16`, `xl: 24`, `xxl: 32`, `xxxl: 44`.
- **Radios de borde (`radius`):** `sm: 10`, `md: 16`, `lg: 22`, `xl: 28` (curva continua estilo `borderCurve: 'continuous'` de iOS), `pill: 999`.
- **Regla de Accesibilidad Táctil:** `MIN_TOUCH_TARGET_PT = 44`. Todo checkbox, botón de mes o ítem interactivo tiene al menos `minHeight: 44` y `minWidth: 44` (o `hitSlop` compensatorio).

---

## 5. Física de Animaciones (60 / 120 fps ProMotion) y Haptics

- **Spring estándar (`springConfigs.snappy`):** `{ damping: 18, stiffness: 240, mass: 0.9 }` para micro-interacciones de checkbox.
- **Spring suave (`springConfigs.gentle`):** `{ damping: 22, stiffness: 160, mass: 1 }` para entrada de tarjetas y gráficas.
- **Haptics:**
  - Marcar concepto como completado → `Haptics.notificationAsync(NotificationFeedbackType.Success)`
  - Desmarcar concepto o cambiar de mes → `Haptics.impactAsync(ImpactFeedbackStyle.Light)`
- **Reduce Motion:** Si el usuario activa *Reducir movimiento* en iOS (`useReducedMotion()`), las transiciones de escala/resorte se reemplazan por `withTiming(..., { duration: 120 })`.
