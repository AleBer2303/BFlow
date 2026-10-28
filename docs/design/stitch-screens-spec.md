# Integración con Google Stitch y Especificación de las 12 Pantallas (`stitch-screens-spec.md`)

Este documento cubre:
1. **Configuración paso a paso del servidor MCP de Google Stitch en Antigravity (Windows 11)** sin exponer la API key en el repositorio.
2. **Flujo alternativo (`docs/design/`)** si el servidor MCP no está disponible.
3. **Lista detallada de las 12 pantallas a diseñar en Google Stitch**, con su contenido exacto y estados basados en tus **datos reales de Octubre 2026**.

---

## 1. Configuración del Servidor MCP de Stitch en Antigravity (Windows 11)

En Antigravity, los servidores MCP globales (que contienen credenciales privadas como tu `STITCH_API_KEY` y por tanto **nunca** deben subirse a Git) se registran en:
`C:\Users\D0604763\.gemini\config\mcp_config.json`

### Paso a paso en Windows (PowerShell):

1. **Obtén tu API Key de Stitch:**
   - Entra a [https://stitch.withgoogle.com](https://stitch.withgoogle.com).
   - Haz clic en tu avatar → **Stitch Settings** → **API Keys** → **Create key** y cópiala.

2. **Registra el servidor MCP en `~/.gemini/config/mcp_config.json` (fuera del repositorio):**
   Ejecuta en PowerShell (reemplazando `TU_STITCH_API_KEY` y opcionalmente `TU_GCP_PROJECT_ID`):
   ```powershell
   $mcpConfigPath = "$HOME\.gemini\config\mcp_config.json"
   New-Item -ItemType Directory -Force -Path (Split-Path $mcpConfigPath) | Out-Null
   @"
   {
     "mcpServers": {
       "stitch": {
         "command": "npx.cmd",
         "args": ["-y", "stitch-mcp"],
         "env": {
           "STITCH_API_KEY": "TU_STITCH_API_KEY"
         }
       }
     }
   }
   "@ | Set-Content -Path $mcpConfigPath -Encoding UTF8
   ```
   *(Nota en Windows 11: usar `"npx.cmd"` en lugar de `"npx"` evita errores de resolución de procesos `spawn ENOENT` en servidores MCP stdio sobre Windows).*

3. **Verifica la conexión en Antigravity:**
   - En el panel de Antigravity ve a **Additional Options (`...`) > MCP Servers** y verifica que `stitch` aparezca conectado, o pídelo en el chat: *"Lista mis proyectos de Stitch"*.

### Flujo Alternativo si el MCP falla (`docs/design/`)
Si en algún momento el servidor MCP no responde o prefieres exportar manualmente desde Stitch:
- Exporta la captura (`.png`) y el código HTML/Tailwind de referencia de cada pantalla a:
  `docs/design/<numero-nombre-pantalla>/` (ej. `docs/design/02-monthly-summary/mockup.png` y `index.html`).
- El skill `stitch-to-code` leerá automáticamente esa carpeta, actualizará `DESIGN.md` y generará los componentes React Native.

---

## 2. Guía de las 12 Pantallas para Diseñar en Google Stitch (Datos Reales de Octubre 2026)

> **Prompt base de estilo sugerido en Stitch:**
> *"iOS 26 native personal finance app optimized for iPhone 16 Pro Max (440x956 pt), Apple Human Interface Guidelines, Liquid Glass translucent cards with subtle specular borders, SF Pro Display / SF Pro Rounded typography, dark mode first with vibrant emerald for income/completed, amber for pending, coral red for expenses/debt, generous whitespace, 44pt minimum touch targets."*

---

### Pantalla 1: `01-auth` — Autenticación (Login / Registro / Recuperación)
- **Objetivo:** Acceso minimalista con estética Liquid Glass.
- **Contenido a mostrar:**
  - Logo e ícono de **BFlow** + subtítulo *"Tu flujo mensual, claro al peso"*.
  - Tarjeta central en Liquid Glass con:
    - Campo `Correo electrónico` y `Contraseña`.
    - Botón primario: `"Iniciar sesión"` y enlace `"¿Olvidaste tu contraseña?"`.
    - Divisor sutil `"o continúa con"`.
    - Botón nativo estilo Apple/Google: `"Continuar con Google"`.
    - Switch inferior entre `"Iniciar sesión"` y `"Crear cuenta"`.
- **Estados a incluir en el diseño:**
  1. Estado por defecto (Login).
  2. Estado cargando (`loading` en botón).
  3. Estado de error de credenciales (banner glass rojo suave).

---

### Pantalla 2: `02-monthly-summary` — Resumen Mensual (Dashboard Principal)
- **Objetivo:** Vista ejecutiva en un vistazo del estado de Octubre 2026 y completado de 1 toque.
- **Contenido real (Octubre 2026) a mostrar:**
  - **Header con Selector de Mes:** `< Octubre 2026 >` + badge `"Abierto"` + botón rápido `+` (Agregar movimiento).
  - **Hero Card (Liquid Glass Principal — Flujo Neto):**
    - **Flujo Neto (En caja hoy):** **`$ 1.080.000`** (`Recibido $ 4.000.000 − Pagado $ 2.920.000`).
    - Sub-píldora informativa: **Flujo Proyectado del Mes:** **`$ 2.630.000`** (`Previsto $ 6.000.000 − Previsto $ 3.370.000`).
  - **Grid de 2 Tarjetas (Ingresos vs Gastos):**
    - **Tarjeta Ingresos:** Recibidos **`$ 4.000.000`** / Previstos **`$ 6.000.000`** (Pendiente: `$ 2.000.000` Prima).
    - **Tarjeta Gastos:** Pagados **`$ 2.920.000`** / Previstos **`$ 3.370.000`** (Pendientes: **`$ 450.000`**).
  - **Tarjeta de Progreso del Checklist Mensual:**
    - Barra circular o lineal con brillo: **`6 de 12 completados (50%)`**.
  - **Sección "Próximos Pendientes" (con checkbox de 1 toque):**
    - `Prima` (Ingreso Fijo) — **`+ $ 2.000.000`** [Pendiente]
    - `Seguro TR SURA` (Gasto Fijo) — **`- $ 130.000`** [Pendiente]
    - `Plan de datos y baño kabir` (Gasto Fijo) — **`- $ 100.000`** [Pendiente]
    - `ETB O Alexandra` (Gasto Fijo) — **`- $ 100.000`** [Pendiente]
    - `Smart Fit` (Gasto Variable) — **`- $ 100.000`** [Pendiente]
    - `Gemini Pro` (Gasto Fijo) — **`- $ 20.000`** [Pendiente]
- **Estados:** Mes en progreso (`6/12`), y estado vacío celebratorio **`"✨ Mes completo (12/12)"`**.

---

### Pantalla 3: `03-monthly-checklist` — Checklist del Mes
- **Objetivo:** Reemplazo directo e interactivo de las tablas de Ingresos y Gastos del Excel.
- **Contenido real (Octubre 2026) a mostrar:**
  - Filtro segmentado estilo iOS (`Todos` | `Pendientes (6)` | `Completados (6)`).
  - **Sección 1: INGRESOS** (Recibido `$ 4.000.000` / Previsto `$ 6.000.000`)
    - *Subgrupo Ingresos Fijos:*
      - ✅ `Salario Principal` — **`$ 4.000.000`** · `Recibido el 21 oct`
      - ⬜ `Prima` — **`$ 2.000.000`** · `Pendiente`
    - *Subgrupo Ingresos Variables:*
      - Botón / fila `+ Otros Ingresos Variables ($ 0 registrados este mes)`
  - **Sección 2: GASTOS** (Pagado `$ 2.920.000` / Previsto `$ 3.370.000` · Pendiente `$ 450.000`)
    - *Subgrupo Gastos Fijos (Pagado `$ 2.620.000` / Previsto `$ 2.970.000` · Pendiente `$ 350.000`):*
      - ✅ `CB300F` — **`$ 500.000`** · `Pagado 21 oct` · Badge `→ Fondo Moto`
      - ✅ `Cuota FUNFAMI` — **`$ 1.800.000`** · `Pagado 27 oct` · Badge `→ Deuda FUNFAMI`
      - ⬜ `Plan de datos y baño kabir` — **`$ 100.000`** · `Pendiente`
      - ⬜ `Seguro TR SURA` — **`$ 130.000`** · `Pendiente`
      - ⬜ `ETB O Alexandra` — **`$ 100.000`** · `Pendiente`
      - ✅ `Parqueadero CEM` — **`$ 120.000`** · `Pagado 21 oct`
      - ✅ `Gasolina Moto/Carro` — **`$ 200.000`** · `Pagado 21 oct` · Badge `→ Fondo Moto`
      - ⬜ `Gemini Pro` — **`$ 20.000`** · `Pendiente`
    - *Subgrupo Gastos Variables (Pagado `$ 300.000` / Previsto `$ 400.000` · Pendiente `$ 100.000`):*
      - ✅ `Tarjeta Nu` — **`$ 300.000`** · `Pagado 21 oct`
      - ⬜ `Smart Fit` — **`$ 100.000`** · `Pendiente`
      - `+ Otro` (`$ 0` — permite múltiples en el mes)

---

### Pantalla 4: `04-add-movement-modal` — Hoja Modal "Agregar / Completar Movimiento"
- **Objetivo:** Bottom sheet con efecto Liquid Glass que aplica la regla de conceptos disponibles (`getAvailableConcepts`).
- **Contenido real (Octubre 2026) a mostrar:**
  - Selector superior: `Gasto` | `Ingreso`.
  - **Selector de Concepto (SOLO muestra los disponibles en Octubre 2026):**
    - Si está en `Gasto`: muestra `Plan de datos y baño kabir ($100.000)`, `Seguro TR SURA ($130.000)`, `ETB O Alexandra ($100.000)`, `Gemini Pro ($20.000)`, `Smart Fit ($100.000)` y `Otro (Múltiple)`. *(Nota: `CB300F`, `Cuota FUNFAMI`, `Parqueadero CEM`, `Gasolina` y `Tarjeta Nu` NO aparecen porque ya están completados en octubre).*
  - **Input de Monto en COP:** Teclado numérico grande con formateo en vivo `"$ 130.000"` (precargado con el monto sugerido del concepto, con chip `"Previsto: $ 130.000"`).
  - **Fecha:** Selector compacto (`Hoy, 28 oct 2026`).
  - **Observaciones:** Campo opcional de nota.
  - **Sub-bloque condicional (cuando el concepto es `Cuota FUNFAMI`):**
    - Reparto de la cuota (`$ 1.800.000`) entre `CB300F - MOTO` y `ESP. IA`.
  - **CTA:** Botón primario `"Marcar como Pagado"`.

---

### Pantalla 5: `05-charts-analytics` — Gráficos y Analítica Visual
- **Objetivo:** Visualización interactiva con animaciones de entrada y tooltips al tocar.
- **Contenido real a mostrar:**
  1. **Pagado vs Pendiente (Octubre 2026):** Barra/anillo mostrando Pagado `$ 2.920.000 (86,6%)` vs Pendiente `$ 450.000 (13,4%)`.
  2. **Distribución de Gastos por Concepto (Dona interactiva):** Centro con `$ 3.370.000`, segmentos encabezados por `Cuota FUNFAMI ($1.800.000 - 53,4%)`, `CB300F ($500.000 - 14,8%)`, `Tarjeta Nu ($300.000 - 8,9%)`, `Gasolina ($200.000 - 5,9%)`, etc.
  3. **Flujo de Efectivo Mensual Detallado:** Barras comparando Ingresos Recibidos (`$4.000.000`), Gastos Pagados (`$2.920.000`), Gastos Pendientes (`$450.000`) y Flujo Neto (`$1.080.000`).
  4. **Previsto vs Real e Histórico Mes a Mes (Línea/Área):** Evolución de balance mensual y comparativa mes actual vs mes anterior.

---

### Pantalla 6: `06-month-history` — Historial Mes a Mes
- **Objetivo:** Reemplazar las múltiples pestañas mensuales del libro de Excel.
- **Contenido a mostrar:**
  - Lista cronológica de tarjetas por mes (`Octubre 2026 — En curso`, `Septiembre 2026 — Cerrado`, etc.).
  - Cada tarjeta muestra: `Flujo Neto ($ 1.080.000)`, `Ingresos ($ 4.000.000)`, `Gastos ($ 2.920.000)`, `Checklist (6/12)` y estado (`Abierto` / `Cerrado`).
  - Vista de detalle al tocar un mes con opción de editar o eliminar movimientos individuales.

---

### Pantalla 7: `07-debt-funfami` — Control de Deuda FUNFAMI
- **Objetivo:** Seguimiento exacto de las dos obligaciones con FUNFAMI y su proyección de libertad financiera.
- **Contenido real (Octubre 2026) a mostrar:**
  - **Hero Card Total Deuda FUNFAMI:**
    - Saldo actual: **`$ 6.200.000`** (Saldo inicial oct: `$ 8.000.000` − Cuota pagada el 27 oct: **`$ 1.800.000`**).
    - Barra de progreso de desendeudamiento (`22,5% reducido este mes`).
    - Proyección estimada de cierre según cuota de `$ 1.800.000/mes` (~4 meses restantes: **Febrero 2027**).
  - **Tarjetas individuales de Deuda:**
    1. **`CB300F - MOTO`:** Saldo apertura mes `$ 4.400.000` · Abono aplicado del mes · Saldo restante.
    2. **`ESP. IA`:** Saldo apertura mes `$ 3.600.000` · Abono aplicado del mes · Saldo restante.
  - **Gráfico de Evolución de Deuda + Historial de Cuotas** con el reparto aplicado en cada mes.

---

### Pantalla 8: `08-savings-and-moto` — Control de Ahorros y Moto
- **Objetivo:** Mostrar la posición de ahorro acumulada real y proyectada.
- **Contenido real (Octubre 2026) a mostrar:**
  - **Hero Card Total Ahorros (`K6`):** **`$ 4.380.000`** (`Moto $ 2.300.000 + Ahorros $ 2.080.000`).
  - **Tarjeta 1: Fondo `Moto` (`K4`):**
    - **Moto - Ahora:** **`$ 2.300.000`**
    - Desglose: `Mes pasado: $ 1.600.000` + `Aportes pagados oct: + $ 700.000` (`CB300F $ 500.000` + `Gasolina $ 200.000`).
  - **Tarjeta 2: Fondo `Ahorros` (`K5`):**
    - **Ahorros - Ahora (En caja):** **`$ 2.080.000`** (`Mes pasado $ 1.000.000` + `Flujo Neto $ 1.080.000`).
    - **Ahorros Proyectado tras Pendientes:** **`$ 1.630.000`** (`$ 2.080.000 − $ 450.000 pendientes por pagar`).
  - **Gráfico Apilado:** Evolución mensual `Moto` vs `Ahorros`.

---

### Pantalla 9: `09-moto-ideal` — Provisión "IDEAL" de la Moto (CB300F)
- **Objetivo:** Comparar lo que cuesta mantener la moto idealmente por mes frente a lo aportado realmente.
- **Contenido real (Octubre 2026) a mostrar:**
  - **Resumen Comparativo (Brecha):**
    - **Provisión Mensual Operativa Ideal (`B43`):** **`$ 872.667 / mes`** (`$ 872.666,67` en Excel).
    - **Total con Meta Kit de Arrastre:** **`$ 1.372.667`**.
    - **Aporte Real en Octubre al Fondo Moto:** **`$ 700.000`** (`CB300F $500k + Gasolina $200k`) → **Brecha operativa: `- $ 172.667`**.
  - **Lista de los 8 Ítems Recurrentes Mensuales:**
    1. `Parqueadero`: **`$ 210.000 / mes`** (vs. Real `Parqueadero CEM`: `$ 120.000`)
    2. `Gasolina`: **`$ 200.000 / mes`** (vs. Real `Gasolina Moto/Carro`: `$ 200.000`)
    3. `Mantenimiento`: **`$ 200.000 / mes`**
    4. `Llantas`: **`$ 83.333 / mes`** (`$ 1.000.000 / año`)
    5. `SOAT`: **`$ 66.667 / mes`** (`$ 800.000 / año`)
    6. `Cambio de aceite`: **`$ 50.000 / mes`**
    7. `Casco`: **`$ 41.667 / mes`** (`$ 500.000 / año`)
    8. `Impuesto`: **`$ 21.000 / mes`** (`$ 252.000 / año`)
  - **Tarjeta de Meta Puntual (`TargetGoal`):**
    - `Kit de arrastre Honda original`: Objetivo **`$ 500.000`** con barra de progreso y fecha meta.

---

### Pantalla 10: `10-concepts-catalog` — Gestión del Catálogo de Conceptos
- **Objetivo:** Crear, editar, reordenar y archivar conceptos sin tocar código.
- **Contenido real a mostrar:**
  - Tabs: `Ingresos (3)` | `Gastos (11)` | `Archivados (0)`.
  - Cada fila muestra ícono, nombre, grupo (`Fijo` / `Variable`), monto sugerido (`$ 4.000.000`, `$ 1.800.000`, etc.), badges (`Múltiple por mes`, `Recurrente mensual`, `Vínculo: FUNFAMI`, `Vínculo: Fondo Moto`) y handle de arrastrar para reordenar.

---

### Pantalla 11: `11-settings` — Ajustes y Diagnóstico Nativo
- **Objetivo:** Preferencias del usuario, exportación y estado de la firma de 7 días / Modo B.
- **Contenido a mostrar:**
  - **Tarjeta Estado de Firma iOS (`iloader` 7 días):** `"Firma activa · Vence en 6 días (Notificación programada)"` + Estado `Modo B (Widgets & Isla Dinámica activos)`.
  - **Preferencias:** Moneda (`COP - Peso Colombiano ($ 1.080.000)`), Tema (`Oscuro / Claro / Sistema`), Zona horaria (`America/Bogota`).
  - **Datos:** `"Exportar historial a CSV"`, `"Re-ejecutar Seed Octubre 2026 (Idempotente)"`.
  - **Cuenta:** `"Cerrar sesión"` y `"Eliminar cuenta y datos"` (con confirmación de seguridad).

---

### Pantalla 12: `12-month-close` — Cierre de Mes y Arrastre Automático
- **Objetivo:** Ritual de fin de mes que reemplaza copiar y pegar hojas en Excel.
- **Contenido real (Cierre de Octubre 2026 → Apertura de Noviembre 2026) a mostrar:**
  - **Advertencia si quedan pendientes:** `"Tienes 6 movimientos pendientes ($ 450.000 en gastos y $ 2.000.000 en ingresos). ¿Deseas cerrarlos como no ejecutados o completarlos antes?"`
  - **Resumen de Arrastre Automático a Noviembre 2026:**
    - `Deuda FUNFAMI` apertura Noviembre: **`$ 6.200.000`**
    - `Fondo Moto` apertura Noviembre: **`$ 2.300.000`**
    - `Fondo Ahorros` apertura Noviembre: **`$ 2.080.000`**
    - `Total Ahorros` apertura Noviembre: **`$ 4.380.000`**
  - **CTA Principal:** Botón Liquid Glass `"Confirmar Cierre de Octubre y Abrir Noviembre 2026"`.
