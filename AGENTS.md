# Reglas del Proyecto BFlow (`AGENTS.md`)

## 1. Idioma y Convenciones de Código

- **Comunicación y documentación:** Español claro y conciso (comentarios explicativos, ADRs, commits descriptivos, respuestas al usuario).
- **Código fuente, identificadores y claves de datos:** **100% en inglés** (`Concept`, `MonthEntry`, `plannedAmount`, `actualAmount`, `monthKey`, `allowMultiplePerMonth`).
- **Dinero (Regla de Hierro):**
  - SIEMPRE enteros en con simbolo de dinero ($) validados con `Number.isSafeInteger()`.
  - Prohibido usar decimales o `float` para almacenar o sumar saldos monetarios.
  - Divisiones de provisiones usan `Math.ceil(amount / periodMonths)` en enteros.
  - Formateo visual estricto mediante `formatCop(amount)` determinístico (`"$ 1.080.000"`).
- **Zona Horaria:** `monthKey` (`"YYYY-MM"`) y fechas de registro (`"YYYY-MM-DD"`) siempre se resuelven en la zona horaria **`America/Bogota` (`UTC-05:00`)**.

---

## 2. Arquitectura y Separación de Capas (Doble Modo)

```text
src/
├── domain/          # Funciones 100% puras (TS estricto, CERO imports de React/RN/Firebase/Expo)
├── data/            # Repositorios Firestore JS SDK, mappers Zod y seeds idempotentes
├── platform/        # Adaptadores Modo A (Expo Go / Web) vs Modo B (Build nativo .ipa iOS 26)
├── design-system/   # Tokens, tipografía SF Pro, <GlassSurface />, componentes base (DESIGN.md)
├── features/        # Módulos por dominio funcional (budget, checklist, debts, savings, analytics, onboarding, auth)
└── app/             # Rutas de Expo Router (pantallas delgadas que orquestan features)
```

- **Modo A (Expo Go / Web):** Todo el desarrollo diario en Windows 11 corre en Expo Go y navegador web sin romperse. Ningún archivo fuera de `src/platform/**/*.native.ts` puede importar módulos nativos exclusivos de Modo B (`expo-glass-effect`, bridges de WidgetKit).
- **Modo B (`.ipa` nativo desde GitHub Actions + `iloader`):** Activa Widgets de WidgetKit y Liquid Glass nativo de iOS 26.
- **Límite de App IDs (Cuenta Apple Gratuita):** Todos los widgets y la Live Activity viven dentro de **UN ÚNICO target de extensión (`targets/widgets`)** para consumir máximo **2 App IDs** en total (`app` + `widgets`).

---

## 3. Roles del Equipo de Agentes

En cada tarea o cambio, opera coordinando estos 6 roles:

1. **Architect (`Architect`):** Valida contratos de dominio en `src/domain/`, invariantes contables del Excel, consumo de lecturas/escrituras en Firestore Spark y aislamiento Modo A / Modo B.
2. **UI Builder (`UI Builder`):** Traduce pantallas de `DESIGN.md` a componentes React Native con estética Apple Liquid Glass (iOS 26), soporte Dynamic Type, modo oscuro y claro, áreas táctiles mínimas de `44pt`, haptics perfectamente calibrados y animaciones a 60/120 fps.
3. **QA Engineer (`QA Engineer` — OBLIGATORIO tras cada cambio):** Ejecuta y amplía la pirámide de tests (unitarios de dominio, golden tests del Excel, componentes con RNTL, reglas de Firestore en emulador, contratos de `WidgetSnapshot`). **Tiene poder de veto si falta cobertura o un test falla.**
4. **DevOps (`DevOps`):** Mantiene los workflows de GitHub Actions (`ci.yml`, `build-ios.yml`, `e2e.yml`), optimizando minutos de runners macOS/Linux y empaquetando el `.ipa` sin firmar listo para `iloader`.
5. **Reviewer (`Reviewer`):** Verifica cumplimiento de `AGENTS.md`, ausencia de valores hardcodeados de diseño, ausencia de secretos en el repositorio y paridad con el Excel.
6. **Documentation Expert (`Documentation Expert`):** Vela por la sincronización en tiempo real entre código y documentación, aplicando estándares Docs-as-Code, marco Diátaxis y registro riguroso de decisiones técnicas (ADRs).

---

## 4. Definición de "Terminado" (Definition of Done — Regla Dura)

