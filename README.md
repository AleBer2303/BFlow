# ROL
Eres un equipo de agentes senior: Arquitecto Mobile, Desarrollador React Native/Expo, Diseñador UX/UI estilo Apple, Ingeniero QA/Automatización y Ingeniero DevOps. Trabajas en Antigravity CLI dentro de VS Code sobre Windows 11. Comentas y respondes en español; el código, nombres de variables y claves de datos van en inglés.

# OBJETIVO
Construir "BFlow" (nombre provisional), una app iOS para controlar mi presupuesto personal mes a mes, optimizada para iPhone 16 Pro Max (iOS 26), con Isla Dinámica (Live Activities), widgets y diseño minimalista Liquid Glass al nivel de pulido de las apps nativas de Apple.

La app reemplaza mi Excel actual "Control_Ingresos_y_gastos_mensuales.xlsx" (hoja "Octubre 2026"). Ese archivo es la FUENTE DE VERDAD de la lógica de negocio y de los datos semilla. La app debe incluir cuatro módulos:
1. Presupuesto mensual (ingresos y gastos con checklist).
2. Control de Deuda FUNFAMI.
3. Control de Ahorros y Moto.
4. Provisión "IDEAL" de la moto.

# RESTRICCIONES DE ENTORNO (CRÍTICO)
- Desarrollo en Windows 11 + VS Code. NO tengo Mac ni Xcode local.
- Pruebo en mi iPhone con Expo Go (UI/lógica) y con un .ipa compilado en GitHub Actions (nativo), firmado e instalado con iloader (cuenta Apple gratuita, firma de 7 días).
- Todo el build iOS ocurre en GitHub Actions (runner macOS). Sin EAS de pago. Todo en capas gratuitas (Firebase Spark, GitHub Actions).
- Honestidad técnica: Expo Go NO soporta widgets, Live Activities ni Google Sign-In nativo. Diseña dos modos:
  - Modo A (Expo Go / web): toda la UI, lógica, Firebase JS SDK, auth email/contraseña. Los módulos nativos se aíslan detrás de interfaces con implementaciones mock/no-op para que la app corra en Expo Go y web sin romperse.
  - Modo B (build nativo .ipa vía prebuild): widgets, Live Activities/Isla Dinámica, Google Sign-In nativo, efectos Liquid Glass nativos.
- Antes de elegir librerías, investiga y confirma versiones y compatibilidad actuales con el Expo SDK elegido (candidatas: expo-widgets, @bacons/apple-targets, expo-live-activity, expo-glass-effect, expo-auth-session, @react-native-google-signin/google-signin). Documenta decisión y alternativas en docs/decisions/ (ADR).
- Fase 0 obligatoria: valida los riesgos de la cuenta Apple gratuita (App Groups para compartir datos con el widget, límite de App IDs por extensiones, expiración a 7 días) y propón mitigaciones.

# STACK PROPUESTO (justifica o ajusta si hay mejor opción)
- Expo (SDK estable más reciente) + React Native + TypeScript estricto + Expo Router.
- Estado: Zustand o TanStack Query. Validación: Zod.
- Animaciones: react-native-reanimated + gesture-handler. Gráficos: Victory Native XL o react-native-gifted-charts.
- Backend: Firebase plan Spark (Auth + Firestore) con Firebase JS SDK (compatible con Expo Go), persistencia offline activada.
- Tests: Jest + jest-expo + React Native Testing Library, Firebase Emulator Suite (reglas e integración), Maestro (E2E).
- Calidad: ESLint, Prettier, tsc --noEmit, Husky + lint-staged.
- Dinero: SIEMPRE enteros en pesos COP (sin decimales ni floats). Formateo es-CO ("$ 1.080.000"). Verifica soporte de Intl en Hermes; si falta, formateador propio con tests.

# DATOS REALES: EL EXCEL ES LA FUENTE DE VERDAD

## Instrucción inicial
Copiaré el archivo a docs/reference/Control_Ingresos_y_gastos_mensuales.xlsx. Léelo con un script reproducible (scripts/extract-excel-fixture) y genera de él: (a) los datos semilla, y (b) el fixture de pruebas fixtures/october-2026.json. No modifiques el original ni inventes datos que no estén en él; lo que no esté claro, pregúntamelo.

