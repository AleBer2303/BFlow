# Cómo validar un cambio en iOS, Android y Web

> **Tipo Diátaxis:** How-To Guide. Objetivo: comprobar, desde Windows 11 y sin credenciales, que un cambio de interfaz funciona y se ve bien en las tres pieles de BFlow y en todos los anchos de ventana.
>
> Contexto y decisiones: [ADR 0010](../decisions/0010-platform-skins-and-responsive-layout.md) y [ADR 0011](../decisions/0011-web-redesign-and-vector-curve.md). Tokens y reglas: [`DESIGN.md`](../../DESIGN.md) §10 y §11.

## 1. Arrancar el modo vitrina

```bash
npm run web:demo
```

Abre `http://localhost:8081`. El modo vitrina (`EXPO_PUBLIC_BFLOW_DEMO=1`) inicia sesión con el usuario demo local y el seed de octubre de 2026. No habla con Firebase: nada de lo que hagas se guarda en la nube.

Para usar otro puerto:

```bash
npm run web:demo -- --port 8090
```

## 2. Cambiar de piel y de tema desde la URL

| URL | Qué muestra |
| :--- | :--- |
| `http://localhost:8081/` | Piel Web, tema oscuro |
| `http://localhost:8081/?theme=light` | Piel Web, tema claro |
| `http://localhost:8081/?skin=android` | Piel Android (Material 3) |
| `http://localhost:8081/?skin=android&theme=light` | Piel Android, tema claro |
| `http://localhost:8081/?skin=ios` | Piel iOS (Liquid Glass) |

Los parámetros solo funcionan en modo vitrina. En producción se ignoran.

Para ver la pantalla de inicio de sesión: pestaña **Cuenta** → **Cerrar Sesión**. Recarga la página para volver a entrar.

## 3. Recorrer los anchos

Con las herramientas de desarrollo del navegador (modo dispositivo), revisa cada pestaña en estos anchos:

| Ancho | Representa |
| ---: | :--- |
| 320 | iPhone SE de 1.ª generación, Android pequeño (mínimo soportado) |
| 360 | Android compacto habitual |
| 390 | iPhone 14 / 15 |
| 440 | iPhone 16 Pro Max |
| 600 | Plegable abierto, tableta pequeña (`medium`) |
| 840 | Tableta (`expanded`); en Web la navegación sube a la cabecera |
| 1024 | Portátil; en Web el margen pasa a 80 px |
| 1440 | Escritorio; composición de dos columnas |

En cada combinación comprueba la lista de `DESIGN.md` §11: sin scroll horizontal, ninguna cifra partida, objetivos táctiles correctos, sin vidrio fuera de iOS, claro y oscuro.

## 4. Ejecutar los tests por plataforma

```bash
npx jest src/features/shell
```

Corre los flujos completos (seis pestañas, checklist, registrar movimiento, tema, inicio de sesión) en las tres pieles y a varios anchos.

```bash
npx jest src/design-system
```

Corre el contrato de tokens (contraste, sin blur fuera de iOS, sin violeta en Web), el layout responsive y los componentes de cada piel.

Para escribir un test en una piel concreta, fuerza la piel en el proveedor y el ancho con `Dimensions`:

```tsx
import { act, render } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';

act(() => {
  const metrics = { width: 1440, height: 900, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
});

render(
  <BFlowThemeProvider skin="android" initialMode="light">
    <MiPantalla />
  </BFlowThemeProvider>
);
```

Jest corre como iOS: sin `skin`, el proveedor entrega la piel iOS.

## 5. Antes de dar el cambio por terminado

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

## 6. Lo que esta guía no cubre

- **Dispositivo real.** La vista previa en el navegador dibuja la piel, no el sistema: el ripple de Android, los insets de borde a borde, la háptica y el blur nativo de iOS solo se ven en un dispositivo o emulador (`npm run android`, `npm start` con Expo Go).
- **Datos reales.** El modo vitrina usa el seed. Para probar la sincronización con Firestore usa `npm run web` con tu cuenta.
- **La escena 3D en la vista previa.** Con `?skin=ios` o `?skin=android` el navegador carga three.js bajo demanda; la piel Web nunca lo hace. Si el navegador no tiene WebGL, esas pieles muestran la curva vectorial animada (ADR 0012).
