#!/usr/bin/env bash
# Enlaza .agents/ -> .claude/ para que Antigravity y Claude Code compartan skills y comandos.
set -euo pipefail

QUIET=0; [ "${1:-}" = "--quiet" ] && QUIET=1
log() { [ "$QUIET" = 1 ] || echo "$@"; }

cd "$(git rev-parse --show-toplevel)"
mkdir -p .claude

IS_WIN=0
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) IS_WIN=1 ;; esac

# ¿Es $1 un enlace (junction/symlink)?
is_link() {
  local path="$1"
  if [ "$IS_WIN" = 1 ]; then
    local win_path
    win_path="$(cygpath -w "$PWD/$path" 2>/dev/null || echo "$path")"
    if command -v powershell.exe >/dev/null 2>&1; then
      powershell.exe -NoProfile -NonInteractive -Command \
        "if ((Get-Item -LiteralPath '$win_path' -Force -ErrorAction SilentlyContinue).LinkType) { exit 0 } else { exit 1 }" >/dev/null 2>&1
    else
      local win_dir
      win_dir="$(cygpath -w "$PWD/$(dirname "$path")" 2>/dev/null || dirname "$path")"
      cmd //c dir //AL //B "$win_dir" 2>/dev/null | tr -d '\r' | grep -qxF "$(basename "$path")"
    fi
  else
    [ -L "$path" ]
  fi
}

# link <origen real> <ruta del enlace>
link() {
  local target="$1" path="$2"
  if [ ! -e "$target" ]; then log "- omitido: $target no existe"; return 0; fi
  if is_link "$path"; then log "✓ ya enlazado: $path"; return 0; fi
  if [ -e "$path" ]; then
    if [ -d "$path" ] && [ -z "$(ls -A "$path")" ]; then
      rmdir "$path"
    else
      echo "⚠ $path existe y no es un enlace. Muévelo o bórralo a mano y vuelve a correr el script."
      return 0
    fi
  fi
  if [ "$IS_WIN" = 1 ]; then
    local win_path win_target
    win_path="$(cygpath -w "$PWD/$path")"
    win_target="$(cygpath -w "$PWD/$target")"
    if command -v powershell.exe >/dev/null 2>&1; then
      powershell.exe -NoProfile -NonInteractive -Command \
        "try { \$ErrorActionPreference = 'Stop'; New-Item -ItemType Junction -Path '$win_path' -Target '$win_target' -Force | Out-Null } catch { Write-Error \$_.Exception.Message; exit 1 }"
    else
      cmd //c mklink //J "$win_path" "$win_target" >/dev/null
    fi
  else
    ln -s "../$target" "$path"
  fi
  log "+ creado: $path -> $target"
}

# --- Enlaces ---
link .agents/skills    .claude/skills
link .agents/workflows .claude/commands
# link .agents/agents  .claude/agents   # solo si el formato de tus agentes es compatible

# --- Que git no versione los enlaces ---
touch .gitignore
for p in ".claude/skills" ".claude/commands" ".claude/settings.local.json"; do
  grep -qxF "$p" .gitignore || echo "$p" >> .gitignore
done

# --- Hooks de git versionados (se re-ejecuta tras pull/checkout) ---
git config core.hooksPath .githooks

log "Listo."