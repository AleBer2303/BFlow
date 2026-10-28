---
name: stitch-to-code
description: >-
  Guides extracting design tokens, layouts, and screen structures from Google
  Stitch via the Stitch MCP server (or exported files in docs/design/) into
  DESIGN.md and React Native components. Use when translating Stitch mockups to code.
---

# Stitch to Code Workflow (`stitch-to-code`)

## 1. Primary Flow (Via Stitch MCP Server)
1. Query the Stitch MCP server tools to list screens in the BFlow Stitch project and inspect the target screen's hierarchy, colors, typography, and spacing.
2. Sync any new or updated visual tokens into `DESIGN.md` and `src/design-system/tokens.ts`.
3. Generate or update the React Native components in `src/design-system/` and `src/features/` using `<GlassSurface />`, semantic tokens, and real October 2026 data (`fixtures/october-2026.json`).

## 2. Fallback Flow (Offline Export in `docs/design/`)
If the Stitch MCP server is unreachable or not yet configured:
1. Read exported mockup images (`.png`) and HTML/CSS references from `docs/design/<screen-name>/`.
2. Extract layout structure and update `DESIGN.md` before coding the React Native screen.

## 3. Security Rule
Never commit `STITCH_API_KEY` to the repository. Keep MCP credentials strictly in `~/.gemini/config/mcp_config.json` or untracked local environment variables.