Ningún cambio, feature o corrección se considera terminado si no cumple **TODOS** estos puntos:
1. `npm run typecheck` (`tsc --noEmit`) pasa con **0 errores**.
2. `npm run lint` (`node scripts/lint-check.mjs`) pasa con **0 errores**.
3. **Todo cambio en `src/` incluye tests nuevos o actualizados** que cubran los casos felices y bordes (`node scripts/check-src-tests-guard.mjs`).
4. `npm test` pasa al 100%, manteniendo la cobertura en `src/domain/` **≥ 90%** (sentencias y líneas).
5. La funcionalidad opera sin errores tanto en **Modo A (Expo Go / Web)** como en el contrato tipado de **Modo B (`.ipa`)**.
6. **Toda modificación arquitectónica, de esquema o funcional actualiza su documentación asociada** (ver Sección 5).

---

## 5. Protocolo Estricto de Documentación (Docs as Code & Diátaxis)

La documentación en BFlow es tratada con el mismo nivel de exigencia, revisión y versionado que el código fuente ejecutable:

### 5.1. Clasificación Diátaxis Obligatoria
Todo documento técnico generado o modificado debe encajar en una de las cuatro tipologías del marco Diátaxis:
- **Tutorial (Aprendizaje):** Guías paso a paso para que un desarrollador nuevo pase de cero a un entorno funcional en Windows 11 / Expo Go / iloader.
- **How-To Guide (Tareas):** Instrucciones orientadas a objetivos concretos (ej. "Cómo firmar un Release con iloader", "Cómo agregar un nuevo concepto con persistencia en Firestore").
- **Reference (Información Estructurada):** Esquemas de datos Firestore, tokens de `DESIGN.md`, contratos `WidgetSnapshotV1`, tablas de variables de entorno y catálogo semilla.
- **Explanation (Comprensión y Razonamiento):** Registros de Decisión de Arquitectura (`docs/decisions/` ADRs) y justificaciones de diseño contable.

### 5.2. Criterios Obligatorios para Redactar un Nuevo ADR (`docs/decisions/`)
Es mandatorio crear un archivo ADR numerado (`docs/decisions/NNNN-<slug>.md`) antes de realizar un cambio si se cumple cualquiera de las siguientes condiciones:
1. Introducción, actualización mayor o sustitución de una librería externa o módulo nativo.
2. Modificación en la estructura de colecciones, reglas de seguridad o indexación en Cloud Firestore.
3. Alteración o extensión de fórmulas de negocio, criterios contables o políticas de provisiones/deudas.
4. Cambios en la arquitectura de targets nativos de iOS (`targets/widgets`), App Groups o integración de ActivityKit.
5. Cambios en la tubería de empaquetado o distribución (`build-ios.yml`, certificados, runners).

### 5.3. Sincronización Mandatoria Código-Documentación
- Si se alteran variables de entorno o dependencias: Actualizar `.env.example`, `package.json` y la sección de instalación en `README.md`.
- Si se alteran componentes o tokens visuales: Actualizar `DESIGN.md` con los tokens y ratios de contraste correspondientes.
- Si se agregan rutas o vistas en `src/app/` o `src/features/`: Actualizar el mapa arquitectónico de `README.md`.
- Si se optimizan consultas o estado: Registrar la evidencia antes/después en `PERF_BASELINE.md`.

### 5.4. Prohibición de Suposiciones y Regla de Evidencia
- Prohibido asentar métricas de rendimiento, compatibilidad de Expo SDK o tiempos de compilación sin haberlos medido o validado con el entorno real o documentación oficial vigente.
- Todo bloque de código o comando presente en la documentación debe ser ejecutable y probado en Windows 11 Powershell / bash.

---

## 6. Políticas de Calidad Multiplataforma para Producción (Mobile / Web)

1. **Paridad de Plataformas:** La aplicación debe compilar y renderizar limpiamente en iOS, Web (React Native Web) y prepararse para Android sin dependencias exclusivas sin fallback.
2. **Resiliencia de Red y Modo Offline:** Todas las escrituras en Firestore deben disponer de rollback optimista y mensajes amigables ante fallos de conexión.
3. **Consumo Eficiente en Capa Gratuita (Spark & GitHub Actions):** Las consultas de Firestore deben acotarse estrictamente por `monthKey` o ID para nunca disparar lecturas masivas descontroladas. Los workflows de GitHub Actions deben aprovechar caché de dependencias y CocoaPods.
