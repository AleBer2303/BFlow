# 0033. Acceso a Cuenta en cabecera, tema en Cuenta y foto de perfil en Firestore

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Extiende los ADR [0003](0003-domain-model-and-firestore-schema.md), [0010](0010-platform-skins-and-responsive-layout.md), [0011](0011-web-redesign-and-vector-curve.md), [0024](0024-android-floating-dock-flat-indicator.md) y [0030](0030-ios-liquid-glass-dock-on-the-ui-thread.md).
- **Autores:** Architect, UI Builder y QA Engineer

---

## 1. Contexto y problema

1. El botón superior derecho del marco (`WorkspaceShell` / `WebAppHeader`) estaba ocupado por el cambio de modo claro/oscuro, una preferencia ocasional, mientras la pestaña **Cuenta** ocupaba uno de los seis lugares de la barra de navegación inferior (`FloatingLiquidGlassDock` en iOS/Android y navegación principal en Web).
2. Dejar **5 destinos financieros** en la navegación principal (`Resumen`, `Checklist`, `Deudas`, `Ahorros`, `Cierre`) da más aire y legibilidad a cada pestaña, especialmente en pantallas de 320–390 pt.
3. El usuario solicitó además editar su **foto de perfil** y guardarla en la base de datos (Firestore), reemplazando el icono de Cuenta en la cabecera por su foto cuando esté configurada.

---

## 2. Decisión

### 2.1. Navegación y ubicación del selector de tema (las tres pieles)

1. **Cabecera del espacio de trabajo:** En iOS, Android y Web (`WorkspaceShell` y `WebAppHeader` con sesión iniciada), el botón superior derecho pasa a ser el acceso a **Cuenta** (`AccountHeaderAvatarButton`, conservando `testID="workspace-tab-account"` para paridad funcional de pruebas entre pieles).
   - Sin foto configurada: muestra el icono vectorial de cuenta (`AccountNavIcon`).
   - Con foto configurada (`authUser.photoUrl`): reemplaza el icono por la imagen de perfil recortada al botón (`resizeMode="cover"`), con respaldo al icono si falla la carga.
2. **Navegación principal de 5 destinos:** `PRIMARY_WORKSPACE_TABS` (`summary`, `checklist`, `debts`, `savings`, `analytics`) alimenta el dock flotante (iOS y Android) y la barra/cabecera de navegación Web. Cuando el destino activo es `'account'`, el dock desmarca la selección y oculta el lente/píldora en reposo hasta que el usuario seleccione o arrastre hacia uno de los 5 destinos.
3. **Modo claro / oscuro dentro de Cuenta:** `ThemeToggleIconButton` (`testID="theme-toggle-button"`) se mueve dentro de la tarjeta **Apariencia** de la vista de Cuenta (`AccountProfileWorkspaceView`). Las pantallas previas a iniciar sesión (`AuthScreen` y `EmailVerificationScreen`) conservan su propio botón de tema.

### 2.2. Modelo de datos y seguridad para `photoUrl` en Cloud Firestore

BFlow opera en Cloud Firestore edición `STANDARD` (plan Spark, sin Cloud Storage). Para mantener la sincronización en el documento `/users/{uid}` sin abrir dependencias de pago ni exceder el límite de 1 MiB por documento:

1. **Campo opcional `photoUrl`** en `/users/{uid}`:
   - Acepta cadena vacía `""` o `null` para indicar foto eliminada explícitamente.
   - Acepta Data URI comprimido `data:image/(jpeg|jpg|png|webp);base64,...` de hasta **120.000 caracteres** (~88 KB binarios).
   - Acepta URL segura `https://...` de hasta **2.048 caracteres** (por ejemplo, avatar inicial de Google Sign-In).
   - Rechaza esquemas inseguros (`javascript:`, `http:`, `image/svg+xml`, rutas locales `file://`).
2. **Compresión en cliente antes de persistir:**
   - **Nativo (iOS / Android — `src/platform/media/profilePhotoPicker.native.ts`):** utiliza `expo-image-picker` (recorte cuadrado `1:1`) y `expo-image-manipulator` para redimensionar a `256×256` px y comprimir como JPEG (`0.72`, con reintento a `0.50` si excede el tope).
   - **Web (`src/platform/media/profilePhotoPicker.ts`):** utiliza `<input type="file">` y un `<canvas>` de `256×256` px con recorte centrado tipo `cover` exportado a JPEG Data URI.
3. **Reglas de seguridad (`firestore.rules`):** `isValidUserProfile` incorpora `photoUrl` en `hasOnlyAllowedFields` y valida formato y longitud máxima tanto en `create` como en `update`.
4. **Optimización de escrituras y cola offline:** `saveUserProfile` solo incluye `photoUrl` en el `setDoc(..., { merge: true })` cuando el usuario modifica o elimina su foto, evitando reescribir los bytes del avatar al editar únicamente el nombre o la meta financiera.

---

## 3. Consecuencias

- **Positivas:** Dock más espacioso (5 pestañas), acceso universal al perfil desde cualquier pantalla en la esquina superior derecha, avatar persistente en Firestore compatible con plan Spark y cola offline.
- **Compensaciones:** Las nuevas dependencias nativas `expo-image-picker` y `expo-image-manipulator` requieren compilar una nueva build nativa (`.ipa` / `.apk`) para probar en Modo B; en Expo Go (Modo A) ya forman parte del runtime de Expo SDK 58. Además, `firestore.rules` debe desplegarse en el proyecto Firebase (`bflow-deaeb`) antes de guardar fotos contra la base en producción.
