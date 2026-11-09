# Auditoría de rendimiento y persistencia offline de BFlow

**Fecha:** 2026-11-09 · **Rama auditada:** `develop` (`fd5e6f7` + cambios sin commit) · **Alcance:** carga de datos, persistencia local, caché offline, renderizado y bundle.

Este documento es solo diagnóstico y plan: no se modificó código en `src/`. Sigue las reglas de `docs/Improvements/OPTIMIZATION/OPTIMIZATION.md` y de `AGENTS.md` §5.4: lo que no se midió aparece como **no medido**.

---

## 1. Conclusión

El problema principal de BFlow no es de CPU ni de renderizado: es que **en iOS no existe persistencia local** y que, en cualquier plataforma, **la caché offline se aplica después de esperar a la red**.

| Situación | Comportamiento actual | Comportamiento esperado |
| :--- | :--- | :--- |
| Abrir la app en iOS (Expo Go o `.ipa`) | Pide iniciar sesión y descarga todo otra vez | Abre con la sesión y los datos del último uso |
| Abrir sin red en iOS | Pantalla de login inutilizable sin red | Datos locales disponibles |
| Abrir sin red en web | Workspace vacío: la caché nunca se aplica | Datos locales disponibles |
| Abrir con red | Muestra ceros hasta completar 2 viajes de red | Datos en el primer render |
| Editar sin red en iOS | Cambio visible, pero se pierde al cerrar la app | Cambio en cola hasta reconectar |

El cálculo, en cambio, está sano. Procesar 60 meses de historial tarda unos 28 ms en V8 y el JSON de la caché pesa 206 KB. **No hace falta optimizar fórmulas, comprimir la caché ni virtualizar listas.**

---

## 2. Evidencia medida

Mediciones de laboratorio en Windows 11 con Node 24. Se hicieron con scripts temporales, sin datos reales y sin conectar con el proyecto de Firebase.

### 2.1 Canalización de carga (`loadFullCloudAccount`, Firestore simulado)

Datos sintéticos a partir de la semilla de octubre 2026: 12 movimientos y 1 abono por mes. Los tiempos son de V8 con JIT; **Hermes en un iPhone será más lento y no se midió**. Sirven para comparar escalas, no como valores absolutos.

| Meses | Docs leídos por carga | Procesado (mediana) | Caché JSON | `stringify` | `parse` | Snapshot de widget | Resúmenes de `index.tsx` |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 34 | 1,1 ms | 6,5 KB | 0,02 ms | 0,03 ms | 0,33 ms | 0,30 ms |
| 12 | 177 | 7,7 ms | 43,8 KB | 0,19 ms | 0,33 ms | 0,48 ms | 0,22 ms |
| 24 | 333 | 13,7 ms | 84,5 KB | 0,64 ms | 0,64 ms | 0,43 ms | 0,12 ms |
| 60 | 801 | 28,1 ms | 206,5 KB | 1,71 ms | 1,58 ms | 0,54 ms | 0,40 ms |

Lo que crece y duele son los **documentos descargados en cada arranque**, no el procesamiento.

### 2.2 Firestore sin red (`disableNetwork`, proyecto ficticio, `memoryLocalCache`)

| Operación | Resultado |
| :--- | :--- |
| `getDoc` | Rechaza con `unavailable` en 7 ms |
| `setDoc` | **Sigue pendiente tras 5.000 ms**: la promesa no se resuelve sin confirmación del servidor |

Cualquier `await setDoc(...)` o `await batch.commit()` en un camino de arranque bloquea el flujo mientras no haya red.

### 2.3 Re-renders (React Profiler en Jest, modo DEV)

Los milisegundos solo sirven para comparar entre sí; el número de commits sí es exacto.

