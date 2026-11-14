# 0028. Historial archivado en la carga de la cuenta y refresco agrupado de widgets

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Fase 4 de la auditoría de producción (`docs/Improvements/AUDITS/auditoria_produccion_bflow.md`, AUD-07). Continúa el [ADR 0018](0018-account-data-revision-and-cache-validation.md) (`dataRevision` y validación de la caché) y el [ADR 0021](0021-home-screen-widgets-ios-android.md) (widgets). No cambia colecciones, reglas ni índices de Firestore; se registra porque cambia qué se lee de la nube en cada sincronización.
- **Autores:** Architect, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

1. **La carga completa crece con el historial.** `loadFullCloudAccount` descargaba toda la colección `entries` cada vez que no podía usar el atajo del ADR 0018: otro dispositivo escribió, la caché tiene más de 24 h o el usuario pulsa «Sincronizar datos ahora». Con unos 12 movimientos por mes, 60 meses son 720 documentos por sincronización, de un cupo diario de 50.000 lecturas en Spark.
2. **Un mes cerrado no es inmutable.** El store no impide editar un movimiento de un mes cerrado, y un mes puede reabrirse desde otro dispositivo. No basta con que un mes tenga `monthSnapshot` para dar por buena su copia en caché.
3. **El snapshot del widget se recalculaba en cada llamada.** `triggerWidgetSync` construía el snapshot (que recorre el historial) de forma síncrona en cada una de sus llamadas, aunque varias ocurrieran en el mismo tick.

## 2. Decisión

### 2.1. Ventana de historial (`src/data/repositories/historyWindow.ts`)

Los meses anteriores a los **últimos 12 meses cerrados** son el *historial archivado*. Un mes que sigue abierto nunca se archiva, ni ninguno posterior a él.

Cuando la caché trae más de 12 meses cerrados y una marca `historySyncedAt`, la carga sustituye la lectura completa de `entries` por tres lecturas en paralelo con el resto:

| Lectura | Consulta | Coste |
| :--- | :--- | :--- |
| Meses recientes | `monthKey >= corte` | 1 lectura por movimiento |
| Cambios | `updatedAt > historySyncedAt − 24 h` | 1 lectura por movimiento cambiado (mínimo 1) |
| Conteo | `count()` sobre `monthKey < corte` | 1 lectura por cada 1.000 movimientos |

Los movimientos archivados salen de la caché **solo si se cumplen las tres comprobaciones**:

1. Cada mes archivado conserva en la nube un `monthSnapshot` idéntico al de la caché. Un mes reabierto pierde el suyo; uno reabierto y vuelto a cerrar cambia `closedAtIso`. La colección `monthSnapshots` se sigue descargando entera (un documento por mes).
2. Los movimientos escritos desde la última carga se descargan y se aplican sobre la caché. Todas las escrituras de `entries` llevan `updatedAt`.
3. El número de movimientos archivados en la nube coincide con el de la caché ya fusionada. Detecta borrados y cualquier diferencia que las otras dos no vean.

Si alguna falla, o si falla cualquiera de las tres lecturas, se descarga la colección completa como antes. El resultado es el mismo que el de una carga completa; solo cambia de dónde sale.

Detalles:

- **`historySyncedAt`** es la hora de inicio de la última carga de la nube. Viaja en `FullCloudAccountData` y en la caché; los guardados que hace el store no la traen y `savePersistedAccount` conserva la existente. No es `savedAt`, que cambia con cada guardado local.
- **Margen de 24 h** (`HISTORY_CLOCK_SKEW_MARGIN_MS`): `updatedAt` lo pone el reloj de cada dispositivo. Pedir los cambios desde un día antes cubre un reloj atrasado; el coste es volver a leer los movimientos editados ese día.
- **Sin caché, sin marca, en un registro o con 12 meses cerrados o menos** no cambia nada: una sola lectura de la colección.
- **`debtPayments` no se acota.** La caché mezcla los abonos de la nube con los que `loadFullCloudAccount` sintetiza en memoria, así que su conteo no es comparable. Son uno o dos documentos por mes.
- **El recálculo de saldos por mes no se acota.** Reutilizar los saldos en caché haría que renombrar una deuda dejara de reflejarse en los meses antiguos, y rompería la igualdad con la carga completa.
- **Índices y reglas:** las tres consultas filtran por un solo campo (índice automático) y `allow read` ya cubre `list` y las agregaciones. No se toca `firestore.rules` ni `firestore.indexes.json`.

