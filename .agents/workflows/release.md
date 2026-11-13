---
description: Prepares a new release in one step — quality gate, SemVer bump, commit, tag, GitHub Release with the unsigned .ipa, .apk and .aab — and provides iloader signing steps.
---

# Workflow: `/release`

El release se hace en un solo paso con `.github/workflows/release.yml` y `scripts/release.mjs` ([ADR 0023](../../docs/decisions/0023-e2e-maestro-and-automated-release.md)).

## 1. Antes de lanzar

- `main` contiene lo que se quiere publicar y su CI está en verde.
- No hay secretos ni archivos `.env` en el repositorio (`git status`).
- Decide el tipo de versión (SemVer): `patch` (correcciones), `minor` (funcionalidad nueva compatible) o `major` (cambio incompatible).
- Opcional, para ver el plan sin escribir nada: `node scripts/release.mjs patch --dry-run`.

## 2. Lanzar el release (camino recomendado)

En GitHub: **Actions → Release → Run workflow**, rama `main`, y elige el `bump`. O desde la terminal:

```bash
gh workflow run release.yml --ref main -f bump=patch
gh run watch
```

Con `-f dry_run=true` solo pasa la puerta de calidad y muestra el plan.

El workflow hace, en orden:

1. **Puerta de calidad:** fixture dorado, tests de los scripts, `typecheck`, `lint` y `npm test -- --coverage --ci`.
2. **Versión y tag:** `node scripts/release.mjs <bump> --push` sube la versión en `package.json`, `package-lock.json` y `app.json` (`expo.version`), incrementa `expo.android.versionCode` (y `expo.ios.buildNumber` si existe), crea el commit `chore(release): vX.Y.Z` y el tag `vX.Y.Z`, y hace push atómico a `main`.
3. **Binarios:** llama a `build-ios.yml` y `build-android.yml` sobre ese tag.
4. **GitHub Release:** crea `BFlow vX.Y.Z` con notas generadas y adjunta `BFlow-unsigned.ipa`, `BFlow-test.apk` y `BFlow.aab`.

Si un build falla, el commit y el tag ya están en `main`: corrige la causa y usa **Re-run failed jobs** en esa misma ejecución. No lances el workflow otra vez, porque subiría la versión de nuevo.

## 3. Camino manual (sin el workflow)

```bash
git switch main && git pull
npm run typecheck && npm run lint && npm test -- --coverage
node scripts/release.mjs patch --push
```

El push lo hace tu usuario, así que dispara `build-ios.yml` y `build-android.yml` por sus disparadores de siempre: una ejecución por el tag `v*`, que adjunta los binarios al Release `vX.Y.Z`, y otra por el push a `main`, que publica los Release `build-N` y `android-build-N`.

## 4. Instalación con `iloader` (ciclo de 7 días)

- Descarga `BFlow-unsigned.ipa` desde el Release `vX.Y.Z`.
- Conecta el iPhone a Windows 11, abre `iloader`, selecciona tu Apple ID gratuito e instala sobre la app existente para conservar el contenedor local. Pasos completos en [`docs/guides/iloader-signing-guide.md`](../../docs/guides/iloader-signing-guide.md).

## Reglas

- El release sale solo de `main` y con el árbol limpio; el script se niega en cualquier otro caso.
- `EXPO_PUBLIC_BFLOW_DEMO` no se define nunca en `release.yml`, `build-ios.yml` ni `build-android.yml` (AGENTS.md §7.6). `scripts/workflow-guards.test.mjs` lo comprueba.
- El release no regenera los fixtures desde el Excel (ni el Excel ni `scripts/extract-excel-fixture.mjs` están en el repositorio); la paridad se valida con `npm run test:phase0`, que la puerta de calidad ya ejecuta.