| Acción | Commits | Tiempo |
| :--- | ---: | ---: |
| 5 cambios de `syncMessage` con Resumen abierto | 5 | 110 ms |
| 5 cambios de `syncMessage` con Checklist abierto | 5 | 214 ms |
| 5 cambios de `syncMessage` con Análisis abierto | 5 | 48 ms |
| `applyFullCloudAccount` con datos idénticos (Checklist) | 1 | 42 ms |
| Marcar una fila del checklist | 1 | 44 ms |

`syncMessage` solo se muestra en la pestaña Cuenta, pero cada cambio vuelve a renderizar la pestaña activa completa. El cambio a Cuenta dio un valor atípico de 1.512 ms que no se investigó; la Fase 0 debe confirmarlo en dispositivo.

### 2.4 Bundle web (`expo export --platform web --source-maps`)

| Chunk | Raw | Gzip | Contenido principal |
| :--- | ---: | ---: | :--- |
| `entry` | 1.088 KB | 287 KB | `expo-router` 423 KB, `react-native-web` 284 KB, `react-dom` 203 KB |
| `index` | 1.128 KB | 242 KB | `@firebase/firestore` 304 KB, código de la app 262 KB, `@firebase/auth` 143 KB, `zod` 71 KB, `webchannel` 52 KB |
| `__common` | 105 KB | 29 KB | `react-native-svg` 52 KB, código de la app 41 KB |
| `_layout` + runtime | 28 KB | 9 KB | — |
| **Primera carga** | **2.349 KB** | **567 KB** | |
| `MonthlyCurveStage` (diferido) | 849 KB | 199 KB | `three` 820 KB; ya está separado |

### 2.5 No medido

Arranque en frío, TTI, FPS, memoria y batería en iPhone; coste de evaluar `three` al iniciar; coste de crear el contexto GL en cada cambio de pestaña; coste de `BlurView` en iOS; latencia real de Firestore desde Colombia hasta `nam5`. El comportamiento offline en iOS se dedujo del código y de la prueba 2.2; no se reprodujo en un dispositivo.

---

## 3. Hallazgos por prioridad

Esfuerzo: **S** menos de medio día, **M** de medio a 2 días, **L** más de 2 días.

### P0: pérdida de la función offline o de datos

| ID | Hallazgo | Evidencia | Esfuerzo | Fase |
| :--- | :--- | :--- | :---: | :---: |
| R-01 | La caché de cuenta y la sesión solo viven en RAM en iOS: la única persistencia es `localStorage`, que no existe en Hermes. Los tests pasan porque solo validan el `Map` en memoria | `persistentStorageAdapter.ts:19-28` | M | 1 |
| R-02 | Firebase Auth usa `inMemoryPersistence` en nativo: hay que iniciar sesión en cada arranque en frío | `firebaseConfig.ts:127` | S | 1 |
| R-03 | Cerrar sesión no borra los datos financieros locales: `clearPersistedAccount` no tiene ninguna llamada. La caché tampoco valida `schemaVersion` ni `uid` | `accountCache.ts:29,38` | S | 1 |
| R-04 | La caché se aplica detrás de la red: `onAuthStateChanged` → `getDoc` → `await setDoc` → listener → caché. Sin red, `setDoc` no termina y la caché nunca se aplica | `authAdapter.ts:116,178,301-308`; `index.tsx:171-175,139` | M | 2 |
| R-05 | `loadFullCloudAccount` espera escrituras no esenciales. Sin red, `isSyncing` queda en `true` y la sincronización manual no hace nada, porque `syncInFlightRef` sigue ocupado | `budgetRepository.ts:1228,1357`; `index.tsx:132,158` | S | 2 |
| R-06 | La caché solo se guarda tras una carga completa; las ediciones posteriores no llegan a disco | `index.tsx:152` (única llamada) | S | 2 |
| R-07 | Las escrituras sin red en iOS se pierden al cerrar la app: `memoryLocalCache` guarda la cola en RAM y `commit` no falla, así que tampoco hay rollback | `firebaseConfig.ts:104`; slices | L | 3 |

### P1: datos incoherentes, lecturas y latencia

