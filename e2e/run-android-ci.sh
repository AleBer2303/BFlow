#!/usr/bin/env bash
#
# e2e/run-android-ci.sh
#
# Instala el APK de E2E en el emulador ya arrancado y ejecuta los flujos de Maestro.
# Lo invoca .github/workflows/e2e.yml (la acción del emulador ejecuta cada línea de su
# `script` por separado, por eso la lógica vive en este archivo).
#
#   bash e2e/run-android-ci.sh <ruta-al-apk> [directorio-de-salida]
#
# Deja en el directorio de salida el informe JUnit, las capturas y los logs de Maestro y,
# si algo falla, el logcat del emulador.

set -euo pipefail

APK_PATH="${1:?Uso: bash e2e/run-android-ci.sh <ruta-al-apk> [directorio-de-salida]}"
OUTPUT_DIR="${2:-e2e-artifacts}"

mkdir -p "$OUTPUT_DIR"

adb install -r "$APK_PATH"
adb logcat -c || true

status=0
maestro test e2e \
  --format junit \
  --output "$OUTPUT_DIR/junit.xml" \
  --test-output-dir "$OUTPUT_DIR/maestro" || status=$?

if [ "$status" -ne 0 ]; then
  adb logcat -d > "$OUTPUT_DIR/logcat.txt" || true
fi

exit "$status"