## Estructura de la hoja "Octubre 2026"
- Cabecera de resumen (A1:B6): Total Ingresos Previstos, Total Gastos Previstos, Total Gastos Pagados, Total Gastos Pendientes, Flujo Neto.
- Bloque INGRESOS (A8:E17): Ingresos Fijos y Variables con columnas Monto, ¿Recibido?, Fecha Recibido, Observaciones.
- Bloque GASTOS (G8:L25): Gastos Fijos y Variables con columnas Monto, ¿Pagado?, Estado (derivado: Pagado/Pendiente), Fecha de Pago, Observaciones.
- Control Deuda FUNFAMI (G1:H6). Control Ahorros y Moto (J1:K6).
- Cuadro IDEAL de la moto (A32:B43).
- Hay una hoja por mes: eso es el "historial mes a mes" que la app debe reproducir.

## Catálogo semilla (concepto → tipo, grupo, monto sugerido)
Ingresos fijos: Salario Principal ($4.000.000), Prima ($2.000.000).
Ingresos variables: Otros Ingresos Variables ($0, allowMultiplePerMonth).
Gastos fijos: CB300F ($500.000), Cuota FUNFAMI ($1.800.000), Plan de datos y baño kabir ($100.000), Seguro TR SURA ($130.000), ETB O Alexandra ($100.000), Parqueadero CEM ($120.000), Gasolina Moto/Carro ($200.000), Gemini Pro ($20.000).
Gastos variables: Tarjeta Nu ($300.000), Smart Fit ($100.000), Otro ($0, allowMultiplePerMonth).

## Estado de octubre 2026 (para el seed del mes actual)
Completados: Salario Principal (21/10), CB300F (21/10), Cuota FUNFAMI (27/10), Parqueadero CEM (21/10), Gasolina Moto/Carro (21/10), Tarjeta Nu (21/10).
Pendientes: Prima (ingreso), Plan de datos y baño kabir, Seguro TR SURA, ETB O Alexandra, Gemini Pro, Smart Fit. "Otro" y "Otros Ingresos Variables" están en $0.

## Fórmulas del Excel y valores dorados (octubre 2026)
| Celda | Fórmula | Significado real | Valor |
|---|---|---|---|
| B2 "Ingresos Previstos" | =B17 | Suma solo ingresos RECIBIDOS (no los previstos) | 4.000.000 |
| B3 "Gastos Previstos" | suma todos los montos de gastos | Gastos planeados totales | 3.370.000 |
| B4 "Gastos Pagados" | =H25 | Gastos con ¿Pagado?=TRUE | 2.920.000 |
| B5 "Gastos Pendientes" | SUMIF(pagado=FALSE) | Gastos no pagados | 450.000 |
| B6 "Flujo Neto" | =B2-B4 | Recibido − pagado | 1.080.000 |
| H18 / H24 "Total Gastos Fijos/Variables" | SUMIF(pagado=TRUE) | Solo pagados, pese al nombre | 2.620.000 / 300.000 |
| H6 "Total Deuda" | =SUM(H2:H3)-H11 | Deuda inicial (4.400.000 + 3.600.000) menos cuota FUNFAMI | 6.200.000 |
| K4 "Moto - Ahora" | =K2+H10+H16 | Moto mes pasado (1.600.000) + CB300F + Gasolina | 2.300.000 |
| K5 "Ahorros - Ahora" | =K3+B6 | Ahorros mes pasado (1.000.000) + Flujo Neto | 2.080.000 |
| K6 "Total Ahorros" | =SUM(K4:K5) | Moto + Ahorros | 4.380.000 |
| J10:J23 "Estado" | IF(pagado,"Pagado","Pendiente") | Estado derivado del checkbox | — |

Deudas: "CB300F - MOTO" $4.400.000 y "ESP. IA" $3.600.000 (saldos iniciales del mes).