| ID | Hallazgo | Evidencia | Esfuerzo | Fase |
| :--- | :--- | :--- | :---: | :---: |
| R-08 | 18 de 22 escrituras no tienen rollback y además borran el mensaje de error con `set({ syncMessage: '' })`, lo que incumple `AGENTS.md` §6.2. Solo revierten las de `createBudgetSlice.ts:86,159,489,534` | Auth 378, 422; Budget 258, 348, 371, 462, 601, 624, 683; Debts 80, 179, 204, 258; Provisions 67, 83; Savings 71, 118, 152 | M | 3 |
| R-09 | El resultado de la nube pisa cambios optimistas hechos durante la sincronización. Se vuelve más probable cuando la app sea interactiva desde el primer render | `index.tsx:153`; `createSyncSlice.ts:97` | M | 3 |
| R-10 | Una carrera al cerrar sesión: si `currentUid` es `undefined`, la validación deja pasar y escribe la cuenta en un store ya cerrado | `index.tsx:148-151` | S | 2 |
| R-11 | Cascada: al menos 4 viajes secuenciales (`getDoc`, `setDoc`, `getDoc`, `Promise.all`) antes de tener datos | `authAdapter.ts:116,178`; `budgetRepository.ts:939,1134-1145` | S | 4 |
| R-12 | `users/{uid}` se lee 3 veces por arranque y 4 en login. `lastLoginAt` genera una escritura en cada arranque, y 2 en login porque `syncUserProfileDocument` corre en el login y en el listener | `authAdapter.ts:116,178,208,307`; `budgetRepository.ts:939,1146` | S | 4 |
| R-13 | Se descarga todo el historial en cada arranque (333 docs a 24 meses, 801 a 60), en contra de `AGENTS.md` §6.3 | `budgetRepository.ts:1148,1150,1153` | L | 4 |
| R-14 | Lecturas secuenciales para datos que ya están en el store | `budgetRepository.ts:1776-1780`; llamada en `createBudgetSlice.ts:533` | S | 4 |

### P2: renderizado y arranque

| ID | Hallazgo | Evidencia | Esfuerzo | Fase |
| :--- | :--- | :--- | :---: | :---: |
| R-15 | `useBudgetStore()` sin selector: cualquier cambio del store renderiza toda la pantalla (sección 2.3) | `index.tsx:69-115` | M | 5 |
| R-16 | `React.memo` de las filas no surte efecto: reciben handlers nuevos en cada render | `ChecklistWorkspaceView.tsx:602-604`; `index.tsx:373` | S | 5 |
| R-17 | 23 `useState`, incluidos los formularios modales, viven junto a la lista: cada tecla renderiza todas las filas. `SummaryAddMovementModal` ya resolvió este mismo problema | `ChecklistWorkspaceView.tsx:372-400` | M | 5 |
| R-18 | Aplicar datos idénticos cambia todas las referencias: recalcula resúmenes, llama a `setCurve` y sincroniza el widget | `createSyncSlice.ts:97-113`; `MonthlyCurveStage.tsx:124` | S | 2 |
| R-19 | El widget se sobrescribe con ceros al montar, antes de hidratar los datos. Cada mutación hace 2 suites × 2 escrituras y 3 recargas | `index.tsx:188`; `widgetAdapter.native.ts:81-101` | S | 2 |
| R-20 | Cada vuelta a Resumen desmonta y recrea el contexto GL y la escena | `index.tsx:430`; `MonthlyCurveStage.tsx:148-154` | M | 6 |
| R-21 | `KeyboardAwareContext` crea un valor nuevo en cada render y renderiza todos los inputs; el dock no está memoizado | `KeyboardAwareScrollView.tsx:258`; `index.tsx:639` | S | 5 |
| R-22 | `three` se evalúa al arrancar en nativo: importación estática y `inlineRequires: false` por defecto. Hermes carga el bytecode de forma diferida, pero el código de nivel superior del módulo se ejecuta igual, al contrario de lo que sugiere el comentario del loader | `MonthlyCurveStageLoader.tsx:1`; `@expo/metro-config/build/ExpoMetroConfig.js:462` | S | 6 |
| R-23 | No hay instrumentación de arranque ni de sincronización en producción | Ausencia en `src/` | S | 0 |

