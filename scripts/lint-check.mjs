#!/usr/bin/env node
/**
 * scripts/lint-check.mjs
 *
 * Architectural & style linter enforcing AGENTS.md rules:
 * 1. `src/domain/` must remain 100% pure (zero imports of react, react-native, expo-*, firebase/*).
 * 2. `src/app/` and `src/features/` must NEVER contain hardcoded hex colors (`#RRGGBB`); all colors come from `src/design-system/tokens.ts`.
 * 3. `src/` must not contain stray `console.log` statements.
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.resolve(rootDir, 'src');

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walkFiles(srcDir);
const errors = [];

for (const filePath of files) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  const isTest = relPath.includes('__tests__/') || /\.test\.tsx?$/.test(relPath);

  // Rule 1: Pure domain check
  if (relPath.startsWith('src/domain/')) {
    const forbiddenDomainImport = /from\s+['"](react|react-native|expo[^'"]*|firebase[^'"]*)['"]/;
    if (forbiddenDomainImport.test(content)) {
      errors.push(`${relPath}: Forbidden UI/Expo/Firebase import inside pure src/domain/ layer.`);
    }
  }

  // Rule 2: No hardcoded hex colors in app/ or features/
  if ((relPath.startsWith('src/app/') || relPath.startsWith('src/features/')) && !isTest) {
    const hexColorRegex = /['"]#[0-9A-Fa-f]{3,8}['"]/;
    if (hexColorRegex.test(content)) {
      errors.push(`${relPath}: Hardcoded hex color detected. Use semantic tokens from src/design-system/tokens.ts.`);
    }
  }

  // Rule 3: No console.log in src/
  if (!isTest && /\bconsole\.log\s*\(/.test(content)) {
    errors.push(`${relPath}: Unexpected console.log() statement.`);
  }
}

if (errors.length > 0) {
  console.error('❌ Architectural & Lint Check Failed:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`✅ Lint & Architecture checks passed (${files.length} source files verified).`);
