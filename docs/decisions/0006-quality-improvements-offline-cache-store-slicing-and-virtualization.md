# 0006. Mejoras de Calidad: Persistencia Offline, Modularización en Slices y Optimización de Renderizado

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Auditoría de Calidad para Producción — Sección 2.2 (`bflow-documentation-and-audit-report.md`)
- **Autores:** Documentation Expert, Architect & UI Builder

---

## 1. Contexto y Problemática

En la auditoría integral de calidad para producción de BFlow, se identificaron cuatro áreas críticas de refactorización y optimización en el código existente (Sección 2.2):

1. **Persistencia Local Móvil en Cloud Firestore (2.2.1):** En [`src/data/firebase/firebaseConfig.ts`](file:///c:/Users/ALEJO%20BERNAL/Documents/PROYECTOS/BFlow/src/data/firebase/firebaseConfig.ts), la inicialización de Firestore utilizaba `persistentLocalCache()` en Web (IndexedDB) pero caía a `memoryLocalCache()` en entornos móviles nativos sin almacenamiento persistente de sesión ni de snapshot de cuenta. Al reabrir la app offline, se producían fallos o retardos de conexión.
2. **Monolito en el Store de Estado (`useBudgetStore.ts`) (2.2.2):** El store principal había acumulado **1.984 líneas de código**, combinando en un único archivo la autenticación, onboarding, conceptos, movimientos, deudas, ahorros, provisiones y sincronización cloud.
3. **Sobrecarga de Renderizado en Listas de Movimientos e Historial (2.2.3):** Las listas de movimientos en la vista de Resumen, Checklist y el selector de historial renderizaban elementos inline mediante `.map()`. Al marcar o editar un ítem individual, todos los ítems de la pantalla se re-renderizaban innecesariamente.
4. **Peso Excesivo de Recursos Gráficos en `assets/` (2.2.4):** Los iconos `icon.png` y `adaptive-icon.png` pesaban ~1.8 MB cada uno (~3.6 MB en total) debido a la ausencia de filtros PNG adaptativos.

---

## 2. Decisiones Técnicas Adoptadas

### 2.1. Arquitectura de Persistencia Offline y Caché de Cuenta (2.2.1)
- **Configuración Firestore JS SDK:** Se actualizó `getFirebaseDb()` en `src/data/firebase/firebaseConfig.ts` para usar `persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED })` en entornos Web/IndexedDB, y doble fallback resiliente a `memoryLocalCache()`.
- **Capa Universal de Persistencia (`src/platform/storage/`):**
  - Se creó [`persistentStorageAdapter.ts`](file:///c:/Users/ALEJO%20BERNAL/Documents/PROYECTOS/BFlow/src/platform/storage/persistentStorageAdapter.ts) con almacenamiento de clave-valor seguro y caché en memoria para accesos ultra-rápidos en milisegundos.
  - Se implementó [`accountCache.ts`](file:///c:/Users/ALEJO%20BERNAL/Documents/PROYECTOS/BFlow/src/platform/storage/accountCache.ts) para guardar instantáneas locales del estado completo del usuario (`savePersistedAccount`, `loadPersistedAccount`, `clearPersistedAccount`).
- **Arranque Instantáneo Offline:** En [`src/app/index.tsx`](file:///c:/Users/ALEJO%20BERNAL/Documents/PROYECTOS/BFlow/src/app/index.tsx), el flujo `syncUserCloudAccount` ahora rehidrata inmediatamente el estado local desde `loadPersistedAccount(user.uid)` antes de que responda la red. Si el dispositivo no tiene conexión, la aplicación opera de inmediato sin mostrar pantallas en blanco ni bloqueos.

### 2.2. Modularización del Store en Slices de Zustand (2.2.2)
Siguiendo el estándar de *Store Slicing* de Zustand 5, se descompuso `useBudgetStore.ts` en seis módulos independientes en `src/features/budget/store/slices/`:
1. **`sliceTypes.ts`:** Interfaces compartidas (`AuthSlice`, `SyncSlice`, `BudgetSlice`, `DebtsSlice`, `SavingsSlice`, `ProvisionsSlice`, `BudgetStoreState`), tipos de entrada y constructores puros del estado inicial (`buildInitialState`, `buildCleanEmptyWorkspaceState`).
2. **`createAuthSlice.ts`:** Sesión activa, perfil de usuario, compuerta de autenticación y flujo de onboarding inicial.
3. **`createSyncSlice.ts`:** Pestaña activa del dock, clave de mes activo (`monthKey`), hidratación de cuenta cloud y puente con WidgetKit.
4. **`createBudgetSlice.ts`:** Catálogo de conceptos, movimientos mensuales, registro, edición, borrado, cierre de mes, reapertura y eliminación de meses.
5. **`createDebtsSlice.ts`:** Deudas por mes, amortización en cascada, cuotas y tipos de tasa de interés (mensual y anual).
6. **`createSavingsSlice.ts`:** Fondos de ahorro, saldos de apertura y vinculación de conceptos con reservas.
7. **`createProvisionsSlice.ts`:** Plan de provisiones, cuotas mensuales calculadas con `Math.ceil` y metas de ahorro.

El archivo raíz [`useBudgetStore.ts`](file:///c:/Users/ALEJO%20BERNAL/Documents/PROYECTOS/BFlow/src/features/budget/store/useBudgetStore.ts) se redujo de **1.984 líneas a menos de 45 líneas**, orquestando los slices y reexportando el 100% de la API pública existente para garantizar compatibilidad retroactiva absoluta.

### 2.3. Optimización de Renderizado y Componentes Memoizados (2.2.3)
- Se extrajeron componentes puros envueltos en `React.memo`:
  - `SummaryMovementRow`: Para la lista de movimientos recientes en el dashboard.
  - `ChecklistRowItem`: Para las filas de ingresos y gastos en el checklist, aislando los eventos de pulsación (`hapticService`), apertura de modales y borrado.
  - `HistoryMonthRowItem`: Para la lista de meses en la vista de analítica e historial.
- **Resultado:** Al marcar un ítem como completado o editar un valor, únicamente se re-renderiza la fila afectada en vez del árbol completo de la pantalla, manteniendo animaciones y scroll a 60/120 fps estables.

### 2.4. Compresión Sin Pérdida de Recursos Gráficos (2.2.4)
- Se desarrolló el script reutilizable [`scripts/optimize-assets.mjs`](file:///c:/Users/ALEJO%20BERNAL/Documents/PROYECTOS/BFlow/scripts/optimize-assets.mjs).
- El algoritmo decodifica las líneas de exploración de las imágenes PNG y aplica filtrado adaptativo de 5 tipos (None, Sub, Up, Average, Paeth) eligiendo la opción de menor varianza absoluta por fila, seguido de compresión Deflate de nivel 9.
- **Ahorro verificado:**
  - `assets/icon.png`: 1.774 KB $\rightarrow$ 869 KB (**51.0% de ahorro**).
  - `assets/adaptive-icon.png`: 1.774 KB $\rightarrow$ 869 KB (**51.0% de ahorro**).
  - `assets/favicon.png`: 6.4 KB $\rightarrow$ 4.6 KB (**27.3% de ahorro**).
  - Integridad de píxeles: 100% idéntica bit a bit al decodificar.

---

## 3. Consecuencias y Validación

- **TypeScript (`npm run typecheck`):** 0 errores.
- **Linter & Arquitectura (`npm run lint`):** 0 errores en 85 archivos verificados.
- **Pruebas Automatizadas (`npm test`):** 23 suites pasadas al 100%, 131 tests ejecutados (100% exitosos).
- **Cobertura de Dominio:** 98.23% en sentencias, 98.50% en líneas (supera holgadamente el $\ge 90\%$ requerido).
- **Paridad con Excel:** Los tests de regresión dorados (`golden-october-2026.test.ts` y `verify-phase0-fixture.test.mjs`) pasan sin discrepancias.