## Cuadro IDEAL de la moto (costo mensual de referencia)
SOAT 66.667 · Gasolina 200.000 · Impuesto 21.000 · Mantenimiento 200.000 · Parqueadero 210.000 · Casco 41.667 · Cambio de aceite 50.000 · Llantas 83.333 · Kit de arrastre Honda original 500.000. El Excel muestra TOTAL = 872.666,67.
Observaciones mías: los valores parecen ser costo anual ÷ 12 (SOAT ≈ 800.000/año, casco 500.000/año, llantas 1.000.000/año, impuesto 252.000/año), pero debes confirmarlo conmigo.

## Inconsistencias detectadas (confírmalas conmigo ANTES de la Fase 2; propón y justifica la decisión)
1. "Total Ingresos Previstos" calcula lo recibido, no lo previsto. Propuesta: la app muestra ambos con nombres claros: Ingresos previstos (6.000.000), Ingresos recibidos (4.000.000), Gastos previstos (3.370.000), Gastos pagados (2.920.000), Gastos pendientes (450.000), Flujo neto (recibido − pagado = 1.080.000) y Flujo proyectado (previsto − previsto = 2.630.000).
2. "Total Gastos Fijos/Variables" suman solo pagados. Propuesta: mostrar previsto, pagado y pendiente por grupo.
3. Total Deuda resta la cuota aunque no esté pagada, y no reparte la cuota entre CB300F-MOTO y ESP. IA. Propuesta: la deuda baja solo cuando la cuota se marca pagada; al hacerlo, la app me pregunta cómo repartirla entre las deudas. Si desmarco el pago, la deuda se restaura. Pregúntame también si la cuota incluye intereses.
4. Moto-Ahora suma CB300F y Gasolina sin importar si están pagados, y con referencias fijas a filas. Pregunta: ¿ambos conceptos deben aportar al fondo Moto? (Gasolina es un gasto de consumo.) Propuesta: aportes configurables por concepto, que cuentan solo cuando están pagados.
5. Ahorros-Ahora = mes pasado + flujo neto: es una posición de caja "en vivo". Propuesta: mostrar también "Ahorros proyectado tras pendientes" (2.080.000 − 450.000 = 1.630.000).
6. Los saldos "mes pasado" y las deudas se actualizan a mano cada mes. Propuesta: arrastre automático al cerrar el mes (el cierre de un mes es la apertura del siguiente).
7. En el IDEAL los montos son texto y el total excluye el kit de arrastre (la suma completa sería 1.372.667). Propuesta: modelarlos como números y tratar el kit como meta puntual (monto objetivo + fecha) en vez de costo mensual. Pregúntame la fecha objetivo. Política de redondeo: provisión mensual = ceil(monto/periodo) en pesos enteros, con tests.
8. "Prima" figura como ingreso fijo mensual, pero parece estacional. Pregunta: ¿es mensual o solo ciertos meses? Agrega al concepto un campo recurrence (meses activos).
9. Posible solapamiento: el cuadro IDEAL incluye gasolina ($200.000) y parqueadero ($210.000), mientras el presupuesto tiene Gasolina ($200.000) y Parqueadero CEM ($120.000). Pregunta si son los mismos gastos.

# MODELO DE DOMINIO (propón mejoras en un ADR)
- Concept: id, name, type (income | expense), group (fixed | variable), defaultAmount, icon, color, allowMultiplePerMonth, recurrence (monthly | lista de meses), linkedDebtId?, savingsContribution? {bucketId}, archived, order.
- MonthEntry (equivale a una fila del Excel): id, monthKey ("YYYY-MM"), conceptId, plannedAmount, actualAmount?, status (pending | completed), completedAt?, note. Para conceptos sin allowMultiplePerMonth usa un id determinístico `${monthKey}_${conceptId}` (evita duplicados offline/multi-dispositivo).
- Debt: id, name, lender, openingBalance, installment?; el saldo se DERIVA (apertura − pagos aplicados) para evitar desfases. DebtPayment: entryId, debtId, amount, monthKey.
- SavingsBucket: id (moto, savings), name, openingBalance. Los aportes salen de los conceptos vinculados; el Flujo Neto del mes alimenta el bucket "Ahorros".
- ProvisionPlan "Moto ideal": ítems con costo, periodo (mensual/anual/etc.), provisión mensual calculada, y metas puntuales (kit de arrastre).
- MonthSnapshot (cierre de mes): totales, saldos de deudas y ahorros. Alimenta historial, gráficos y arrastre.
- Todas las métricas son funciones puras en src/domain, sin dependencias de UI ni Firebase.

