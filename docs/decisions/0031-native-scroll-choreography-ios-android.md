# 0031. Coreografía de scroll en el hilo de UI para iOS y Android

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Tipo Diátaxis:** Explanation
- **Contexto:** Extiende el ADR [0022](0022-motion-scale-and-interaction-feedback.md) §2.2, el ADR [0024](0024-android-floating-dock-flat-indicator.md) y el ADR [0030](0030-ios-liquid-glass-dock-on-the-ui-thread.md) para incorporar transiciones y animaciones ligadas al scroll (*scroll down* y *scroll up*) en **iOS (Liquid Glass)** y **Android (Material 3)** manteniendo **Web** sin movimiento ligado al scroll ([`AGENTS.md`](../../AGENTS.md) §7.2, [`DESIGN.md`](../../DESIGN.md) §10.4). Exigido por `AGENTS.md` §5.2 y §7.7.
- **Autores:** Mobile Developer, Architect, UI Builder, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

Aunque BFlow ya animaba el dock de iOS en el hilo de UI (ADR 0030) y las aperturas de paneles (`Entrance`, `RevealDown`, `AppPressable`), el desplazamiento vertical (*scroll down* y *scroll up*) en las pantallas del workspace seguía siendo estático:

1. **Dock fijo obstruyendo la lectura:** El dock flotante permanecía siempre arriba del borde inferior mientras el usuario bajaba leyendo tarjetas, reduciendo el área útil vertical.
2. **Secciones sin peso ni continuidad bidireccional:** Las tarjetas entraban sin respuesta al desplazamiento ni transición de regreso al volver a subir (*scroll up*).
3. **Posición de scroll compartida entre pestañas:** Al cambiar entre pestañas montadas en `WorkspaceTabKeepAlive`, el `ScrollView` único conservaba el offset de la pestaña anterior en lugar de restaurar el de cada vista.

Sin embargo, el contenido superior debe permanecer limpio durante el desplazamiento: **no** se agrega ninguna cabecera fija (*sticky header*) ni barra superior de progreso o carga al hacer scroll, dejando intactos el título en línea y todo el ancho útil superior.

---

## 2. Decisión

### 2.1. Coreografía 100 % en el hilo de UI (Reanimated 4)

Todo cálculo continuo cuadro a cuadro corre en el hilo nativo de UI mediante `useAnimatedScrollHandler`, `useSharedValue` y `useAnimatedStyle` en `WorkspaceShell`, `KeyboardAwareScrollView`, `ScrollDepthHero`, `ScrollRevealSection`, `LiquidGlassDock` y `FlatPillDock`:

- **Cero `setState` y cero `scheduleOnRN` durante el scroll:** El desplazamiento no dispara re-renders de React ni puentes hacia el hilo de JS.
- **Seguridad de worklets (`ADR 0030` §3):** Ningún worklet lee variables capturadas en su lista de parámetros (sin valores por defecto) y toda salida numérica pasa por `Number.isFinite`. La matemática pura de referencia vive en `src/design-system/motion/scrollKinematics.ts` y pruebas de paridad verifican coincidencia exacta con las copias worklet (`stepDockChromeOnUI`, `heroDepthTransformAt`, `sectionScrollTransformAt`).

### 2.2. Tokens por piel (`scrollMotionBySkin` y `springConfigs.scrollDockReveal`)

`src/design-system/tokens.ts` define `ScrollMotionSpec` para las tres pieles:

| Aspecto | iOS (Liquid Glass) | Android (Material 3) | Web |
| :--- | :--- | :--- | :--- |
| Habilitado | Sí (`enabled: true`) | Sí (`enabled: true`) | **No (`enabled: false`)** |
| Retracción direccional del dock | Baja `translateY` + escala `0.94` (`220 ms`, sin animar opacidad sobre `GlassView`) | Baja `translateY` + escala `0.96` + atenúa `0.85` con curva emphasized-accelerate (`180 ms`) | No aplica |
| Retorno del dock (*scroll up*) | Resorte `scrollDockReveal` (`damping: 20, stiffness: 240, mass: 0.85`, ζ ≈ 0,70) | Curva Material 3 emphasized-decelerate (`250 ms`, sin sobrepaso) | No aplica |
| Histéresis direccional | Ocultar: `+28 pt`; revelar: `-14 pt`; tope superior `48 pt`; auto-revela a `48 pt` del fondo o en contenido corto (`< 120 pt`) | Igual histéresis direccional y auto-revelado en extremos | No aplica |
| Profundidad de héroe (`ScrollDepthHero`) | Paralaje `16 pt`, escala `0.968` y estiramiento elástico en *pull-down* (`overscrollMaxScale: 1.022`) | Paralaje `10 pt`, escala `0.984`, sin estiramiento de *overscroll* | Renderiza `{children}` directo |
| Entrada bidireccional (`ScrollRevealSection`) | Deslizamiento desde abajo (`16 pt`) al bajar y desde el borde superior (`-10 pt`) al subir; opacidad mínima `0.82` | Deslizamiento (`12 pt` abajo / `-8 pt` arriba), sin rebote; opacidad mínima `0.72` | Renderiza `{children}` directo |

