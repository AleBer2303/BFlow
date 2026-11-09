# 0008. La curva del mes sustituye a los tubos en Resumen

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Sustituye la forma de la visualización del [ADR 0007](0007-three-js-monthly-overview-scene.md) (§2.2 y §2.5). Se mantienen su pila técnica, su compatibilidad con Expo Go y su estrategia de optimización.
- **Autores:** Architect, UI Builder y QA Engineer

---

## 1. Contexto y problema

Los tubos de vidrio funcionaban, pero se leían como un objeto decorativo y no como un instrumento financiero. Se pidió algo más enfocado a finanzas, minimalista y moderno, con un apartado visual llamativo. Tras aprobar un prototipo interactivo, se reemplazan por una curva acumulada del mes.

## 2. Decisiones

### 2.1. Forma: una curva por métrica

- Una línea luminosa sobre una cuadrícula de puntos, con una cifra grande encima. Un selector cambia entre **Flujo, Ingresos, Gastos, Ahorros y Deudas**.
- Una sola serie a la vez, con su propia escala: nunca hay doble eje ni dos magnitudes comparadas en el mismo lienzo.
- Las escalas incluyen siempre el cero. Sin ejes visibles, partir de otro valor exageraría los cambios.
- Se conserva un trazo escalonado con esquinas suaves: el dinero entra y sale de golpe, y una curva suave sugeriría saldos intermedios que nunca existieron.
- Deslizar en horizontal recorre el mes. La inclinación sigue al dedo y es el único 3D que queda; se retiran el giro libre y los objetos.

### 2.2. Reconstrucción diaria en el dominio

`src/domain/overview/monthlyCurve.ts` reconstruye cada serie a partir de los movimientos completados y sus fechas, con estas reglas:

| Caso | Regla |
| :--- | :--- |
| Valor actual | Es la cifra del resumen correspondiente (`netCashFlow`, `totalCurrentSavings`, `totalRemainingDebt`…). La apertura se deduce restando los movimientos, de modo que la curva no puede contradecir al resto de la app. |
| Fecha de un movimiento | `completedAt`, que es el día en que se marcó, no necesariamente cuando se movió el dinero. |
| Sin fecha legible o anterior al mes | Se ubica en el día 1. |
| Posterior a hoy o al mes | Se ubica en el último día conocido, para que el último punto conserve el total. |
| Deudas | Solo cambian con abonos activos de entradas completadas, en la fecha de la entrada. |
| Ahorros | Incluyen el flujo neto si existe el fondo general, más los aportes a fondos. |

El **cierre previsto** significa «si se completa lo pendiente»: valor actual más lo pendiente de cada resumen. Se usa en lugar de `plannedIncome - plannedExpenses` porque esa fórmula ignora las diferencias entre lo previsto y lo pagado en los movimientos ya completados. En Deudas resta las cuotas pendientes de conceptos vinculados a deuda, sin bajar de cero. Es una proyección de presentación: no modifica ninguna fórmula existente ni los valores dorados.

Un mes terminado no tiene proyección. Un mes futuro solo tiene su punto de apertura.

### 2.3. Escena

- Sigue sobre `three` + `expo-gl`, sin dependencias nuevas.
- Seis mallas: área, brillo, línea, proyección, guía y marcador. Sin luces, texturas ni `discard`.
- El brillo y la línea usan mezcla `MAX` en oscuro y `MIN` en claro y escriben colores opacos. Así un trazo que se pliega en una esquina cerrada no se aclara dos veces. El test de contrato confirma que `expo-gl` expone esas constantes.
- El marcador late durante un número limitado de ciclos tras cada interacción. Después el bucle se detiene y no hay llamadas a GL en reposo.
- La vibración de selección se dispara una vez por cada día recorrido, nunca por evento táctil ni al soltar.

### 2.4. Accesibilidad y respaldo

- El lienzo sigue oculto para VoiceOver. Los cinco botones del selector son el equivalente nativo: anuncian monto y cierre previsto, y el color nunca es la única identificación.
- Con *Reducir Movimiento* no hay trazado de entrada, transformación, inclinación ni latido.
- Sin WebGL, una barra por día con la misma escala y una barra atenuada para el cierre previsto.

## 3. Consecuencias

- No hay lecturas ni escrituras adicionales en Firestore ni cambios de esquema.
- Una fecha mal registrada deforma la curva pero no su valor final, que sigue anclado al resumen.
- Con pocos movimientos la curva se ve escalonada, y a principio de mes predomina la proyección.
- Se retiró el token `springConfigs.liquidSlosh`, que solo usaban los tubos.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck`, `npm run lint`, `npm test` | Sin errores |
| Paridad con el fixture de octubre de 2026 | Cada serie termina en su valor dorado (`monthlyCurve.test.ts`) |
| Contrato con `expo-gl` | Inicializar, dibujar, actualizar y liberar usa solo métodos y constantes implementados en sus fuentes nativas |
| Bundle de iOS (sin bytecode) y Web | Compilan |
| Web en Chromium | Dibujo, deslizamiento, cierre previsto, cambio de métrica, temas y `320 pt` verificados |

Las mediciones están en la sección 9 de `PERF_BASELINE.md`.

**Sin verificar:** la curva no se ejecutó en un iPhone. El test de contrato no compila GLSL ni prueba gestos táctiles reales; debe comprobarse en Expo Go y en el `.ipa`.
