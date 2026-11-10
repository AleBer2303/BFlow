# Reglas del Proyecto BFlow (`AGENTS.md`)

## 1. Idioma y Convenciones de Código

- **Comunicación y documentación:** Español claro y conciso (comentarios explicativos, ADRs, commits descriptivos, respuestas al usuario).
- **Código fuente, identificadores y claves de datos:** **100% en inglés** (`Concept`, `MonthEntry`, `plannedAmount`, `actualAmount`, `monthKey`, `allowMultiplePerMonth`).
- **Dinero (Regla de Hierro):**
  - SIEMPRE enteros en con simbolo de dinero ($) validados con `Number.isSafeInteger()`.
  - Prohibido usar decimales o `float` para almacenar o sumar saldos monetarios.
  - Divisiones de provisiones usan `Math.ceil(amount / periodMonths)` en enteros.
  - Formateo visual estricto mediante `formatCurrency(amount)` determinístico (`"$ 1.080.000"`).
- **Zona Horaria:** `monthKey` (`"YYYY-MM"`) y fechas de registro (`"YYYY-MM-DD"`) siempre se resuelven en la zona horaria **`America/Bogota` (`UTC-05:00`)**.

---

## 2. Arquitectura y Separación de Capas (Doble Modo)

```text
src/
├── domain/          # Funciones 100% puras (TS estricto, CERO imports de React/RN/Firebase/Expo)
├── data/            # Repositorios Firestore JS SDK, mappers Zod y seeds idempotentes
├── platform/        # Adaptadores Modo A (Expo Go / Web) vs Modo B (Build nativo .ipa iOS 26), insets, sistema, modo vitrina
├── design-system/   # Tokens por piel (iOS / Android / Web), tema, layout responsive, componentes base (DESIGN.md)
├── features/        # Módulos por dominio funcional (budget, checklist, debts, savings, analytics, onboarding, auth, summary, shell)
└── app/             # Rutas de Expo Router (pantallas delgadas que orquestan features)
```

- **Tres plataformas, tres pieles:** iOS (Liquid Glass), Android (Material 3, sin vidrio) y Web (sistema plano). Mismos datos, flujos y tests; cambia el material. Reglas en la Sección 7.

- **Modo A (Expo Go / Web):** Todo el desarrollo diario en Windows 11 corre en Expo Go y navegador web sin romperse. Ningún archivo fuera de `src/platform/**/*.native.ts` puede importar módulos nativos exclusivos de Modo B (`expo-glass-effect`, bridges de WidgetKit).
- **Modo B (`.ipa` nativo desde GitHub Actions + `iloader`):** Activa Widgets de WidgetKit y Liquid Glass nativo de iOS 26.
- **Límite de App IDs (Cuenta Apple Gratuita):** Todos los widgets y la Live Activity viven dentro de **UN ÚNICO target de extensión (`targets/widgets`)** para consumir máximo **2 App IDs** en total (`app` + `widgets`).

---

## 3. Roles del Equipo de Agentes

En cada tarea o cambio, opera coordinando estos 6 roles:

1. **Architect (`Architect`):** Valida contratos de dominio en `src/domain/`, invariantes contables del Excel, consumo de lecturas/escrituras en Firestore Spark y aislamiento Modo A / Modo B.
2. **UI Builder (`UI Builder`):** Traduce pantallas de `DESIGN.md` a componentes React Native que se ven correctos en las tres pieles: Apple Liquid Glass (iOS 26), Material 3 (Android) y sistema plano (Web). Soporte Dynamic Type, modo oscuro y claro, layout responsive de 320 pt a escritorio, áreas táctiles mínimas de `44pt` (`48dp` en Android), haptics calibrados y animaciones a 60/120 fps.
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
7. **Todo cambio de interfaz funciona en las tres pieles (iOS, Android, Web) y en todos los anchos** (ver Sección 7): tests funcionales por piel en verde y revisión con `npm run web:demo`.

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
- Si se alteran componentes o tokens visuales: Actualizar `DESIGN.md` con los tokens y ratios de contraste correspondientes. Un token se define para **las tres pieles** (`DESIGN.md` §10) o no se añade.
- Si se alteran breakpoints, márgenes o columnas: Actualizar el contrato responsive de `DESIGN.md` §11.
- Si se agregan rutas o vistas en `src/app/` o `src/features/`: Actualizar el mapa arquitectónico de `README.md`.
- Si se optimizan consultas o estado: Registrar la evidencia antes/después en `PERF_BASELINE.md`.

### 5.4. Prohibición de Suposiciones y Regla de Evidencia
- Prohibido asentar métricas de rendimiento, compatibilidad de Expo SDK o tiempos de compilación sin haberlos medido o validado con el entorno real o documentación oficial vigente.
- Todo bloque de código o comando presente en la documentación debe ser ejecutable y probado en Windows 11 Powershell / bash.

---

## 6. Políticas de Calidad Multiplataforma para Producción (Mobile / Web)

1. **Paridad de Plataformas:** La aplicación debe compilar y renderizar limpiamente en iOS, Android y Web (React Native Web), sin dependencias exclusivas de una plataforma que no tengan fallback. La paridad es **funcional**, no visual: cada plataforma tiene su piel (Sección 7).
2. **Resiliencia de Red y Modo Offline:** Todas las escrituras en Firestore deben disponer de rollback optimista y mensajes amigables ante fallos de conexión.
3. **Consumo Eficiente en Capa Gratuita (Spark & GitHub Actions):** Las consultas de Firestore deben acotarse estrictamente por `monthKey` o ID para nunca disparar lecturas masivas descontroladas. Los workflows de GitHub Actions deben aprovechar caché de dependencias y CocoaPods.

