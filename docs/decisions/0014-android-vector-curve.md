# 0014. La piel Android dibuja la curva del mes con vectores animados

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Modifica los ADR [0008](0008-monthly-curve-replaces-tubes.md) y [0012](0012-animated-vector-curve.md): la escena three.js deja de ser el escenario de Android. Cierra el seguimiento del ADR 0012 §5.
- **Autores:** Architect, UI Builder y QA Engineer

---

## 1. Contexto y problema

En Expo Go para Android, con las animaciones del sistema activas, la curva del Resumen se veía quieta: aparecía ya dibujada, el punto no latía y al cambiar de métrica la forma cambiaba de golpe. En iOS se animaba.

### 1.1. Medición en el teléfono

El medidor de desarrollo del ADR 0012 §5 (`curveFrameProbe`) dio estas dos líneas en ese teléfono:

```text
[Curva] 453 cuadros en 11863 ms reales (marcas de tiempo: 11864 ms), ~38 fps, hueco máximo 4330 ms. Reducir movimiento: no; AppState: active.
[Curva] 341 cuadros en 5715 ms reales (marcas de tiempo: 5715 ms), ~59 fps, hueco máximo 28 ms. Reducir movimiento: no; AppState: active.
```

| Hipótesis del ADR 0012 §5 | Resultado |
| :--- | :--- |
| *Reducir Movimiento* activo | Descartada: «no» en las dos líneas |
| Marcas de tiempo más rápidas que el reloj | Descartada: 5715 ms frente a 5715 ms |
| Huecos largos entre cuadros | Descartada al cambiar de métrica: 59 fps y hueco máximo de 28 ms |
| Temporizadores detenidos | Descartada: 341 cuadros seguidos |

La segunda línea corresponde a un cambio de métrica: 341 cuadros en 5,7 s son la transformación (0,56 s) y los 3 latidos (5,7 s). JavaScript calculó y envió a `expo-gl` cada cuadro a tiempo. Lo que no ocurrió fue que esos cuadros se vieran: la superficie de `expo-gl` no se refresca en pantalla cuadro a cuadro en ese teléfono.

La primera línea es la entrada al abrir el Resumen. Su hueco de 4,3 s no se investigó: coincide con la creación del contexto GL y con la carga de la cuenta, y no explica el problema, porque la segunda línea no tiene huecos y la curva tampoco se movía.

**Sin determinar:** la causa dentro de `expo-gl` (un `TextureView` alimentado desde un hilo GL propio). No se pudo depurar: no hay SDK de Android ni `adb` en el equipo de desarrollo. Tampoco se sabe si ocurre igual en el `.apk`, que compila `expo-gl` 58.0.4 en lugar de la versión incluida en Expo Go; hasta el [ADR 0013](0013-android-release-keep-rules.md) el `.apk` se cerraba antes de mostrar la curva.

## 2. Decisión

1. **Token `curveStage` en `platformSkins`** (`tokens.ts`), definido para las tres pieles:

   | Piel | `curveStage` | Escenario |
   | :--- | :--- | :--- |
   | iOS | `scene-3d` | Escena three.js; si no puede dibujar, curva vectorial (ADR 0012 §2.3) |
   | Android | `vector` | Curva vectorial animada, con gesto táctil |
   | Web | `vector` | Curva vectorial animada, con puntero y teclado |

2. `MonthlyCurveSection` lee ese token en lugar de deducir el escenario del material de la piel. No hay ninguna rama por `Platform.OS`.
3. En Android la curva vectorial usa el gesto de `useCurveScrubResponder` (toma el toque, bloquea el scroll, vuelve a hoy al soltar) y queda oculta para TalkBack, igual que el lienzo en iOS.
4. La piel Android **no monta ningún `GLView`**.

La curva vectorial se dibuja con `react-native-svg` y se actualiza por el mismo camino que el resto de la interfaz, sin superficie GL. Es el escenario que ya usa la piel Web y el respaldo de iOS, con la misma línea de tiempo (`curveMotion.ts`).

### 2.1. Alternativas descartadas

| Alternativa | Motivo |
| :--- | :--- |
| Mantener la escena 3D y esperar a un fallo para usar el respaldo | La escena no falla: dibuja y no se refresca. JavaScript no recibe ninguna señal de eso |
| Forzar el redibujado de la vista en cada cuadro | No se pudo probar en dispositivo y depende de un detalle interno de `expo-gl` |
| Curva vectorial solo en Expo Go y 3D en el `.apk` | Dos comportamientos según el entorno, y el del `.apk` sin probar |

## 3. Consecuencias

- Android pierde el brillo de la línea y la inclinación al recorrerla. El trazado de entrada, la proyección, la transformación entre métricas, la mezcla de color y el latido se mantienen.
- Android ya no crea un contexto GL ni compila shaders al abrir el Resumen.
- En Android no se ejecuta el puente JNI de `expo-gl`. La regla keep del ADR 0013 se conserva: el paquete sigue en el `.apk`.
- Durante la animación, React vuelve a renderizar el SVG en cada cuadro (unos 7 s tras la entrada, 6 s tras un cambio de métrica). En reposo no hay trabajo.
- Para devolver la escena 3D a Android basta cambiar `platformSkins.android.curveStage` a `scene-3d`. Antes hay que confirmar en un teléfono que la superficie GL se refresca.
- `curveFrameProbe` sigue activo en desarrollo para la escena de iOS. En Android ya no mide nada. Se puede retirar cuando la curva esté confirmada en el teléfono.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck`, `npm run lint`, `npm test -- --coverage --ci` | Sin errores |
| Token por piel (`skinTokens.test.ts`) | `scene-3d` en iOS; `vector` en Android y Web |
| Escenario por piel (`vectorCurve.test.tsx`) | Android: sin `GLView`, gesto táctil, oculto a TalkBack y sin aviso de respaldo tras `GL_CONTEXT_TIMEOUT_MS`; el trazado crece, el marcador late, la forma intermedia de una transformación no es la inicial ni la final y la cifra termina exacta; el toque recorre el mes y actualiza la lectura. iOS conserva el `GLView` |
| App completa (`workspacePlatforms.test.tsx`) | La piel Android no monta ningún `GLView` y muestra la curva vectorial |
| Piel Android en Chromium, 412 × 915, modo vitrina (`?skin=android&theme=dark`) | Ningún `canvas`. Tras tocar otra métrica, muestreando cada cuadro durante 1,5 s: 91 cuadros, 34 formas distintas de la línea (la última a los 552 ms), 28 colores, 27 valores de la cifra y un anillo de latido con 90 radios distintos; al terminar, sin latido y con la cifra exacta |

**Sin verificar:** no se ejecutó en un teléfono Android, ni en Expo Go ni en el `.apk`. La prueba en Chromium confirma el código de la piel, no el dibujo nativo de `react-native-svg`. La comprobación final es abrir el Resumen en Expo Go en el teléfono donde se midió el problema.