### Descartado, con motivo

| Propuesta | Motivo |
| :--- | :--- |
| Virtualizar listas (`FlatList`/`FlashList`) | Una fila por movimiento (decenas por mes) y 60 meses de historial tras 5 años. Además anidaría listas dentro del `ScrollView` raíz |
| Comprimir la caché o moverla a un worker | 206 KB y menos de 2 ms a 60 meses |
| Optimizar fórmulas o el bucle de `loadFullCloudAccount` | 28 ms a 60 meses. Tocar esa zona arriesga los tests dorados sin beneficio visible |
| Memoizar más los cálculos de dominio | Menos de 0,5 ms |
| Escena 3D en reposo | Ya renderiza bajo demanda y se pausa en segundo plano (`monthlyCurveScene.ts:408,756`) |
| Sustituir `expo-router` (423 KB raw) | Es la mayor ganancia posible en web, pero su coste y riesgo no se justifican en una app cuyo uso principal es iOS |
| `<Activity>` de React | La documentación oficial no menciona React Native. Solo usar si se valida en el dispositivo |

### Correcciones a `PERF_BASELINE.md`

Conviene corregir estos puntos al registrar los próximos resultados:

- **§5.3:** los `useMemo` no se recalculan con cualquier cambio del store, porque sus dependencias son estables. Lo que se repite es el render del árbol.
- **§8.01:** "16 → 8 lecturas" cuenta consultas, no documentos.
- **§8.03, punto 16:** "Ya resuelto" no aplica al arranque completo (R-11).
- **§8.04:** "Usable" en 3G y CPU 4x no tiene medición que lo respalde.

---

## 4. Plan de ejecución

Las fases están ordenadas por dependencia y prioridad. La Fase 2 depende de la 1; la 3 y la 4 dependen de la 2.

| Fase | Objetivo | Hallazgos | Prioridad | Requiere ADR | Decisión tuya |
| :---: | :--- | :--- | :---: | :---: | :--- |
| 0 | Medir en iPhone | R-23 | Previa | No | — |
| 1 | Persistencia real en iOS | R-01, R-02, R-03 | P0 | Sí | — |
| 2 | Arranque desde caché y sin bloqueos | R-04, R-05, R-06, R-10, R-18, R-19 | P0 | No | — |
| 3 | Escrituras offline y rollback | R-07, R-08, R-09 | P0/P1 | Sí | Cola offline o solo lectura |
| 4 | Menos lecturas y latencia | R-11, R-12, R-13, R-14 | P1 | Sí (parte B) | Aprobar `dataRevision` |
| 5 | Renderizado | R-15, R-16, R-17, R-21 | P2 | No | — |
| 6 | Pestañas y arranque nativo | R-20, R-22 | P2 | No | Según mediciones |

### Antes de empezar

`develop` tiene muchos cambios sin commit, incluida la curva del Resumen. Haz commit de ese trabajo o guárdalo antes de crear las ramas, para no mezclarlo con estas fases.

Reglas comunes: una rama por fase, un cambio por commit, y `npm run typecheck`, `npm run lint` y `npm test` en 0 errores. Registra el antes y el después en `PERF_BASELINE.md`. Si una métrica empeora, se revierte.

---

### Fase 0: instrumentar y medir

**Pasos**

1. Crear `src/platform/perf/perfMarks.ts`, con marcas que no hagan nada en producción salvo que se activen.
2. Marcar: inicio del JS, primer render, sesión restaurada, caché aplicada, nube aplicada y sincronización terminada.
3. Mostrar los tiempos en la pestaña Cuenta solo en `__DEV__`.
4. Medir en iPhone con Expo Go y `.ipa`, en arranque en frío, con y sin red, 5 veces cada caso.