# REGLA "CHECKLIST MENSUAL" (núcleo de la app)
- Al empezar un mes (o al abrir la app), ensureMonthPlan(monthKey) crea de forma idempotente un MonthEntry pending por cada concepto activo cuya recurrence incluya ese mes (sin generar entradas para los allowMultiplePerMonth).
- Función pura: getAvailableConcepts(concepts, entries, monthKey, type). Un concepto está disponible si allowMultiplePerMonth es true o NO tiene un entry completed ese mes. Los pendientes siguen disponibles (registrarlos = completarlos con el monto real).
- En "Agregar movimiento": tipo → concepto (solo disponibles) → monto (precargado con el previsto) → fecha/nota. Al completar, el concepto desaparece de las opciones en ese mes y reaparece en el siguiente. Si elimino o desmarco el movimiento, vuelve a estar disponible.
- Ejemplo con mis datos: en octubre, Salario y Parqueadero CEM ya no aparecen; "Otro" y "Otros Ingresos Variables" siempre aparecen.
- Progreso del checklist: solo cuentan los conceptos sin allowMultiplePerMonth. Octubre 2026 = 6 de 12 completados (2 ingresos + 10 gastos).
- Estado vacío elegante: "Mes completo" cuando todo está completado.
- monthKey con zona horaria America/Bogota; correcto en cambio de mes y de año.
- Marcar completado en el dashboard debe ser de un toque (equivale al checkbox ¿Pagado?/¿Recibido? del Excel), con animación y haptics.

# PANTALLAS
1. Auth: login/registro con email y contraseña y con Google; recuperar contraseña; cerrar sesión.
2. Resumen mensual: flujo neto, ingresos previstos/recibidos, gastos previstos/pagados/pendientes, progreso del checklist (X de Y), próximos pendientes, selector de mes.
3. Checklist del mes: dos secciones (Ingresos y Gastos), con subgrupos Fijos y Variables, estado y fecha por ítem, marcar/desmarcar rápido.
4. Agregar movimiento: hoja modal con efecto glass.
5. Gráficos (ver abajo).
6. Historial mes a mes: lista de meses con totales y balance; detalle de cada mes; edición y eliminación.
7. Deuda FUNFAMI: deuda total, detalle por deuda (CB300F-MOTO, ESP. IA), progreso, historial de cuotas, proyección de fecha de cierre según la cuota, reparto de cada cuota.
8. Ahorros y Moto: saldos de Moto, Ahorros y Total; aportes del mes; saldo proyectado tras pendientes.
9. Moto ideal: ítems con provisión mensual, total, brecha entre lo ideal y lo aportado realmente al fondo Moto, y metas puntuales.
10. Gestión de conceptos: crear, editar, archivar, reordenar, vincular a deuda o bucket de ahorro.
11. Ajustes: moneda (COP por defecto), tema (claro/oscuro/sistema), exportar CSV, eliminar cuenta.
12. Cierre de mes: resumen, confirmar y arrastrar saldos al mes siguiente.

# GRÁFICOS (animados al entrar, con tooltip al tocar)
- Ingresos vs gastos por mes; balance mensual (línea/área); flujo de efectivo mensual detallado (recibido, pagado, pendiente); distribución de gastos por concepto (dona); comparativa mes actual vs anterior.
- Previsto vs real por mes; pagado vs pendiente del mes actual.
- Evolución de la deuda FUNFAMI con proyección de cierre.
- Evolución de ahorros (Moto vs Ahorros, apilado).
- Moto: provisión ideal vs aporte real.

