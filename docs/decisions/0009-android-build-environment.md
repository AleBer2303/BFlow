# 0009. Entorno de compilación Android (app.json y CI)

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Pasos 1 y 2 del numeral 2.3 del informe de auditoría. Complementa el [ADR 0001](0001-dual-mode-architecture-and-apple-free-tier.md) (doble modo) con la primera base para Android.
- **Autores:** Architect y Mobile Developer

---

## 1. Contexto y problema

`app.json` solo declaraba el bloque `ios`, y el único workflow nativo era `build-ios.yml`. Sin bloque `android` ni pipeline, no se puede generar un `.apk` ni un `.aab`.

## 2. Decisiones

1. **`app.json` → `android`:** `package: com.bflow.app` (igual que el bundle id de iOS), `versionCode: 1` e `adaptiveIcon` con `assets/adaptive-icon.png` sobre fondo `#0D0F12`.
2. **`expo-system-ui`:** se añade porque `userInterfaceStyle: "automatic"` no funciona en Android sin él (lo avisa `expo prebuild`).
3. **`.github/workflows/build-android.yml`:** misma puerta de calidad que iOS (typecheck, lint y tests) y luego, en `ubuntu-latest` con JDK 17, `expo prebuild --platform android` + `assembleRelease` (`.apk`) y `bundleRelease` (`.aab`). Se publican como artefactos y en un GitHub Release (`main` o tag `v*`).
4. **Script `npm run android`:** `expo start --android`, simétrico a `npm run ios`.

## 3. Consecuencias

- Los binarios salen firmados con la **keystore de depuración** que genera el prebuild: el `.apk` se instala en dispositivos de prueba, pero el `.aab` **no sirve para subir a Google Play**. Para publicar hará falta una keystore de subida guardada como secreto de GitHub y su configuración en Gradle (ADR futuro).
- El directorio `android/` sigue ignorado en git: se regenera en cada build (flujo CNG).
- La workflow no se ha ejecutado aún en GitHub; solo se validó localmente `expo prebuild --platform android`.
- Pendientes del numeral 2.3 (splash, E2E, telemetría, política de privacidad) quedan para cambios posteriores.