**Prompt**

```text
Ejecuta la Fase 0 de docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md (R-23).

Trabaja en la rama perf/phase-0-instrumentation creada desde develop. Crea
src/platform/perf/perfMarks.ts con marcas de tiempo: inicio de JS, primer render de
PhaseOneHomeScreen, sesión restaurada, caché aplicada, nube aplicada y sincronización
terminada. Debe ser inerte en producción y en tests, sin dependencias nuevas y sin
console.log (usa una función de lectura y muéstrala solo en __DEV__ en la pestaña Cuenta).

Incluye tests de perfMarks. Después dame el procedimiento exacto para medir en mi
iPhone (arranque en frío, con y sin red, 5 repeticiones, Expo Go e .ipa) y una tabla
vacía en PERF_BASELINE.md para registrarlo. Incluye también el coste de volver a
Resumen y una comprobación del valor atípico de la pestaña Cuenta (sección 2.3).
No afirmes resultados que no se hayan medido en el dispositivo.
Cierra con typecheck, lint y npm test en 0 errores.
```

---

### Fase 1: persistencia real en iOS

**Solución recomendada:** `expo-sqlite/kv-store`, en un backend exclusivo de nativo. Según la documentación del SDK 58 viene incluido en Expo Go, ofrece API síncrona (`getItemSync`, `setItemSync`) y es un reemplazo directo de AsyncStorage. La API síncrona es clave, porque `buildInitialState` lee la sesión al crear el store y así no hay que reescribir ese contrato. Web sigue con `localStorage`, por lo que no necesita WASM ni cabeceras COOP/COEP.

**Pasos**

1. Escribir el ADR: módulo nativo nuevo (`AGENTS.md` §5.2.1).
2. `npx expo install expo-sqlite`.
3. Separar el backend en `storageBackend.ts` (web) y `storageBackend.native.ts` (kv-store).
4. Usar `getReactNativePersistence` en nativo, en un archivo específico por plataforma.
5. Versionar la caché con `schemaVersion` y `uid`, y descartarla si no coincide.
6. Llamar a `clearPersistedAccount` al cerrar sesión y al reiniciar la cuenta.

**Riesgos:** requiere una `.ipa` nueva; la base SQLite no va cifrada (SQLCipher no funciona en Expo Go), y guarda el token de Firebase y los datos financieros en el sandbox de la app.

**Prompt**

```text
Ejecuta la Fase 1 de docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md (R-01, R-02, R-03).

Rama perf/phase-1-native-persistence. Primero escribe el ADR siguiente en docs/decisions/
justificando expo-sqlite/kv-store frente a AsyncStorage y MMKV, incluida la falta de
cifrado de los datos locales. Instala con npx expo install y actualiza README.md.

1. Mantén la interfaz síncrona de persistentStorage. Separa el backend por extensión de
   Metro: storageBackend.ts (localStorage, web y tests) y storageBackend.native.ts
   (expo-sqlite/kv-store con API síncrona). No cargues expo-sqlite en web.
2. En firebaseConfig.ts usa getReactNativePersistence con kv-store en nativo, mediante un
   archivo por plataforma. Comprueba los tipos reales de firebase@11 antes de escribirlo.
   Web sigue con browserLocalPersistence.
3. Sube la caché a un sobre versionado { schemaVersion, uid, savedAt, data }. Descarta el
   formato v1 o cualquier sobre con versión o uid distintos.
4. Llama a clearPersistedAccount al cerrar sesión y en resetFullAccount.

Tests: un backend simulado que sobreviva a reiniciar el Map en memoria (este hueco hace
que hoy los tests no detecten el fallo), sobre inválido, uid distinto y borrado al cerrar
sesión. Debe funcionar en Web, Expo Go y el contrato de Modo B. Dame los pasos para
verificar en mi iPhone que la sesión y los datos sobreviven al cierre de la app.
Cierra con typecheck, lint y npm test en 0 errores.
```

