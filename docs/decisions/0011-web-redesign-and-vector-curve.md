# 0011. Rediseño de la piel Web y curva vectorial en lugar de three.js

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Aplica a la piel Web el marco del [ADR 0010](0010-platform-skins-and-responsive-layout.md). Acota a iOS y Android la escena del [ADR 0007](0007-three-js-monthly-overview-scene.md) y del [ADR 0008](0008-monthly-curve-replaces-tubes.md), que siguen vigentes en esas dos plataformas.
- **Autores:** Architect, UI Builder, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

En el navegador BFlow era la app de iPhone estirada: tarjetas de vidrio a 1.280 px de ancho, dock flotante y una gráfica limitada a 480 px. Se pidió rediseñar la Web por completo con la skill `.agents/skills/design-taste-frontend` y evaluar si conservar la gráfica de three.js.

La skill está escrita para sitios de empresa en HTML estático (una sección por pantalla, fotografías, scripts de comprobación sobre `main > section`). BFlow en Web es una aplicación React Native Web con sesión. Por eso se aplica **su sistema** (color, tipografía, radios, navegación, botones, movimiento y texto), no su estructura de página ni sus scripts de verificación, que no pueden leer una SPA de React Native Web.

## 2. Decisiones

### 2.1. Sistema repartido por la skill, no elegido a gusto

`node .agents/skills/design-taste-frontend/scripts/start.mjs deal --page software` (historial en `.taste-skill/history.json`) repartió tres paletas y tres parejas tipográficas. Se tomaron:

| Elemento | Valor | Motivo |
| :--- | :--- | :--- |
| Tipo de página | `software` (fintech) | App con cuentas; habilita modo oscuro. |
| Paleta | `putty-black-teal` | Neutro cálido cercano a la arena de BFlow; un solo acento petróleo `#256F82`. |
| Tipografía | `geist` (Geist, display 500) | «Fintech: exacto, simple y rápido». |
| Radios | `sharp` (4 / 6 / 8) | Recomendado para fintech. |
| Botones | `solid` | Un único botón relleno con el acento por vista. |

Reglas del sistema que quedan codificadas en tokens y cubiertas por tests:

- Interfaz 90–95 % neutra; líneas al 11 % y 20 % de la tinta; tarjeta = superficie, sin sombra.
- **Sin violeta ni lavanda:** `semantic.savings` pasa a rosa en Web (`#8A3A66` / `#E08FB8`). iOS y Android conservan su amatista.
- Texto de lectura a 16 px y nada por debajo de 13 px; mayúsculas solo de oración.
- Una sola familia de radios: en Web `radius.pill` vale 4 (botones y etiquetas son cajas, no cápsulas).
- Movimiento: 140 ms al entrar el puntero, 200 ms al salir, 90 ms al pulsar, sin rebote; nada se anima al hacer scroll. `prefers-reduced-motion` anula las transiciones.
- Anillo de foco de 2 px con el acento para teclado (`:focus-visible`).

### 2.2. Marco de la aplicación

- **Cabecera** opaca a todo el ancho, con línea inferior de 1 px, igual a cualquier profundidad de scroll: sin blur, transparencia, sombra ni píldora flotante. Marca a la izquierda sobre la línea de contenido; interruptor de tema a la derecha.
- **≥ 840 px:** las seis vistas como palabras en la cabecera; la actual lleva una barra de 2 px.
- **< 840 px:** las vistas pasan a una barra opaca al pie con línea superior de 1 px. Por debajo de 360 px muestra solo iconos (con nombre accesible), porque una etiqueta de 13 px no cabe en celdas de 53 px.
- **Columna** de 1.280 px centrada con márgenes de 24 / 48 / 80 px.
- **Composición de escritorio (columna ≥ 920 px):** Resumen con las tres cifras en una fila (6 / 3 / 3) y la curva como panel partido (tabla de métricas a la izquierda, gráfica a la derecha). Checklist, Deudas, Ahorros, Cierre y Cuenta colocan sus paneles en dos columnas. En teléfono todo vuelve a una columna.

### 2.3. Primera pantalla (inicio de sesión)

Cabecera más un héroe partido: a la izquierda el titular que nombra la categoría y para quién es («Presupuesto mensual para tus finanzas personales»), una frase de cómo funciona y un hecho; a la derecha el formulario, con «Entrar a mi presupuesto» como único botón relleno. Por debajo de 1.024 px el formulario se apila bajo el texto. No se inventan reseñas, cifras ni clientes.

### 2.4. La curva del mes: vectorial en Web, three.js en iOS y Android

**Se retira three.js de la piel Web** y se conserva en iOS y Android.

Evaluación:

| Criterio | three.js en Web | Curva vectorial (`react-native-svg`) |
| :--- | :--- | :--- |
| Encaje con el sistema Web | Brillo de neón, inclinación al arrastrar y latido en bucle: los tres los prohíbe el sistema («sin glow», «nada se inclina», «una gráfica se queda quieta») | Línea de 2 px, área plana al 10 %, líneas de cuadrícula finas |
| Peso | Chunk propio de **869.611 bytes (202.404 gzip)** | 0 bytes extra: `react-native-svg` ya está en el bundle por los iconos |
| Contextos WebGL | 1 | 0 |
| Nitidez al redimensionar | Lienzo rasterizado, antes limitado a 480 px | Vectorial a cualquier ancho (hasta 880 px en escritorio) |
| Ratón y teclado | Solo arrastre | Recorre el mes al pasar el puntero; flechas, Inicio, Fin y Escape |
| Lectores de pantalla | Lienzo oculto | Control `adjustable` que anuncia día y monto |

Medición con `npx expo export -p web` (9 de noviembre de 2026, Windows 11, Node v24.14.0): el JavaScript total era 792 KB gzip, de los que el chunk de three.js era el 25,5 %. Los otros chunks no contienen three.js (`grep -c WebGLRenderer` = 0).

Implementación:

- `MonthlyCurveVectorStage` dibuja con la **misma** geometría pura que la escena (`sampleCurveValue`, `curveXForDay`, `resolveCurveStop`), así que ambas curvas tienen la misma forma y coinciden con la lectura al peso.
- `MonthlyCurveSection` elige el escenario por la piel (`surfaceMaterial === 'flat'`), no por plataforma: la vista previa de las pieles iOS y Android en el navegador sigue cargando three.js bajo demanda, y la Web de producción nunca lo pide.
- `clampCurveStop` descarta una parada que ya no existe tras cambiar de mes (el puntero puede quedarse sobre la gráfica mientras cambian los datos).

## 3. Consecuencias

- La Web carga la tipografía Geist desde Google Fonts (`display=swap`). Si la petición falla se usa la fuente del sistema; nada bloquea el render. Es una dependencia de red nueva en tiempo de ejecución, no una dependencia de `package.json`.
- `three` y `expo-gl` siguen en `package.json` porque iOS y Android los usan.
- Las pruebas visuales de la skill (`consistency.mjs`, `check.mjs`, `perf.mjs`) no se ejecutaron: están hechas para HTML estático. La verificación fue: tests RNTL por piel, auditoría automática de desbordes, cifras partidas y objetivos táctiles a 320, 390, 600, 768, 1.024 y 1.440 px en las seis vistas, y revisión visual en el navegador.
- Las etiquetas en mayúsculas de la tarjeta de Cierre (`FLUJO NETO HOY`…) son texto compartido con iOS y Android y se mantienen; contradicen la regla de mayúsculas de oración solo en Web.
- La primera pantalla Web muestra texto y formulario, sin captura del producto: añadirla requiere una decisión de contenido.
