# 0024. La piel Android usa el dock flotante de iOS con una píldora plana

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Modifica el ADR [0010](0010-platform-skins-and-responsive-layout.md) §«Piel Android»: la barra de navegación Material anclada deja de ser la navegación de Android. Exigido por `AGENTS.md` §7.7 (cambio del patrón de navegación de una piel).
- **Autores:** Architect, UI Builder, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

El ADR 0010 dio a Android una barra de navegación Material 3 anclada al borde inferior y prohibió allí el dock flotante. Se pidió que Android use el mismo dock que iOS, con un solo cambio: el marcador de selección (el lente) debe ser plano, sin aspecto de lupa ni de Liquid Glass.

## 2. Decisión

1. **`platformSkins.android.navigation` pasa a `floating-dock`.** `WorkspaceShell` monta `FloatingLiquidGlassDock` cuando la piel declara ese patrón, sin preguntar por la plataforma. Web sigue con `adaptive-header`.
2. **Un solo componente para iOS y Android.** Forma de cápsula, ancho máximo (580), seis pestañas, iconos, etiquetas, selección al tocar, arrastre horizontal y háptica son los mismos.
3. **El marcador depende del material de la piel** (`skinSpec.surfaceMaterial`):

   | | iOS (`liquid-glass`) | Android (`tonal`) |
   | :--- | :--- | :--- |
   | Marcador | Lente: borde especular, brillo superior, sombra interior, resplandor al tocar, sombra propia | Píldora plana de `accent.container`: sin borde, sombra ni capas interiores |
   | Bajo el dedo | Crece (×1,12 / ×1,06) y se estira con la velocidad | No cambia de tamaño |
   | Al asentarse | `liquidSettle`, conserva el impulso y puede rebotar | `flatSettle`, sin sobrepaso y sin impulso |
   | En los extremos | Se comprime contra el borde | Su recorrido termina en la primera y la última pestaña |
   | `testID` | `dock-magnifying-lens` | `dock-flat-indicator` |

4. **El dock de Android es opaco y usa la paleta de su piel:** fondo `glass.surfaceElevatedTint`, línea `glass.specularBorder`, acento verde. No hay `BlurView` ni translucidez; `GlassSurface` ya entrega el contenedor tonal.
5. **Borde a borde.** El dock recibe `bottomInset` y se separa `insets.bottom` de la barra de gestos. El final del scroll reserva 76 dp más ese inset.
6. **Objetivo táctil:** cada pestaña declara `skinSpec.minTouchTarget` (48 dp en Android) y mide 54 dp de alto.
7. **Se elimina `MaterialNavigationBar`** y el valor `navigation-bar` de `NavigationPattern`: nada los usa.

### 2.1. Alternativas descartadas

| Alternativa | Motivo |
| :--- | :--- |
| Un dock nuevo solo para Android | Duplicaría el gesto de arrastre y su geometría, que no cambian |
| Mantener el lente y quitarle solo el brillo | Seguiría creciendo y rebotando bajo el dedo, que es lo que lo hace parecer una lupa |
| Conservar `MaterialNavigationBar` sin uso | Código y tests sin consumidor; se recupera del historial de git si hace falta |

## 3. Consecuencias

- La regla «el dock flotante es solo de iOS» (`AGENTS.md` §7.2, `DESIGN.md` §10.1) se sustituye por «el lente es solo de iOS». Blur, translucidez y borde especular siguen prohibidos fuera de iOS.
- En Android la navegación deja de estar en el flujo del layout: el dock flota sobre el contenido, como en iOS.
- En tema claro, la píldora (`#CDE9DB`) sobre el dock (`#E2E9E1`) tiene poco contraste entre sí (1,04:1). La selección se lee por el color y el peso del icono y la etiqueta (`accent.primary` sobre la píldora: 5,5:1 en oscuro y 5,0:1 en claro), igual que ocurría con la píldora de la barra Material.
- Para volver a la barra Material hay que recuperar `MaterialNavigationBar` del historial y devolver el token a `navigation-bar`.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck`, `npm run lint`, `npm test` | Sin errores |
| Dock en la piel Android (`floatingLiquidGlassDock.test.tsx`) | Seis destinos; píldora plana con `accent.container` en claro y oscuro, sin borde, sombra, elevación ni capas, y solo con `translateX`; sin `dock-magnifying-lens`; superficie opaca de la paleta Android; 48 dp por pestaña; `bottomInset` sube el dock; selecciona al tocar e ignora la pestaña activa; `flatSettle` no es subamortiguado |
| App completa (`workspacePlatforms.test.tsx`) | Android monta el dock con la píldora plana, sin `BlurView` en ninguna pestaña, y reserva espacio al final del contenido; los flujos comunes pasan en las tres pieles |
| Token por piel (`skinTokens.test.ts`) | `floating-dock` en iOS y Android, `adaptive-header` en Web |

**Sin verificar:** no se ejecutó en un teléfono Android ni en un emulador (no hay SDK ni `adb` en el equipo). Quedan por confirmar en hardware la sombra del dock, el arrastre de la píldora, la separación respecto de la barra de gestos y la posición del dock con el teclado abierto.