---

### Fase 2: arranque desde caché y sin bloqueos

**Pasos**

1. Hidratar desde caché de forma síncrona con la sesión guardada, antes de cualquier espera.
2. En `subscribeToAuthUser`, entregar el usuario de inmediato y sincronizar el perfil en segundo plano.
3. Quitar el `await` de las escrituras no esenciales de la carga, con `catch` para evitar rechazos sin manejar.
4. Guardar la caché al cambiar los datos, con debounce y volcado al pasar a segundo plano.
5. Omitir `applyFullCloudAccount` si la nube trae exactamente lo mismo.
6. No escribir el widget hasta tener datos hidratados, y agrupar sus recargas.
7. Corregir la validación de sesión tras la sincronización.

**Prompt**

```text
Ejecuta la Fase 2 de docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md (R-04, R-05, R-06,
R-10, R-18, R-19). Requiere la Fase 1 integrada.

Rama perf/phase-2-cache-first-boot. Objetivo: con sesión guardada, el primer render ya
muestra los datos de la caché, nunca ceros, con y sin red.

1. Hidrata el store desde loadPersistedSession + loadPersistedAccount antes de esperar a
   Firebase, sin que usuarios distintos puedan ver datos ajenos. Añade un estado de
   hidratación para distinguir "sin datos" de "aún cargando".
2. subscribeToAuthUser debe entregar el usuario enseguida; syncUserProfileDocument pasa a
   segundo plano y ningún camino de arranque puede esperar a setDoc o batch.commit
   (authAdapter.ts:178, budgetRepository.ts:1228 y 1357).
3. Si no hay red, isSyncing debe terminar y syncInFlightRef liberarse. Muestra un estado
   amigable en lugar de un mensaje vacío.
4. Corrige index.tsx:148: si ya no hay usuario autenticado o cambió, descarta el resultado.
5. Crea una suscripción del store con debounce que escriba la caché y vuelque al pasar a
   background; no persistas campos de interfaz.
6. Antes de applyFullCloudAccount, compara la serialización con la de la caché y omite el
   set si son iguales, sin dejar de actualizar el estado de sincronización.
7. No sincronices el widget hasta hidratar. Agrupa las recargas y evita escribir si el
   snapshot no cambió (ignora updatedAtIso al comparar).

Tests: arranque con y sin caché; setDoc que nunca resuelve no bloquea (promesa pendiente
simulada); cambio de usuario y cierre durante la carga; caché actualizada tras una mutación;
datos idénticos no provocan set; widget sin escribir antes de hidratar.
Actualiza PERF_BASELINE.md con el antes y el después medidos con perfMarks.
Cierra con typecheck, lint y npm test en 0 errores.
```

---

### Fase 3: escrituras offline y rollback

**Decisión previa:** recomiendo la **opción A**.

- **A. Cola persistente de escrituras.** La app sigue funcionando sin red. Los IDs deterministas (`${monthKey}_${conceptId}`) y `batch.set` hacen que reintentar sea seguro.
- **B. Solo lectura sin red en nativo.** Es mucho más simple, pero impide registrar un pago sin conexión, que es un caso de uso real de la app.

**Pasos**

1. Distinguir "sin confirmar" (timeout: queda pendiente) de "rechazado" (rollback).
2. Crear una cola persistente FIFO con reintento al reconectar o al volver a primer plano.
3. No aplicar una carga completa mientras haya escrituras pendientes.
4. Añadir rollback y mensaje amigable en las 18 escrituras que no lo tienen.
5. Indicar en la interfaz cuántos cambios faltan por sincronizar.

**Prompt**