# ISLA DINÁMICA Y WIDGETS (Modo B)
- Widgets: pequeño (flujo neto del mes), mediano (ingresos/gastos/pendientes + mini gráfico), grande (checklist de pendientes con montos), uno de Total Deuda con progreso, uno de Total Ahorros (Moto + Ahorros), y widget de pantalla de bloqueo si es viable.
- Live Activity / Isla Dinámica: compacta y mínima con total pendiente; expandida con flujo neto, pendientes y progreso del checklist. Se actualiza al completar un movimiento.
- Datos compartidos vía App Group con un contrato tipado y versionado (WidgetSnapshot), con tests de serialización. Si el App Group no es viable con cuenta gratuita, documenta y propón alternativa antes de implementar.

# DISEÑO UX/UI
- Minimalista, tipografía del sistema (SF Pro), jerarquía clara, espaciado generoso, haptics en acciones clave, Dynamic Type y modo oscuro.
- Liquid Glass (iOS 26) en barras, hojas y tarjetas; fallback a blur estándar en Expo Go/web/iOS anterior.
- Animaciones a 60/120 fps (ProMotion): spring physics, transiciones compartidas, números animados, micro-interacción al marcar un concepto.
- Accesibilidad: labels, contraste AA, reduce motion, áreas táctiles de 44pt mínimo.
- Convención de color para estados (completado/pendiente, ingreso/gasto) definida en tokens y documentada.
- Design system en src/design-system y DESIGN.md como fuente de verdad visual. Nunca valores hardcodeados.

# AGENTES, SKILLS Y REGLAS (Antigravity)
Verifica rutas y formatos vigentes de Antigravity y crea:
- AGENTS.md / reglas del workspace: convenciones, arquitectura, definición de "terminado" (DoD), y la regla de que el Excel manda en la lógica de negocio.
- Skills (SKILL.md): expo-feature-scaffold, firebase-firestore-modeling, domain-budget-rules (reglas del Excel y valores dorados), ios-widget-liveactivity, liquid-glass-ui, write-tests-for-change, ci-cd-ipa-build.
- Agentes/roles: Architect, UI Builder, QA Engineer (obligatorio tras cada cambio), DevOps, Reviewer.
- Workflows reutilizables: /new-feature, /add-tests, /fix-bug, /release.
- Regla dura: ningún cambio se considera terminado sin tests nuevos o actualizados que lo cubran y sin que toda la suite pase.

# ESTRATEGIA DE PRUEBAS AUTOMATIZADAS
- Pirámide: muchos unit (lógica de dominio), componentes (RTL), integración (Firestore Emulator + reglas) y pocos E2E (Maestro).
- Tests de paridad con el Excel (golden tests): con fixtures/october-2026.json, las funciones puras deben reproducir exactamente los valores de la tabla de fórmulas (ingresos recibidos 4.000.000, previstos 6.000.000, gastos previstos 3.370.000, pagados 2.920.000, pendientes 450.000, flujo neto 1.080.000, deuda total 6.200.000, Moto 2.300.000, Ahorros 2.080.000, Total Ahorros 4.380.000, progreso 6/12). Si un valor cambia, el test falla y exige justificación.
- Casos obligatorios de la regla checklist: concepto oculto tras completarlo; reaparece al cambiar de mes; reaparece al eliminar o desmarcar; allowMultiplePerMonth; cambio de año (diciembre→enero); zona horaria America/Bogota; mismo concepto en meses distintos; ensureMonthPlan idempotente; duplicados/concurrencia; recurrence (Prima solo en meses activos, si lo confirmo).
- Deudas: la cuota solo reduce el saldo cuando está pagada; desmarcar restaura el saldo; reparto entre deudas suma exactamente la cuota; proyección de cierre.
- Ahorros: arrastre automático al cerrar el mes; aportes solo cuando están pagados; Ahorros proyectado tras pendientes.
- Moto ideal: provisión mensual por ítem, redondeo (ceil, enteros), meta puntual del kit, total con y sin metas.
- Dinero: sin floats; formateo es-CO; sumas sin pérdida.
- Un test por cada inconsistencia del Excel que se resuelva, documentando la decisión tomada.
- Pruebas de reglas de Firestore en el emulador y tests de contrato para WidgetSnapshot y datos de Live Activity.
- E2E Maestro: registro → completar Salario → desaparece de opciones → ver gráfico → completar Cuota FUNFAMI → baja la deuda → historial.
- Umbral de cobertura (inicio 80% en dominio) que rompe el pipeline. El CI falla si cambia src/ sin cambios en tests (verificación heurística documentada).

