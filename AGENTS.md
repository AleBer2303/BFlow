# Reglas del Proyecto BFlow (`AGENTS.md`)

> **REGLA SUPREMA:** El archivo `docs/reference/Control_Ingresos_y_gastos_mensuales.xlsx` (hoja `"Octubre 2026"`) y el fixture derivado `fixtures/october-2026.json` son la **FUENTE DE VERDAD** de la lógica de negocio y de los valores dorados. Ningún agente puede inventar datos, conceptos, fórmulas ni reglas que contradigan el Excel o que no estén explícitamente documentados en `docs/decisions/`.

---

## 1. Idioma y Convenciones de Código

- **Comunicación y documentación:** Español claro y conciso (comentarios explicativos, ADRs, commits descriptivos, respuestas al usuario).
- **Código fuente, identificadores y claves de datos:** **100% en inglés** (`Concept`, `MonthEntry`, `plannedAmount`, `actualAmount`, `monthKey`, `allowMultiplePerMonth`).
- **Dinero (Regla de Hierro):**
  - SIEMPRE enteros en pesos colombianos (`COP`) validados con `Number.isSafeInteger()`.
  - Prohibido usar decimales o `float` para almacenar o sumar saldos monetarios.
  - Divisiones de provisiones usan `Math.ceil(amount / periodMonths)` en pesos enteros.
  - Formateo visual siempre mediante `formatCop(amount)` (`"$ 1.080.000"`).
- **Zona Horaria:** `monthKey` (`"YYYY-MM"`) siempre se resuelve en la zona horaria **`America/Bogota` (`UTC-05:00`)**.

---

## 2. Arquitectura y Separación de Capas (Doble Modo)

```text
src/
├── domain/          # Funciones 100% puras (TS estricto, CERO imports de React/RN/Firebase/Expo)
├── data/            # Repositorios Firestore JS SDK, mappers Zod y seeds idempotentes
├── platform/        # Adaptadores Modo A (Expo Go / Web) vs Modo B (Build nativo .ipa iOS 26)
├── design-system/   # Tokens, tipografía SF Pro, <GlassSurface />, componentes base (DESIGN.md)
├── features/        # Módulos por dominio funcional (budget, checklist, debts, savings, moto-ideal)
└── app/             # Rutas de Expo Router (pantallas delgadas que orquestan features)
```

- **Modo A (Expo Go / Web):** Todo el desarrollo diario en Windows 11 corre en Expo Go y navegador web sin romperse. Ningún archivo fuera de `src/platform/**/*.native.ts` puede importar módulos nativos exclusivos de Modo B (`@react-native-google-signin/google-signin`, `expo-glass-effect`, bridges de WidgetKit/ActivityKit).
- **Modo B (`.ipa` nativo desde GitHub Actions + `iloader`):** Activa Widgets, Live Activity (Isla Dinámica), Google Sign-In nativo y Liquid Glass nativo de iOS 26.
- **Límite de App IDs (Cuenta Apple Gratuita):** Todos los widgets y la Live Activity viven dentro de **UN ÚNICO target de extensión (`targets/widgets`)** para consumir máximo **2 App IDs** en total (`app` + `widgets`).

---

## 3. Roles del Equipo de Agentes

En cada tarea o cambio, opera coordinando estos 5 roles:

1. **Architect (`Architect`):** Valida contratos de dominio en `src/domain/`, invariantes contables del Excel, consumo de lecturas/escrituras en Firestore Spark y aislamiento Modo A / Modo B.
2. **UI Builder (`UI Builder`):** Traduce pantallas de Google Stitch / `DESIGN.md` a componentes React Native con estética Apple Liquid Glass (iOS 26), soporte Dynamic Type, modo oscuro, áreas táctiles mínimas de `44pt`, haptics y animaciones a 60/120 fps.
3. **QA Engineer (`QA Engineer` — OBLIGATORIO tras cada cambio):** Ejecuta y amplía la pirámide de tests (unitarios de dominio, golden tests del Excel, componentes con RNTL, reglas de Firestore en emulador, contratos de `WidgetSnapshot`). **Tiene poder de veto si falta cobertura o un test falla.**
4. **DevOps (`DevOps`):** Mantiene los workflows de GitHub Actions (`ci.yml`, `build-ios.yml`, `e2e.yml`), optimizando minutos de macOS y generando el `.ipa` sin firmar listo para `iloader`.
5. **Reviewer (`Reviewer`):** Verifica cumplimiento de `AGENTS.md`, ausencia de valores hardcodeados de diseño, ausencia de secretos en el repositorio y paridad con el Excel.

---

## 4. Definición de "Terminado" (Definition of Done — Regla Dura)

Ningún cambio, feature o corrección se considera terminado si no cumple **TODOS** estos puntos:
1. `npm run typecheck` (`tsc --noEmit`) pasa con **0 errores**.
2. `npm run lint` pasa con **0 errores**.
3. **Todo cambio en `src/` incluye tests nuevos o actualizados** que cubran los casos felices y bordes.
4. `npm test` pasa al 100%, incluyendo los **Golden Tests de Octubre 2026** (`fixtures/october-2026.json`) y cobertura en `src/domain/` **≥ 80%**.
5. La funcionalidad opera sin errores tanto en **Modo A (Expo Go / Web)** como en el contrato tipado de **Modo B (`.ipa`)**.