```text
Ejecuta la Fase 3 de docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md (R-07, R-08, R-09).
Requiere la Fase 2 integrada. Decisión: opción A, cola persistente [cámbialo si eliges B].

Rama perf/phase-3-offline-writes. Escribe primero un ADR con la cola, la política de
conflictos y por qué web conserva la cola nativa de persistentLocalCache.

1. Crea un helper común para las escrituras: un timeout marca la operación como pendiente
   sin hacer rollback (commit no falla sin red); un rechazo real (permission-denied,
   invalid-argument...) hace rollback con un mensaje amigable.
2. Implementa una cola persistente FIFO en nativo, por uid, con operaciones serializables
   e idempotentes. Vacíala al reconectar y al volver a primer plano. Empieza por
   toggleEntryStatus, addOrCompleteMovement y editEntry, y extiéndela al resto. Si algún
   tipo de operación no es seguro para reintentar, bloquéalo sin red y explícalo.
3. Mientras haya escrituras pendientes o en vuelo, syncUserCloudAccount no debe sobrescribir
   el estado local (R-09).
4. Añade rollback y mensaje amigable en las 18 escrituras listadas en R-08 para cumplir
   AGENTS.md §6.2.
5. Muestra un indicador discreto con los cambios pendientes.

Respeta dinero en enteros y mantén verdes los tests dorados. Tests: timeout sin rollback,
rechazo con rollback en cada slice, persistencia y orden de la cola, reintento idempotente
y una carga en la nube que no pisa pendientes. Prueba además en iPhone: modo avión, editar,
cerrar la app, reabrir y reconectar; dame los pasos.
Cierra con typecheck, lint y npm test en 0 errores.
```

---

### Fase 4: menos lecturas y menos latencia

**Parte A, sin cambios de esquema:** eliminar la cascada y las lecturas duplicadas del documento de usuario, actualizar `lastLoginAt` como máximo una vez al día y pasar `entry` y `concept` desde el store a `deleteOrResetEntry`.

**Parte B, `dataRevision`:** cada escritura guarda un identificador aleatorio en `users/{uid}`. Si coincide con el de la caché, no se descarga nada más: **un arranque sin cambios pasa de cientos de documentos a uno**. Una cadena aleatoria evita tener que consultar el valor al servidor tras las escrituras propias, algo que un contador incremental sí exigiría, y detecta también borrados y cambios desde otro dispositivo.

No recomiendo limitar la consulta a una ventana de meses: la acumulación de saldos depende del historial completo y pondría en riesgo los tests dorados, para un coste de CPU que ya es mínimo.

**Prompt**

```text
Ejecuta la Fase 4 de docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md (R-11 a R-14).
Requiere las Fases 2 y 3 integradas.

Rama perf/phase-4-firestore-reads. Haz la Parte A y detente a mostrarme las lecturas antes
de empezar la Parte B.

Parte A (sin cambios de esquema):
1. Evita que seedOctober2026IfEmpty sea un viaje previo: lee users/{uid} una sola vez por
   carga y reutilízalo. Solo debe consultar más si la cuenta realmente necesita semilla.
2. Evita el doble syncUserProfileDocument en login y escribe lastLoginAt como máximo cada
   24 horas.
3. deleteOrResetEntry debe recibir entry y concept del store en lugar de hacer dos getDoc
   secuenciales. Revisa otras esperas secuenciales independientes en el repositorio.
Tests con conteo de getDoc/getDocs por escenario: arranque, login y usuario nuevo.

Parte B (requiere mi aprobación y ADR, porque cambia esquema y reglas):
4. Añade users/{uid}.dataRevision, una cadena aleatoria generada por el cliente, escrita
   mediante un helper común en TODOS los caminos de escritura; añade un test que falle si
   un camino nuevo no lo usa. Actualiza firestore.rules.
5. Guarda la revisión en el sobre de la caché y actualízala con las escrituras propias.
6. En el arranque: si la revisión coincide y la caché tiene menos de 24 horas, omite las
   consultas de colecciones. La sincronización manual siempre hace una carga completa.
7. Comprueba las reglas en el emulador.

No cambies las fórmulas ni la lógica de arrastre de saldos. Registra en PERF_BASELINE.md
los documentos leídos antes y después, contados en documentos y no en consultas.
Cierra con typecheck, lint y npm test en 0 errores.
```

