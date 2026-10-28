# Guía de Descarga, Firma e Instalación del `.ipa` con `iloader` (Ciclo de 7 Días)

Como el repositorio `https://github.com/AleBer2303/BFlow` es **público**, GitHub Actions ejecuta el workflow `.github/workflows/build-ios.yml` en un runner **macOS** de forma **100% gratuita e ilimitada** en cada push a `main` o tag `v*`.

---

## 1. Cómo Descargar el `.ipa` sin Firmar desde GitHub

1. Entra a **`https://github.com/AleBer2303/BFlow/releases`** (o a la pestaña **Actions → Build Unsigned iOS .ipa**).
2. En el último Release (ej. `build-1` o `v0.1.0`), descarga el archivo adjunto **`BFlow-unsigned.ipa`** a tu PC con Windows 11.

---

## 2. Cómo Firmar e Instalar en tu iPhone 16 Pro Max (iOS 26) con `iloader`

1. **Conecta tu iPhone 16 Pro Max a tu PC con Windows 11** por cable USB-C (o Wi-Fi local si ya está emparejado con iTunes / Apple Devices).
2. Asegúrate de tener activado el **Modo Desarrollador (Developer Mode)** en tu iPhone:
   - *Ajustes → Privacidad y seguridad → Modo desarrollador → Activar*.
3. Abre **`iloader`** (o Sideloadly / SideStore):
   - Selecciona el archivo **`BFlow-unsigned.ipa`** que descargaste.
   - Ingresa tu **Apple ID gratuito**.
   - Verifica que el Bundle ID base sea `com.bflow.app`.
   - Haz clic en **Start / Install**.
4. **Primera vez con ese Apple ID en el iPhone:**
   - En tu iPhone ve a *Ajustes → General → Administración de dispositivos y VPN → [Tu correo de Apple ID]* y pulsa **Confiar**.

---

## 3. Recordatorio del Ciclo de 7 Días (Sin Perder Datos)

- La firma de una cuenta Apple gratuita dura exactamente **7 días**.
- **Regla de Oro al renovar:** **NO desinstales BFlow de tu iPhone.** Simplemente vuelve a conectar el iPhone a `iloader` en el día 6 o 7 y vuelve a instalar el `.ipa` **encima** con el mismo Apple ID.
- Incluso si alguna vez borras la app por accidente, a partir de la Fase 3 todos tus datos están respaldados en tiempo real en **Cloud Firestore (`users/{uid}/...`)**, por lo que al iniciar sesión recuperarás el 100% de tu información al instante.