# DATOS Y SEGURIDAD (Firestore)
- Estructura sugerida: users/{uid}/concepts/{id}, users/{uid}/entries/{id} (con monthKey indexable), users/{uid}/debts/{id}, users/{uid}/debtPayments/{id}, users/{uid}/savingsBuckets/{id}, users/{uid}/provisionPlans/{id}, users/{uid}/monthSnapshots/{monthKey}. Justifica o mejora el modelo y calcula lecturas/escrituras (un mes tiene unas 15 entradas) para mantenerte dentro del plan Spark.
- Reglas: cada usuario solo lee/escribe bajo users/{uid}/...; valida esquema y tipos (montos enteros, monthKey con formato válido, status permitido), con tests en el emulador.
- Sin secretos en el repo: GitHub Secrets, variables de entorno de Expo e .env.example.
- Script de seed: carga catálogo, deudas, buckets, plan de moto y el estado de octubre 2026 desde el fixture, para mi usuario. Debe ser idempotente.

# CI/CD CON GITHUB ACTIONS (automatización completa)
1. ci.yml (push y PR): dependencias con caché, lint, typecheck, tests con cobertura, tests de reglas con Firebase Emulator.
2. build-ios.yml (push a main y tags): runner macOS; expo prebuild; pod install; xcodebuild archive con code signing deshabilitado; empaquetar Payload/ → .ipa SIN FIRMAR; subir como artifact y publicar en GitHub Releases con versión y changelog automáticos.
3. e2e.yml (nocturno o manual): Maestro sobre simulador iOS.
4. Opcional: Expo Go / EAS Update gratuito para previsualizar cambios de JS.
5. Protección de main: merge solo si ci.yml pasa. El .ipa solo se construye si los tests pasan.
6. Optimiza minutos macOS (caché de Pods/DerivedData, concurrency cancel-in-progress) y documenta consumo; evalúa repo público vs privado.
7. Documenta cómo descargar el .ipa del Release y firmarlo/instalarlo con iloader, con el recordatorio del ciclo de 7 días.

# PLAN DE ENTREGA (no avances sin que la fase anterior pase tests)
- Fase 0: viabilidad y riesgos, ADRs, estructura del repo, AGENTS.md, skills, lectura del Excel y lista de preguntas abiertas.
- Fase 1: proyecto Expo + TypeScript + design system + CI con tests + .ipa vacío instalado en mi iPhone (valida la tubería completa temprano).
- Fase 2: dominio puro con TDD: checklist, métricas mensuales con golden tests del Excel, deudas, ahorros, moto ideal, cierre de mes.
- Fase 3: Firebase (Auth email + Google, Firestore, reglas, emulador, seed) con tests.
- Fase 4: UI principal: resumen, checklist, agregar, historial, conceptos.
- Fase 5: módulos Deuda FUNFAMI, Ahorros y Moto, Moto ideal (UI + datos).
- Fase 6: gráficos animados.
- Fase 7: widgets y Live Activity / Isla Dinámica (Modo B).
- Fase 8: pulido (animaciones, haptics, accesibilidad, Liquid Glass), E2E Maestro, release automatizado.

# FORMA DE TRABAJAR
- Empieza SOLO por la Fase 0 y entrégame: (1) resumen de riesgos y viabilidad, (2) árbol de carpetas, (3) contenido de AGENTS.md, skills y workflows, (4) comandos exactos para Windows, (5) mapeo Excel → modelo de dominio con tu decisión propuesta para cada una de las 9 inconsistencias, y (6) las preguntas que necesites que responda (nombre de la app, bundle id, moneda, proyecto de Firebase, URL del repo, y las preguntas abiertas del Excel).
- Pide confirmación antes de decisiones irreversibles. Si una librería o API pudo cambiar, verifica la documentación oficial actual en lugar de asumir.
- No inventes datos ni reglas que no estén en el Excel o que yo no haya confirmado.
- Al final de cada fase entrega: qué se hizo, tests agregados, resultado de la suite, y cómo probarlo en mi iPhone (Expo Go o .ipa).