---

### Fase 5: renderizado

Primero se corrige la estructura. React Compiler se evalúa después, porque puede evitar estabilizar handlers a mano, pero no resuelve la suscripción al store completo ni dónde vive el estado de los formularios. Según la guía de Expo, a partir del SDK 54 se activa con `experiments.reactCompiler` sin instalar paquetes adicionales.

**Prompt**

```text
Ejecuta la Fase 5 de docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md (R-15, R-16, R-17,
R-21).

Rama perf/phase-5-rendering. Antes de cambiar nada, añade un test con React Profiler que
cuente los commits de cada acción de la sección 2.3 y guarda la línea base.

1. Convierte cada pestaña en un contenedor con selectores finos (useShallow) y deja
   src/app/index.tsx solo con la autenticación, el layout y el dock. Las acciones se obtienen
   de forma estable. syncMessage e isSyncing solo los lee la pestaña Cuenta o un indicador
   aislado. Cada resumen se calcula solo donde se usa.
2. Extrae los formularios de agregar y editar de ChecklistWorkspaceView a componentes con
   su propio estado, siguiendo el patrón de SummaryAddMovementModal.
3. Memoiza el valor de KeyboardAwareContext y el dock.
4. Activa experiments.reactCompiler en app.json en un commit separado y compara commits y
   tiempos con y sin él. Consérvalo solo si mejora y no rompe nada. Si lo conservas, no
   añadas useCallback manuales que ya no aporten.

Criterios: cambiar syncMessage no renderiza Resumen, Checklist, Deudas, Ahorros ni Análisis;
escribir en un formulario no renderiza las filas; marcar una fila solo renderiza esa fila y
los resúmenes afectados. No cambies el comportamiento visual ni los testID.
No añadas virtualización. Registra el antes y el después en PERF_BASELINE.md.
Cierra con typecheck, lint y npm test en 0 errores.
```

---

### Fase 6: pestañas y arranque nativo

Aplícala **solo si la Fase 0 demuestra un coste perceptible**.

**Prompt**

```text
Ejecuta la Fase 6 de docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md (R-20, R-22), solo
para lo que las mediciones de PERF_BASELINE.md (Fase 0) hayan demostrado que es perceptible.
Si un punto no lo es, documéntalo como descartado y no lo implementes.

Rama perf/phase-6-native-startup.

1. R-22: carga MonthlyCurveStage con React.lazy también en nativo, reserva el espacio y evita
   saltos de layout; corrige el comentario del loader. No actives inlineRequires global
   salvo que midas una mejora y verifiques que Firebase sigue inicializando bien.
2. R-20: mantén montado solo Resumen tras la primera visita, oculto con display none, y usa
   setActive(false) en la escena mientras no esté visible. El AppState y la visibilidad
   deben combinarse sin que uno reactive lo que el otro pausó. No uses <Activity> salvo que
   valides su soporte real en React Native 0.88.

Mide en iPhone el arranque en frío, el regreso a Resumen y la memoria, antes y después; si
empeora, revierte. Actualiza los tests de MonthlyCurveStage y PERF_BASELINE.md.
Cierra con typecheck, lint y npm test en 0 errores.
```

---

## 5. Cómo se obtuvo esta evidencia

- **Lectura de código:** arranque, store, repositorio, caché, autenticación, widgets, escena 3D y vistas principales.
- **Carga:** `loadFullCloudAccount` real, con Firestore simulado en Jest y mappers reales.
- **Sin red:** SDK real de Firestore con `disableNetwork` y un proyecto ficticio, sin tráfico.
- **Render:** `PhaseOneHomeScreen` real bajo `React.Profiler` con el estado semilla de pruebas.
- **Bundle:** `expo export` con source maps y atribución de bytes generados por paquete.
- **Documentación oficial consultada:** Expo SQLite (SDK 58), guía de React Compiler de Expo y referencia de `<Activity>` de React.
