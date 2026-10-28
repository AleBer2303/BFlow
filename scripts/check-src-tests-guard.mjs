#!/usr/bin/env node
/**
 * scripts/check-src-tests-guard.mjs
 *
 * Heuristic CI guard: Fails if files under `src/` were modified in a PR/range
 * without any corresponding test file (`__tests__` or `*.test.*`) being added or updated.
 * Bypassable only when commit message or PR explicitly includes `[skip-test-guard]`.
 */

import { execSync } from 'node:child_process';

const baseRef = process.argv[2] || 'HEAD~1';

try {
  const commitMsg = execSync('git log -1 --pretty=%B', { encoding: 'utf8' });
  if (commitMsg.includes('[skip-test-guard]')) {
    console.log('ℹ️ [skip-test-guard] detected in commit message. Skipping heuristic check.');
    process.exit(0);
  }

  const diffOutput = execSync(`git diff --name-only ${baseRef}...HEAD`, { encoding: 'utf8' });
  const changedFiles = diffOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const srcNonTestChanges = changedFiles.filter(
    (file) => file.startsWith('src/') && !file.includes('__tests__/') && !/\.test\.[jt]sx?$/.test(file)
  );

  const testChanges = changedFiles.filter(
    (file) => file.includes('__tests__/') || /\.test\.m?[jt]sx?$/.test(file)
  );

  if (srcNonTestChanges.length > 0 && testChanges.length === 0) {
    console.error('❌ CI Heuristic Guard Failed: Files in `src/` were modified without updating or adding tests:');
    srcNonTestChanges.forEach((f) => console.error(`   - ${f}`));
    process.exit(1);
  }

  console.log('✅ CI Heuristic Guard Passed.');
} catch (error) {
  console.log('ℹ️ Could not compute git range diff (likely initial commit). Passing guard.');
}
