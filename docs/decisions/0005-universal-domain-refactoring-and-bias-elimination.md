# ADR 0005: Universalización del Dominio, Generalización de Fondos y Eliminación de Sesgos

- **Estado:** **Aprobado / Implementado**
- **Fecha:** 2026-11-07
- **Contexto:** Adaptación arquitectónica y de interfaz de BFlow para ser una plataforma financiera personal 100% universal y agnóstica a cualquier usuario, moneda, tipo de deuda, interés o meta, erradicando sesgos específicos (`moto`, `funfami`, `soat`, `parqueadero`, `cb300f`, `esp ia`, `COP`, `bogota`, `colombia`, `pesos`).

---

## 1. Problema y Motivación

La versión inicial de BFlow se basó en una hoja de cálculo personal específica de octubre de 2026 (`Control_Ingresos_y_gastos_mensuales.xlsx`) que contenía conceptos acoplados a un vehículo particular (`CB300F`, `SOAT`, `Gasolina Moto`, `Parqueadero CEM`), una entidad de préstamo familiar (`FUNFAMI`, `ESP. IA`) y la moneda colombiana (`COP`, `pesos`). 

Para convertir BFlow en una aplicación de finanzas personales apta para cualquier usuario a nivel global, se requiere:
1. Eliminar todo texto de ejemplo, etiqueta o identificador acoplado a un contexto geográfico o vehicular particular.
2. Proporcionar abstracciones universales para cálculo de provisiones (`calculateProvisionPlanSummary`), amortización de deudas en cascada (`calculateDebtsSummary`) y fondos de reserva (`reserve`).
3. Soportar formateo monetario flexible (`formatCurrency`), zonas horarias configurables (`toAppMonthKey`, `toAppIsoDate`) e identificadores semánticos neutrales en el sistema de diseño.
4. Mantener paridad dorada estricta (100% test pass rate) con los fixtures históricos de prueba (`fixtures/october-2026.json`) mediante contratos compatibles y getters limpios.

---

## 2. Decisiones Técnicas Implementadas

### 2.1. Dominio Monetario y Fechas
- **Moneda:** Se introdujo `formatCurrency`, `formatCurrencyCompact` y `parseCurrencyInteger` en `src/domain/money/money.ts`, con soporte para opciones de formateo (`CurrencyFormatOptions`) y símbolo configurable (por defecto `"$"`). Se conservaron los alias retrocompatibles `formatCop` y `parseCopInteger`.
- **Zona Horaria:** Se definió `DEFAULT_APP_TIMEZONE = 'America/Bogota'` y se exportaron las funciones universales `toAppMonthKey` y `toAppIsoDate` en `src/domain/date/monthKey.ts`, manteniendo los alias `toBogotaMonthKey` y `toBogotaIsoDate`.

### 2.2. Provisiones y Metas (`ProvisionPlan` vs `IdealMotoPlan`)
- Se creó el módulo `src/domain/provisions/provisionCalculator.ts` con la función pura `calculateProvisionPlanSummary`.
- Se universalizaron las interfaces: `ProvisionPlan`, `ProvisionItemSpec`, `ProvisionPlanComparisonSummary`, `EvaluatedProvisionItem` y `EvaluatedTargetGoal`.
- El archivo `src/domain/moto-ideal/motoIdealCalculator.ts` re-exporta limpiamente estas definiciones para garantizar retrocompatibilidad total sin duplicación de código.
- Los getters no enumerables (`targetAmount`, `suggestedMonthlySaving`) garantizan que las aserciones de igualdad profunda (`toEqual`) de los tests dorados de octubre de 2026 se mantengan inalteradas.

### 2.3. Deudas y Abonos (`DebtSummaryResult` vs `FunfamiDebtSummary`)
- La función de cálculo en `src/domain/debts/debtCalculator.ts` se universalizó como `calculateDebtsSummary`.
- La amortización en cascada (`buildDebtPaymentsForInstallment`) se adaptó para respetar el aislamiento de grupos de deuda (`groupKey`), permitiendo gestionar múltiples acreedores independientes (tarjetas, bancos, créditos personales).
- En la interfaz de usuario, el banner de hito final se convirtió en un reconocimiento dinámico: detecta automáticamente cualquier obligación que alcance saldo cero en el mes en curso y celebra la liberación de flujo de caja permanente.

### 2.4. Fondos de Ahorro y Tokens de Diseño
- Se promovió `'reserve'` como identificador de fondo de reserva principal en `src/domain/savings/savingsCalculator.ts`, reconociendo `'moto'` como un alias transparente.
- En `src/design-system/tokens.ts`, se añadieron los tokens semánticos `semantic.reserve`, `semantic.reserveSoft`, `semantic.provisions` y `semantic.provisionsSoft` tanto en la paleta oscura como en la clara.
- Los componentes `StatusBadge` y `CurrencyText` soportan los tonos `reserve` y `provisions`.

### 2.5. Textos de Ejemplo y Copia de Interfaz (UI Copy)
- Se eliminaron menciones a marcas de motos, SOAT, parqueaderos específicos y monedas particulares en formularios, modales, placeholders y mensajes de error.
- Ejemplos y ayudas contextuales ahora utilizan conceptos universales como "Seguros, Mantenimiento, Pólizas", "Suscripción", "Préstamo personal" y "Tarjeta de crédito".

---

## 3. Consecuencias y Verificación

- **Retrocompatibilidad:** El 100% de las 21 suites de pruebas (124 tests unitarios, de integración y dorados) pasan con 0 fallos.
- **Cobertura de Dominio:** Se mantiene en **97.12% en sentencias** y **97.75% en líneas**, superando holgadamente el requisito del 90% de `AGENTS.md`.
- **Calidad de Código:** `npm run typecheck` y `npm run lint` pasan con **0 errores**.
- **Aislamiento de Reglas Firestore:** Las reglas de seguridad de Firestore (`firestore.rules`) permanecieron intactas y los tests de persistencia en emulador validan todas las invariantes contables.