### 2.2. La sincronización manual también usa la ventana

`forceFullSync` salta el atajo de `dataRevision`, pero ya no implica descargar el historial archivado. La garantía es la de las tres comprobaciones, no la de leerlo todo. Para forzar una descarga íntegra basta con que no haya caché: cerrar sesión la borra.

### 2.3. Refresco de widgets agrupado

`triggerWidgetSync` guarda el último estado recibido y programa un único cálculo al final del tick (`Promise.resolve().then`). Todas las llamadas del mismo tick reciben la misma promesa. Al cerrar sesión, `cancelPendingWidgetSync()` descarta el cálculo pendiente antes de `clearWidgetData()`.

Se eligió una microtarea y no un temporizador porque los tests con relojes simulados no la retrasan y porque no añade latencia perceptible al widget.

`widgetAdapter.native.ts` compara con el último snapshot entregado **antes** de validar con Zod y serializar. `isEquivalentCloudAccount` compara primero tamaños y, si ambas cuentas tienen la misma forma y la misma `dataRevision`, las da por iguales sin serializarlas.

## 3. Alternativas descartadas

- **Dar por inmutable un mes con snapshot.** Barato, pero incorrecto por el punto 1.2.
- **Sincronización solo por `updatedAt` para toda la colección.** Lee menos, pero hace depender los meses en curso de la hora de cada dispositivo. La ventana limita esa dependencia al historial antiguo, y el conteo la cubre.
- **Un contador de revisión por mes.** Detectaría cualquier cambio sin heurísticas, pero exige cambiar el esquema, las reglas y todas las escrituras.
- **Bloquear la edición de meses cerrados.** Cambia el comportamiento del producto; no se pidió.

## 4. Consecuencias

- Con 20 meses (19 cerrados), una sincronización lee 158 documentos de `entries` en vez de 240 (medido en `archivedHistoryLoad.test.ts`). El ahorro crece con cada mes cerrado; ver `PERF_BASELINE.md` §19.
- Una sincronización que encuentra la caché desfasada cuesta más que antes: las lecturas de la ventana más la colección completa.
- **Riesgo residual:** una edición hecha en un mes archivado desde un dispositivo cuyo reloj atrasa más de 24 h no se detecta por `updatedAt`, y el conteo no la ve porque no cambia el número de documentos. El movimiento antiguo se quedaría con su valor anterior en este dispositivo hasta que otra comprobación falle o se pierda la caché.
- Un documento de `entries` mal formado en el historial archivado hace que el conteo nunca cuadre y que esa cuenta descargue siempre todo (comportamiento anterior, sin ahorro).

## 5. Verificación

- `src/data/__tests__/historyWindow.test.ts`: corte de la ventana, meses abiertos, fusión de cambios, conteo y snapshots.
- `src/data/__tests__/archivedHistoryLoad.test.ts`: `loadFullCloudAccount` contra un Firestore simulado que aplica los filtros; igualdad con la carga completa, edición y borrado desde otro dispositivo, mes reabierto, conteo no disponible, caché sin marca y cuenta con 12 meses cerrados.
- `src/features/budget/store/__tests__/widgetCloudSync.test.ts`, `src/platform/widgets/__tests__/widgetNativeBridge.test.ts` y `src/platform/storage/__tests__/accountCache.test.ts`.

**No verificado:** ninguna de las tres consultas se ha ejecutado contra Firestore real ni contra el emulador desde este entorno; `getCountFromServer` y la consulta por `updatedAt` solo se han probado con el SDK simulado.