### 2.3. Navegación, memoria de scroll y *scroll-to-top*

- **Memoria por pestaña:** `WorkspaceShell` guarda el último `scrollY` de cada pestaña al cambiar de destino, restaura el offset guardado de la pestaña entrante (`animated: false`) y revela el dock automáticamente.
- **Volver arriba (*scroll-to-top*):** Volver a tocar la pestaña activa en el dock (`onReselectActiveTab`, protegido contra doble disparo tras `onPressIn` de cambio de pestaña) desplaza la vista suavemente a `y = 0` con `hapticService.selection()` solo si el usuario estaba desplazado (`scrollY > 4`).
- **Compatibilidad con `KeyboardAwareScrollView`:** `checkAndScrollInput` lee `scrollYShared.value` cuando el scroll corre en UI thread, evitando desalineaciones al enfocar campos cerca del teclado.

### 2.4. Principios *Content-First* y *Reduce Motion*

- Las tarjetas visibles en el pliegue inicial (`scrollY <= 4` y `sectionTop < 0.92 × viewportHeight`) permanecen en reposo (`opacity: 1, translateY: 0, scale: 1`).
- Al alcanzar el fondo de la página (`remainingBottom < 40`), el progreso de entrada libera la última sección a `1.0` aunque el contenido sea corto o tenga relleno inferior.
- Secciones altas (`> 420 pt`) omiten la modulación de escala para evitar deformación óptica.
- Con `reducedMotion` activo, `choreography.active` es `false`: no hay paralaje, traslación, escala ni retracción del dock.

---

## 3. Alternativas descartadas

| Alternativa | Motivo del rechazo |
| :--- | :--- |
| Escuchar `onScroll` en JS y actualizar `useState` | Saturaría el hilo de JS durante flings a 60/120 fps y provocaría saltos visuales en listas largas de Android. |
| Animar `opacity` sobre `GlassView` en iOS | Rompe el compositor nativo `UIVisualEffectView` en iOS 26 (ADR 0030 §2.4). |
| Bloquear el scroll natural (*scroll hijacking* / *snap* forzado) | Contrario a `/scroll-experience` y a la manipulación directa de iOS HIG / Material 3. |
| Activar animaciones de scroll en Web | Prohibido explícitamente por `AGENTS.md` §7.2 y `DESIGN.md` §10.4. |

---

## 4. Consecuencias

- Las features (`SummaryOverview`, `ChecklistWorkspaceView`, `DebtsFunfamiView`, `DebtsTab`, `SavingsAndMotoIdealView`, `SavingsTab`, `AnalyticsAndHistoryView`, `AnalyticsChartsPanel`, `AccountProfileWorkspaceView`) solo envuelven bloques con `<ScrollDepthHero>` y `<ScrollRevealSection>`, sin ramas `Platform.OS` ni `skin`.
- `DESIGN.md` incorpora `scrollDockReveal` (§6.1), el detalle de Reducción de Movimiento (§6.2), la sección §6.5 de Coreografía de Scroll y la fila de Scroll en §10.1.
- Toda modificación futura a fórmulas de scroll debe mantener paridad exacta entre `scrollKinematics.ts` y los worklets de `WorkspaceShell`, `ScrollDepthHero` y `ScrollRevealSection`.

---

## 5. Verificación

| Verificación | Alcance |
| :--- | :--- |
| `npm run typecheck`, `npm run lint` | 0 errores en TypeScript y cumplimiento arquitectónico (`AGENTS.md`). |
| `npm run test:scripts` | Guardia de cierres de worklets (`worklet-closure-guard.test.mjs`), workflows y Maestro. |
| Tests unitarios y paridad (`scrollChoreography.test.tsx`, `motionSpec.test.ts`, `skinTokens.test.ts`) | Estado direccional, histéresis, límites, NaN, paridad exacta JS ⇄ worklets y contratos de tokens por piel. |
| Tests funcionales activos (`activeScrollChoreography.test.tsx`) | Simulación de scroll down / scroll up en `WorkspaceShell` sobre iOS, Android, Web y `reducedMotion`, ausencia explícita de cabecera sticky y barra de progreso, retracción/retorno del dock, `scroll-to-top` en pestaña activa y memoria por pestaña. |
| Regresión multiplataforma (`workspacePlatforms.test.tsx`, `floatingLiquidGlassDock.test.tsx`, `renderCommits.test.tsx`) | Sin `BlurView` fuera de iOS, `paddingBottom` e insets preservados, cero renders extra de navegación/checklist al cambiar `pendingSyncCount`. |

**No verificado en hardware físico (`AGENTS.md` §5.4 y §7.6):** No se ejecutó en un iPhone físico con ProMotion a 120 Hz ni en un teléfono o emulador Android (sin SDK/dispositivo conectado en esta sesión). Quedan por confirmar en dispositivo real la suavidad a 120 fps de la retracción/retorno del dock, la percepción háptica de *scroll-to-top*, el estiramiento elástico de *overscroll* en iOS y el desplazamiento de borde en Android.
