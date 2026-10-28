---
description: Prepares a new release, runs all quality/security gates, triggers the unsigned .ipa build in GitHub Actions, and provides iloader signing steps.
---

# Workflow: `/release`

1. **Pre-flight Quality Gate local:**
   - Ejecuta `node scripts/extract-excel-fixture.mjs` y verifica `git diff fixtures/` sin cambios inesperados.
   - Ejecuta `npm run typecheck`, `npm run lint` y `npm test -- --coverage`.
   - Verifica que no existan secretos ni archivos `.env` en el área de staging (`git status`).
2. **Versionado y Tag:**
   - Actualiza `version` en `package.json` y `app.config.ts` siguiendo SemVer (`vX.Y.Z`).
   - Crea commit `chore(release): vX.Y.Z` y tag `vX.Y.Z`.
3. **Publicación y Build `.ipa` en GitHub Actions:**
   - Haz push a `origin main --tags`.
   - El workflow `.github/workflows/build-ios.yml` compila en macOS sin requerir certificados de pago y adjunta `BFlow-unsigned.ipa` al GitHub Release.
4. **Instalación con `iloader` (Ciclo de 7 días):**
   - Descarga `BFlow-unsigned.ipa` desde el último Release de GitHub.
   - Conecta el iPhone 16 Pro Max a Windows 11, abre `iloader`, selecciona tu Apple ID gratuito e instala sobre la app existente para conservar el contenedor local.