---

## 7. Trabajo Multiplataforma: iOS · Android · Web (Regla Dura)

BFlow se entrega en tres plataformas con **una piel cada una**: iOS (Liquid Glass), Android (Material 3) y Web (sistema plano). Decisiones en los ADR [0010](docs/decisions/0010-platform-skins-and-responsive-layout.md) y [0011](docs/decisions/0011-web-redesign-and-vector-curve.md); tokens y contrato responsive en `DESIGN.md` §10 y §11; pasos de validación en [`docs/guides/multiplatform-validation-guide.md`](docs/guides/multiplatform-validation-guide.md).

### 7.1. Dónde vive la diferencia entre plataformas

1. **Las features no deciden aspecto por plataforma.** En `src/features/` y `src/app/` está prohibido elegir colores, radios, tipografía o tamaños con `Platform.OS` o con `skin`: salen de `useBFlowTheme()`, que ya entrega los de la piel activa. `Platform.OS` solo se admite para APIs del sistema (teclado, `LayoutAnimation`, hojas modales).
2. **Una composición distinta por piel es una excepción documentada**, no un recurso habitual. Hoy son tres: `WorkspaceShell` (marco y navegación), `AuthScreen` (héroe de la primera pantalla Web) y `MonthlyCurveSection` (escenario 3D o vectorial). Una cuarta requiere justificarla en el ADR o en `DESIGN.md` §10.
3. **La diferencia se encapsula** en `src/design-system/` y `src/platform/`: `GlassSurface` (material), `AppPressable` (respuesta al toque y objetivo táctil), `usePrimaryActionLook` (botón principal), `WorkspaceShell` y los componentes de `navigation/` (marco y navegación). Si una pantalla necesita un comportamiento distinto por piel, se añade ahí un componente o un token, no un `if` en la pantalla.
4. **Un token nuevo se define para las tres pieles** en `tokens.ts` y se documenta en `DESIGN.md` §10. No existen tokens de una sola plataforma.

### 7.2. Liquid Glass es solo de iOS

1. `expo-blur`, las superficies translúcidas, el borde especular, el lente y el dock flotante **no** aparecen en Android ni en Web. `npm run lint` rechaza cualquier import de `expo-blur` fuera de `GlassSurface` y `IosWheelPickerModal`, que lo condicionan a la piel iOS.
2. Las superficies se piden siempre con `<GlassSurface />`; nunca se construye una tarjeta a mano con `BlurView` o con un `rgba` translúcido.
3. La piel Web no usa violeta ni lavanda, ni texto por debajo de 13 px, ni animaciones con rebote o ligadas al scroll.

### 7.3. Interacción

1. Todo elemento interactivo de `src/features/` y `src/app/` es un `AppPressable` (o `TactilePressable`). `npm run lint` rechaza el `Pressable` de React Native en esas carpetas.
2. Objetivo táctil mínimo: 44 pt en iOS y Web, 48 dp en Android. Un control que declare menos lo compensa `AppPressable` (hit slop en nativo, crecimiento en Web); no se desactiva ni se sobrescribe.
3. Una vista tiene **una** acción principal, con `usePrimaryActionLook()`.

### 7.4. Responsive

1. Ancho mínimo soportado: **320**. Ninguna pantalla puede provocar scroll horizontal ni partir o truncar una cifra monetaria.
2. Prohibido leer `Dimensions.get('window')` o escribir anchos fijos de pantalla en features. El tamaño se obtiene de `useResponsiveLayout()` y los paneles se reparten con `ResponsiveColumns`.
3. El contenido vive dentro de `WorkspaceShell`, que centra y limita la columna; una pantalla no se posiciona contra la ventana.
4. Toda pantalla nueva o modificada se revisa en 320, 360, 390, 600, 840, 1.024 y 1.440 de ancho, en claro y oscuro.

### 7.5. Tests obligatorios por plataforma

1. Un cambio en una pantalla o en el marco añade o actualiza tests que la ejercitan en **las tres pieles** (`<BFlowThemeProvider skin="android">`, `skin="web"`; Jest corre como iOS por defecto). Referencia: `src/features/shell/__tests__/workspacePlatforms.test.tsx`.
2. Lo que dependa del ancho se prueba cambiando la ventana con `Dimensions.set(...)` en teléfono (390) y escritorio (1.440).
3. Los `testID` de navegación (`workspace-tab-<id>`) y de pantalla son idénticos en las tres pieles: un test funcional no debe conocer la plataforma.
4. Un token nuevo pasa el contrato de `src/design-system/__tests__/skinTokens.test.ts` (contraste AA, sin blur fuera de iOS, sin violeta en Web).

### 7.6. Validación manual y sus límites

1. `npm run web:demo` (modo vitrina, sin Firebase ni credenciales) y `?skin=ios|android|web` con `?theme=dark|light`.
2. `EXPO_PUBLIC_BFLOW_DEMO` no se define nunca en builds reales ni en workflows de publicación.
3. La vista previa en el navegador valida la piel, no el sistema. Ripple, insets de borde a borde, háptica y blur nativo se confirman en dispositivo o emulador. Si no se probó en dispositivo, **se dice explícitamente** en la entrega (Sección 5.4).

### 7.7. Cuándo hace falta un ADR

Además de la Sección 5.2: añadir o quitar una piel, cambiar el material o el patrón de navegación de una piel, cambiar los breakpoints o los topes de columna, y sustituir una visualización en una plataforma (como la curva vectorial de Web).
